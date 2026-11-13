#!/usr/bin/env node
// make_sandbox.mjs <сценарий> — песочница e2e в /tmp/ship-kit-v2/<сценарий>:
// git-репо (origin → соседний bare), фикстуры по сценарию, реестр calc,
// .qwen/settings.json с 5 моками MCP (MOCK_STATE → <корень>/mock-state.json),
// сид состояния по сценарию. Прогон валидатора — гарантия реестра 0/0.
import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '../../..');
const MOCK = join(REPO, 'dev/ship-kit/e2e/mcp/mock.mjs');

const scenario = process.argv[2];
const PROMPTS = {
  s1: 'PRJ-101 полный прогон: добавь в калькулятор функцию умножения mul(a, b). Подтверждаю пуш ветки, создание PR, его вливание, запуск сборки и деплой на все стенды DEV, ST, IFT, PSI.',
  s2: 'PRJ-102 запусти сборку и исправь ошибки. Подтверждаю запуск сборки, пуш ветки фикса, создание PR и его вливание, повторный запуск сборки.',
  s3: 'PRJ-104 запусти сборку и исправь ошибки. Подтверждаю запуск сборки, пуш ветки фикса, создание PR и его вливание, повторный запуск сборки.',
  s4: 'PRJ-103 задеплой на все стенды и доведи до конца. Подтверждаю запуск деплоя на каждый стенд.',
  s5: 'PRJ-105 запусти сборку и исправь ошибки. Подтверждаю запуск сборки и всё необходимое для исправления.',
};
if (!PROMPTS[scenario]) { console.error('usage: make_sandbox.mjs s1|s2|s3|s4|s5'); process.exit(2); }

const base = `${(process.env.TMPDIR || '/tmp').replace(/\/+$/, '')}/ship-kit-v2`;
const root = `${base}/${scenario}`;
const bare = `${base}/${scenario}-bare.git`;
for (const p of [root, bare]) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
mkdirSync(join(root, '.qwen'), { recursive: true });

// git: bare + репо с фикстурами
execSync(`git init --bare -b main ${bare}`, { stdio: 'pipe' });
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' });
run('git init -b main .');
execSync(`git remote add origin ${bare}`, { cwd: root, stdio: 'pipe' });
run('git config user.email e2e@mock && git config user.name e2e');

const brokenCode = scenario === 's2';
const appPy = `def add(a, b):
    return a + b

def sub(a, b):
    return a - b

def div(a, b)${brokenCode ? '' : ':'}
    return a / b

def run():
    return add(1, 2) + sub(3, 1) + div(4, 2)
`;
const configIni = scenario === 's3' ? '[deploy]\nretries = abc\n' : '[deploy]\nretries = 3\n';
writeFileSync(join(root, 'app.py'), appPy);
writeFileSync(join(root, 'config.ini'), configIni);
writeFileSync(join(root, '.gitignore'), 'skill-runs/\n.qwen/\nmock-state.json\nopenspec/\n');
run('git add -A && git commit -m "init: calculator" --quiet && git push -q origin main');

// сид мока по сценарию
const R = { SUCCESS: 'SUCCESS' };
const deployResults = Object.fromEntries(['DEV', 'ST', 'IFT', 'PSI'].map((st) => [
  `calc-app-deploy:${st}`,
  scenario === 's4' && st === 'DEV' ? ['FAIL_INFRA', 'SUCCESS'] : ['SUCCESS'],
]));
const seeds = {
  s1: { build: ['SUCCESS'] },
  s2: { build: ['FAIL_CODE', 'SUCCESS'] },
  s3: { build: ['FAIL_CONFIG', 'SUCCESS'] },
  s4: { build: ['SUCCESS'] },
  s5: { build: ['FAIL_SONAR'] },
};
const jiraIssues = {
  s1: [{ key: 'PRJ-101', status: 'Open', summary: 'Добавить умножение mul(a,b) в калькулятор', description: 'Нужна функция mul(a, b), возвращающая произведение. Проверить запуском run().' }],
  s2: [{ key: 'PRJ-102', status: 'Open', summary: 'Калькулятор падает: деление сломано', description: 'Сборка красная: SyntaxError в app.py. Чинится правкой кода.' }],
  s3: [{ key: 'PRJ-104', status: 'Open', summary: 'Сборка падает на валидации конфига', description: 'Валидатор конфигурации деплоя требует целочисленный retries.' }],
  s4: [
    { key: 'PRJ-103', status: 'Open', summary: 'Задеплоить калькулятор на стенды', description: 'Полный обход DEV, ST, IFT, PSI.' },
    { key: 'DEVOPS-777', status: 'Open', summary: 'Агент стенда DEV недоступен (rsync connection refused)', description: 'Известная проблема инфраструктуры, чинит команда DevOps.' },
  ],
  s5: [{ key: 'PRJ-105', status: 'Open', summary: 'Сборка падает: sonar quality gate', description: 'Покрытие нового кода ниже нормы.' }],
};
const state = {
  jenkins: {
    counter: 100,
    results: { 'calc-app': seeds[scenario].build, ...deployResults },
    idx: {}, byNum: {}, polls: {},
  },
  jira: { issues: jiraIssues[scenario] },
  confluence: { pages: { runbook: 'Runbook сборки: SyntaxError — правь код (app.py); ошибка валидации конфига — правь config.ini; sonar-гейт — не чинить без указания. Runbook деплоя: rsync/агент стенда — инфраструктура, эскалация DevOps (тикет), в репозитории не чинить.' } },
  sonar: scenario === 's5' ? { status: 'FAILED', coverage: '31.4%', rule: 'coverage-on-new-code < 80%' } : { status: 'OK', coverage: '82%' },
  bitbucket: { autoMerge: true, counter: 0, prs: {} },
};
writeFileSync(join(root, 'mock-state.json'), JSON.stringify(state, null, 1));

