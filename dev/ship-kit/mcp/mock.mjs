#!/usr/bin/env node
// Универсальный мок MCP-сервера для тест-стенда ship-kit v3 (dev/ship-kit,
// stdio, JSON-RPC). Роль — первым аргументом: jenkins | jira | confluence
// | sonar | bitbucket. Состояние — файл из MOCK_STATE (json): поведение
// детерминировано сидом сценария; все мутации persistятся (каждый вызов —
// свой stdio-процесс). jenkins_get_build: первый опрос — RUNNING (правило
// ожидания ci), create_pr — autoMerge (PR сразу MERGED).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const role = process.argv[2] || 'jenkins';
const statePath = process.env.MOCK_STATE || new URL('./state.json', import.meta.url).pathname;
const load = () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {});
const save = (s) => writeFileSync(statePath, JSON.stringify(s, null, 1));

const BASE_LOGS = {
  FAIL_CODE: {
    snippet: 'SyntaxError: invalid syntax (app.py, line 19)',
    tail: '[compile] python -m py_compile app.py\n  File "app.py", line 19\n    def div(a, b)\n                  ^\nSyntaxError: invalid syntax\n[build] step compile failed (exit 1)',
  },
  FAIL_CONFIG: {
    snippet: "config.ini: [deploy] 'retries' must be an integer, got 'abc'",
    tail: '[config] validating config.ini\n[config] ERROR: deploy.retries: invalid literal for int() with base 10: \'abc\'\n[build] step validate-config failed (exit 1)',
  },
  FAIL_SONAR: {
    snippet: 'ERROR: QUALITY GATE FAILED (corp-calc): coverage 31.4% < 80%',
    tail: '[sonar] quality gate request…\n[sonar] coverage-on-new-code: 31.4% (required 80%)\n[sonar] overall status FAILED\n[build] step quality-gate failed (exit 1)',
  },
  FAIL_INFRA: {
    snippet: 'rsync: failed to connect to stand-dev.corp (Connection refused) — see DEVOPS-777',
    tail: '[deploy] rsync -a dist/ stand-dev.corp:/srv/calc\nrsync: failed to connect to stand-dev.corp: Connection refused (111)\n[deploy] агент стенда DEV недоступен; известная проблема DEVOPS-777',
  },
};

const ok = (msg, id) => ({ jsonrpc: '2.0', id, result: msg });
// Логи падений можно перекрывать из state: s.jenkins.logs[<имя исхода>]
const logs = (s) => ({ ...BASE_LOGS, ...((s.jenkins && s.jenkins.logs) || {}) });
const text = (id, v) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v) }] } });

function jenkinsTools() {
  const terminal = (r) => (r.startsWith('FAIL') ? 'FAILURE' : r);
  return [
    { name: 'jenkins_trigger_build', desc: 'Запустить джобу Jenkins: job + параметры → номер и URL',
      run: (a) => {
        const s = load(); s.jenkins ??= {}; s.jenkins.idx ??= {}; s.jenkins.byNum ??= {}; s.jenkins.polls ??= {};
        const job = a.job || a.jobName || 'calc-app';
        const stand = a.params && (a.params.stand || a.params.STAND || a.params.environment);
        const key = stand ? `${job}:${stand}` : job;
        const seq = (s.jenkins.results || {})[key] || ['SUCCESS'];
        const i = Math.min(s.jenkins.idx[key] || 0, seq.length - 1);
        s.jenkins.idx[key] = (s.jenkins.idx[key] || 0) + 1;
        const number = (s.jenkins.counter = (s.jenkins.counter || 100) + 1);
        s.jenkins.byNum[number] = { job, key, result: seq[i] };
        save(s);
        return { number, url: `http://jenkins.mock/job/${job}/${number}`, job, stand: stand || null };
      } },
    { name: 'jenkins_get_build', desc: 'Статус запуска джобы по номеру: состояние, при падении errorSnippet',
      run: (a) => {
        const s = load(); const n = String(a.number ?? a.build ?? a.buildNumber);
        const b = (s.jenkins?.byNum || {})[n];
        if (!b) return { state: 'UNKNOWN', number: n };
        s.jenkins.polls[n] = (s.jenkins.polls[n] || 0) + 1; save(s);
        if (s.jenkins.polls[n] === 1) return { state: 'RUNNING', number: n, url: `http://jenkins.mock/job/${b.job}/${n}` };
        const st = terminal(b.result);
        return { state: st, number: n, url: `http://jenkins.mock/job/${b.job}/${n}`, errorSnippet: st === 'FAILURE' ? (logs(s)[b.result]?.snippet || 'failure') : undefined };
      } },
    { name: 'jenkins_search_build_log', desc: 'Хвост лога запуска по номеру: первая ошибка и последние строки',
      run: (a) => {
        const s = load(); const n = String(a.number ?? a.build ?? a.buildNumber);
        const b = (s.jenkins.byNum || {})[n] || { result: 'SUCCESS' };
        const l = logs(s)[b.result];
        return { number: n, state: terminal(b.result), errorSnippet: l ? l.snippet : null, logTail: l ? l.tail : '[build] all steps passed (exit 0)' };
      } },
  ];
}

