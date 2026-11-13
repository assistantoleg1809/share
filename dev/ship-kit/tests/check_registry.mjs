#!/usr/bin/env node
// check_registry — валидатор ship-kit.projects.yaml (уровень 2).
// Правила 1–14 — docs/ship-kit.md и design v2-stage-model §11.
// Использование: node check_registry.mjs <реестр.yaml> [манифест.yaml]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from './yamlite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MAX_FORMAT = 1;
const ALIASES = ['MCP_BUILD', 'MCP_DEPLOY', 'MCP_SONAR', 'MCP_JIRA', 'MCP_CONFLUENCE', 'MCP_BITBUCKET', 'MCP_MAPP'];
const STANDS = ['DEV', 'ST', 'IFT', 'PSI'];
const TAXONOMY = ['code', 'tests', 'sonar', 'infra', 'config', 'dependency', 'flaky', 'devops-known', 'other'];
const TRANSPORT = { BUILD: 'MCP_BUILD', FIX_BUILD: 'MCP_BUILD', DEPLOY: 'MCP_DEPLOY', FIX_DEPLOY: 'MCP_DEPLOY' };
const EDITING = new Set(['analyst', 'mechanic']); // позиции, правящие репозиторий

const errors = [], warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const registryPath = process.argv[2];
if (!registryPath) { console.error('usage: check_registry.mjs <registry.yaml> [manifest.yaml]'); process.exit(2); }
const manifestPath = process.argv[3] || join(here, '../../../extensions/ship-kit/docs/ship-kit.positions.yaml');

let reg, manifest;
try { reg = parse(readFileSync(registryPath, 'utf8')); }
catch (e) { console.error(`ошибок: 1 · предупреждений: 0\n- <реестр> не разобран: ${e.message}`); process.exit(1); }
try { manifest = parse(readFileSync(manifestPath, 'utf8')); }
catch (e) { console.error(`ошибок: 1 · предупреждений: 0\n- <манифест> не разобран: ${e.message}`); process.exit(1); }

const kindPositions = manifest.kindPositions || {};
const manifestPositions = Object.keys(manifest.positions || {});
const defaults = manifest.defaults || {};

// formatVersion
const fv = reg.formatVersion ?? 1;
if (!Number.isInteger(fv) || fv < 1) err(`formatVersion: ожидается целое ≥1, получено ${JSON.stringify(reg.formatVersion)}`);
if (fv > MAX_FORMAT) err(`formatVersion=${fv} выше поддерживаемой (${MAX_FORMAT}): обновите комплект`);

// servers
const servers = reg.servers || {};
const usedServers = new Set();

// executors (13)
for (const [pos, skill] of Object.entries(reg.executors || {})) {
  if (!manifestPositions.includes(pos)) err(`executors: позиции «${pos}» нет в манифесте (${manifestPositions.join(', ')})`);
  if (typeof skill !== 'string') err(`executors.${pos}: ожидается имя скилла-строка`);
  else if (!skill.startsWith('ship-kit:')) warn(`executors.${pos}: внешний скилл «${skill}» — контракт проверяется e2e`);
}
for (const pos of Object.keys(defaults)) {
  if (reg.executors && !(pos in reg.executors)) continue; // дефолт, ок
}

