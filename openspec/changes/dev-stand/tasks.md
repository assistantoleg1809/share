# Tasks

## 1. Стенд в dev/ship-kit

- [x] 1.1 `dev/ship-kit/mcp/mock.mjs` — перенос из examples/conveyor/e2e/mcp/mock.mjs (роли argv, MOCK_STATE, RUNNING на первом опросе jenkins_get_build, autoMerge PR; шапка — v3). Проверить: `node --check dev/ship-kit/mcp/mock.mjs` зелёный
- [x] 1.2 `dev/ship-kit/make_sandbox.mjs` — песочница `$TMPDIR/ship-kit/green777`: bare+репо (фикстура app.py без mul), сид мока (PRJ-777, сборка SUCCESS, autoMerge), копия `skills/ship-kit-*` → `<sb>/.qwen/skills/`, `.qwen/settings.json` (jira/bitbucket/jenkins/confluence моки), run.sh (`--model glm-5.3-flash --yolo --max-wall-time 10m`, session.txt, tee run.log) и retry.sh (`--resume`, «продолжи прогон PRJ-777»). Проверить: `node --check` зелёный
- [x] 1.3 `dev/ship-kit/check.sh` — критерии успеха: план-файл `.qwen/tmp/ship-kit/PRJ-777/plan.md` существует; незакрытых чекбоксов нет; PR MERGED в mock-state; джоба запускалась и опрошена ≥ 2 раз; ветка PRJ-777 в bare; в run.log нет «ждать ли». Проверить: `bash -n dev/ship-kit/check.sh` зелёный
- [x] 1.4 `dev/ship-kit/run_one.sh` — make_sandbox → run.sh → check.sh одной командой. Проверить: `bash -n dev/ship-kit/run_one.sh` зелёный

## 2. Сценарий, журнал, опросник, инструкция

- [x] 2.1 `dev/ship-kit/SCENARIOS.md` — сценарий green777 (сид, промпт дословно, ожидаемая цепочка, критерии, как расширять RED-сидами) и `dev/ship-kit/e2e-run.md` — журнал (правила заполнения: дата, попытки, вердикт, дословные строки). Проверить: оба файла существуют, промпт в SCENARIOS.md совпадает с промптом в make_sandbox.mjs
- [x] 2.2 `git mv docs/review.md dev/ship-kit/review.md` (+строка в шапке про стенд рядом); `docs/ship-kit.md` п.9 — указатель на dev/ship-kit (опросник + стенд). Проверить: docs/review.md нет; grep «dev/ship-kit» в docs/ship-kit.md ≥ 1
- [x] 2.3 `dev/ship-kit/README.md` — инструкция для человека: требования, один прогон одной командой, промпт дословно + зачем pre-approved фразы и poll=5, что делать при зависании, критерии успеха, куда записать итог. Проверить: README содержит команду run_one.sh и промпт

## 3. Проверки

- [x] 3.1 `openspec validate dev-stand --strict` зелёный; `node --check` обоих .mjs и `bash -n` обоих .sh зелёные; живой e2e-прогон агентом НЕ выполняется (запуск — за человеком по README). Проверить: выводы дословно

## 4. Ручной режим (доворка 2026-11-25)

- [x] 4.1 `make_sandbox.mjs` генерирует `manual.sh` (интерактивная сессия `qwen --model glm-5.3-flash` в каталоге песочницы); README — раздел «Ручной запуск» (запуск, промпт без pre-approved фраз, ожидаемые шаги с карточками «пуш+PR» и запуска, что смотреть по ходу, поведение check.sh без run.log, пометка «ручной» в журнале); `check.sh` — пункт «ждать ли» пропускается при отсутствии run.log; SCENARIOS — заметка о ручном варианте промпта. Проверить: `node --check` и `bash -n` зелёные; grep «manual.sh» в make_sandbox.mjs и README ≥ 1

## 5. Самодостаточная инструкция и новые сценарии (доворка 2026-11-25)

- [x] 5.1 `dev/ship-kit/INSTRUCTION.md` — инструкция для запускающего без истории сессии (запрос: «история сессии будет не доступна»): контекст проекта/стенда, предпосылки, режим A (headless: run_one.sh, промпт с pre-approved, ожидание, зависание/retry) и режим B (ручной: manual.sh, промпт без pre-approved, шаги, места наблюдения), критерии успеха, поведение после прогона (GREEN → e2e-run.md + «архив» dev-stand; RED → задача), создание новых сценариев — 5 шагов (промпт в PROMPTS, фикстуры, сид мока с доступными FAIL_*, ручной вариант, критерии) + команды сборки/запуска; `run_one.sh` параметризован `[сценарий]` (green777 по умолчанию); README — указатель на INSTRUCTION.md, SCENARIOS «Как расширять» — указатель на INSTRUCTION.md. Проверить: `bash -n run_one.sh`; grep «INSTRUCTION» в README и SCENARIOS ≥ 1; grep «Новые сценарии» в INSTRUCTION.md ≥ 1

## 6. Иерархия dev/ship-kit (доворка 2026-11-25)

- [x] 6.1 «В корне только скиллы»: стенд разложен в `dev/ship-kit/stand/` (моки, раннеры, сценарии, журнал, INSTRUCTION), опросник — `review/review.md`; из корня перенесены `docs/` (ship-kit.md, upgrade.md, flow.html, example-plan.md → `dev/ship-kit/docs/`), `examples/` и `research/` → `dev/ship-kit/`; `openspec/` остался в корне (CLI и скиллы openspec-* ищут корень вверх от cwd — перенос ломает обнаружение); пути исправлены: make_sandbox.mjs REPO-глубина, команды в INSTRUCTION/README/SCENARIOS/check.sh, ссылки в ship-kit.md и conveyor README; README dev/ship-kit — карта иерархии. Проверить: `node --check` и `bash -n` стенда; grep битых путей («dev/ship-kit/mcp», «dev/ship-kit/run_one» вне архива) = 0; `ls` корня = skills + openspec + dev
