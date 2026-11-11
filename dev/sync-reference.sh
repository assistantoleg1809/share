#!/usr/bin/env bash
# Обновление эталона расширения: пересоздаёт ~/.qwen/extensions/<имя>
# из чистого корня extensions/<имя>. Ручной запуск:
#   bash dev/sync-reference.sh [имя-расширения]   (дефолт ship-kit)
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
name="${1:-ship-kit}"
ext="$repo/extensions/$name"

[ -f "$ext/qwen-extension.json" ] || { echo "нет манифеста: $ext"; exit 1; }

qwen extensions uninstall "$name" >/dev/null 2>&1 || true
qwen extensions install "$ext" --consent >/dev/null
qwen extensions list | grep -q "$name" || { echo "ОШИБКА: $name не установлен"; exit 1; }

echo "Эталон обновлён (~/.qwen/extensions/$name):"
ls "$HOME/.qwen/extensions/$name"