for (const project of reg.projects || []) {
  const pk = project.projectKey || '<без имени>';
  const stages = project.stages || [];
  const knowledge = project.knowledge || [];
  const stageIds = stages.map((s) => s.id);
  const recIds = knowledge.map((k) => k.id);
  const dup = (a) => a.filter((v, i) => a.indexOf(v) !== i);

  for (const d of dup(stageIds)) err(`${pk}: дубли стадий id=${d}`);
  for (const d of dup(recIds)) err(`${pk}: дубли записей знания id=${d}`);

  const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
  const recById = Object.fromEntries(knowledge.map((k) => [k.id, k]));

  const eps = (recId) => (recById[recId] || {}).endpoints || [];
  const transportEp = (recId, alias) => eps(recId).find((e) => e.alias === alias);

  for (const st of stages) {
    const sid = `${pk}/${st.id}`;
    const kind = st.kind;
    if (!kindPositions[kind]) err(`${sid}: неизвестный kind «${kind}»`);

    // 14: positions ⊆ kindPositions
    const allowed = kindPositions[kind] || [];
    for (const p of st.positions || []) {
      if (!allowed.includes(p)) err(`${sid}: позиция «${p}» не входит в дефолтный набор kind ${kind} (${allowed.join(', ')})`);
    }
    const positions = (st.positions && st.positions.length ? st.positions : allowed);
    if (!st.positions || !st.positions.length) {
      if (kind === 'FIX_BUILD' && !positions.includes('mechanic')) warn(`${sid}: без позиции mechanic не-код падения уйдут в notFixable`);
    }

    // 1: ссылки
    for (const ref of ['knowledgeRef', 'diagnosisRef', 'repairRef']) {
      const v = st[ref];
      if (v === null || v === undefined) continue;
      if (!recIds.includes(v)) err(`${sid}: ${ref} «${v}» не существует`);
    }
    // 2: роли ссылок
    if (st.diagnosisRef != null && !(kind === 'BUILD' || kind === 'DEPLOY')) err(`${sid}: diagnosisRef допустим только у BUILD/DEPLOY`);
    if (st.repairRef != null && !(kind === 'FIX_BUILD' || kind === 'FIX_DEPLOY')) err(`${sid}: repairRef допустим только у FIX_BUILD/FIX_DEPLOY`);
    for (const ref of ['nextStageId', 'fixesStageId']) {
      if (st[ref] != null && !stageIds.includes(st[ref])) err(`${sid}: ${ref} «${st[ref]}» не существует`);
    }
    // 8: фикс-стадии
    if (kind && kind.startsWith('FIX_')) {
      if (!st.fixesStageId) err(`${sid}: у фикс-стадии обязателен fixesStageId`);
      if (!st.nextStageId) err(`${sid}: у фикс-стадии обязателен nextStageId`);
    }
    if (st.triggeredBy != null) {
      if (kind !== 'FIX_DO') err(`${sid}: triggeredBy допустим только у FIX_DO`);
      else if (!['pullRequestReview', 'humanDirective'].includes(st.triggeredBy)) err(`${sid}: triggeredBy «${st.triggeredBy}» не из {pullRequestReview, humanDirective}`);
    }
    // 11: pullRequestOwner
    if (st.pullRequestOwner != null && !positions.includes(st.pullRequestOwner)) {
      err(`${sid}: pullRequestOwner «${st.pullRequestOwner}» не входит в позиции стадии (${positions.join(', ')})`);
    }
    if (st.pullRequestOwner == null && positions.some((p) => EDITING.has(p))) {
      warn(`${sid}: стадия правит репозиторий (${positions.filter((p) => EDITING.has(p)).join(', ')}), а pullRequestOwner не задан — PR некому обвязывать`);
    }
    // 5: покрытие позиций (упрощённо)
    const kr = st.knowledgeRef;
    if (kr && recIds.includes(kr)) {
      const aliases = eps(kr).map((e) => e.alias);
      if (positions.includes('analyst') && !aliases.includes('MCP_JIRA')) warn(`${sid}: позиция analyst без MCP_JIRA в записи ${kr}`);
      if (positions.includes('courier') && !aliases.includes('MCP_BITBUCKET')) warn(`${sid}: позиция courier без MCP_BITBUCKET в записи ${kr}`);
      if (positions.includes('operator') && TRANSPORT[kind]) {
        if (!aliases.includes(TRANSPORT[kind])) err(`${sid}: позиции operator нужен ${TRANSPORT[kind]} в записи ${kr}`);
      }
    }
    // 3: diagnosisRef транспорт
    if (st.diagnosisRef != null && recIds.includes(st.diagnosisRef) && (kind === 'BUILD' || kind === 'DEPLOY')) {
      const alias = TRANSPORT[kind];
      const dep = transportEp(st.diagnosisRef, alias);
      if (!dep) err(`${sid}: diagnosisRef без ${alias} — лог упавшей нечем читать`);
      else if (kr && recIds.includes(kr)) {
        const kep = transportEp(kr, alias);
        if (kep && (dep.jobFolder !== kep.jobFolder || dep.jobName !== kep.jobName)) {
          err(`${sid}: diagnosisRef смотрит на другую джобу (${dep.jobFolder}/${dep.jobName} ≠ ${kep.jobFolder}/${kep.jobName} у стадии)`);
        }
      }
    }
    // 4: repairRef
    if (st.repairRef != null && recIds.includes(st.repairRef)) {
      const rl = eps(st.repairRef);
      if (rl.length !== 1) err(`${sid}: repairRef — ровно один транспортный endpoint, найдено ${rl.length}`);
      else {
        const alias = TRANSPORT[kind];
        if (rl[0].alias !== alias) err(`${sid}: repairRef с alias ${rl[0].alias}, а транспорт стадии ${alias}`);
      }
    }
    // 12: лимиты стадии
    for (const [k, v] of Object.entries(st.limits || {})) {
      if (!Number.isInteger(v) || v < 1) err(`${sid}: limits.${k} — целое ≥1, получено ${JSON.stringify(v)}`);
    }
  }

  // 9: pipelineOrder
  const order = project.pipelineOrder || ['do', 'build', 'deploy'].filter((id) => stageIds.includes(id));
  for (const id of order) {
    if (!stageIds.includes(id)) err(`${pk}: pipelineOrder ссылается на несуществующую стадию «${id}»`);
    else if ((byId[id].kind || '').startsWith('FIX_')) err(`${pk}: pipelineOrder содержит фикс-стадию «${id}»`);
  }
  for (const st of stages) {
    if (!(st.kind || '').startsWith('FIX_') && !order.includes(st.id)) {
      warn(`${pk}/${st.id}: не-фикс стадия вне pipelineOrder — недостижима`);
    }
  }
  // 10: без фикс-стадии
  for (const st of stages) {
    if (st.kind === 'BUILD' || st.kind === 'DEPLOY') {
      const has = stages.some((f) => (f.kind || '').startsWith('FIX_') && f.fixesStageId === st.id);
      if (!has) warn(`${pk}/${st.id}: нет фикс-стадии — любое fixable-падение станет notFixable`);
    }
  }
  // 12: errorPolicy
  for (const c of (project.errorPolicy || {}).unfixableCategories || []) {
    if (!TAXONOMY.includes(c)) warn(`${pk}: категория «${c}» не из taxonomy (не гейт)`);
  }
  for (const [k, v] of Object.entries(project.limits || {})) {
    if (!Number.isInteger(v) || v < 1) err(`${pk}: limits.${k} — целое ≥1, получено ${JSON.stringify(v)}`);
  }

  // endpoints: alias-набор, runnerKind, servers
  for (const rec of knowledge) {
    for (const ep of rec.endpoints || []) {
      if (!ALIASES.includes(ep.alias)) err(`${pk}/${rec.id}: alias «${ep.alias}» не из закрытого набора`);
      const sid = ep.serverId;
      if (typeof sid !== 'string' || !sid) err(`${pk}/${rec.id}: endpoint без serverId`);
      else {
        usedServers.add(sid);
        if (!(sid in servers)) err(`${pk}/${rec.id}: serverId «${sid}» не описан в servers:`);
      }
      const isTransport = ep.alias === 'MCP_BUILD' || ep.alias === 'MCP_DEPLOY';
      const rk = ep.runnerKind || (isTransport ? 'JENKINS' : null);
      if (isTransport) {
        if (rk === 'JENKINS') {
          if (!ep.jobFolder || !ep.jobName) err(`${pk}/${rec.id}.${ep.alias}: JENKINS требует jobFolder+jobName`);
        } else if (rk === 'CUSTOM') {
          if (!ep.jobParameters) err(`${pk}/${rec.id}.${ep.alias}: CUSTOM требует jobParameters`);
          if (ep.jobFolder || ep.jobName) err(`${pk}/${rec.id}.${ep.alias}: CUSTOM запрещает jobFolder/jobName`);
        } else err(`${pk}/${rec.id}.${ep.alias}: runnerKind «${rk}» не из {JENKINS, CUSTOM}`);
      } else if (ep.runnerKind != null) {
        err(`${pk}/${rec.id}.${ep.alias}: runnerKind только у MCP_BUILD/MCP_DEPLOY`);
      }
      if (ep.environments != null) {
        if (!Array.isArray(ep.environments) || !ep.environments.length) err(`${pk}/${rec.id}.${ep.alias}: environments — непустой список`);
        else {
          const idx = ep.environments.map((s) => STANDS.indexOf(s));
          if (idx.some((i) => i < 0)) err(`${pk}/${rec.id}.${ep.alias}: стенд вне DEV/ST/IFT/PSI`);
          else if (idx.some((i, j) => j > 0 && i <= idx[j - 1])) err(`${pk}/${rec.id}.${ep.alias}: стенды не в каноническом порядке DEV→ST→IFT→PSI`);
        }
        for (const k of Object.keys(ep.environmentJobNames || {})) {
          if (!ep.environments.includes(k)) err(`${pk}/${rec.id}.${ep.alias}: environmentJobNames.${k} вне environments`);
        }
      } else if (ep.environmentJobNames != null) {
        err(`${pk}/${rec.id}.${ep.alias}: environmentJobNames без environments`);
      }
    }
  }
}

for (const s of Object.keys(servers)) {
  if (!usedServers.has(s)) warn(`servers: «${s}» не используется ни одним endpoint`);
}

console.log(`ошибок: ${errors.length} · предупреждений: ${warnings.length}`);
for (const m of errors) console.log(`✗ ${m}`);
for (const m of warnings) console.log(`⚠ ${m}`);
process.exit(errors.length ? 1 : 0);
