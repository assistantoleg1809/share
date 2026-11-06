export const meta = {
  name: 'Autonomous worker tick',
  description:
    'Тик автономного воркера: Jira → OpenSpec → реализация → PR → ревью → сборка. Драйвер цикла — /loop 5m, состояние в .qwen/autonomous-worker/state.json',
  whenToUse:
    'Регулярный опрос Jira и продвижение назначенной задачи по конвейеру (вызывается планировщиком раз в 5 минут)',
  phases: [
    { title: 'State', detail: 'Чтение state.json и скан назначенных задач Jira' },
    { title: 'Step', detail: 'Один шаг конвейера: spec / dev / pr-check (+fix) / build' },
    { title: 'Result', detail: 'Отчёт тика и запись нового состояния' },
  ],
};

const STATE_PATH = '.qwen/autonomous-worker/state.json';

const STATE = {
  type: 'object',
  properties: {
    missing: { type: 'boolean' },
    phase: {
      type: 'string',
      enum: [
        'IDLE', 'SPEC', 'DEV', 'PR_WAIT',
        'DONE', 'SPEC_FAILED', 'DEV_FAILED', 'BUILD_FAILED', 'PR_DECLINED', 'PR_STUCK',
      ],
    },
    task: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        summary: { type: 'string' },
        url: { type: 'string' },
        jenkinsJob: { type: 'string' },
      },
      required: ['key'],
    },
    specDir: { type: 'string' },
    branch: { type: 'string' },
    prId: { type: 'string' },
    worktreePath: { type: 'string' },
    fixRetries: { type: 'number' },
    lastTick: { type: 'string' },
    lastError: { type: 'string' },
    history: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'string' }, event: { type: 'string' }, task: { type: 'string' } },
        required: ['at', 'event'],
      },
    },
  },
};

const TASKS = {
  type: 'object',
  properties: {
    mcpOk: { type: 'boolean' },
    problem: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          summary: { type: 'string' },
          url: { type: 'string' },
          jenkinsJob: { type: 'string' },
        },
        required: ['key', 'summary'],
      },
    },
  },
  required: ['mcpOk', 'tasks'],
};

const SPEC = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    specDir: { type: 'string' },
    jenkinsJob: { type: 'string' },
    summary: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    error: { type: 'string' },
  },
  required: ['ok'],
};

const PR = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['OPEN', 'MERGED', 'DECLINED', 'MISSING'] },
    commentsCount: { type: 'number' },
    unresolved: {
      type: 'array',
      items: {
        type: 'object',
        properties: { author: { type: 'string' }, text: { type: 'string' } },
        required: ['text'],
      },
    },
    url: { type: 'string' },
  },
  required: ['state'],
};

const FIXR = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    commit: { type: 'string' },
    pushed: { type: 'boolean' },
    summary: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['ok', 'pushed'],
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

if (!A?.now) {
  throw new Error('args.now обязателен (ISO-строка текущего времени) — драйвер передаёт его при каждом тике');
}
const now = A.now;

const history = (state, event) =>
  (state.history ?? []).concat([{ at: now, event, task: state.task?.key ?? '' }]).slice(-20);

async function saveState(next) {
  const w = await agent(
    `Запиши файл ${STATE_PATH} в корне репозитория (создай каталог при необходимости, перезапись целиком):\n` +
      `${JSON.stringify(next, null, 2)}\nВерни ok=true.`,
    { label: 'state:write', schema: WRITE },
  );
  if (w === null || !w.ok) {
    log('state:write не удался — состояние тика не сохранено, следующий тик начнёт с прежнего');
  }
}

phase('State');
const read = await agent(
  `Прочитай файл ${STATE_PATH} в корне репозитория и верни его содержимое как есть. Файла нет — верни {missing:true}.`,
  { label: 'state:read', schema: STATE },
);
if (read === null) {
  return { status: 'ERROR', step: 'state-read', message: 'не удалось прочитать состояние воркера' };
}
let state = read.missing ? { phase: 'IDLE', history: [] } : { ...read };
delete state.missing;

