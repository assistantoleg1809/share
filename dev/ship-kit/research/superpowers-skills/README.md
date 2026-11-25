# Исследование: скиллы суперпауэрс (obra/superpowers)

Дата: 2026-11-14. Живой источник: `~/.qwen/skills/` (установка 2026-09-09, без hook/plugin-машин upstream).

## Состав

- `diagrams.md` — схемы взаимодействия 14 скиллов (mermaid): маршрутизация, жизненный цикл фичи, цикл задачи SDD, сбойный путь, ревью-контуры, граф вызовов + матрица взаимодействий и человеко-гейты.
- `volume.md` — объём набора скиллов относительно предоставляемого функционала: метрики по каждому скиллу и категориям, наблюдения.
- `skills/` — снимок 14 каталогов скиллов (51 файл), по которым составлены схемы: SKILL.md + шаблоны промптов, скрипты, референсы.

## Список скиллов

using-superpowers, brainstorming, writing-plans, executing-plans, subagent-driven-development,
dispatching-parallel-agents, using-git-worktrees, test-driven-development,
systematic-debugging, requesting-code-review, receiving-code-review,
verification-before-completion, finishing-a-development-branch, writing-skills.

## Предупреждение

Снимок зафиксирован на дату выше; файлы в `~/.qwen/skills/` могут обновляться из upstream obra/superpowers — перед опорой на детали сверять с живыми файлами.
