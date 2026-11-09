export const meta = {
  // Имя workflow: для расширений имя берётся ИЗ meta.name (не из имени файла)
  // и обязано быть kebab-lowercase — иначе загрузчик расширения молча пропустит скрипт.
  name: 'deploy-autofix',
  description:
    'Запуск deploy-джобы Jenkins с разбором ошибок деплоя: до 2 попыток «запуск → ожидание → триаж (приоритет: инфра/DevOps-тикет) → фикс, если правится конфигом/кодом»',
  whenToUse:
    'Успешная сборка слита, нужно прогнать deploy-джобу; при падении — понять: инфра/известная проблема DevOps или правится кодом',
  phases: [
    { title: 'MCP check', detail: 'Доступность Jenkins до траты попыток' },
    { title: 'Deploy & watch', detail: 'Запуск deploy-джобы и ожидание статуса' },
    { title: 'Triage', detail: 'Разбор падения: инфра, DevOps-тикет, конфиг или код' },
    { title: 'Fix', detail: 'Только если причина правится конфигом/кодом репозитория' },
    { title: 'Result', detail: 'Итоговый отчёт' },
  ],
};

// Структурный близнец build-autofix.js (песочница запрещает import — дублирование
// осознанное). Правки схем/хелперов/цикла вносить синхронно в оба файла.

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
    deployNumber: { type: 'number' },
    url: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['ok', 'deployNumber'],
};

const STATUS = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: ['RUNNING', 'SUCCESS', 'FAILURE', 'UNSTABLE', 'ABORTED', 'UNKNOWN'],
    },
    deployNumber: { type: 'number' },
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

const WRITE = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

// Headless-запуск передаёт args строкой — нормализуем (урок e2e из mcp-jenkins-test).
const A = (typeof args === 'string') ? JSON.parse(args) : args;
const withModel = (o, m) => { if (m) { o.model = m; } return o; };
const field = (text, k) => {
  const m = String(text).match(new RegExp('^' + k + ':\\s*(.*)$', 'm'));
  return m === null ? null : m[1].trim();
};
// Строки из текстовых отчётов агентов попадают в промпты с shell-командами —
// перед интерполяцией проверяем форму (метасимволы и чужие пути не проходят;
// семантику дополнительно страхует сам git: remove отказывает на чужих путях).
const SAFE_WORKTREE = /^[\w./-]*\.qwen\/worktrees\/[\w-]+$/;
const safeWorktree = (p) => (p !== null && p !== undefined && SAFE_WORKTREE.test(p) ? p : null);

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
  withModel({ agentType: 'deploy-status', label: 'probe:jenkins', schema: AVAIL, effort: 'low' }, A?.modelFast),
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

