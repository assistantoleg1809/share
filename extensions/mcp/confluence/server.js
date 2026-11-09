#!/usr/bin/env node
// confluence — эталонный stdio MCP-мок: runbook сборки/деплоя.
const readline = require('readline');

const PAGES = {
  'Runbook сборки calc-app': 'Runbook: при SyntaxError в extensions/e2e/target/app.py проверь двоеточие в сигнатуре def (смотри строку из лога). Проверка локально: python3 -c "import sys; sys.path.insert(0, \'extensions/e2e/target\'); import app". Тесты: python3 -m pytest extensions/e2e/target/ -q (если pytest недоступен — достаточно импорта).',
  'Runbook деплоя app-deploy': 'Runbook: ошибки «No space left on device» на deploy-агенте — известная проблема DevOps, тикет DEVOPS-4821. Со стороны кода не правится: передать в DevOps.',
};

const TOOLS = [
  { name: 'get_page', description: 'Страница Confluence по заголовку', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
  { name: 'search', description: 'Поиск страниц', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
];

function call(name, a) {
  if (name === 'get_page') {
    const title = String(a.title || '');
    if (PAGES[title]) return PAGES[title];
    const hit = Object.keys(PAGES).find((k) => title && k.toLowerCase().includes(String(title).toLowerCase()));
    return hit ? PAGES[hit] : 'Страница не найдена: ' + title;
  }
  if (name === 'search') {
    const q = String(a.query || '').toLowerCase();
    return JSON.stringify(Object.keys(PAGES).filter((k) => q === '' || k.toLowerCase().includes(q)).map((k) => ({ title: k })));
  }
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'confluence-mock', version: '1.0.0' } });
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