function roleTools() {
  switch (role) {
    case 'jenkins': return jenkinsTools();
    case 'jira': return [
      { name: 'search_issues', desc: 'Поиск задач Jira по тексту: ключ, статус, описание',
        run: (a) => { const s = load(); const q = String((a.query ?? a.text ?? a.jql ?? '')).toLowerCase(); return (s.jira?.issues || []).filter((i) => !q || (i.key + ' ' + i.summary + ' ' + i.description).toLowerCase().includes(q.split('order by')[0].trim().slice(0, 40))); } },
      { name: 'get_issue', desc: 'Прочитать задачу Jira по ключу',
        run: (a) => { const s = load(); return (s.jira?.issues || []).find((i) => i.key === (a.key ?? a.issueKey ?? a.id)) || { error: 'not found' }; } },
    ];
    case 'confluence': return [
      { name: 'get_page', desc: 'Прочитать страницу Confluence по заголовку',
        run: (a) => { const s = load(); const t = String(a.title ?? a.pageTitle ?? '').toLowerCase(); const p = (s.confluence?.pages || {})[t] || (s.confluence?.pages || {})['runbook']; return p ? { title: 'Runbook', body: p } : { error: 'not found' }; } },
      { name: 'search_pages', desc: 'Поиск страниц Confluence по тексту',
        run: () => { const s = load(); return Object.entries(s.confluence?.pages || {}).map(([k, v]) => ({ title: k, excerpt: String(v).slice(0, 80) })); } },
    ];
    case 'sonar': return [
      { name: 'quality_gate', desc: 'Статус quality gate проекта в Sonar',
        run: () => { const s = load(); return s.sonar || { status: 'OK', coverage: '82%' }; } },
    ];
    case 'bitbucket': return [
      { name: 'list_prs', desc: 'Список pull request репозитория с состояниями',
        run: () => { const s = load(); const prs = s.bitbucket?.prs || {}; return Object.entries(prs).map(([id, p]) => ({ id, ...p })); } },
      { name: 'create_pr', desc: 'Создать pull request: ветка, база, заголовок, описание → id и url',
        run: (a) => { const s = load(); s.bitbucket ??= {}; s.bitbucket.prs ??= {}; s.bitbucket.counter ??= 0; const id = ++s.bitbucket.counter; const auto = s.bitbucket.autoMerge !== false; s.bitbucket.prs[id] = { branch: a.branch ?? a.source, base: a.base ?? a.target ?? 'main', title: a.title || 'PR', description: a.description || '', state: auto ? 'MERGED' : 'OPEN', comments: [] }; save(s); return { id, url: `http://bitbucket.mock/pr/${id}`, state: s.bitbucket.prs[id].state }; } },
      { name: 'get_pr', desc: 'Состояние pull request по id: OPEN/MERGED/DECLINED, замечания',
        run: (a) => { const s = load(); const p = (s.bitbucket?.prs || {})[String(a.id ?? a.prId ?? a.pr)]; return p ? { id: String(a.id ?? a.prId ?? a.pr), ...p } : { error: 'not found' }; } },
      { name: 'add_comment', desc: 'Комментарий в pull request',
        run: (a) => { const s = load(); const id = String(a.id ?? a.prId ?? a.pr); const p = (s.bitbucket?.prs || {})[id]; if (p) { p.comments.push({ id: p.comments.length + 1, text: a.text ?? a.body ?? '' }); save(s); } return { ok: true }; } },
      { name: 'resolve_comment', desc: 'Пометить замечание решённым',
        run: () => ({ ok: true }) },
      { name: 'get_repo_info', desc: 'Информация о репозитории',
        run: () => ({ slug: 'team/calc', mainbranch: 'main' }) },
    ];
    default: return [];
  }
}
// inputSchema инструментов (объявляются клиенту; логика принимает аргументы как есть)
const SCHEMAS = {
  jenkins_trigger_build: { job: { type: 'string' }, jobName: { type: 'string' }, params: { type: 'object' } },
  jenkins_get_build: { number: { type: 'number' }, build: { type: 'number' }, buildNumber: { type: 'number' } },
  jenkins_search_build_log: { number: { type: 'number' }, build: { type: 'number' }, buildNumber: { type: 'number' } },
  search_issues: { query: { type: 'string' }, text: { type: 'string' }, jql: { type: 'string' } },
  get_issue: { key: { type: 'string' }, issueKey: { type: 'string' }, id: { type: 'string' } },
  get_page: { title: { type: 'string' }, pageTitle: { type: 'string' } },
  search_pages: {},
  quality_gate: {},
  list_prs: {},
  create_pr: { branch: { type: 'string' }, source: { type: 'string' }, base: { type: 'string' }, target: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } },
  get_pr: { id: { type: 'string' }, prId: { type: 'string' }, pr: { type: 'string' } },
  add_comment: { id: { type: 'string' }, prId: { type: 'string' }, pr: { type: 'string' }, text: { type: 'string' }, body: { type: 'string' } },
  resolve_comment: { id: { type: 'string' } },
  get_repo_info: {},
};
const TOOLS = roleTools();

let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (line) { try { handle(JSON.parse(line)); } catch { /* мусор — игнор */ } }
  }
});
function handle(msg) {
  if (msg.method === 'initialize') return process.stdout.write(JSON.stringify(ok({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: `${role}-mock`, version: '1.0' } }, msg.id)) + '\n');
  if (msg.method === 'tools/list') return process.stdout.write(JSON.stringify(ok({ tools: TOOLS.map((t) => ({ name: t.name, description: t.desc, inputSchema: { type: 'object', properties: SCHEMAS[t.name] || {} } })) }, msg.id)) + '\n');
  if (msg.method === 'tools/call') {
    const t = TOOLS.find((x) => x.name === msg.params?.name);
    let out;
    try { out = t ? t.run(msg.params.arguments || {}) : { error: `unknown tool ${msg.params?.name}` }; }
    catch (e) { out = { error: String(e.message) }; }
    return process.stdout.write(JSON.stringify(text(msg.id, out)) + '\n');
  }
  if (msg.id !== undefined && msg.id !== null) process.stdout.write(JSON.stringify(ok({}, msg.id)) + '\n');
}
