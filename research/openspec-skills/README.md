# Исследование: скиллы openspec (Fission-AI/OpenSpec)

Дата: 2026-11-18. Живой источник: `.agents/skills/openspec-*` этого репо (генерация `openspec init`/`openspec update`, CLI 2.0.0, `generatedBy: "2.0.0"`). Upstream-шаблоны — пакет `@fission-ai/openspec` 2.0.0 (Homebrew, `…/dist/core/templates/workflows/`, 14 workflow-шаблонов; в этот проект сгенерировано 6 скиллов).

## Состав

- `diagrams.md` — схемы взаимодействия 6 скиллов (mermaid): входной контроль, жизненный цикл change, цикл задачи в apply, синхронизация дельт, explore-режим, граф вызовов + матрица взаимодействий и человеко-гейты.
- `volume.md` — объём набора скиллов относительно предоставляемого функционала: метрики по каждому скиллу и категориям, дословные дубли блоков, наблюдения.
- `skills/` — снимок 6 каталогов скиллов (6 файлов, по одному SKILL.md), по которым составлены схемы.

## Список скиллов

openspec-explore, openspec-propose, openspec-update-change,
openspec-apply-change, openspec-sync-specs, openspec-archive-change.

## Контекст набора (в отличие от суперпауэрс)

Скиллы — тонкая процедурная обвязка над CLI `openspec`: состояние, граф артефактов, шаблоны и валидацию отдаёт CLI в JSON (`status`, `instructions`, `list`, `validate`), скилл интерпретирует ответ и пишет файлы. Скилла-диспетчера нет — маршрутизация по description/триггерам, а общие входные блоки (Store selection, Project check) повторены дословно в каждом скилле. Исполняемого кода в скиллах нет (allowed-tools: `Bash(openspec:*)` у всех).

## Предупреждение

Снимок зафиксирован на дату выше; `openspec update` перегенерирует файлы из шаблонов CLI (обновление brew меняет версию шаблонов) — перед опорой на детали сверять с живыми `.agents/skills/openspec-*`.
