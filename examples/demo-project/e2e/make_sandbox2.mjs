#!/usr/bin/env node
// make_sandbox2 — одноразовая песочница кейса-2 (замечание на PR →
// CI-тесты ❌ → Jenkins-конфиг ❌ → фиксы). Правила спеки — в файле
// проектов; openspec-скиллы копируются в песочницу (discovery видит).
import { mkdirSync, writeFileSync, mkdtempSync, cpSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, '../../conveyor/e2e/mcp/mock.mjs');
const skillsSrc = join(here, '../../../.agents/skills');
const sb = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'ship-kit-case2-'));

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
    stage('deploy-ift') { steps { sh "deploy.sh --host \${STAND_HOS} --stand IFT" } }
  }
}
`);

// openspec-скиллы — в песочницу (правила проекта применяются без промпта)
const skills = readdirSync(skillsSrc).filter((d) => d.startsWith('openspec-'));
for (const s of skills) {
  mkdirSync(join(sb, '.agents/skills'), { recursive: true });
  cpSync(join(skillsSrc, s), join(sb, '.agents/skills', s), { recursive: true });
}

writeFileSync(join(sb, 'ship-kit.projects.md'), `# Файл проектов — reports (песочница кейса-2)

Контекст проекта: агент читает файл и сам применяет правила; скиллы
ship-kit файл не читают.

## reports

- Ключ задач: PRJ · базовая ветка: main (пуш запрещён)
- Рабочие ветки: feature/<КЛЮЧ> · фиксы bugfix/<КЛЮЧ> · тех-фиксы fixci/<КЛЮЧ>

## MCP-серверы (alias = значение аргумента вызова)

- mcp-jira = jira · mcp-confluence = wiki · mcp-bitbucket = bb
- mcp-build = jenkins · mcp-deploy = jenkins

## Джобы CI

- build: calc-app — тесты репо + платформенный ci-тест отчётов
- deploy: calc-app-deploy — стенд только IFT (STAND=IFT)

## Конвенции спеки — правила проекта (применяются всегда, без напоминания)

- **Спека обязательна**: каждая задача оформляется изменением до кода
  (лёгкого пути без спеки в этом проекте нет).
- Инструмент спекирования проекта — **openspec-скилл** из списка
  скиллов сессии (например openspec-propose); при нескольких
  кандидатах спекирования выбирается openspec-скилл.
- Имя изменения: \`<ключ родительской стори>-<slug названия задачи>\`
  (родительская сторь и название — из jira по ключу задачи);
  артефакты изменения — \`openspec/changes/<имя>/\`.
- Реализация идёт по чек-листу tasks.md изменения.
- Аргументы вызовов скиллов (mcp-*) агент берёт из этого файла —
  называть их в задании не нужно.

## Известные особенности стендов

- IFT: платформенный ci-тест отчётов требует округление сумм до 2
  знаков (стандарт платформы; см. wiki «Отчёты»).
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
    { key: 'PRJ-705', summary: 'Отчёты', issuetype: 'Story', status: 'In Progress' },
    { key: 'PRJ-888', summary: 'Добавь округление суммы в отчёте', issuetype: 'Task', status: 'Open',
      parent: { key: 'PRJ-705', summary: 'Отчёты' },
      description: 'Сумма строк отчёта с округлением. По спеке аналитика — округление до целых (Math.round). Стори PRJ-705.' },
  ] },
  confluence: { pages: {
    'отчёты': 'PRJ-705: суммы отчётов; стандарт платформы — округление до 2 знаков.',
    runbook: 'Deploy IFT: падение конфига Jenkins — правка Jenkinsfile в репо; кодовое падение ci-теста — фикс в репо.',
  } },
  jenkins: {
    results: { 'calc-app': ['FAIL_TEST', 'SUCCESS'], 'calc-app-deploy:IFT': ['FAIL_JENKINSCFG', 'SUCCESS'] },
    logs: {
      FAIL_TEST: {
        snippet: "AssertionError [ci-total]: expected total([10.555, 0.005]) to be 10.56 (стандарт платформы: округление до 2 знаков), got 11",
        tail: "[build] node ci-total.test.js\nexpected: 10.56\n     got: 11\n[build] платформенный ci-тест отчётов failed (exit 1): округление сумм — до 2 знаков",
      },
      FAIL_JENKINSCFG: {
        snippet: "groovy.lang.MissingPropertyException: No such property: STAND_HOS (Jenkinsfile, stage deploy-ift)",
        tail: "[deploy IFT] Running: deploy.sh --host ${STAND_HOS} --stand IFT\ngroovy.lang.MissingPropertyException: No such property: STAND_HOS for class: groovy.lang.Binding\n\tat Jenkinsfile(stage deploy-ift)\n[deploy] конфигурация джобы упала (exit 1) — опечатка в Jenkinsfile репозитория",
      },
    },
  },
  bitbucket: { autoMerge: false, prs: {}, counter: 0 },
}, null, 1));

writeFileSync(join(sb, '.gitignore'), '.origin/\n');
execSync(`git init -q -b main && git add -A && git -c user.email=case2@mock -c user.name=case2 commit -qm "init: reports (PRJ-705)" && git init -q -b main .origin && git remote add origin "${sb}/.origin" && git push -q -u origin main`, { cwd: sb });

// минимальный openspec-корень (эквивалент init, без интерактива)
mkdirSync(join(sb, 'openspec'), { recursive: true });
writeFileSync(join(sb, 'openspec/config.yaml'), 'schema: spec-driven\n');
writeFileSync(join(sb, 'openspec/project.md'), '# reports — песочница кейса-2 demo-project\n');
console.log(sb);
