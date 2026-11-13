#!/usr/bin/env node
// mock_smoke — смоук-тест моков e2e-стенда (без LLM): каждая роль поднимается
// по stdio, отвечает на initialize, отдаёт tools/list с контрактными именами
// и отвечает на tools/call. Тестирует поставляемый артефакт стенда.
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MOCK = join(here, '../e2e/mcp/mock.mjs');
const state = join(here, 'fixtures/.smoke-state.json');

const EXPECT = {
  jenkins: ['jenkins_trigger_build', 'jenkins_get_build', 'jenkins_search_build_log'],
  jira: ['search_issues', 'get_issue'],
  confluence: ['get_page'],
  sonar: ['quality_gate'],
  bitbucket: ['create_pr', 'get_pr', 'list_prs'],
};

function rpc(role, lines) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [MOCK, role], { env: { ...process.env, MOCK_STATE: state } });
    let buf = '', out = [];
    const timer = setTimeout(() => { p.kill(); reject(new Error(`${role}: таймаут`)); }, 15000);
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (l) out.push(JSON.parse(l));
      }
      if (out.length >= lines) { clearTimeout(timer); p.kill(); resolve(out); }
    });
    p.stderr.on('data', () => {});
    let id = 0;
    const send = (method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    send('initialize', {});
    send('tools/list', {});
    send('tools/call', { name: EXPECT[role][0], arguments: {} });
    p.on('error', reject);
  });
}

let fail = 0;
for (const [role, names] of Object.entries(EXPECT)) {
  try {
    rmSync(state, { force: true });
    writeFileSync(state, '{}');
    const replies = await rpc(role, 3);
    const init = replies[0]?.result?.serverInfo?.name;
    const tools = (replies[1]?.result?.tools || []).map((t) => t.name);
    const callOk = replies[2]?.result?.content?.[0]?.text !== undefined;
    const missing = names.filter((n) => !tools.includes(n));
    if (init === `${role}-mock` && !missing.length && callOk) {
      console.log(`✓ ${role}: initialize + ${tools.length} инструментов + call`);
    } else {
      console.log(`✗ ${role}: init=${init} missing=${missing.join(',') || '—'} call=${callOk}`); fail = 1;
    }
  } catch (e) { console.log(`✗ ${role}: ${e.message}`); fail = 1; }
}
rmSync(state, { force: true });
process.exit(fail);
