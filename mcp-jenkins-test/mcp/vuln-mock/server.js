#!/usr/bin/env node
// vuln-mock — stdio MCP-мок (эталонная форма mcp-jenkins-test). Ноль зависимостей.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'vuln-findings.json');
const TOOLS = [
  { name: 'vuln_get_findings', description: 'Отчёт сервиса уязвимостей: findings по проекту (фикстура)', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: [] } },
];
function call(name, args) {
  if (name === 'vuln_get_findings') {
    const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    if (args && args.project) data.project = String(args.project);
    return JSON.stringify(data, null, 1);
  }
  throw new Error('unknown tool: ' + name);
}
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id === undefined) return;
  try {
    if (msg.method === 'initialize') {
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vuln-mock', version: '1.0.0' } });
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
