#!/usr/bin/env bash
# Агрегатор статических проверок ship-kit (уровни 1–2).
# Уровень 1: синтаксис скриптов, структура эталона, парс манифеста.
# Уровень 2: валидатор реестра на фикстурах с ожидаемыми исходами.
set -u
cd "$(dirname "$0")"
ROOT=../../..          # → корень репо
KIT=$ROOT/extensions/ship-kit
FAIL=0

step() { printf '\n== %s\n' "$1"; }
bad()  { echo "✗ $1"; FAIL=1; }
good() { echo "✓ $1"; }

step 'уровень 1: синтаксис node-скриптов'
for f in yamlite.mjs check_registry.mjs; do
  node --check "$f" 2>/dev/null && good "$f" || bad "$f не компилируется"
done

step 'уровень 1: структура эталона'
[ -f "$KIT/qwen-extension.json" ] && good 'qwen-extension.json' || bad 'нет qwen-extension.json'
[ -f "$KIT/QWEN.md" ] && good 'QWEN.md' || bad 'нет QWEN.md'
node -e "const m=require('$KIT/qwen-extension.json'); if(m.version!=='1.0.0') process.exit(1)" \
  && good 'манифест 1.0.0 + валидный JSON' || bad 'манифест не читается или версия не 1.0.0'
for s in run registry adapt-kit analyst courier operator doctor; do
  [ -f "$KIT/skills/$s/SKILL.md" ] && good "skills/$s" || bad "нет skills/$s/SKILL.md"
done
[ -f "$KIT/skills/doctor/build.md" ] && [ -f "$KIT/skills/doctor/deploy.md" ] \
  && good 'командные файлы doctor' || bad 'нет командных файлов doctor'

step 'уровень 1: манифест позиций парсится'
node --input-type=module -e "
import {parse} from './yamlite.mjs'; import {readFileSync} from 'node:fs';
const m = parse(readFileSync('$KIT/docs/ship-kit.positions.yaml','utf8'));
const need = ['analyst','courier','operator','detective','mechanic'];
const have = Object.keys(m.positions||{});
if(!need.every(p=>have.includes(p))) { console.error('позиции: '+have.join(',')); process.exit(1); }
if(Object.keys(m.kindPositions||{}).length !== 6) process.exit(1);
if(!m.fixRouting) process.exit(1);
" && good 'манифест: 5 позиций, 6 kind, fixRouting' || bad 'манифест позиций не разобран'

step 'уровень 2: смоук моков e2e (initialize/tools/call по каждой роли)'
node mock_smoke.mjs || FAIL=1

step 'уровень 2: валидатор реестра — фикстуры'
out=$(node check_registry.mjs fixtures/calc.yaml); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q 'ошибок: 0 · предупреждений: 0' \
  && good 'calc.yaml: 0/0' || { bad "calc.yaml: $out"; }

out=$(node check_registry.mjs fixtures/billing.yaml); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q 'ошибок: 0 · предупреждений: 3' \
  && good 'billing.yaml: 0 ошибок, 3 предупреждения' || { bad "billing.yaml: $out"; }

out=$(node check_registry.mjs fixtures/broken.yaml); rc=$?
if [ $rc -ne 0 ] && echo "$out" | grep -qE 'ошибок: (1[0-9]|[6-9]) '; then
  good 'broken.yaml (negtest): ≥6 ошибок, exit 1'
else
  bad "broken.yaml: неожиданный исход: $out"
fi

printf '\n'
if [ $FAIL -eq 0 ]; then echo 'ИТОГ: все статические проверки зелёные'; else echo 'ИТОГ: ЕСТЬ ПРОВАЛЫ'; fi
exit $FAIL
