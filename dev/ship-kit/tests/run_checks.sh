#!/usr/bin/env bash
# Статические проверки ship-kit: bash dev/ship-kit/tests/run_checks.sh
set -u
cd "$(dirname "$0")/.." || exit 2
rc=0
python3 tests/check_skills.py || rc=1
python3 tests/check_registry.py tests/fixtures/registry_valid.md || rc=1
if python3 tests/check_registry.py tests/fixtures/registry_invalid.md >/dev/null 2>&1; then
  echo "ОШИБКА: битая фикстура реестра прошла валидатор"; rc=1
else
  echo "УРОВЕНЬ 2 (негатив): OK"
fi
exit "$rc"
