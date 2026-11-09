#!/usr/bin/env node
// jenkins — эталонный stdio MCP-мок для e2e эталона агентов/workflows.
// Имена сервера и инструментов совпадают с продакшн-идентикаторами из
// .qwen/agents/* в режиме копии; в режиме расширения — agent-файлы комплекта
// (mcp__jenkins__trigger_build и т.д.).
// Детерминизм: первый запуск сборки/деплоя → FAILURE (фикстура), далее SUCCESS.
// Статус: первый опрос каждого запуска → RUNNING, далее терминальный.
// Состояние — в файле .qwen/tmp/jenkins-mock-state.json в cwd сессии: каждый
// workflow-агент получает СВОЙ stdio-процесс мока, памяти процесса мало —
// счётчики обязаны переживать агентов (урок e2e: пересборка снова была #1).
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const STATE_FILE = path.join(process.cwd(), '.qwen', 'tmp', 'jenkins-mock-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { buildCounter: 0, deployCounter: 0, buildStatusCalls: {}, deployStatusCalls: {} };
  }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

const TOOLS = [
  { name: 'trigger_build', description: 'Запустить сборку job', inputSchema: { type: 'object', properties: { job: { type: 'string' }, branch: { type: 'string' } }, required: ['job'] } },
  { name: 'get_build_status', description: 'Статус сборки: RUNNING | SUCCESS | FAILURE', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
  { name: 'get_build_log', description: 'Лог сборки (фикстура)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
  { name: 'trigger_deploy', description: 'Запустить deploy-джобу', inputSchema: { type: 'object', properties: { job: { type: 'string' }, branch: { type: 'string' } }, required: ['job'] } },
  { name: 'get_deploy_status', description: 'Статус деплоя: RUNNING | SUCCESS | FAILURE', inputSchema: { type: 'object', properties: { job: { type: 'string' }, deploy: { type: 'number' } }, required: ['job', 'deploy'] } },
  { name: 'get_deploy_log', description: 'Лог деплоя (фикстура)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, deploy: { type: 'number' } }, required: ['job', 'deploy'] } },
];

const outcome = (n) => (Number(n) === 1 ? 'FAILURE' : 'SUCCESS');

function call(name, a) {
  const job = String(a.job || 'calc-app');
  const s = loadState();
  try {
    if (name === 'trigger_build') {
      s.buildCounter += 1;
      return JSON.stringify({ ok: true, job, buildNumber: s.buildCounter, url: 'http://jenkins.local/job/' + job + '/' + s.buildCounter });
    }
    if (name === 'get_build_status') {
      const b = Number(a.build || 1);
      s.buildStatusCalls[b] = (s.buildStatusCalls[b] || 0) + 1;
      return s.buildStatusCalls[b] === 1 ? 'RUNNING' : outcome(b);
    }
    if (name === 'get_build_log') {
      return read(outcome(Number(a.build || 1)) === 'FAILURE' ? 'build-compile-error.log' : 'build-success.log');
    }
    if (name === 'trigger_deploy') {
      s.deployCounter += 1;
      return JSON.stringify({ ok: true, job, deployNumber: s.deployCounter, url: 'http://jenkins.local/job/' + job + '/' + s.deployCounter });
    }
    if (name === 'get_deploy_status') {
      const d = Number(a.deploy || 1);
      s.deployStatusCalls[d] = (s.deployStatusCalls[d] || 0) + 1;
      return s.deployStatusCalls[d] === 1 ? 'RUNNING' : outcome(d);
    }
    if (name === 'get_deploy_log') {
      return read(outcome(Number(a.deploy || 1)) === 'FAILURE' ? 'deploy-infra-error.log' : 'build-success.log');
    }
    throw new Error('unknown tool: ' + name);
  } finally {
    saveState(s);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'jenkins-mock', version: '1.1.0' } });
    } else if (msg.method === 'tools/list') {
      send(msg.id, { tools: TOOLS });
    } else if (msg.method === 'tools/call') {
      send(msg.id, { content: [{ type: 'text', text: String(call(msg.params.name, msg.params.arguments || {})) }] });
    } else {
      send(msg.id, undefined, { code: -32601, message: 'method not found: ' + msg.method });
    }
  } catch (e) {
    send(msg.id, undefined, { code: -32000, message: String((e && e.message) || e) });
  }
});
function send(id, result, error) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result, error }) + '\n');
}
