#!/usr/bin/env bash
# run_case.sh <песочница> [фаза2-скрипт] — прогон сценария с watchdog.
# Вложенные flash-сессии зависают на API-стриме; --max-wall-time не срабатывает
# посреди вызова, поэтому: qwen в фоне, мониторим mtime свежего транскрипта
# песочницы; простой > 120с — kill, затем --resume (план — токен возобновления).
set -u
SB="$1"
PHASE2="${2:-}"
SC=$(basename "$SB")
cd "$SB"

transcript() {
  ls -t "$HOME"/.qwen/projects/*"ship-kit-v2-$SC"*/chats/*.jsonl 2>/dev/null | head -1
}

attempt() { # $1 — скрипт (run.sh/retry.sh/фаза2), $2 — лог
  bash "$1" > "$2" 2>&1 &
  local wpid=$!
  while kill -0 "$wpid" 2>/dev/null; do
    sleep 15
    local t m now
    t=$(transcript)
    if [ -n "$t" ]; then
      m=$(stat -f %m "$t" 2>/dev/null) || continue
      now=$(date +%s)
      if [ $((now - m)) -gt 120 ]; then
        kill "$wpid" 2>/dev/null; sleep 1; kill -9 "$wpid" 2>/dev/null
        echo "[watchdog] убит по простою транскрипта ${SC} $(date +%H:%M:%S)" >> driver.log
        break
      fi
    fi
  done
  wait "$wpid" 2>/dev/null
  echo $? > last.exit
}

attempt run.sh run.log
for i in $(seq 2 12); do
  [ "$(cat last.exit 2>/dev/null)" = "0" ] && break
  echo "== попытка $i (resume) $(date +%H:%M:%S)" >> driver.log
  attempt retry.sh "run$i.log"
done

if [ -n "$PHASE2" ]; then
  attempt "$PHASE2" phase2.log
  for i in 2 3 4 5 6; do
    [ "$(cat last.exit 2>/dev/null)" = "0" ] && break
    echo "== фаза2 попытка $i $(date +%H:%M:%S)" >> driver.log
    attempt retry.sh "phase2-$i.log"
  done
fi
echo "DRIVER-DONE $(date +%H:%M:%S) last=$(cat last.exit 2>/dev/null)" >> driver.log
