# Tasks: v2-stage-model

Реализация — после финального подтверждения пользователем (архитектура
согласована 13.11.2026: вариант Б, «Профессии», doctor, заимствования).

## 1. Формат реестра и манифест (docs)

- [x] 1.1 `docs/ship-kit.projects.example.md` → схема `ship-kit.projects.yaml`: `formatVersion`, поля и обязательность, закрытый набор alias, `runnerKind` (JENKINS/CUSTOM), ссылки стадий, секции `servers:` и `executors:`, полный пример calc+billing из модели исследования
- [x] 1.2 `docs/ship-kit.positions.yaml` — манифест позиций: контракты (шаг 0, формат отчёта, ask-правила), версия v1, дефолтные наборы позиций по kind
- [x] 1.3 `docs/ship-kit.md`: реестр v2, схема позиций/executors, таблица «kind → позиции», правила исходов (В4), гейт-контракт prepare→confirm→apply, обновлённые mermaid-схемы из design.md
- [x] 1.4 `QWEN.md` корня расширения: сводка v2 (стадии, позиции, executors, doctor, гейт-контракт, миграции)

## 2. registry

- [x] 2.1 Цепочка поиска: `ship-kit.projects.yaml` в корне проекта → `~/.qwen/ship-kit/projects.yaml`
- [x] 2.2 Протокол ведения yaml (проект / стадия / запись знания / endpoint / servers / executors) с проверкой правил 1–14 из design.md §11 (включая `executors`/`positions` против манифеста)
- [x] 2.3 Сверка `serverId` с `settings.json → mcpServers`; отчёт диффом + предупреждения
- [x] 2.4 `formatVersion` + протокол миграций: цепочка в docs (журнал форматов), дифф и подтверждение перед применением, стоп «реестр из будущего»; тест миграции M−1 → M

## 3. run

- [x] 3.1 Чтение yaml: проект по тегу (`jiraProjectKey` — префикс тега) или явный `project`; `pipelineOrder`, стадии, записи знания, `executors`
- [x] 3.2 Обход стадий: позиции из манифеста по kind (с учётом `positions` стадии), исполнители из `executors`; производный kind=build|deploy для транспорта
- [x] 3.3 Переходы: `nextStageId` после MERGED; `fixesStageId` по падению; `triggeredBy` (pullRequestReview / humanDirective) — вход fixDo
- [x] 3.4 Исходы (design §3 В4): flaky/таймаут → retry без гейта (`maxRetries`, идентичная карточка); fixable → позиция по `fixRouting`; not-fixable у деплоя infra/devops-known → WAIT (заморозка, resume «продолжи прогон»); вето `errorPolicy.unfixableCategories` → issues.md
- [x] 3.5 Счётчики и loop guard по id стадии (`maxRuns` на стадию, деплой — на стенд; круг «фикс→PR→MERGED→перезапуск» = +1 `maxFixAttempts`, новый PR не сбрасывает); `totalRunBudget` заморожен в ожидании
- [x] 3.6 Гейт-контракт: карточки трёх типов (джоба/пуш/PR) с payload и источниками; prepare ≠ apply; fail-closed; подтверждение привязано к карточке (изменение payload = новый вопрос)
- [x] 3.7 План `skill-runs/<тег>/plan.md` по шаблону design §13; `issues.md` — без изменений; цепочка разрешения аргументов джоб и «ничего не искать» — без изменений

## 4. Исполнители (Профессии, 7 скиллов)

- [x] 4.1 Создать `skills/analyst` (бывш. openspec), `skills/courier` (бывш. pr), `skills/operator` (бывш. jobs), `skills/doctor` (объединение diagnosis+repair: режимы `diagnose`|`fix`, командные файлы build.md/deploy.md общие); старых каталогов в чистом дереве v2 не было — удалять нечего
- [x] 4.2 В начале каждого SKILL.md исполнителя — таблица ask-правил (design §6.4); SKILL.md под контракт манифеста позиций
- [x] 4.3 Источники аргументов: позиции — `knowledgeRef`, doctor:diagnose — `diagnosisRef`, doctor:fix — `repairRef` (дефолт `knowledgeRef`); форматы отчётов исполнителей не меняются

## 5. adapt-kit и поставка

- [x] 5.1 `adapt-kit`: yaml-реестр и манифест позиций в точках адаптации; инварианты: kind-семантика позиций, счётчики по id, гейт-контракт, trust discovery-only; ревизия критериев «универсальный/проектный»
- [x] 5.2 `qwen-extension.json` → 1.0.0, описания v2 (7 скиллов, «Профессии»)
- [x] 5.3 Синхронизация установленной копии `~/.qwen/extensions/ship-kit` (uninstall → install --consent; проверен состав: skills/, docs/, QWEN.md, манифест, openspec/)

## 6. dev-воркспейс (в поставку не идёт)

- [x] 6.1 `dev/ship-kit/tests/`: валидатор yaml (yamlite-парсер подмножества + `check_registry.mjs`, правила 1–14 + formatVersion) + фикстуры calc (0/0), billing (0/3), broken-negtest (15 ошибок) + смоук моков `mock_smoke.mjs`; агрегатор `run_checks.sh` зелёный
- [x] 6.2 `dev/ship-kit/e2e/`: стенд построен и принят живыми прогонами — моки MCP (5 ролей, файловое состояние), bare+клон, генератор песочниц `make_sandbox.mjs`, watchdog-драйвер `run_case.sh` (resume по плану), протокол `SCENARIOS.md`
- [x] 6.3 Прогоны s1 (полный конвейер), s2 (код-фикс), s3 (не-код фикс) — **GREEN** на glm-5.3-flash, токены каждого кейса в `e2e-runs.md`; **s4/s5 отложены пользователем** (2026-11-13, «дорого») до релизного прогона
- [x] 6.4 Интервью-файл `tests/interview.md`: 10 дешёвых вопросов-эталонов по кейсам 1–7, гейт-контракту, loop guard и executors (проверка понимания без прогона)

## 7. Проверки

- [x] 7.1 `openspec validate v2-stage-model --strict` зелёный (из `extensions/ship-kit`)
- [x] 7.2 Статические проверки (агрегатор уровня 1–2 + смоук моков) зелёные
- [x] 7.3 e2e: s1–s3 GREEN с фиксацией токенов и находок (`e2e/e2e-runs.md`); s4–s5 — отложены пользователем до релизного прогона (запуск: `make_sandbox.mjs <sN>` → `run_case.sh`)
