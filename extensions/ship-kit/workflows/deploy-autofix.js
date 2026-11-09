export const meta = {
  // Имя workflow: для расширений имя берётся ИЗ meta.name (не из имени файла)
  // и обязано быть kebab-lowercase — иначе загрузчик расширения молча пропустит скрипт.
  name: 'deploy-autofix',
  description:
    'Запуск deploy-джобы Jenkins с разбором ошибок деплоя: до 2 попыток «запуск → ожидание → триаж (приоритет: инфра/DevOps-тикет) → фикс, если правится конфигом/кодом». Прогон ведёт run-журнал на диске и после обрыва продолжает уже запущенный деплой вместо повторного запуска',
  whenToUse:
    'Успешная сборка слита, нужно прогнать deploy-джобу; при падении — понять: инфра/известная проблема DevOps или правится кодом',
  phases: [
    { title: 'MCP check', detail: 'Доступность Jenkins и run-журнал прошлого прогона: продолжить или начать' },
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

// Решение о resume — по ОДНОЙ строке _resume из журнала, а не по эху полей:
// быстрая модель теряет поля JSON и превращает null в строку "null"
// (поймано e2e 2026-11-09, раунды 2–3: status и номер читались, а branch/kind/
// job — нет, прогон уходил в дубль). Короткую строку модель эхирует дословно.
const JOURNAL = {
  type: 'object',
  properties: {
    missing: { type: 'boolean' },
    _resume: { type: 'string' },
    updatedAt: { type: 'string' },
    status: { type: 'string' },
    attempts: { type: 'array', items: { type: 'object' } },
    history: { type: 'array', items: { type: 'object' } },
  },
};

// Реестр проектов (Задача «конфиг проектов»): job/ветка/политики могут жить
// в файле, а не в args — расширение читает конфиг первым делом. Читаем
// свободным объектом: записи короткие, строковые поля эхируются надёжно.
const REGISTRY = {
  type: 'object',
  properties: {
    missing: { type: 'boolean' },
    path: { type: 'string' },
    defaultProject: { type: 'string' },
    projects: { type: 'object' },
    checkedPaths: { type: 'array', items: { type: 'string' } },
  },
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
// Тег задачи и путь журнала интерполируются в промпты файловых агентов —
// тоже только через проверку формы (инвариант: новая точка интерполяции =
// новый валидатор). Тег «PRJ-42 slack» → каталог openspec/changes/PRJ-42-slack/.
const SAFE_JOURNAL = /^[\w][\w./-]*\.json$/;
const slugTag = (t) => {
  if (t === null || t === undefined) return null;
  const s = String(t).trim().replace(/\s+/g, '-');
  return /^[\w][\w.-]*$/.test(s) ? s : null;
};
const NOW = (typeof A?.now === 'string' && A.now) || null;

const jobArg = typeof A?.job === 'string' ? A.job.trim() : '';
const branchArg = A?.branch;
const maxAttempts = A?.maxAttempts ?? 2;
const MAX_WATCHERS = 8;

const tag = slugTag(A?.tag);
let journalPath = null;
if (typeof A?.journal === 'string' && SAFE_JOURNAL.test(A.journal)) {
  journalPath = A.journal;
} else if (typeof A?.journal === 'string') {
  log(`args.journal «${A.journal}» не прошёл проверку формы — журнал в каталоге по умолчанию`);
}
if (journalPath === null) {
  // Журнал живёт в каталоге задачи OpenSpec (решение Oleg 2026-11-09):
  // переживает обрыв сессии и перезагрузку, лежит рядом со спекой задачи.
  // Без тега — служебный каталог проекта, НЕ временный (tmp чистится).
  journalPath = tag !== null
    ? `openspec/changes/${tag}/run-deploy.json`
    : '.qwen/ship-kit/runs/run-deploy.json';
}

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

// Реестр проектов читается первым делом (решение владельца 2026-11-09):
// job/ветка/политики ошибок могут прийти из конфига, а не из args. Цепочка
// путей — первый существующий файл рабочий; реестра нет — работаем от args.
const regPaths = [];
if (typeof A?.registry === 'string' && /^[\w.~/-]+\.json$/.test(A.registry)) {
  regPaths.push(A.registry);
} else if (typeof A?.registry === 'string') {
  log(`args.registry «${A.registry}» не прошёл проверку формы — ищу реестр по стандартной цепочке`);
}
regPaths.push('ship-kit.projects.json (корень репозитория)');
regPaths.push('.qwen/ship-kit/projects.json (корень репозитория)');
regPaths.push('~/.qwen/ship-kit/projects.json (домашний каталог пользователя)');
const reg = await agent(
  'Проверь по очереди файлы реестра проектов ship-kit (JSON с полями defaultProject и projects):\n' +
    regPaths.map((p, i) => `${i + 1}. ${p}`).join('\n') +
    '\nПервый существующий файл верни как: path (где нашёл), defaultProject и projects ' +
    '(из файла дословно), checkedPaths (все проверенные пути). ' +
    'Ни один не существует — {missing:true, checkedPaths:[...]}. Другого не возвращай.',
  withModel({ label: 'registry:read', schema: REGISTRY, effort: 'low' }, A?.modelFast),
);
const regProjects = reg !== null && reg.projects !== null && typeof reg.projects === 'object' ? reg.projects : {};
const projectArg = typeof A?.project === 'string' && A.project.trim() ? A.project.trim() : null;
const projectDefault =
  typeof reg?.defaultProject === 'string' && reg.defaultProject.trim() ? reg.defaultProject.trim() : null;
const projectName = projectArg ?? projectDefault;
const entryRaw = projectName !== null && regProjects[projectName] !== null && typeof regProjects[projectName] === 'object'
  ? regProjects[projectName]
  : null;
if (projectArg !== null && entryRaw === null) {
  throw new Error(
    `args.project «${projectArg}» не найден в реестре${reg?.missing === true ? ' (реестр не найден)' : ''}. ` +
      `Доступны проекты: ${Object.keys(regProjects).join(', ') || '—'}`,
  );
}
const regJob = typeof entryRaw?.deployJob === 'string' ? entryRaw.deployJob.trim() : '';
const regBranch = typeof entryRaw?.branchDefault === 'string' ? entryRaw.branchDefault.trim() : '';
const notFixable = Array.isArray(entryRaw?.errorPolicy?.notFixableCategories)
  ? entryRaw.errorPolicy.notFixableCategories.filter((c) => typeof c === 'string' && c.trim())
  : [];
const job = jobArg || regJob;
if (!job) {
  throw new Error(
    'job не определён: args.job не задан, реестр проектов не найден или в записи нет deployJob. ' +
      `Проверенные пути: ${(reg?.checkedPaths ?? regPaths).join('; ')}. ` +
      'Задай args.job или добавь запись в реестр (docs/agents-and-workflows.md §4a).',
  );
}
const branch = branchArg ?? (regBranch || null);
const branchLine = branch ? `Ветка: ${branch}.` : 'Ветка: дефолт джобы.';

// Run-журнал: план вызовов и факты прогона на диске — обрыв процесса или
// выключение компьютера не теряют уже запущенный деплой (номер джобы известен
// до начала ожидания). Возобновим только прогон со статусом RUNNING и известным
// номером деплоя: новую джобу НЕ запускаем, смотрим тот же.
let jr = {
  kind: 'deploy',
  workflow: 'deploy-autofix',
  tag,
  job,
  project: projectName,
  registry: reg?.missing === true ? null : (typeof reg?.path === 'string' ? reg.path : null),
  branch: branch ?? null,
  status: 'RUNNING',
  startedAt: NOW,
  updatedAt: NOW,
  resumeOf: null,
  plan: ['mcp-check', 'trigger', 'watch', 'triage', 'fix', 'result'],
  maxAttempts,
  attempts: [],
  facts: { deployNumber: null, attempt: 0, fixCommit: null, fixBranch: null },
  events: [],
  history: [],
};

const attempts = [];
let lastFix = null;

async function saveJournal() {
  jr.attempts = attempts;
  jr.updatedAt = NOW;
  // Строка-подсказка для resume: единственное, что читает следующий прогон.
  jr._resume =
    'job=' + jr.job +
    ';branch=' + (jr.branch === null || jr.branch === undefined || jr.branch === '' ? '-' : jr.branch) +
    ';number=' + (Number(jr.facts.deployNumber) > 0 ? Number(jr.facts.deployNumber) : 0) +
    ';attempt=' + (jr.facts.attempt || 0) +
    ';status=' + jr.status;
  const w = await agent(
    `Перезапиши файл ${journalPath} в корне репозитория этим содержимым целиком ` +
      '(создай недостающие каталоги, ничего кроме этого файла не трогай):\n' +
      `${JSON.stringify(jr, null, 2)}\nВерни ok=true.`,
    withModel({ label: 'journal:write', schema: WRITE, effort: 'low' }, A?.modelFast),
  );
  if (w === null || !w.ok) {
    log(`journal:write не удался — журнал ${journalPath} не обновлён (прогон продолжается)`);
  }
}

// Каждая терминальная ветка выходит через done(): статус и накопленные
// attempts обязаны попасть на диск до возврата.
async function done(result) {
  jr.status = result.status ?? 'UNKNOWN';
  await saveJournal();
  return result;
}

const prev = await agent(
  `Прочитай файл ${journalPath} в корне репозитория (JSON run-журнала). Верни ровно четыре поля: ` +
    'missing (true, если файла нет); _resume — строку _resume из файла ПОСИМВОЛЬНО ' +
    '(она короткая, вида job=...;branch=...;number=...;attempt=...;status=...); ' +
    'attempts (массив из файла как есть, если есть); history (массив из файла как есть, если есть). ' +
    'Другие поля не возвращай.',
  withModel({ label: 'journal:read', schema: JOURNAL, effort: 'low' }, A?.modelFast),
);
const hint = prev !== null && typeof prev._resume === 'string' ? prev._resume.trim() : null;
const h = hint !== null
  ? hint.match(/^job=([^;]+);branch=([^;]*);number=(\d+);attempt=(\d+);status=([A-Z_]+)$/)
  : null;
const hintOk = h !== null && h[1] === job &&
  (h[2] === '-' ? null : h[2]) === (branch ?? null) &&
  Number(h[3]) > 0 && h[5] === 'RUNNING';
let resume = null;
if (hintOk) {
  resume = prev;
} else if (prev !== null && prev.missing !== true) {
  // Прошлый прогон терминальный (или чужой) — в архив; новый начнётся с чистого
  // журнала, история сохраняется в том же файле.
  jr.history = (Array.isArray(prev.history) ? prev.history : [])
    .concat([{
      finishedAt: typeof prev.updatedAt === 'string' ? prev.updatedAt : null,
      status: h !== null ? h[5] : (typeof prev.status === 'string' ? prev.status : 'UNKNOWN'),
      deployNumber: h !== null ? (Number(h[3]) || null) : null,
    }])
    .slice(-10);
}
let startAttempt = 1;
let resumeDeployNumber = null;
if (resume !== null) {
  resumeDeployNumber = Number(h[3]);
  startAttempt = Math.max(1, Number(h[4]) || 1);
  jr.resumeOf = resumeDeployNumber;
  jr.attempts = Array.isArray(prev.attempts) ? prev.attempts : [];
  jr.facts = {
    deployNumber: resumeDeployNumber,
    attempt: startAttempt,
    fixCommit: null,
    fixBranch: null,
  };
  jr.events = [{
    at: NOW,
    step: 'resume',
    detail: `продолжение после обрыва: деплой #${resumeDeployNumber} уже запущен — повторный trigger не нужен`,
  }];
  jr.history = Array.isArray(prev.history) ? prev.history : [];
  // Прошлые попытки — в рабочий массив: done() пишет в журнал in-memory
  // attempts, без подсева история попыток затиралась бы пустым списком.
  for (const a of (Array.isArray(prev.attempts) ? prev.attempts : [])) {
    attempts.push(a);
  }
  log(`Run-журнал: продолжаю оборванный прогон — деплой #${resumeDeployNumber} (попытка ${startAttempt}), новую джобу не запускаю`);
} else {
  jr.events = [{
    at: NOW,
    step: 'start',
    detail: `новый прогон: job=${job}${branch ? `, ветка ${branch}` : ''}` +
      (jobArg ? '' : ` (из реестра${projectName ? ` «${projectName}»` : ''})`) +
      `, попыток до ${maxAttempts}`,
  }];
}
await saveJournal();

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

for (let attempt = startAttempt; attempt <= maxAttempts; attempt++) {
  jr.facts.attempt = attempt;
  phase('Deploy & watch');
  let deployNumber = null;
  let triggerUrl = null;
  if (resumeDeployNumber !== null && attempt === startAttempt) {
    deployNumber = resumeDeployNumber;
    log(`Попытка ${attempt}: смотрю уже запущенный деплой #${deployNumber} (без нового запуска)`);
  } else {
    const trigger = await agent(
      `Запусти deploy-джобу ${job}. ${branchLine} Одна попытка, без ретраев. Верни номер запуска и url.`,
      withModel(
        { agentType: 'deploy-trigger', label: `deploy:${attempt}`, schema: TRIGGER, effort: 'low' },
        A?.modelFast,
      ),
    );
    if (trigger === null || !trigger.ok) {
      return await done({
        status: 'TRIGGER_FAILED',
        attempt,
        attempts,
        error: trigger === null ? 'агент запуска не завершился' : (trigger.error ?? 'неизвестная ошибка запуска'),
      });
    }
    deployNumber = trigger.deployNumber ?? null;
    triggerUrl = trigger.url ?? null;
    log(`Попытка ${attempt}: деплой #${deployNumber} запущен`);
    // Номер запущенного деплоя — на диск ДО ожидания: обрыв между trigger и
    // watch не должен рождать повторный запуск (главный риск обрыва).
    jr.facts.deployNumber = deployNumber;
    jr.events = jr.events
      .concat([{ at: NOW, step: 'trigger', detail: `попытка ${attempt}: деплой #${deployNumber} запущен` }])
      .slice(-50);
    await saveJournal();
  }

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
    phase('Result');
    await cleanupWorktree(lastFix === null ? null : lastFix.worktree);
    return await done({
      status: 'WATCH_TIMEOUT',
      attempt,
      attempts,
      deployNumber,
      message: `Деплой не завершился за ${MAX_WATCHERS} наблюдателей (~64 мин) — проверь вручную`,
    });
  }
  if (status.state === 'SUCCESS') {
    phase('Result');
    await cleanupWorktree(lastFix === null ? null : lastFix.worktree);
    return await done({
      status: 'SUCCESS',
      attempt,
      deployNumber,
      url: status.url ?? triggerUrl ?? null,
    });
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
    return await done({ status: 'TRIAGE_FAILED', attempt, attempts, deployNumber });
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
    return await done({
      status: 'NOT_FIXABLE',
      attempt,
      attempts,
      triage,
      message: 'Инфраструктура или известная проблема DevOps — передай тикет команде DevOps',
    });
  }
  // Политика проекта из реестра: перечисленные категории не чиним, даже если
  // триаж считает фикс возможным — решение владельца проекта, не агента.
  if (notFixable.indexOf(triage.category) !== -1) {
    phase('Result');
    return await done({
      status: 'NOT_FIXABLE',
      attempt,
      attempts,
      triage,
      message: `категория «${triage.category}» входит в notFixableCategories проекта ${projectName ?? '?'} — фикс не запускается по политике реестра`,
    });
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
    return await done({
      status: 'FIX_FAILED',
      attempt,
      attempts,
      triage,
      lastFix,
      fix: fix === null
        ? null
        : { commit: fixCommit, summary: fixSummary, worktree: fixWorktree, excerpt: String(fix).slice(0, 300) },
    });
  }
  lastFix = {
    attempt,
    commit: fixCommit,
    branch: fixBranch ?? branch ?? null,
    worktree: safeWorktree(fixWorktree),
  };
  jr.facts.fixCommit = fixCommit ?? null;
  jr.facts.fixBranch = lastFix.branch;
  jr.events = jr.events
    .concat([{ at: NOW, step: 'fix', detail: `попытка ${attempt}: фикс ${fixCommit ?? '?'} запушен в ${lastFix.branch ?? '?'}` }])
    .slice(-50);
  await saveJournal();
  log(`Попытка ${attempt}: фикс ${fixCommit ?? '?'} запушен в ${fixBranch ?? branch ?? '?'} — повторный деплой`);
}

phase('Result');
await cleanupWorktree(lastFix === null ? null : lastFix.worktree);
return await done({ status: 'EXHAUSTED', maxAttempts, attempts, lastFix });
