export const meta = {
  name: 'build-fix-loop',
  description: 'Полный цикл: сборка → триаж ошибки → отчёты sonar/vuln → правка кода (TDD, worktree) → пересборка',
  whenToUse: 'Нужно довести сборку до зелёной, автоматически исправляя ошибки',
  phases: [
    { title: 'Build', detail: 'Запуск сборки и статус (мок: детерминированно)' },
    { title: 'Triage', detail: 'Классификация ошибки упавшей сборки' },
    { title: 'Checks', detail: 'Отчёты sonar и уязвимостей (параллельно)' },
    { title: 'Fix', detail: 'Минимальный фикс по TDD в изолированном worktree' },
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

let maxIter = args.maxIterations;
if (maxIter === undefined || maxIter < 1) maxIter = 3;
if (maxIter > 5) maxIter = 5;
let build = args.buildNumber;
if (build === undefined) build = 1;
const report = { job: args.jobName, project: args.project, iterations: [], result: 'не запускалось' };

for (let i = 1; i <= maxIter; i++) {
  phase('Build');
  const trig = await agent(
    'Цель: запустить сборку и узнать статус. Вызови MCP jenkins-mock -> jenkins_trigger_build с job="' + args.jobName + '", build=' + build +
    ', затем jenkins_get_job_status с теми же job/build. Верни одной строкой итоговый статус (SUCCESS или FAILURE). Только эти два вызова.',
    { label: 'build:' + i });
  if (trig === null) { report.result = 'агент сборки упал на итерации ' + i; break; }
  const status = /SUCCESS/i.test(String(trig)) ? 'SUCCESS' : 'FAILURE';
  report.iterations.push({ iteration: i, build: build, status: status });
  log('итерация ' + i + ': сборка #' + build + ' -> ' + status);
  if (status === 'SUCCESS') { report.result = 'зелёная сборка на итерации ' + i; break; }

  phase('Triage');
  const tri = await agent(
    'Цель: классифицировать ошибку упавшей сборки. Вызови jenkins-mock -> jenkins_get_build_log job="' + args.jobName + '" build=' + build + '. ' +
    'Класс: sonar / компиляция / тесты / инфра / деплой. Укажи файл и строку из лога. Только чтение. Проект: ' + args.project + '.',
    { label: 'triage:' + i, schema: CLASS_SCHEMA });
  if (tri === null) { report.result = 'triage-агент упал на итерации ' + i; break; }
  report.iterations[report.iterations.length - 1].triage = tri;

  phase('Checks');
  const checks = await parallel([
    () => agent('Цель: отчёт SonarQube. Вызови MCP sonar-mock -> sonar_get_issues project="' + args.project + '". Верни одной строкой самое критичное (severity + правило + сообщение). Только чтение.', { label: 'check:sonar', effort: 'low' }),
    () => agent('Цель: отчёт уязвимостей. Вызови MCP vuln-mock -> vuln_get_findings project="' + args.project + '". Верни одной строкой самое критичное (severity + CVE + компонент). Только чтение.', { label: 'check:vuln', effort: 'low' }),
  ]);
  const sonarTop = checks[0] === null ? 'нет данных' : String(checks[0]).slice(0, 200);
  const vulnTop = checks[1] === null ? 'нет данных' : String(checks[1]).slice(0, 200);
  report.iterations[report.iterations.length - 1].checks = { sonar: sonarTop, vuln: vulnTop };

  phase('Fix');
  const fix = await agent(
    'Цель: исправь ошибку сборки. Проект лежит в подкаталоге mcp-jenkins-test/ репозитория. ' +
    'Диагноз: ' + tri.category + ' — ' + tri.summary +
    (tri.file ? (' (' + tri.file + (tri.line ? (':' + tri.line) : '') + ')') : '') + '. ' +
    'Дисциплина: 1) воспроизведи: если mcp-jenkins-test/.venv отсутствует — создай (python3 -m venv mcp-jenkins-test/.venv && mcp-jenkins-test/.venv/bin/pip install -q pytest), ' +
    'запусти mcp-jenkins-test/.venv/bin/python -m pytest mcp-jenkins-test/src/tests/ -q и убедись в ошибке. ' +
    '2) минимальный фикс. 3) снова тесты до зелёного. ' +
    'Контекст (НЕ исправлять в этом цикле): sonar: ' + sonarTop + ' | уязвимости: ' + vulnTop + '. ' +
    'Границы: только файл из диагноза. Не заявляй успех без вывода тестов. ' +
    'Верни: суть правки + последние строки прогона тестов.',
    { label: 'fix:' + i, isolation: 'worktree' });
  if (fix === null) { report.result = 'fix-агент упал на итерации ' + i; break; }
  report.iterations[report.iterations.length - 1].fix = String(fix).slice(0, 500);
  build = build + 1;
}
if (report.result === 'не запускалось') report.result = 'лимит итераций исчерпан, сборка всё ещё красная';
return report;
