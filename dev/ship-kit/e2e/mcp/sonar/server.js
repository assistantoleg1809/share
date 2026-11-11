#!/usr/bin/env node
// sonar — эталонный stdio MCP-мок: отчёт качества.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

const TOOLS = [
  { name: 'get_issues', description: 'Проблемы качества по проекту', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
];

function call(name, a) {
  if (name === 'get_issues') {
    return fs.readFileSync(path.join(FIXTURES, 'sonar-issues.json'), 'utf8');
  }
  throw new Error('unknown tool: ' + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'sonar-mock', version: '1.0.0' } });
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
