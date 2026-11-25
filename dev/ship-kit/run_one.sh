#!/usr/bin/env bash
# run_one.sh — один успешный прогон базы ship-kit v3 на glm-5.3-flash:
# сборка песочницы -> запуск -> проверка критериев. Из корня репо:
#   bash dev/ship-kit/run_one.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SB="${TMPDIR:-/tmp}/ship-kit-v3/green777"

node "$HERE/make_sandbox.mjs" green777
bash "$SB/run.sh"
bash "$HERE/check.sh" "$SB"
