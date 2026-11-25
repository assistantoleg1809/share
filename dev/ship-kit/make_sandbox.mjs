#!/usr/bin/env node
// make_sandbox.mjs [green777] — песочница одного прогона ship-kit v3:
// $TMPDIR/ship-kit/<сценарий> — git-репо (origin → соседний bare),
// фикстуры, сид мока (mock-state.json), копия скиллов skills/ship-kit-*,
// .qwen/settings.json с моками MCP, run.sh / retry.sh (qwen, glm-5.3-flash).
// Всё для стенда — в dev/ship-kit; скиллы берутся из поставки skills/.
import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '../..');
const MOCK = join(here, 'mcp/mock.mjs');

const scenario = process.argv[2] || 'green777';
const PROMPTS = {
  green777: 'PRJ-777 возьми задачу: добавь в калькулятор функцию умножения mul(a, b) и вызови её в run(). mcp-tracker=jira, mcp-repo=bitbucket, mcp-build=jenkins, poll=5. Подтверждаю пуш ветки и создание PR. Подтверждаю запуск сборки PRJ-777.',
};
if (!PROMPTS[scenario]) { console.error('usage: make_sandbox.mjs green777'); process.exit(2); }

const base = `${(process.env.TMPDIR || '/tmp').replace(/\/+$/, '')}/ship-kit`;
const root = `${base}/${scenario}`;
const bare = `${base}/${scenario}-bare.git`;
for (const p of [root, bare]) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
mkdirSync(join(root, '.qwen/skills'), { recursive: true });

// git: bare + репо с фикстурами
execSync(`git init --bare -b main ${JSON.stringify(bare)}`, { stdio: 'pipe' });
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' });
run('git init -b main .');
run(`git remote add origin ${JSON.stringify(bare)}`);
run('git config user.email e2e@mock && git config user.name e2e');

const appPy = `def add(a, b):
    return a + b

def sub(a, b):
    return a - b

def div(a, b):
    return a / b

def run():
    return add(1, 2) + sub(3, 1) + div(4, 2)
`;
writeFileSync(join(root, 'app.py'), appPy);
writeFileSync(join(root, '.gitignore'), '.qwen/\nmock-state.json\n');
run('git add -A && git commit -m "init: calculator" --quiet && git push -q origin main');

// сид мока (green777): сборка зелёная с первой попытки; PR сразу MERGED
const state = {
  jenkins: { counter: 100, results: { 'calc-app': ['SUCCESS'] }, idx: {}, byNum: {}, polls: {} },
  jira: { issues: [{ key: 'PRJ-777', status: 'Open', summary: 'Добавить умножение mul(a, b) в калькулятор', description: 'Нужна функция mul(a, b), возвращающая произведение; вызвать её в run(). Проверить локально запуском run().' }] },
  confluence: { pages: { runbook: 'Runbook сборки (мок): зелёная сборка — изменений не требует.' } },
  bitbucket: { autoMerge: true, counter: 0, prs: {} },
};
writeFileSync(join(root, 'mock-state.json'), JSON.stringify(state, null, 1));

// скиллы — копия из поставки skills/ (тестируется текущее состояние репо)
for (const s of ['ship-kit-task', 'ship-kit-pr', 'ship-kit-ci']) {
  cpSync(join(REPO, 'skills', s), join(root, '.qwen/skills', s), { recursive: true });
}

// моки MCP (stdio; каждый вызов — свой процесс, состояние в файле)
const mk = (r) => ({ command: 'node', args: [MOCK, r], env: { MOCK_STATE: join(root, 'mock-state.json') } });
writeFileSync(join(root, '.qwen/settings.json'), JSON.stringify({
  mcpServers: { jira: mk('jira'), bitbucket: mk('bitbucket'), jenkins: mk('jenkins'), confluence: mk('confluence') },
}, null, 2));

// раннер: session-id одноразовый (session.txt — для --resume), лог в run.log
const Q = ' --model glm-5.3-flash --yolo --max-wall-time 10m ';
writeFileSync(join(root, 'run.sh'), `#!/usr/bin/env bash
set -o pipefail
cd "${root}"
UUID=$(uuidgen | tr 'A-Z' 'a-z'); echo "$UUID" > session.txt
qwen --session-id "$UUID"${Q}"${PROMPTS[scenario].replace(/"/g, '\\"')}" 2>&1 | tee run.log
`);
writeFileSync(join(root, 'retry.sh'), `#!/usr/bin/env bash
set -o pipefail
cd "${root}"
qwen --resume "$(cat session.txt)"${Q}"продолжи прогон PRJ-777 с места остановки" 2>&1 | tee -a run.log
`);
// ручной режим: интерактивная сессия в песочнице, карточки подтверждает
// человек (промпт — без pre-approved фраз, см. README «Ручной запуск»)
writeFileSync(join(root, 'manual.sh'), `#!/usr/bin/env bash
cd "${root}"
qwen --model glm-5.3-flash
`);
execSync(`chmod +x ${root}/run.sh ${root}/retry.sh ${root}/manual.sh`);
console.log(`sandbox: ${root}`);
console.log(`prompt : ${PROMPTS[scenario]}`);
console.log(`next   : bash ${root}/run.sh   (завис — Ctrl-C, затем bash ${root}/retry.sh)`);
console.log(`manual : bash ${root}/manual.sh  — ручной прогон глазами (карточки подтверждаешь ты)`);
