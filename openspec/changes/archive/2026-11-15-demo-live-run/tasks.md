# Tasks

## 1. Пререквизит и стенд

- [x] 1.1 Обновить установленную копию: `qwen extensions uninstall
  ship-kit` → `qwen extensions install
  /Users/oleg/projects/share/extensions/ship-kit --consent`; проверить:
  в списке скиллов установки — task/pr/ci, версия 2.0.0, старых имён нет
- [x] 1.2 Написать `examples/demo-project/e2e/make_sandbox.mjs`:
  одноразовая песочница (копия repo/, git init -b main + commit,
  сценарный `ship-kit.projects.md` — алиасы, деплой только IFT, конвенция
  спеки по стори, `.qwen/settings.json` с моками из
  `../../conveyor/e2e/mcp/mock.mjs`, сид `mcp-state.json`: jira PRJ-777 с
  parent PRJ-700 «Экспорт отчётов» и названием задачи, jenkins
  calc-app=['SUCCESS'], calc-app-deploy:IFT=['FAIL_CODE','SUCCESS'],
  bitbucket auto-merge); проверить: сборка песочницы проходит,
  `git -C <sb> log` имеет init-коммит, мок-смоук (initialize +
  tools/call) зелёный
- [x] 1.3 Написать `examples/demo-project/e2e/SCENARIO.md` (кейс 1–5,
  команды вызовов с дословными «подтверждаю …», ожидаемые артефакты)

## 2. Живой прогон (flash, headless, по вызову на фазу)

- [x] 2.1 Вызов 1: `/ship-kit:task PRJ-777 добавь экспорт отчётов в
  CSV.` (порядок и гейты — pre-approved фразы); проверить: в песочнице
  `specs/PRJ-700-<название из jira>/` с чек-листом, коммиты
  feat(PRJ-777) в ветке, `skill-runs/PRJ-777/plan.md` с чек-листом
  порядка, отчёт с дословными строками теста
- [x] 2.2 Вызов 2: `/ship-kit:pr отправь на ревью` («подтверждаю пуш и
  создание PR»); проверить: PR-1 создан (мок), отчёт ok/prId/gate
- [x] 2.3 Вызов 3: `/ship-kit:ci запусти сборку и деплой на IFT`
  («подтверждаю запуск …»); проверить: build SUCCESS, deploy IFT #1
  FAILURE, отчёт диагноза CATEGORY/FIXABLE/RELATED: task-diff/HANDOFF:
  task
- [x] 2.4 Вызовы 4–6: `task` fix по диагнозу → `pr` (новая ветка от
  main, «подтверждаю пуш и создание PR») → `ci` перезапуск IFT
  («подтверждаю повторный запуск»); проверить: фикс-коммит, PR-2 MERGED,
  IFT #2 SUCCESS, план отмечен до конца

## 3. Приёмка и фиксация

- [x] 3.1 Сверить артефакты песочницы с кейсом 1–5 (директория спеки по
  правилу проекта, план-токен через 6 вызовов, гейты только
  pre-approved, деплой зелёный после фикса); расхождения — честно в
  протокол
- [x] 3.2 Написать `examples/demo-project/e2e/RUN.md` — дословный
  протокол прогона (команды, ключевые ответы, вердикт); коммит (test:
  живой прогон demo-project на моках); проверить: `git status` чист
