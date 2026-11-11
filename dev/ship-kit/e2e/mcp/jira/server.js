#!/usr/bin/env node
// jira — эталонный stdio MCP-мок: назначенная задача PRJ-42 и DevOps-тикет.
const readline = require('readline');

const ASSIGNED = [
  {
    key: 'PRJ-42',
    summary: 'div(x,0) должен возвращать None — в dev/ship-kit/e2e/target/app.py синтаксическая ошибка',
    url: 'https://jira.example.com/browse/PRJ-42',
    jenkinsJob: 'calc-app',
  },
];

const DEVOPS_TICKETS = [
  { key: 'DEVOPS-4821', summary: 'deploy-agent-03: нет места на диске (массовая, 5 открытых дубликатов)', url: 'https://jira.example.com/browse/DEVOPS-4821' },
];

const TOOLS = [
  { name: 'search_assigned_tasks', description: 'Задачи, назначенные на меня и готовые к работе', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'get_task', description: 'Задача по ключу', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'search_issues', description: 'Поиск тикетов по тексту (например, для DevOps-борда)', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'add_comment', description: 'Комментарий в задачу', inputSchema: { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' } }, required: ['key', 'text'] } },
];

function call(name, a) {
  if (name === 'search_assigned_tasks') return JSON.stringify(ASSIGNED);
  if (name === 'get_task') {
    return JSON.stringify({
      key: a.key,
      summary: (ASSIGNED.find((t) => t.key === a.key) || {}).summary || 'Задача ' + a.key,
      description: 'Требование: div(x, 0) возвращает None. Целевой файл dev/ship-kit/e2e/target/app.py. Сборочная джоба calc-app, deploy-джоба app-deploy.',
    });
  }
  if (name === 'search_issues') {
    const text = String(a.text || '');
    const infra = /deploy|диск|space|инфра|agent|rsync|артефакт/i.test(text);
    return JSON.stringify(infra ? DEVOPS_TICKETS : []);
  }
  if (name === 'add_comment') return 'ok: комментарий добавлен к ' + a.key;
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'jira-mock', version: '1.0.0' } });
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
