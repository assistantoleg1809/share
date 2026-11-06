export const meta = {
  name: 'Deploy with autofix',
  description:
    'Запуск deploy-джобы Jenkins с разбором ошибок деплоя: до 2 попыток «запуск → ожидание → триаж (приоритет: инфра/DevOps-тикет) → фикс, если правится кодом»',
  whenToUse:
    'Успешная сборка слита, нужно прогнать deploy-джобу; при падении — понять: инфра/известная проблема DevOps или правится кодом',
  phases: [
    { title: 'MCP check', detail: 'Доступность Jenkins до траты попыток' },
    { title: 'Deploy & watch', detail: 'Запуск deploy-джобы и ожидание статуса' },
    { title: 'Triage', detail: 'Разбор падения: инфра, DevOps-тикет, конфиг или код' },
    { title: 'Fix', detail: 'Только если причина правится кодом/конфигом репозитория' },
    { title: 'Result', detail: 'Итоговый отчёт' },
  ],
};

const AVAIL = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    problem: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok'],
};

const TRIGGER = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    buildNumber: { type: ['string', 'number'] },
    url: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['ok'],
};

const STATUS = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: ['RUNNING', 'SUCCESS', 'FAILURE', 'UNSTABLE', 'ABORTED', 'UNKNOWN'],
    },
    buildNumber: { type: ['string', 'number'] },
    url: { type: 'string' },
    errorSnippet: { type: 'string' },
    logTail: { type: 'string' },
  },
  required: ['state'],
};

const TRIAGE = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['infra', 'devops-known', 'config', 'code', 'dependency', 'flaky', 'other'],
    },
    rootCause: { type: 'string' },
    fixable: { type: 'boolean' },
    fixHint: { type: 'string' },
    knownIssues: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, url: { type: 'string' }, summary: { type: 'string' } },
        required: ['summary'],
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['category', 'rootCause', 'fixable', 'fixHint', 'confidence'],
};

const FIX = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commit: { type: 'string' },
    branch: { type: 'string' },
    pushed: { type: 'boolean' },
    summary: { type: 'string' },
    verification: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['ok', 'pushed', 'summary'],
};

// Headless-запуск передаёт args строкой — нормализуем (урок e2e из mcp-jenkins-test).
const A = (typeof args === 'string') ? JSON.parse(args) : args;
const withModel = (o, m) => { if (m) { o.model = m; } return o; };

const job = A?.job;
if (!job) {
  throw new Error('args.job обязателен (deploy-джоба), например { job: "app-deploy", branch: "main" }');
}
const branch = A?.branch;
const maxAttempts = A?.maxAttempts ?? 2;
const MAX_WATCHERS = 8;

const branchLine = branch ? `Ветка: ${branch}.` : 'Ветка: дефолт джобы.';

phase('MCP check');
const probe = await agent(
  'Проверь доступность MCP-сервера jenkins по своему шагу 0 (один лёгкий вызов). ' +
    'Сервер отвечает — ok=true. Нет — ok=false, problem и рекомендации.',
  withModel({ agentType: 'build-status', label: 'probe:jenkins', schema: AVAIL, effort: 'low' }, A?.modelFast),
);
if (probe === null) {
  return {
    status: 'ERROR',
    step: 'mcp-check',
    message: 'Агент-проверка jenkins не завершился — проверь /mcp и запусти workflow заново',
  };
}
if (!probe.ok) {
  return {
    status: 'MCP_UNAVAILABLE',
    server: 'jenkins',
    problem: probe.problem ?? '',
    recommendations: probe.recommendations ?? [],
  };
}