let report = { status: 'IDLE' };
let done = false;

phase('Step');
const key = state.task?.key ?? '';

// Тик исполняет ровно один блок — так проще resume и предсказуемее расход токенов.

if (!done && (state.phase === 'IDLE' || !state.phase)) {
  const scan = await agent(
    'Шаг 0 (доступность jira), затем: найди назначенные мне задачи Jira, готовые к работе ' +
      '(открытые / «к выполнению»), максимум 3, по приоритету. Для каждой: key, summary, url, ' +
      'jenkinsJob — если имя джобы сборки видно из задачи, её полей или привязанного проекта. ' +
      'Назначенных задач нет — верни пустой список.',
    withModel({ agentType: 'openspec', label: 'jira:scan', schema: TASKS, effort: 'low' }, A?.modelFast),
  );
  if (scan === null) {
    report = { status: 'ERROR', step: 'jira-scan', message: 'агент скана Jira не завершился' };
  } else if (!scan.mcpOk) {
    report = {
      status: 'MCP_UNAVAILABLE',
      server: 'jira',
      problem: scan.problem ?? '',
      recommendations: scan.recommendations ?? [],
    };
  } else if (scan.tasks.length === 0) {
    report = { status: 'IDLE', message: 'назначенных задач нет' };
  } else {
    const t = scan.tasks[0];
    state = { phase: 'SPEC', task: t, history: history(state, 'picked') };
    log(`Взята задача ${t.key}: ${t.summary}`);
    report = { status: 'TASK_PICKED', task: t.key, summary: t.summary };
  }
  done = true;
}

if (!done && state.phase === 'SPEC') {
  const spec = await agent(
    `Задача ${state.task.key}: ${state.task.summary}.` +
      (state.task.url ? ` Ссылка: ${state.task.url}.` : '') +
      ' Подготовь OpenSpec-изменение по своему протоколу (шаг 0: jira, confluence, mmap).',
    withModel({ agentType: 'openspec', label: `spec:${key}`, schema: SPEC, effort: 'high' }, A?.modelExpert),
  );
  if (spec === null || !spec.ok) {
    state.phase = 'SPEC_FAILED';
    state.lastError = spec === null ? 'агент openspec не завершился' : (spec.error ?? 'неизвестная ошибка');
    state.history = history(state, 'spec-failed');
    report = { status: 'SPEC_FAILED', task: key, error: state.lastError };
  } else {
    state.phase = 'DEV';
    state.specDir = spec.specDir ?? null;
    if (!state.task.jenkinsJob && spec.jenkinsJob) {
      state.task = { ...state.task, jenkinsJob: spec.jenkinsJob };
    }
    state.history = history(state, 'spec-done');
    // Спека пишется в основной чекаут — коммитим её сразу: DEV-шаг требует
    // чистое дерево для isolation:'worktree' (урок e2e: openspec/ в untracked
    // ронял DEV-агента до старта).
    const commitSpec = await agent(
      'Закоммить в git только новые/изменённые файлы каталога openspec/ ' +
        `(git add openspec && git commit -m "docs(openspec): ${key} — спека" — именно в таком объёме, ` +
        'остальное не трогать). Нечего коммитить — тоже верни ok=true.',
      { label: 'spec:commit', schema: WRITE },
    );
    if (commitSpec === null || !commitSpec.ok) {
      log('openspec-каталог не закоммичен — DEV-шаг откажется до ручного коммита');
    }
    report = {
      status: 'SPEC_DONE',
      task: key,
      specDir: state.specDir,
      questions: spec.questions ?? [],
    };
  }
  done = true;
}

