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
    prId: { type: ['string', 'number'] },
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

const DEV = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    branch: { type: 'string' },
    prId: { type: ['string', 'number'] },
    prUrl: { type: 'string' },
    summary: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['ok', 'branch', 'prId'],
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

if (!args?.now) {
  throw new Error('args.now обязателен (ISO-строка текущего времени) — драйвер передаёт его при каждом тике');
}
const now = args.now;

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
    { agentType: 'openspec', label: 'jira:scan', schema: TASKS },
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
    { agentType: 'openspec', label: `spec:${key}`, schema: SPEC },
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
  const dev = await agent(
    `Реализуй задачу ${key} по OpenSpec-каталогу ${state.specDir ?? 'openspec/changes/' + key} ` +
      '(режим implement + pr): ветка, коммиты, pull request в Bitbucket со ссылкой на Jira.',
    { agentType: 'implementer', label: `dev:${key}`, schema: DEV },
  );
  if (dev === null || !dev.ok) {
    state.phase = 'DEV_FAILED';
    state.lastError = dev === null ? 'агент implementer не завершился' : (dev.error ?? 'неизвестная ошибка');
    state.history = history(state, 'dev-failed');
    report = { status: 'DEV_FAILED', task: key, error: state.lastError };
  } else {
    state.phase = 'PR_WAIT';
    state.branch = dev.branch ?? null;
    state.prId = dev.prId ?? null;
    state.fixRetries = 0;
    state.history = history(state, 'pr-opened');
    report = {
      status: 'PR_OPEN',
      task: key,
      branch: state.branch,
      prId: state.prId,
      prUrl: dev.prUrl ?? null,
    };
  }
  done = true;
}

if (!done && state.phase === 'PR_WAIT') {
  const pr = await agent(
    `Режим check: pull request ${state.prId} (ветка ${state.branch}). Верни состояние и нерешённые замечания.`,
    { agentType: 'implementer', label: `pr:check:${state.prId}`, schema: PR },
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
      const build = await workflow('build-autofix', { job, branch: state.branch, maxAttempts: 3 });
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
        const fix = await agent(
          `Режим fix: pull request ${state.prId}. Замечания:\n${JSON.stringify(unresolved, null, 2)}\n` +
            `Устрани каждое и запушь в ${state.branch}.`,
          { agentType: 'implementer', label: `pr:fix:${state.prId}:${retries}`, schema: FIXR },
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
  // Терминальные фазы: закрываем задачу с записью в историю, следующий тик
  // возьмёт новую из Jira.
  const previousPhase = state.phase ?? 'UNKNOWN';
  state = { phase: 'IDLE', history: history(state, `closed:${previousPhase}`) };
  log(`Задача ${key || '?'} закрыта в фазе ${previousPhase} — воркер переходит к скану`);
  report = { status: 'TASK_CLOSED', previousPhase, task: key };
}

state.lastTick = now;
phase('Result');
await saveState(state);
return report;
