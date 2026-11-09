#!/usr/bin/env node
// jenkins-mock — эталонный stdio MCP-мок Jenkins для mcp-jenkins-test.
// Ноль зависимостей. Детерминированное правило: build=1 → FAILURE (compile-error), build>=2 → SUCCESS.
// Замена на реальный Jenkins MCP — правкой .qwen/settings.json (см. README, раздел «Замена моков»).
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const TOOLS = [
  { name: 'jenkins_trigger_build', description: 'Запустить сборку job (мок: мгновенный детерминированный результат)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job'] } },
  { name: 'jenkins_get_job_status', description: 'Статус сборки: SUCCESS | FAILURE', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
  { name: 'jenkins_get_build_log', description: 'Лог сборки (фикстура из mcp/fixtures)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
];

const outcome = (build) => (Number(build) === 1 ? 'FAILURE' : 'SUCCESS');
const logFor = (build) => (outcome(build) === 'FAILURE' ? 'build-compile-error.log' : 'build-success.log');

function call(name, args) {
  const job = String(args.job || 'calc-app');
  const build = Number(args.build || 1);
  if (name === 'jenkins_trigger_build') {
    return 'Triggered ' + job + ' #' + build + ' -> ' + outcome(build) + ' (mock: детерминированный результат)';
  }
  if (name === 'jenkins_get_job_status') return outcome(build);
  if (name === 'jenkins_get_build_log') return read(logFor(build));
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return; // notification (напр. notifications/initialized) — без ответа
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'jenkins-mock', version: '1.0.0' } });
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
