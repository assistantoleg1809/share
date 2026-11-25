#!/usr/bin/env bash
# Агрегатор статических проверок: база ship-kit + пример conveyor.
# (Уровень «валидатор md-реестра на фикстурах» не переносится:
#  yaml-валидатор yaml-эпохи удалён вместе с форматом.)
set -u
cd "$(dirname "$0")"
ROOT=../../..
KIT=$ROOT/extensions/ship-kit
EX=$ROOT/examples/conveyor
FAIL=0

step() { printf '\n== %s\n' "$1"; }
bad()  { echo "✗ $1"; FAIL=1; }
good() { echo "✓ $1"; }

step 'база ship-kit: манифест 2.0.0 + JSON'
node -e "const m=require('$KIT/qwen-extension.json'); if(m.version!=='2.0.0') process.exit(1)" \
  && good 'манифест 2.0.0, валидный JSON' || bad 'манифест не читается или версия не 2.0.0'

step 'база ship-kit: три скилла + kind-файлы'
for s in task pr ci; do
  [ -f "$KIT/skills/$s/SKILL.md" ] && good "skills/$s" || bad "нет skills/$s/SKILL.md"
done
[ -f "$KIT/skills/ci/build.md" ] && [ -f "$KIT/skills/ci/deploy.md" ] \
  && good 'kind-файлы ci' || bad 'нет kind-файлов ci'

step 'база ship-kit: чистота поставки (имена v2 и бренды — пусто)'
if grep -rqE 'analyst|courier|operator|doctor|registry|adapt-kit|openspec' "$KIT" --include='*.md' --include='*.json'; then
  bad 'в поставке остались запрещённые имена'
else
  good 'поставка чиста'
fi

step 'пример conveyor: структура'
for s in run doctor registry adapt-kit; do
  [ -f "$EX/skills/$s/SKILL.md" ] && good "skills/$s" || bad "нет skills/$s/SKILL.md"
done
[ -f "$EX/skills/doctor/build.md" ] && [ -f "$EX/skills/doctor/deploy.md" ] \
  && good 'командные файлы doctor' || bad 'нет командных файлов doctor'
for f in README.md docs/conveyor.md docs/positions.md docs/ship-kit.projects.example.md docs/specs-snapshot.md; do
  [ -f "$EX/$f" ] && good "$f" || bad "нет $f"
done

step 'смоук моков e2e (initialize/tools/call по каждой роли)'
node mock_smoke.mjs || FAIL=1

printf '\n'
if [ $FAIL -eq 0 ]; then echo 'ИТОГ: все статические проверки зелёные'; else echo 'ИТОГ: ЕСТЬ ПРОВАЛЫ'; fi
exit $FAIL
