#!/usr/bin/env node
// mmap — эталонный stdio MCP-мок: сервер схем/знаний (минимальный).
const readline = require('readline');

const SCHEMES = [
  { title: 'Процесс релиза', content: 'сборка (calc-app) → деплой (app-deploy) → передача в тестирование' },
  { title: 'Схема расчётного модуля', content: 'e2e/target/app.py: add/sub/mul/div; div(x,0) → None по требованию PRJ-42' },
];

const TOOLS = [
  { name: 'search', description: 'Поиск по схемам/знаниям', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'ping', description: 'Проверка доступности', inputSchema: { type: 'object', properties: {} } },
];

function call(name, a) {
  if (name === 'ping') return 'ok';
  if (name === 'search') {
    const q = String(a.query || '').toLowerCase();
    return JSON.stringify(SCHEMES.filter((s) => q === '' || (s.title + s.content).toLowerCase().includes(q)));
  }
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mmap-mock', version: '1.0.0' } });
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
