export const meta = {
  name: 'Build with autofix',
  description:
    'Запуск сборки Jenkins с возможностью исправления ошибки сборки: до 3 попыток «запуск → ожидание → триаж → фикс → push»',
  whenToUse:
    'Нужно собрать джобу и при падении автоматически разобрать причину, исправить код и пересобрать',
  phases: [
    { title: 'MCP check', detail: 'Доступность Jenkins до траты попыток' },
    { title: 'Build & watch', detail: 'Запуск (одна попытка) и ожидание статуса сборки' },
    { title: 'Triage', detail: 'Разбор причины падения: лог, Jira DevOps, Confluence, Sonar, Bitbucket' },
    { title: 'Fix', detail: 'Минимальная правка, локальная проверка, commit, push' },
    { title: 'Result', detail: 'Итоговый отчёт по всем попыткам' },
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
      enum: ['code', 'tests', 'sonar', 'infra', 'config', 'dependency', 'flaky', 'other'],
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

const job = args?.job;
if (!job) {
  throw new Error('args.job обязателен, например { job: "app-build", branch: "task/PRJ-1" }');
}
const branch = args?.branch;
const maxAttempts = args?.maxAttempts ?? 3;
const MAX_WATCHERS = 8;

const branchLine = branch ? `Ветка: ${branch}.` : 'Ветка: дефолт джобы.';

phase('MCP check');
const probe = await agent(
  'Проверь доступность MCP-сервера jenkins по своему шагу 0 (один лёгкий вызов). ' +
    'Сервер отвечает — ok=true. Нет — ok=false, problem и рекомендации.',
  { agentType: 'build-status', label: 'probe:jenkins', schema: AVAIL, effort: 'low' },
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
  phase('Build & watch');
  const trigger = await agent(
    `Запусти сборку джобы ${job}. ${branchLine} Одна попытка, без ретраев. Верни номер сборки и url.`,
    { agentType: 'build-trigger', label: `trigger:${attempt}`, schema: TRIGGER },
  );
  if (trigger === null || !trigger.ok) {
    return {
      status: 'TRIGGER_FAILED',
      attempt,
      attempts,
      error: trigger === null ? 'агент запуска не завершился' : (trigger.error ?? 'неизвестная ошибка запуска'),
    };
  }
  log(`Попытка ${attempt}: сборка #${trigger.buildNumber} запущена`);

  let status = null;
  for (let watcher = 1; watcher <= MAX_WATCHERS; watcher++) {
    const chunk = await agent(
      `Сборка ${job} #${trigger.buildNumber}: наблюдай по своему протоколу ` +
        '(проверка статуса, между проверками sleep 45, бюджет этого захода ~8 минут). ' +
        'Сборка всё ещё идёт — верни state=RUNNING.',
      { agentType: 'build-status', label: `watch:${attempt}:${watcher}`, schema: STATUS, effort: 'low' },
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
      message: `Сборка не завершилась за ${MAX_WATCHERS} наблюдателей (~64 мин) — проверь её вручную`,
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
    `Сборка ${job} #${trigger.buildNumber} упала (${status.state}).\n` +
      `Первая ошибка: ${status.errorSnippet ?? 'не извлечена'}\n` +
      `Хвост лога:\n${(status.logTail ?? '').slice(0, 4000)}\n` +
      'Разбери причину по своему протоколу (лог Jenkins, Jira DevOps, Confluence, Sonar, Bitbucket) и верни диагноз.',
    { agentType: 'build-triage', label: `triage:${attempt}`, schema: TRIAGE },
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
  });
  if (!triage.fixable) {
    phase('Result');
    return { status: 'NOT_FIXABLE', attempt, attempts, triage };
  }

  phase('Fix');
  const fix = await agent(
    `Сборка ${job} #${trigger.buildNumber} упала. Диагноз: ${triage.category} — ${triage.rootCause}. ` +
      `Подсказка: ${triage.fixHint}. Исправь по своему протоколу: минимальная правка, локальная проверка, commit, push.`,
    { agentType: 'build-fix', label: `fix:${attempt}`, schema: FIX },
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
  // Фикс делается и на последней попытке: даже без пересборки человек получает
  // ветку с исправлением, а не только список диагнозов.
  lastFix = { attempt, commit: fix.commit ?? null, branch: fix.branch ?? branch ?? null };
  log(`Попытка ${attempt}: фикс ${fix.commit ?? '?'} запушен в ${fix.branch ?? branch ?? '?'} — пересборка`);
}

phase('Result');
return { status: 'EXHAUSTED', maxAttempts, attempts, lastFix };
