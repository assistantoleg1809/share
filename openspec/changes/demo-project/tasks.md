# Tasks

## 1. Каркас примера и файл проектов

- [x] 1.1 Создать `examples/demo-project/` с `ship-kit.projects.md`:
  проект calc (ключ PRJ, ветки feature/bugfix, базовая main),
  MCP-алиасы (mcp-jira=jira-corp, mcp-confluence=wiki-corp,
  mcp-bitbucket=bb, mcp-build=jenkins-corp, mcp-deploy=jenkins-corp),
  джобы (build: calc-app, deploy: calc-app-deploy по стендам
  DEV/ST/IFT/PSI), todo-список для демонстрации; формат — md-списки,
  без yaml; проверить: все значения из сценария README есть в файле
- [x] 1.2 Создать `examples/demo-project/ship-kit.workflows.md` с
  макросом «feature» (openspec-спека → имплементация → ревью →
  `/ship-kit:pr` 🔒 → `/ship-kit:ci` 🔒); проверить: имена скиллов базы
  и 🔒-пометки на слотах

## 2. Мини-репозиторий repo/

- [x] 2.1 Написать `repo/app.js` (calc: сложение + заглушка экспорта),
  `repo/app.test.js`, `repo/test.sh` (запуск теста, exit-код),
  `repo/Jenkinsfile` (учебный), `repo/README.md`; проверить:
  `bash examples/demo-project/repo/test.sh` зелёный из корня репо

## 3. Walkthrough README

- [x] 3.1 Написать `examples/demo-project/README.md`: сценарий
  PRJ-777 по шагам — задание; таблица «строка ship-kit.projects.md →
  аргумент вызова»; вызов task (Шаг-0: чек-лист из макроса,
  подтверждение порядка; спека через openspec-скилл discovery; TDD
  красный→зелёный); карточка «пуш+PR» и отчёт pr; карточки запуска
  ci, build SUCCESS; deploy DEV ок → ST FAILURE (infra) с дословным
  хвостом лога и отчётом CATEGORY/FIXABLE/RELATED/HANDOFF; issues.md +
  эскалация; «продолжи PRJ-777» → зелёные ST/IFT/PSI; проверить: шаги
  1:1 покрывают диаграмму падения деплоя, карточки соответствуют трём
  правилам гейтов

## 4. Образцы состояния прогона

- [x] 4.1 Написать `examples/demo-project/skill-runs/PRJ-777/plan.md`
  (подтверждённый чек-лист с 🔒, журнал: сборка #114, DEV #57, падение
  ST #23, эскалация, продолжение ST #24 / IFT #9 / PSI #6) и
  `issues.md` (задача DEVOPS: инфра-агент стенда ST, эскалация,
  источник диагноза DEVOPS-311); проверить: журнал и README рассказывают
  один и тот же прогон без расхождений
- [x] 4.2 Написать `examples/demo-project/INTERVIEW.md` — интервью-тест
  примера (вместо отложенных агентных тестов): инструкции двух режимов
  (человек-коллега / один вопрос = один вызов glm-5.3-flash по файлам
  примера), 15 вопросов с эталонами, критерии GREEN/RED, таблица
  «неверный ответ → какой файл чинить», журнал прохождений; проверить:
  каждый вопрос отвечает по файлам примера без выхода в openspec/ и
  examples/conveyor, эталоны соответствуют README и plan.md

## 5. Проверки и коммит

- [x] 5.1 `openspec validate demo-project --strict` — зелёный; структура
  примера соответствует design; grep по `extensions/ship-kit` не
  изменился (поставка не тронута); ссылки README — только
  ship-kit:task/pr/ci и ../conveyor
- [x] 5.2 Коммит (docs: учебный пример целевого проекта); проверить:
  `git status` чист
