#!/usr/bin/env node
// make_sandbox — одноразовая песочница live-прогона demo-project.
// Сид: стартовая точка задачи PRJ-777 (экспорта нет), моки из стенда
// examples/conveyor, деплой только IFT: #1 падает по коду задачи
// (smoke ждёт «;», спека — запятая), #2 зелёный после фикса.
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, '../../conveyor/e2e/mcp/mock.mjs');
const sb = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'ship-kit-live-'));

writeFileSync(join(sb, 'app.js'), `function add(a, b) {
  return a + b;
}
module.exports = { add };
`);
writeFileSync(join(sb, 'app.test.js'), `const assert = require('node:assert');
const { add } = require('./app.js');
assert.strictEqual(add(2, 3), 5);
console.log('OK: add зелёный');
`);

writeFileSync(join(sb, 'ship-kit.projects.md'), `# Файл проектов — calc (песочница live-прогона)

Контекст проекта: агент читает файл и сам собирает аргументы вызова
скиллов ship-kit; скиллы файл не читают.

## calc

- Ключ задач: PRJ (Jira) · базовая ветка: main (пуш запрещён)
- Рабочие ветки: задачи — feature/<КЛЮЧ>, фиксы — bugfix/<КЛЮЧ>

## MCP-серверы (alias = значение аргумента вызова)

- mcp-tracker = jira · mcp-docs = wiki · mcp-repo = bb
- mcp-build = jenkins · mcp-deploy = jenkins

## Джобы CI

- build: calc-app — прогон тестов (node app.test.js)
- deploy: calc-app-deploy — **стенд только IFT** (деплой этого проекта
  идёт только на IFT, параметр STAND=IFT)

## Конвенции спеки (только этого проекта)

- Спека задачи — директория \`specs/<ключ родительской стори>-<название задачи>/\`
  (proposal.md + tasks.md). Родительская стори и название задачи — из
  jira по ключу задачи (get_issue: parent и summary). Название директории —
  slug из summary задачи.
`);

mkdirSync(join(sb, '.qwen'));
const srv = (role) => ({ command: 'node', args: [mock, role], env: { MOCK_STATE: join(sb, 'mcp-state.json') } });
writeFileSync(join(sb, '.qwen/settings.json'), JSON.stringify({
  mcpServers: { jira: srv('jira'), wiki: srv('confluence'), bb: srv('bitbucket'), jenkins: srv('jenkins') },
  permissions: { allow: [
    'Bash(git checkout *)', 'Bash(git log *)', 'Bash(git status *)',
    'Bash(openspec *)', 'Bash(node *)', 'Bash(true)',
    'mcp__jira__get_issue', 'mcp__jira__search_issues',
    'mcp__wiki__search_pages', 'mcp__wiki__get_page',
    'mcp__bb__get_repo_info', 'mcp__bb__list_prs', 'mcp__bb__create_pr', 'mcp__bb__get_pr', 'mcp__bb__add_comment', 'mcp__bb__resolve_comment',
    'mcp__jenkins__jenkins_get_build', 'mcp__jenkins__jenkins_search_build_log', 'mcp__jenkins__jenkins_trigger_build',
  ] },
}, null, 2));

writeFileSync(join(sb, 'mcp-state.json'), JSON.stringify({
  jira: { issues: [
    { key: 'PRJ-700', summary: 'Экспорт отчётов', issuetype: 'Story', status: 'In Progress' },
    { key: 'PRJ-777', summary: 'Добавь экспорт отчётов в CSV', issuetype: 'Task', status: 'Open',
      parent: { key: 'PRJ-700', summary: 'Экспорт отчётов' },
      description: 'Экспорт результатов расчётов в CSV для BI. Разделитель — запятая (по спеке аналитика). Стори PRJ-700.' },
  ] },
  confluence: { pages: {
    'экспорт отчётов': 'Требования PRJ-700: выгрузка расчётов в CSV для платформы отчётов.',
    runbook: 'Deploy IFT: smoke-экспорт гоняет toCsv; кодовое падение — фикс в репо.',
  } },
  jenkins: {
    results: { 'calc-app': ['SUCCESS'], 'calc-app-deploy:IFT': ['FAIL_TASKCODE', 'SUCCESS'] },
    logs: { FAIL_TASKCODE: {
      snippet: "AssertionError [smoke-export]: expected '1;2\\n3;4', got '1,2\\n3,4' (toCsv: неверный разделитель, платформа отчётов требует ';')",
      tail: "[deploy IFT] smoke: toCsv([[1,2],[3,4]])\nexpected: '1;2\\n3;4'\n     got: '1,2\\n3,4'\n[deploy] smoke-export failed (exit 1) — платформа отчётов требует разделитель ';'",
    } },
  },
  bitbucket: {},
}, null, 1));

writeFileSync(join(sb, '.gitignore'), '.origin/\n');
execSync(`git init -q -b main && git add -A && git -c user.email=live@mock -c user.name=live commit -qm "init: calc (PRJ-700)" && git init --bare -q -b main .origin && git remote add origin "${sb}/.origin" && git push -q -u origin main`, { cwd: sb });
console.log(sb);
