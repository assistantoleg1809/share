#!/usr/bin/env bash
# Обновление эталона ship-kit: пересоздаёт ~/.qwen/extensions/ship-kit
# из чистого корня extensions/ship-kit. Ручной запуск: bash dev/sync-reference.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
ext="$repo/extensions/ship-kit"
name="ship-kit"

[ -f "$ext/qwen-extension.json" ] || { echo "нет манифеста: $ext"; exit 1; }

qwen extensions uninstall "$name" >/dev/null 2>&1 || true
qwen extensions install "$ext" --consent >/dev/null
qwen extensions list | grep -q "$name" || { echo "ОШИБКА: $name не установлен"; exit 1; }

echo "Эталон обновлён (~/.qwen/extensions/$name):"
ls "$HOME/.qwen/extensions/$name"
