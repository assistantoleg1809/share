# Proposal: v2-stage-model — конвейер на стадиях с декомпозицией знаний

Задача от пользователя напрямую (13.11.2026), ключа Jira нет. Источники — два
вложения сессии: `ship-kit.projects.yaml` (модель «полная декомпозиция
стадии», черновик исследования 2026-11-13) и схемы к нему; эталон v1 читался
из HEAD ветки v2 (рабочее дерево вычищено — восстановление не выполнялось).
Решения пользователя: архитектура — вариант Б (схема kind → позиции +
`executors:`), имена — набор «Профессии», объединение diagnosis+repair →
doctor; реестр yaml снимает md без миграции; слот — пересборка
`extensions/ship-kit` in place.

## Why

v1 (items-конвейер `item(action, skill, knowledge, PR)`, md-реестр) имеет три
доказанных исследованиями ограничения:

1. **Один транспорт на действие.** Диагносту нужен другой набор MCP, чем
   стадии: runbook в Confluence и тикеты команды в Jira
   (`skills/diagnosis/build.md:21-22`, `deploy.md:15,17`), а у стадии build их
   нет. Ремонт сверяет первопричину логом **упавшей** джобы
   (`skills/repair/SKILL.md`, протокол п.1), а фикс-стадия в md-реестре
   перекрывает джобу быстрой ci — ремонт читал бы не тот лог.
2. **Стадия = действие.** Вторая сборка в проекте невыразима: одно действие →
   одна пара `job.path`/`job.name`.
3. **Счётчики ключуются действием.** `runLimit.build` один на все сборки
   проекта; строка плана `Stage: <действие>` не различает две сборки.

Плюс два решения по итогам ресёрча готовых решений (два круга, сабагенты на
glm-5.3-flash, 13.11.2026): готового аналога целиком нет — берём четыре
заимствования (gh-aw, agent-os, spec-kit, Claude Code; детали — design.md,
секция «Заимствования»), а не готовую базу.

## What Changes

- **BREAKING** — **Реестр**: `ship-kit.projects.md` → `ship-kit.projects.yaml`:
  `formatVersion`, проекты → стадии (`id`, `kind`, ссылки знаний,
  `nextStageId`, `fixesStageId`, `triggeredBy`, `pullRequestOwner`, лимиты,
  опциональное сужение `positions`) → записи знания (`endpoints`: alias →
  serverId, runnerKind, джобы, стенды) + секции `servers:` и `executors:`.
  Миграции формата — протокол `formatVersion` + цепочка миграций в registry.
- **BREAKING** — **Скиллы: 8 → 7, имена «Профессии»**: `openspec` →
  **analyst** (спека + правки кода), `pr` → **courier** (ветка/PR/замечания),
  `jobs` → **operator** (запуск/ожидание джоб), `diagnosis` + `repair` →
  **doctor** с режимами `diagnose` (только чтение) и `fix` (TDD-фикс, 🔒,
  пуш); режим задаёт вызывающий. `run`, `registry`, `adapt-kit` не
  переименовываются.
- **Схема исполнителей (вариант Б)**: словарь позиций — манифест комплекта
  (позиция = контракт: шаг 0, формат отчёта, ask-правила, версия v1); kind
  стадии определяет набор позиций; проект в `executors:` подменяет исполнителя
  позиции одной строкой. Позиции: analyst, courier, operator, detective,
  mechanic (детали — design.md).
- **run**: обход стадий по `pipelineOrder`; переходы `nextStageId`/
  `fixesStageId`/`triggeredBy`; счётчики по **id стадии**; loop guard; исходы
  retry / issues.md / WAIT.
- **Гейт-контракт** (заимствование из gh-aw/agent-os): prepare → confirm →
  apply; карточка = payload с превью; fail-closed; подтверждение выдаётся
  карточке — изменение payload = новый вопрос.
- **Роли** (operator, doctor, analyst, courier): механика, шаг 0, форматы
  отчётов — без изменений; источник аргументов — запись своей стадии
  (`knowledgeRef`/`diagnosisRef`/`repairRef`, дефолт `knowledgeRef`); в
  SKILL.md — таблица ask-правил (заимствование Claude Code).
- Инварианты сохраняются: MCP только из аргументов вызова; пуш только в
  рабочие ветки `<X>/<КЛЮЧ>`; ПР-only правки; статусы Jira не трогать; «ничего
  не искать» (включая исполнителей — trust-модель spec-kit); явный вызов
  скилла не тянет цепочку.

## Capabilities

### New Capabilities

- `conveyor`: диспетчер прогона — обход стадий по `pipelineOrder`, переходы
  (`nextStageId`/`fixesStageId`/`triggeredBy`), счётчики по id стадии, loop
  guard, исходы (retry / issues.md / WAIT), гейт-контракт prepare → confirm →
  apply
- `registry`: единственная точка ведения `ship-kit.projects.yaml` — проекты,
  стадии, записи знания, серверы, executors; валидация против манифеста
  позиций; миграции `formatVersion`
- `executors`: позиции и исполнители — словарь позиций (манифест), дефолты
  комплекта (analyst/courier/operator/doctor), режимы doctor, подмена
  исполнителя в проекте, ask-правила, PR только через courier, записи знания
  по потребителю

### Modified Capabilities

Нет: `openspec/specs/` проекта пуст — это первые способности репозитория.

## Impact

- **openspec-слой репо**: корень изменений в `extensions/ship-kit/openspec/`
  — мультипроектная схема (в репо могут появляться свои openspec-корни у
  скиллов/расширений/агентов); скиллы openspec-* общие в `.agents/skills/`
  корня репо.
- Переписываются: `skills/run`, `skills/registry`; создаются
  `skills/{analyst,courier,operator,doctor}` (переименование + объединение);
  удаляются `skills/{openspec,pr,jobs,diagnosis,repair}`.
- Обновляются: `skills/adapt-kit`, `docs/ship-kit.md`,
  `docs/ship-kit.projects.example.md` (→ схема yaml), манифест позиций
  (новый `docs/ship-kit.positions.yaml`), `QWEN.md`, `qwen-extension.json`
  (→ 1.0.0).
- dev-воркспейс: валидатор yaml (правила + executors↔манифест + миграции) и
  e2e-стенд под стадии; прогоны — только glm-5.3-flash.
- Совместимости с md-реестром нет (решение пользователя: снимается, реестры
  заводятся заново).

## Non-goals

- Миграция md → yaml автоматом (в журнале форматов md = «0»).
- Новые форматы отчётов ролей; инфраструктура gh-aw (git-bundle, GraphQL-push,
  Actions) — берём только паттерны.
- Каталог готовых MCP-обёрток CI в комплекте: транспорт — контракт трёх
  операций, сервер ставит проект.
- Webhook-режим ожиданий (гейты/апрувы — паузы прогона с фиксацией в плане).
- Запись в Jira (комментарии/статусы) — только чтение.