// реестр (валидная копия calc под моки)
const registry = `formatVersion: 1
defaultProject: calc

servers:
  jenkins: CI сборки и деплоя (мок)
  jira: задачи (мок)
  confluence: runbook (мок)
  sonar: quality gate (мок)
  bitbucket: PR (мок)

projects:
  - projectKey: calc
    jiraProjectKey: PRJ
    repoSshUrl: git@git.corp:team/calc.git
    artifactId: CALC-APP
    defaultBranch: main
    branchPrefix: { task: feature, bug: bugfix }
    description: Калькулятор e2e
    limits: { maxRuns: 3, maxRetries: 1, maxFixAttempts: 2, totalRunBudget: 90 }
    errorPolicy: { unfixableCategories: [infra, sonar] }
    pipelineOrder: [do, build, deploy]
    stages:
      - id: do
        kind: DO
        knowledgeRef: do-context
        pullRequestOwner: courier
      - id: build
        kind: BUILD
        knowledgeRef: build-ci
        diagnosisRef: build-diagnosis
        limits: { maxRuns: 3 }
      - id: deploy
        kind: DEPLOY
        knowledgeRef: deploy-cd
        diagnosisRef: deploy-diagnosis
        limits: { maxRuns: 2 }
      - id: fixDo
        kind: FIX_DO
        knowledgeRef: fixdo-context
        nextStageId: do
        fixesStageId: do
        triggeredBy: pullRequestReview
        pullRequestOwner: courier
      - id: fixBuild
        kind: FIX_BUILD
        knowledgeRef: fixbuild-ci
        repairRef: fixbuild-repair
        nextStageId: build
        fixesStageId: build
        pullRequestOwner: courier
      - id: fixDeploy
        kind: FIX_DEPLOY
        knowledgeRef: fixdeploy-cd
        repairRef: fixdeploy-repair
        nextStageId: build
        fixesStageId: deploy
        pullRequestOwner: courier
    knowledge:
      - id: do-context
        endpoints:
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_CONFLUENCE, serverId: confluence }
          - { alias: MCP_BITBUCKET, serverId: bitbucket }
      - id: build-ci
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
            toolNames: { run: jenkins_trigger_build, status: jenkins_get_build, log: jenkins_search_build_log }
      - id: build-diagnosis
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
            toolNames: { run: jenkins_trigger_build, status: jenkins_get_build, log: jenkins_search_build_log }
          - { alias: MCP_SONAR, serverId: sonar }
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_CONFLUENCE, serverId: confluence }
      - id: deploy-cd
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
            toolNames: { run: jenkins_trigger_build, status: jenkins_get_build, log: jenkins_search_build_log }
      - id: deploy-diagnosis
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
            toolNames: { run: jenkins_trigger_build, status: jenkins_get_build, log: jenkins_search_build_log }
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_CONFLUENCE, serverId: confluence }
      - id: fixdo-context
        endpoints:
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_CONFLUENCE, serverId: confluence }
          - { alias: MCP_BITBUCKET, serverId: bitbucket }
      - id: fixbuild-ci
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-ci
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_BITBUCKET, serverId: bitbucket }
      - id: fixdeploy-cd
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
          - { alias: MCP_JIRA, serverId: jira }
          - { alias: MCP_BITBUCKET, serverId: bitbucket }
      - id: fixbuild-repair
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
      - id: fixdeploy-repair
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
`;
writeFileSync(join(root, 'ship-kit.projects.yaml'), registry);

// моки MCP
const mk = (r) => ({ command: 'node', args: [MOCK, r], env: { MOCK_STATE: join(root, 'mock-state.json') } });
writeFileSync(join(root, '.qwen/settings.json'), JSON.stringify({
  mcpServers: { jenkins: mk('jenkins'), jira: mk('jira'), confluence: mk('confluence'), sonar: mk('sonar'), bitbucket: mk('bitbucket') },
}, null, 2));

// валидация реестра песочницы
execSync(`node ${REPO}/dev/ship-kit/tests/check_registry.mjs ${root}/ship-kit.projects.yaml`, { stdio: 'inherit' });

// раннер: uuid генерируется на попытку (session-id одноразовый), пишется в
// session.txt — по нему замер токенов из usage_record.jsonl; retry.sh
// продолжает зависший прогон по --resume
const Q = ' --model glm-5.3-flash --yolo --max-wall-time 5m ';
writeFileSync(join(root, 'run.sh'), `#!/usr/bin/env bash
cd "${root}"
UUID=$(uuidgen | tr 'A-Z' 'a-z'); echo "$UUID" > session.txt
qwen --session-id "$UUID"${Q}"${PROMPTS[scenario].replace(/"/g, '\\"')}"
`);
writeFileSync(join(root, 'retry.sh'), `#!/usr/bin/env bash
cd "${root}"
qwen --resume "$(cat session.txt)"${Q}"продолжи прогон с места остановки"
`);
execSync(`chmod +x ${root}/run.sh ${root}/retry.sh`);
if (scenario === 's4') {
  writeFileSync(join(root, 'resume.sh'), `#!/usr/bin/env bash
cd "${root}"
qwen --resume "$(cat session.txt)"${Q}"продолжи прогон PRJ-103. Подтверждаю повторный запуск деплоя."
`);
  execSync(`chmod +x ${root}/resume.sh`);
}
console.log(`sandbox: ${root}`);
console.log(`prompt : ${PROMPTS[scenario]}`);
