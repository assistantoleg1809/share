#!/usr/bin/env bash
# check.sh <песочница> — машино-проверяемые критерии успеха прогона green777.
set -u
SB="${1:-${TMPDIR:-/tmp}/ship-kit/green777}"
cd "$SB" || { echo "нет песочницы: $SB"; exit 2; }
pass=0; fail=0
chk() { if eval "$2" >/dev/null 2>&1; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }

chk "план-файл создан (.qwen/tmp/ship-kit/PRJ-777/plan.md)" 'test -s .qwen/tmp/ship-kit/PRJ-777/plan.md'
chk "незакрытых слотов в плане нет" '! grep -q "\[ \]" .qwen/tmp/ship-kit/PRJ-777/plan.md'
chk "PR создан и MERGED" 'node -e "const s=require(\"./mock-state.json\");const p=Object.values(s.bitbucket.prs)[0];if(!p||p.state!==\"MERGED\")process.exit(1)"'
chk "сборка запускалась (jenkins.byNum не пуст)" 'node -e "const s=require(\"./mock-state.json\");if(!Object.keys(s.jenkins.byNum).length)process.exit(1)"'
chk "агент ждал джобу (опросов >= 2: RUNNING -> SUCCESS)" 'node -e "const s=require(\"./mock-state.json\");const n=Math.max(0,...Object.values(s.jenkins.polls||{}));if(n<2)process.exit(1)"'
chk "ветка задачи запушена в bare" 'git ls-remote origin | grep -q "PRJ-777"'
chk "не спрашивал «ждать ли» (run.log; ручной прогон — глазами)" 'test ! -f run.log || ! grep -qi "ждать ли" run.log'

echo "----"
echo "PASS=$pass FAIL=$fail"
if [ "$fail" = 0 ]; then
  echo "GREEN: прогон успешен — запиши итог в dev/ship-kit/e2e-run.md (дата, попытки, дословные строки)"
else
  echo "RED: проваленные пункты выше; расхождение со скиллами/спекой — отдельной задачей"
fi