if (!done && state.phase === 'DEV') {
  // Реализация — в изолированном worktree: основной чекаут не занимается
  // задачей воркера (боль «бурных дней»: невозможность переключать ветки).
  const dev = await agent(
    `Реализуй задачу ${key} по OpenSpec-каталогу ${state.specDir ?? 'openspec/changes/' + key} ` +
      '(режим implement + pr). Ты запущен в свежем git-worktree: работай строго в нём ' +
      '(pwd покажет путь для отчёта), ветка, коммиты, pull request в Bitbucket со ссылкой на Jira. ' +
      'Заверши отчёт обязательными строками OK / WORKTREE / BRANCH / PRID / PRURL.',
    withModel(
      { agentType: 'implementer', label: `dev:${key}`, isolation: 'worktree', effort: 'high' },
      A?.modelExpert,
    ),
  );
  if (dev === null) {
    state.phase = 'DEV_FAILED';
    state.lastError = 'агент implementer не завершился';
    state.history = history(state, 'dev-failed');
    report = { status: 'DEV_FAILED', task: key, error: state.lastError };
  } else {
    const devOk = /^true$/i.test(field(dev, 'OK') ?? 'false');
    const devBranch = field(dev, 'BRANCH');
    const devPrId = field(dev, 'PRID');
    const devWorktree = field(dev, 'WORKTREE');
    if (!devOk || !devBranch || !devPrId) {
      state.phase = 'DEV_FAILED';
      state.lastError =
        'implementer вернул неполный отчёт (нужны строки OK/BRANCH/PRID): ' + String(dev).slice(0, 300);
      state.history = history(state, 'dev-failed');
      report = { status: 'DEV_FAILED', task: key, error: state.lastError };
    } else {
      state.phase = 'PR_WAIT';
      state.branch = devBranch;
      state.prId = devPrId;
      state.worktreePath = devWorktree && devWorktree.length > 0 ? devWorktree : null;
      state.fixRetries = 0;
      state.history = history(state, 'pr-opened');
      log(`PR ${devPrId} открыт из worktree ${state.worktreePath ?? '?'} (ветка ${devBranch})`);
      report = {
        status: 'PR_OPEN',
        task: key,
        branch: state.branch,
        prId: state.prId,
        prUrl: field(dev, 'PRURL'),
      };
    }
  }
  done = true;
}

