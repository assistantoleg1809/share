# Proposal

## Why

Walkthrough demo-project — текст: он описывает живой прогон, но сам
прогон ни разу не выполнялся реальными скиллами базы 2.0.0. Пользователь
хочет самозапуск: живой прогон `/ship-kit:task PRJ-777 …` на моках MCP
(цель и кейс из 5 шагов — 2026-11-15), с проектными правилами, которых
нет в базе (директория спеки по родительской стори Jira, деплой только
IFT).

## What Changes

- `examples/demo-project/e2e/` — живой стенд: сборщик песочницы
  (мини-репо из repo/ + `ship-kit.projects.md` сценарного варианта:
  деплой только IFT + конвенция спеки `specs/<ключ стори>-<название
  задачи>` по данным jira-mcp + мок-MCP в `.qwen/settings.json`),
  сид сценария (моки v2-стенда `examples/conveyor/e2e/mcp/mock.mjs`
  переиспользуются: PRJ-777 с родительской стори PRJ-700, build SUCCESS,
  deploy IFT #1 FAIL_CODE → #2 SUCCESS, PR auto-merge), SCENARIO.md и
  протокол прогона.
- Прогон: последовательные headless-вызовы flash в песочнице —
  `/ship-kit:task` → `/ship-kit:pr` → `/ship-kit:ci` (падение IFT) →
  `task` fix → `pr` (новый PR: прежний MERGED) → `ci` перезапуск IFT
  SUCCESS; гейты — дословными «подтверждаю …» в заданиях (pre-approved);
  состояние между вызовами — `skill-runs/PRJ-777/plan.md`.
- Пререквизит: установленная копия `~/.qwen/extensions/ship-kit`
  обновляется до 2.0.0 (висячий follow-up; иначе во вложенной сессии
  старые скиллы v1.0.0).

## Capabilities

### New Capabilities

(нет — тестовый стенд и пример, поведения базы не меняет)

### Modified Capabilities

(нет)

## Impact

- Добавляется `examples/demo-project/e2e/**`; моки не копируются, а
  подключаются из `examples/conveyor/e2e/mcp/mock.mjs`.
- `~/.qwen/extensions/ship-kit` — переустановка 2.0.0 (вне git).
- Скиллы, спеки и поставку репозитория не трогаем.