async function cleanupWorktree(worktreePath) {
  if (!worktreePath) return;
  if (safeWorktree(worktreePath) === null) {
    log(`worktree ${worktreePath} не прошёл проверку формы пути — прибери вручную`);
    return;
  }
  const c = await agent(
    `Из корня репозитория выполни git worktree remove --force ${worktreePath} ` +
      '(каталог работы; ветку не удалять — фикс уже запушен). Верни ok=true.',
    { label: 'worktree:cleanup', schema: WRITE },
  );
  if (c === null || !c.ok) {
    log(`worktree ${worktreePath} не удалён — прибери вручную`);
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  phase('Deploy & watch');
  const trigger = await agent(
    `Запусти deploy-джобу ${job}. ${branchLine} Одна попытка, без ретраев. Верни номер запуска и url.`,
    withModel(
      { agentType: 'deploy-trigger', label: `deploy:${attempt}`, schema: TRIGGER, effort: 'low' },
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
  const deployNumber = trigger.deployNumber ?? null;
  log(`Попытка ${attempt}: деплой #${deployNumber} запущен`);

  let status = null;
  for (let watcher = 1; watcher <= MAX_WATCHERS; watcher++) {
    const chunk = await agent(
      `Деплой ${job} #${deployNumber}: наблюдай по своему протоколу ` +
        '(проверка статуса, между проверками sleep 45, бюджет этого захода ~8 минут). ' +
        'Деплой всё ещё идёт — верни state=RUNNING.',
      withModel(
        { agentType: 'deploy-status', label: `watch:${attempt}:${watcher}`, schema: STATUS, effort: 'low' },
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
      deployNumber,
      message: `Деплой не завершился за ${MAX_WATCHERS} наблюдателей (~64 мин) — проверь вручную`,
    };
  }
  if (status.state === 'SUCCESS') {
    phase('Result');
    await cleanupWorktree(lastFix === null ? null : lastFix.worktree);
    return {
      status: 'SUCCESS',
      attempt,
      deployNumber,
      url: status.url ?? trigger.url ?? null,
    };
  }

  phase('Triage');
  const triage = await agent(
    `Деплой ${job} #${deployNumber} упал (${status.state}).\n` +
      `Первая ошибка: ${status.errorSnippet ?? 'не извлечена'}\n` +
      `Хвост лога:\n${(status.logTail ?? '').slice(0, 4000)}\n` +
      'Разбери причину по своему протоколу (приоритет: известные тикеты DevOps и инфра, ' +
      'затем конфиг/код репозитория) и верни диагноз.',
    withModel({ agentType: 'deploy-triage', label: `triage:${attempt}`, schema: TRIAGE, effort: 'high' }, A?.modelExpert),
  );
  if (triage === null) {
    return { status: 'TRIAGE_FAILED', attempt, attempts, deployNumber };
  }
  attempts.push({
    attempt,
    deployNumber,
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
  // Фикс — в изолированном worktree, текстовый протокол OK/COMMIT/BRANCH/
  // PUSHED/SUMMARY/WORKTREE (как в build-autofix: isolation проверен e2e).
  const fix = await agent(
    `Деплой ${job} #${deployNumber} упал. Диагноз: ${triage.category} — ${triage.rootCause}. ` +
      `Подсказка: ${triage.fixHint}. Исправь по своему протоколу: воспроизведи (красный), минимальная правка, ` +
      'зелёный, commit, push. Ты запущен в свежем git-worktree: работай в нём (pwd покажет путь для отчёта), ' +
      'рабочая ветка от базовой, коммит и push оттуда. Заверши отчёт строками ' +
      'OK / COMMIT / BRANCH / PUSHED / SUMMARY / WORKTREE.',
    withModel(
      { agentType: 'deploy-fix', label: `fix:${attempt}`, isolation: 'worktree', effort: 'high' },
      A?.modelExpert,
    ),
  );
  const fixOk = fix !== null && /^true$/i.test(field(fix, 'OK') ?? 'false');
  const fixCommit = fix === null ? null : field(fix, 'COMMIT');
  const fixBranch = fix === null ? null : field(fix, 'BRANCH');
  const fixPushed = fix !== null && /^true$/i.test(field(fix, 'PUSHED') ?? 'false');
  const fixSummary = fix === null ? '' : (field(fix, 'SUMMARY') ?? '');
  const fixWorktree = fix === null ? null : (field(fix, 'WORKTREE') ?? null);
  if (!fixOk || !fixPushed) {
    phase('Result');
    // worktree не прибираем: человеку нужен каталог с незавершённым фиксом
    return {
      status: 'FIX_FAILED',
      attempt,
      attempts,
      triage,
      lastFix,
      fix: fix === null
        ? null
        : { commit: fixCommit, summary: fixSummary, worktree: fixWorktree, excerpt: String(fix).slice(0, 300) },
    };
  }
  lastFix = {
    attempt,
    commit: fixCommit,
    branch: fixBranch ?? branch ?? null,
    worktree: safeWorktree(fixWorktree),
  };
  log(`Попытка ${attempt}: фикс ${fixCommit ?? '?'} запушен в ${fixBranch ?? branch ?? '?'} — повторный деплой`);
}

phase('Result');
await cleanupWorktree(lastFix === null ? null : lastFix.worktree);
return { status: 'EXHAUSTED', maxAttempts, attempts, lastFix };