if (!done && state.phase === 'PR_WAIT') {
  const pr = await agent(
    `Режим check: pull request ${state.prId} (ветка ${state.branch}). Верни состояние и нерешённые замечания.`,
    withModel({ agentType: 'implementer', label: `pr:check:${state.prId}`, schema: PR, effort: 'low' }, A?.modelFast),
  );
  if (pr === null) {
    state.lastError = 'агент check PR не завершился';
    report = { status: 'ERROR', step: 'pr-check', task: key, error: state.lastError };
  } else if (pr.state === 'MISSING') {
    state.phase = 'DEV_FAILED';
    state.lastError = `PR ${state.prId} не найден`;
    state.history = history(state, 'pr-missing');
    report = { status: 'DEV_FAILED', task: key, error: state.lastError };
  } else if (pr.state === 'DECLINED') {
    state.phase = 'PR_DECLINED';
    state.history = history(state, 'pr-declined');
    report = { status: 'PR_DECLINED', task: key, pr: pr.url ?? null };
  } else if (pr.state === 'MERGED') {
    const job = state.task?.jenkinsJob;
    if (!job) {
      state.phase = 'BUILD_FAILED';
      state.lastError =
        'jenkinsJob не определён — впиши его в .qwen/autonomous-worker/state.json и дай следующий тик';
      state.history = history(state, 'build-nojob');
      report = { status: 'BUILD_FAILED', task: key, error: state.lastError };
    } else {
      log(`Ветка слита — вызов build-autofix для ${job}`);
      const build = await workflow('build-autofix', {
        job,
        branch: state.branch,
        maxAttempts: 3,
        modelFast: A?.modelFast,
        modelExpert: A?.modelExpert,
      });
      if (build === null) {
        state.phase = 'BUILD_FAILED';
        state.lastError = 'вложенный workflow build-autofix не стартовал (имя/файл не найдены)';
        state.history = history(state, 'build-failed');
        report = { status: 'BUILD_FAILED', task: key, error: state.lastError };
      } else if (build.status === 'SUCCESS') {
        state.phase = 'DONE';
        state.history = history(state, 'done');
        report = { status: 'DONE', task: key, build };
      } else {
        state.phase = 'BUILD_FAILED';
        state.lastError = `build-autofix завершился со статусом ${build.status}`;
        state.history = history(state, 'build-failed');
        report = { status: 'BUILD_FAILED', task: key, build };
      }
    }
  } else {
    const unresolved = pr.unresolved ?? [];
    if (unresolved.length === 0) {
      report = { status: 'PR_WAIT', task: key, commentsCount: pr.commentsCount ?? 0 };
    } else {
      const retries = (state.fixRetries ?? 0) + 1;
      if (retries > 3) {
        state.fixRetries = retries;
        state.phase = 'PR_STUCK';
        state.lastError = 'три попытки устранить замечания не удались — нужно ревью человека';
        state.history = history(state, 'pr-stuck');
        report = { status: 'PR_STUCK', task: key, unresolvedCount: unresolved.length };
      } else {
        const fixOpts = {
          agentType: 'implementer',
          label: `pr:fix:${state.prId}:${retries}`,
          schema: FIXR,
          effort: 'high',
        };
        if (state.worktreePath) {
          fixOpts.workingDir = state.worktreePath;
        }
        const fix = await agent(
          `Режим fix: pull request ${state.prId}. Замечания:\n${JSON.stringify(unresolved, null, 2)}\n` +
            `Устрани каждое: ответь (add_comment), правка, коммит, пуш в ${state.branch}, замечание закрой ` +
            'через resolve_comment.' +
            (state.worktreePath ? ` Работай в worktree ${state.worktreePath}.` : ''),
          withModel(fixOpts, A?.modelExpert),
        );
        if (fix !== null && fix.ok && fix.pushed) {
          state.fixRetries = 0;
          state.history = history(state, 'pr-fixed');
          log(`Замечания устранены (${fix.commit ?? '?'}) — ждём ревью`);
          report = { status: 'PR_FIXED', task: key, commit: fix.commit ?? null };
        } else {
          state.fixRetries = retries;
          state.lastError = fix === null ? 'агент fix не завершился' : (fix.error ?? 'фикс не запушен');
          report = { status: 'FIX_FAILED', task: key, retries, error: state.lastError };
        }
      }
    }
  }
  done = true;
}

if (!done) {
  // Терминальные фазы: прибираем worktree воркера, закрываем задачу в историю,
  // следующий тик возьмёт новую из Jira.
  const previousPhase = state.phase ?? 'UNKNOWN';
  if (state.worktreePath) {
    const clean = await agent(
      `Прибери за воркером: из корня репозитория выполни ` +
        `git worktree remove --force ${state.worktreePath} (каталог работы; ветку не удалять). Верни ok=true.`,
      { label: 'worktree:cleanup', schema: WRITE },
    );
    if (clean === null || !clean.ok) {
      log(`worktree ${state.worktreePath} не удалён — прибери вручную`);
    }
  }
  state = { phase: 'IDLE', history: history(state, `closed:${previousPhase}`) };
  log(`Задача ${key || '?'} закрыта в фазе ${previousPhase} — воркер переходит к скану`);
  report = { status: 'TASK_CLOSED', previousPhase, task: key };
}

state.lastTick = now;
phase('Result');
await saveState(state);

// Звук-уведомление по стандарту Oleg: Tink — завершение, Bottle — нужно внимание.
const SOUNDS = {
  DONE: 'Tink.aiff',
  SPEC_FAILED: 'Bottle.aiff',
  DEV_FAILED: 'Bottle.aiff',
  BUILD_FAILED: 'Bottle.aiff',
  PR_DECLINED: 'Bottle.aiff',
  PR_STUCK: 'Bottle.aiff',
};
const sound = SOUNDS[report.status];
if (sound) {
  const beep = await agent(
    `Выполни ровно одну shell-команду и верни ok=true: afplay /System/Library/Sounds/${sound}`,
    { label: 'notify:sound', schema: WRITE },
  );
  if (beep === null || !beep.ok) {
    log(`звук ${sound} не сыгран — уведомление не доставлено`);
  }
}
return report;
