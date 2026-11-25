#!/usr/bin/env bash
# run_one.sh [сценарий] — один прогон базы ship-kit на glm-5.3-flash:
# сборка песочницы -> запуск -> проверка критериев. green777 по умолчанию.
# Из корня репо: bash dev/ship-kit/run_one.sh [сценарий]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SC="${1:-green777}"
SB="${TMPDIR:-/tmp}/ship-kit/$SC"

node "$HERE/make_sandbox.mjs" "$SC"
bash "$SB/run.sh"
bash "$HERE/check.sh" "$SB"
