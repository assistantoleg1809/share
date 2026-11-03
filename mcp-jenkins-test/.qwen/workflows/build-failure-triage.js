export const meta = {
  name: 'build-failure-triage',
  description: 'Разбор лога упавшей сборки Jenkins: классификация + известные решения + массовость',
  whenToUse: 'Сборка или деплой упали и нужно понять причину и что делать',
  phases: [
    { title: 'Triage', detail: 'Лог сборки через MCP → классификация ошибки' },
    { title: 'Known issues', detail: 'Тикеты DevOps и проверка массовости (параллельно)' },
  ],
};

const CLASS_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['sonar', 'компиляция', 'тесты', 'инфра', 'деплой'] },
    summary: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'number' },
    evidence: { type: 'string' },
  },
  required: ['category', 'summary', 'evidence'],
};
const TICKETS_SCHEMA = {
  type: 'object',
  properties: {
    tickets: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } }, required: ['id', 'title'] } },
    note: { type: 'string' },
  },
  required: ['tickets'],
};
const MASS_SCHEMA = {
  type: 'object',
  properties: { isMass: { type: 'boolean' }, similarCount: { type: 'number' }, note: { type: 'string' } },
  required: ['isMass'],
};

phase('Triage');
const cls = await agent(
  'Цель: прочитать лог упавшей сборки и классифицировать ошибку. ' +
  'Вызови MCP-инструмент jenkins-mock -> jenkins_get_build_log с job="' + args.jobName + '", build=' + args.buildNumber + '. ' +
  'Классифицируй: sonar / компиляция / тесты / инфра / деплой. Укажи файл и строку, если есть, и процитируй ключевую строку лога. ' +
  'Ограничения: только чтение, никаких правок. Проект: ' + args.project + '.',
  { label: 'triage:log', schema: CLASS_SCHEMA });
if (cls === null) return { ok: false, error: 'triage-агент не вернул классификацию' };

phase('Known issues');
const known = await parallel([
  () => agent(
    'Цель: найти открытые тикеты DevOps-борды ' + args.devopsBoard + ' по ошибке: "' + cls.summary + '" (категория: ' + cls.category + '). ' +
    'В мок-среде опирайся на файл mcp/fixtures/build-deploy-infra-error.log (там перечислены тикеты) и известные тебе типовые проблемы. ' +
    'Формат — по схеме. Только чтение.',
    { label: 'known:tickets', schema: TICKETS_SCHEMA }),
  () => agent(
    'Цель: определить, массовая ли проблема: сколько тикетов с той же ошибкой "' + cls.summary + '" открыто. ' +
    'Границы: не ищи решение, только массовость. Формат — по схеме.',
    { label: 'known:mass', schema: MASS_SCHEMA, disallowedTools: ['mcp__sonar-mock'] }),
]);
return {
  ok: true,
  build: { job: args.jobName, build: args.buildNumber },
  error: log,
  known: {
    tickets: known[0] === null ? null : known[0].tickets,
    mass: known[1],
  },
};
