#!/usr/bin/env node
// jenkins — эталонный stdio MCP-мок для e2e эталона агентов/workflows.
// Имена сервера и инструментов совпадают с продакшн-идентикаторами из
// .qwen/agents/* (mcp__jenkins__trigger_build и т.д.).
// Детерминизм: первый запуск сборки/деплоя → FAILURE (фикстура), далее SUCCESS.
// Статус: первый опрос каждого запуска → RUNNING, далее терминальный.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const TOOLS = [
  { name: 'trigger_build', description: 'Запустить сборку job', inputSchema: { type: 'object', properties: { job: { type: 'string' }, branch: { type: 'string' } }, required: ['job'] } },
  { name: 'get_build_status', description: 'Статус сборки: RUNNING | SUCCESS | FAILURE', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
  { name: 'get_build_log', description: 'Лог сборки (фикстура)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, build: { type: 'number' } }, required: ['job', 'build'] } },
  { name: 'trigger_deploy', description: 'Запустить deploy-джобу', inputSchema: { type: 'object', properties: { job: { type: 'string' }, branch: { type: 'string' } }, required: ['job'] } },
  { name: 'get_deploy_status', description: 'Статус деплоя: RUNNING | SUCCESS | FAILURE', inputSchema: { type: 'object', properties: { job: { type: 'string' }, deploy: { type: 'number' } }, required: ['job', 'deploy'] } },
  { name: 'get_deploy_log', description: 'Лог деплоя (фикстура)', inputSchema: { type: 'object', properties: { job: { type: 'string' }, deploy: { type: 'number' } }, required: ['job', 'deploy'] } },
];

let buildCounter = 0;
let deployCounter = 0;
const buildStatusCalls = {};
const deployStatusCalls = {};
const outcome = (n) => (Number(n) === 1 ? 'FAILURE' : 'SUCCESS');

function call(name, a) {
  const job = String(a.job || 'calc-app');
  if (name === 'trigger_build') {
    buildCounter += 1;
    return JSON.stringify({ ok: true, job, buildNumber: buildCounter, url: 'http://jenkins.local/job/' + job + '/' + buildCounter });
  }
  if (name === 'get_build_status') {
    const b = Number(a.build || 1);
    buildStatusCalls[b] = (buildStatusCalls[b] || 0) + 1;
    return buildStatusCalls[b] === 1 ? 'RUNNING' : outcome(b);
  }
  if (name === 'get_build_log') {
    return read(outcome(Number(a.build || 1)) === 'FAILURE' ? 'build-compile-error.log' : 'build-success.log');
  }
  if (name === 'trigger_deploy') {
    deployCounter += 1;
    return JSON.stringify({ ok: true, job, deployNumber: deployCounter, url: 'http://jenkins.local/job/' + job + '/' + deployCounter });
  }
  if (name === 'get_deploy_status') {
    const d = Number(a.deploy || 1);
    deployStatusCalls[d] = (deployStatusCalls[d] || 0) + 1;
    return deployStatusCalls[d] === 1 ? 'RUNNING' : outcome(d);
  }
  if (name === 'get_deploy_log') {
    return read(outcome(Number(a.deploy || 1)) === 'FAILURE' ? 'deploy-infra-error.log' : 'build-success.log');
  }
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
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
