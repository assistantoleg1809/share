#!/usr/bin/env node
// make_sandbox3 — одноразовая песочница кейса-3 (проект на суперпауэрс-
// скиллах: инструмент спеки — brainstorming → writing-plans; openspec
// в песочнице нет вообще). Арка зелёная: build/deploy SUCCESS, багов
// в Jenkinsfile нет — падения диагнозов закрыты кейсами 1–2.
import { mkdirSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, '../../conveyor/e2e/mcp/mock.mjs');
const skillsSrc = join(here, '../../../research/superpowers-skills/skills');
const sb = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'ship-kit-case3-'));

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
writeFileSync(join(sb, 'Jenkinsfile'), `pipeline {
  agent any
  environment { DEPLOY_HOST = 'ift.reports.corp' }
  stages {
    stage('test') { steps { sh 'node app.test.js' } }
    stage('deploy-ift') { steps { sh "deploy.sh --host \${DEPLOY_HOST} --stand IFT" } }
  }
}
`);

// суперпауэрс-скиллы — в песочницу (конвенция называет их инструментом
// спекирования); openspec-скиллы и openspec-корень НЕ копируются
mkdirSync(join(sb, '.agents/skills'), { recursive: true });
for (const s of ['brainstorming', 'writing-plans', 'test-driven-development']) {
  cpSync(join(skillsSrc, s), join(sb, '.agents/skills', s), { recursive: true });
}

writeFileSync(join(sb, 'ship-kit.projects.md'), `# Файл проектов — reports (песочница кейса-3)

Контекст проекта: агент читает файл и сам применяет правила; скиллы
ship-kit файл не читают.

## reports

- Ключ задач: PRJ · базовая ветка: main (пуш запрещён)
- Рабочие ветки: feature/<КЛЮЧ> · фиксы bugfix/<КЛЮЧ> · тех-фиксы fixci/<КЛЮЧ>

## MCP-серверы (alias = значение аргумента вызова)

- mcp-tracker = jira · mcp-docs = wiki · mcp-repo = bb
- mcp-build = jenkins · mcp-deploy = jenkins

## Джобы CI

- build: calc-app — тесты репо + платформенный ci-тест отчётов
- deploy: calc-app-deploy — стенд только IFT (STAND=IFT)

## Конвенции спеки — правила проекта (применяются всегда, без напоминания)

- **Спека обязательна**: каждая задача оформляется изменением до кода
  (лёгкого пути без спеки в этом проекте нет).
- Инструмент спекирования проекта — **суперпауэрс-скиллы** из списка
  скиллов сессии: brainstorming (дизайн, утверждается человеком) →
  writing-plans (план работ); при нескольких кандидатах спекирования
  выбираются суперпауэрс-скиллы.
- Артефакты: \`specs/<ключ родительской стори>-<slug названия задачи>/
  {design.md,plan.md}\` (родительская сторь и название — из jira по
  ключу задачи).
- Реализация идёт по чек-листу плана, TDD: красный → зелёный.
- Аргументы вызовов скиллов (mcp-*) агент берёт из этого файла —
  называть их в задании не нужно.

## Известные особенности стендов

- IFT: платформенный ci-тест отчётов — среднее по строкам: пустой
  массив → 0 (стандарт платформы; см. wiki «Отчёты»).
`);

mkdirSync(join(sb, '.qwen'));
const srv = (role) => ({ command: 'node', args: [mock, role], env: { MOCK_STATE: join(sb, 'mcp-state.json') } });
writeFileSync(join(sb, '.qwen/settings.json'), JSON.stringify({
  mcpServers: { jira: srv('jira'), wiki: srv('confluence'), bb: srv('bitbucket'), jenkins: srv('jenkins') },
  permissions: { allow: [
    'Bash(git checkout *)', 'Bash(git log *)', 'Bash(git status *)',
    'Bash(git add *)', 'Bash(git commit *)', 'Bash(git push *)',
    'Bash(node *)', 'Bash(true)',
    'mcp__jira__get_issue', 'mcp__jira__search_issues',
    'mcp__wiki__search_pages', 'mcp__wiki__get_page',
    'mcp__bb__get_repo_info', 'mcp__bb__list_prs', 'mcp__bb__create_pr', 'mcp__bb__get_pr', 'mcp__bb__add_comment', 'mcp__bb__resolve_comment',
    'mcp__jenkins__jenkins_get_build', 'mcp__jenkins__jenkins_search_build_log', 'mcp__jenkins__jenkins_trigger_build',
  ] },
}, null, 2));

writeFileSync(join(sb, 'mcp-state.json'), JSON.stringify({
  jira: { issues: [
    { key: 'PRJ-705', summary: 'Отчёты', issuetype: 'Story', status: 'In Progress' },
    { key: 'PRJ-999', summary: 'Добавь среднее по строкам отчёта', issuetype: 'Task', status: 'Open',
      parent: { key: 'PRJ-705', summary: 'Отчёты' },
      description: 'Среднее по числам строк отчёта. Стори PRJ-705.' },
  ] },
  confluence: { pages: {
    'отчёты': 'PRJ-705: отчёты; стандарт платформы — среднее по строкам: пустой массив даёт 0.',
    runbook: 'Deploy IFT: зелёный деплой — норма; падения — по runbook Jenkins.',
  } },
  jenkins: {
    results: { 'calc-app': ['SUCCESS'], 'calc-app-deploy:IFT': ['SUCCESS'] },
  },
  bitbucket: { autoMerge: false, prs: {}, counter: 0 },
}, null, 1));

writeFileSync(join(sb, '.gitignore'), '.origin/\n');
execSync(`git init -q -b main && git add -A && git -c user.email=case3@mock -c user.name=case3 commit -qm "init: reports (PRJ-705)" && git init --bare -q -b main .origin && git remote add origin "${sb}/.origin" && git push -q -u origin main`, { cwd: sb });

console.log(sb);
