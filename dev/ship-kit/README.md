# dev/ship-kit — воркспейс разработки и приёмки ship-kit

В корне репо — только поставка (`skills/`); всё остальное живёт здесь.
Прогоны — **только glm-5.3-flash**.

| каталог | что внутри |
|---|---|
| `stand/` | тест-стенд с моками MCP: `INSTRUCTION.md` — самодостаточная инструкция (запускающему история сессий не нужна; там же — создание новых сценариев), `SCENARIOS.md`, раннеры `run_one.sh` / `check.sh` / `make_sandbox.mjs`, `mcp/mock.mjs`, журнал `e2e-run.md` |
| `review/` | опросник ревью с эталонами (`review.md`) — приёмка текстов; живое поведение проверяет стенд |
| `docs/` | документация комплекта: `ship-kit.md` (manual), `upgrade.md` (changelog), `flow.html` (схема прогона), `example-plan.md` (эталон плана) |
| `examples/` | образцы: `conveyor/` (полный конвейер v2 — снимок), `central-catalog/` (каталог проектов с генератором индекса), `demo-project/` (целевой проект с e2e-сценариями) |
| `research/` | исследовательские снимки (openspec-скиллы, суперпауэрс, гейты и др.) |

Быстрый старт стенда — `stand/INSTRUCTION.md`:

```
bash dev/ship-kit/stand/run_one.sh          # headless, green777
bash "$TMPDIR/ship-kit/green777/manual.sh"  # руками и глазами
```