const attempts = [];
let lastFix = null;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  phase('Deploy & watch');
  const trigger = await agent(
    `Запусти deploy-джобу ${job} инструментом запуска деплоя (trigger_deploy). ${branchLine} ` +
      'Одна попытка, без ретраев. Верни номер запуска и url.',
    withModel(
      { agentType: 'build-trigger', label: `deploy:${attempt}`, schema: TRIGGER, effort: 'low' },
      A?.modelFast,
    ),
  );
  if (trigger === null || !trigger.ok) {
    return {
      status: 'TRIGGER_FAILED',
      attempt,
      attempts,
      error: trigger === null ? 'агент запуска не завершился' : (trigger.error ?? 'неизвестная ошибка запуска'),
    };
  }
  log(`Попытка ${attempt}: деплой #${trigger.buildNumber} запущен`);

  let status = null;
  for (let watcher = 1; watcher <= MAX_WATCHERS; watcher++) {
    const chunk = await agent(
      `Деплой ${job} #${trigger.buildNumber}: наблюдай по своему протоколу ` +
        '(статус деплоя, между проверками sleep 45, бюджет этого захода ~8 минут). ' +
        'Деплой всё ещё идёт — верни state=RUNNING.',
      withModel(
        { agentType: 'build-status', label: `watch:${attempt}:${watcher}`, schema: STATUS, effort: 'low' },
        A?.modelFast,
      ),
    );
    if (chunk === null) {
      log(`Наблюдатель ${watcher} не завершился — продолжаю следующим`);
      continue;
    }
    status = chunk;
    if (chunk.state !== 'RUNNING') break;
  }

  if (status === null || status.state === 'RUNNING' || status.state === 'UNKNOWN') {
    return {
      status: 'WATCH_TIMEOUT',
      attempt,
      attempts,
      buildNumber: trigger.buildNumber ?? null,
      message: `Деплой не завершился за ${MAX_WATCHERS} наблюдателей (~64 мин) — проверь вручную`,
    };
  }
  if (status.state === 'SUCCESS') {
    phase('Result');
    return {
      status: 'SUCCESS',
      attempt,
      buildNumber: trigger.buildNumber ?? null,
      url: status.url ?? trigger.url ?? null,
    };
  }

  phase('Triage');
  const triage = await agent(
    `Деплой ${job} #${trigger.buildNumber} упал (${status.state}).\n` +
      `Первая ошибка: ${status.errorSnippet ?? 'не извлечена'}\n` +
      `Хвост лога:\n${(status.logTail ?? '').slice(0, 4000)}\n` +
      'Разбери по своему протоколу, но приоритет деплой-специфики: (1) поиск открытых тикетов DevOps ' +
      'по тексту ошибки (известная/массовая проблема — категория devops-known, fixable=false); ' +
      '(2) инфраструктура/окружение — infra, fixable=false; (3) конфиг или код репозитория — ' +
      'config/code, fixable=true с fixHint; Confluence — runbook по деплою.',
    withModel({ agentType: 'build-triage', label: `triage:${attempt}`, schema: TRIAGE, effort: 'high' }, A?.modelExpert),
  );
  if (triage === null) {
    return { status: 'TRIAGE_FAILED', attempt, attempts, buildNumber: trigger.buildNumber ?? null };
  }
  attempts.push({
    attempt,
    buildNumber: trigger.buildNumber ?? null,
    result: status.state,
    category: triage.category,
    rootCause: triage.rootCause,
    knownIssues: triage.knownIssues ?? [],
  });
  if (!triage.fixable) {
    phase('Result');
    return {
      status: 'NOT_FIXABLE',
      attempt,
      attempts,
      triage,
      message: 'Инфраструктура или известная проблема DevOps — передай тикет команде DevOps',
    };
  }

  phase('Fix');
  const fix = await agent(
    `Деплой ${job} #${trigger.buildNumber} упал. Диагноз: ${triage.category} — ${triage.rootCause}. ` +
      `Подсказка: ${triage.fixHint}. Если правится конфигом/кодом репозитория — исправь по своему ` +
      'протоколу (воспроизведи → минимальная правка → проверь → commit → push в рабочую ветку).',
    withModel({ agentType: 'build-fix', label: `fix:${attempt}`, schema: FIX, effort: 'high' }, A?.modelExpert),
  );
  if (fix === null || !fix.ok || !fix.pushed) {
    phase('Result');
    return {
      status: 'FIX_FAILED',
      attempt,
      attempts,
      triage,
      fix: fix === null
        ? null
        : { commit: fix.commit ?? null, summary: fix.summary, error: fix.error ?? null },
    };
  }
  lastFix = { attempt, commit: fix.commit ?? null, branch: fix.branch ?? branch ?? null };
  log(`Попытка ${attempt}: фикс ${fix.commit ?? '?'} запушен в ${fix.branch ?? branch ?? '?'} — повторный деплой`);
}

phase('Result');
return { status: 'EXHAUSTED', maxAttempts, attempts, lastFix };
