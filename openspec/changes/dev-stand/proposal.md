# Proposal

## Why

v3 лишился тестового стенда: расширение `extensions/ship-kit/` удалено
(вместе со старым e2e), а `examples/conveyor/e2e/make_sandbox.mjs`
ссылается на несуществующий `dev/ship-kit/…`. Опросник
(`docs/review.md`) живёт отдельно от инструментов проверки. Нужен
самодостаточный каталог `dev/ship-kit/`: моки MCP, песочница, раннер
и проверка одного успешного прогона базы v3 (task → pr → ci) на
бюджетной модели glm-5.3-flash — с промптом и инструкцией для
человека. Прогоны — только на glm-5.3-flash (правило проекта).

## What Changes

- Новый `dev/ship-kit/` (не поставляется, только разработка/приёмка):
  `mcp/mock.mjs` — универсальный мок MCP (jenkins · jira · confluence
  · bitbucket · sonar; stdio JSON-RPC, состояние в файле;
  перенос из examples/conveyor/e2e), `make_sandbox.mjs` — песочница
  одного прогона (git-репо + bare origin, фикстуры, сид мока, копия
  скиллов из `skills/`, `.qwen/settings.json` с моками, run.sh /
  retry.sh), `run_one.sh` — сборка → запуск → проверка, `check.sh` —
  критерии успеха, `SCENARIOS.md` (сценарий green777), `e2e-run.md`
  — журнал прогонов, `README.md` — инструкция и промпт для человека.
- Опросник перенесён: `docs/review.md` → `dev/ship-kit/review.md`
  (приёмка = стенд + опросник в одном месте); `docs/ship-kit.md` п.9
  обновлён.
- Скиллы в песочницу копируются из `skills/` репо на момент сборки —
  тестируется текущее состояние поставки, дублей нет.

## Capabilities

### New Capabilities

—

### Modified Capabilities

—

(инструментальный change: `skip_specs: true` — поведение поставки
`base-skills` не меняется.)

## Impact

- Добавляется `dev/` в репо (каталог разработки, в поставку skills/
  не входит); `docs/review.md` → `dev/ship-kit/review.md`;
  `docs/ship-kit.md` п.9.
- Прогон выполняет человек по README (одна команда); e2e-прогоны
  агентом в этом change не выполняются — только сборка стенда и
  синтаксические проверки.
