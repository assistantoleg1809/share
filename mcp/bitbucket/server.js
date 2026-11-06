#!/usr/bin/env node
// bitbucket — эталонный stdio MCP-мок: PR с одним замечанием ревьюера.
// Цикл: create_pr → PR OPEN с замечанием; после resolve_comment всех
// замечаний → MERGED. Состояние — в файле .qwen/tmp/bitbucket-mock-state.json
// в cwd сессии: каждый workflow-агент получает свой процесс мока, состояние
// обязано переживать агентов (урок e2e из jenkins-мока).
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE_FILE = path.join(process.cwd(), '.qwen', 'tmp', 'bitbucket-mock-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { nextPrId: 137, prs: {} };
  }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

const initialComments = () => [
  { id: 1, author: 'lead', text: 'Покажи в тесте или ответе, как покрыт случай деления на ноль (div(x,0) → None).' },
];

const TOOLS = [
  { name: 'create_pr', description: 'Создать pull request из ветки', inputSchema: { type: 'object', properties: { branch: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } }, required: ['branch', 'title'] } },
  { name: 'get_pr', description: 'Состояние PR: state, замечания (prId — число)', inputSchema: { type: 'object', properties: { prId: { type: 'number' } }, required: ['prId'] } },
  { name: 'add_comment', description: 'Ответ на замечание в PR (prId — число)', inputSchema: { type: 'object', properties: { prId: { type: 'number' }, text: { type: 'string' } }, required: ['prId', 'text'] } },
  { name: 'resolve_comment', description: 'Закрыть замечание ревьюера (prId — число)', inputSchema: { type: 'object', properties: { prId: { type: 'number' }, commentId: { type: 'number' } }, required: ['prId', 'commentId'] } },
];

const prState = (s, id) => {
  const pr = s.prs[id];
  if (!pr) return null;
  const unresolved = pr.comments.filter((c) => !pr.resolved[c.id]);
  if (pr.state === 'OPEN' && unresolved.length === 0) pr.state = 'MERGED';
  return { state: pr.state, commentsCount: pr.comments.length, unresolved, url: pr.url };
};

function call(name, a) {
  const s = loadState();
  try {
    if (name === 'create_pr') {
      const id = s.nextPrId++;
      s.prs[id] = { state: 'OPEN', comments: initialComments(), resolved: {}, url: 'https://bitbucket.local/pr/' + id };
      return JSON.stringify({ ok: true, prId: id, branch: a.branch, url: s.prs[id].url, state: 'OPEN' });
    }
    if (name === 'get_pr') {
      const id = Number(a.prId);
      const st = prState(s, id);
      if (!st) return JSON.stringify({ state: 'MISSING' });
      return JSON.stringify(st);
    }
    if (name === 'add_comment') {
      const id = Number(a.prId);
      if (!s.prs[id]) return 'PR не найден: ' + id;
      s.prs[id].comments.push({ id: s.prs[id].comments.length + 100, author: 'dev', text: a.text });
      return 'ok: комментарий добавлен в PR ' + id;
    }
    if (name === 'resolve_comment') {
      const id = Number(a.prId);
      if (!s.prs[id]) return 'PR не найден: ' + id;
      s.prs[id].resolved[Number(a.commentId)] = true;
      return 'ok: замечание ' + a.commentId + ' закрыто в PR ' + id;
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
      send(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'bitbucket-mock', version: '1.1.0' } });
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

