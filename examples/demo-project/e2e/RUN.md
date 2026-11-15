# RUN — протокол живого прогона PRJ-777 (2026-11-15)

Модель glm-5.3-flash, 6 последовательных headless-вызовов в песочнице
(сборщик `make_sandbox.mjs`; путь прогона —
`/var/folders/.../T/ship-kit-live-AQ4SvC`, одноразовый). Установленная
копия ship-kit 2.0.0. Команды вызовов — [SCENARIO.md](SCENARIO.md).

## Вердикт: кейс пользователя 1–5 — GREEN

| Шаг кейса | Факт прогона |
|---|---|
| 1. ввод команды | вызов 1 дословно; скилл task отработал фазой целиком |
| 2. аргументы из файла проектов; деплой только IFT | вызов 1: агент сам взял алиасы из `ship-kit.projects.md` (порядок + конвенции оттуда же); деплой шёл только на IFT (STAND=IFT) |
| 3. проверка MCP | Шаг-0 в каждом вызове: jira/wiki/bb/jenkins лёгкими вызовами |
| 4. директория спеки по правилу проекта | `specs/PRJ-700-dobavit-eksport-otchetov-v-csv/` (proposal.md + tasks.md): родительская стори PRJ-700 и slug — из jira (get_issue → parent/summary); конвенция — только из файла проектов |
| 5. деплой зелёный после фикса | build #101 SUCCESS → deploy IFT #102 FAILURE (code, RELATED: task-diff) → task fix 311d10a (TDD красный→зелёный) → PR-2 MERGED → IFT #103 SUCCESS |

Мок-итог: `PR1 MERGED feature/PRJ-777 · PR2 MERGED bugfix/PRJ-777`;
jenkins `#101 SUCCESS · #102 FAIL_TASKCODE · #103 SUCCESS`. План
прогона `skill-runs/PRJ-777/plan.md` вёл всё 6 вызовов (токен
возобновления работает), вплоть до дословных хвостов логов и
pre-approved гейтов с источниками.

## Ключевые ответы вызовов (дословно, сокращено)

1. task: `OK: true · SPEC: brainstorming · BRANCH: feature/PRJ-777 ·
   HANDOFF: pr` — спека по конвенции проекта; ловушка разделителя
   («запятая» в тексте задачи vs «;» у платформы) зафиксирована как
   риск в proposal.md до деплоя.
2. pr: `PRID: 1 · GATE: pre-approved(задание) · HANDOFF: ci` — PR-1
   MERGED (мок мержит сразу).
3. ci: `#101 SUCCESS · #102 FAILURE · CATEGORY: code · FIXABLE: true ·
   RELATED: task-diff · CONFIDENCE: high · HANDOFF: task` + дословный
   хвост smoke-лога.
4. task fix: коммит `311d10a fix(export): разделитель «;» [build #102]`,
   `HANDOFF: pr(тех-PR)`.
5. pr: `PRID: 2 · «тех-фикс» · MERGED`.
6. ci: `#103 SUCCESS · OK: true` — прогон завершён, статусы Jira не
   тронуты (PRJ-777 Open — решение на человеке).

## Честные отклонения (зафиксированы скиллами в плане)

1. **Пуш не выполнялся**: в песочнице нет git-remote (мерж живёт только
   в мок-контуре bb); скилл явно отказался выдумывать origin.
2. **«Ветка от main» в фикс-вызове**: локальный main не содержит слитый
   код (мерж в моке) — ветка срезана от дерева, равного пост-MERGE
   main (проверено merge-base), локальный main не двигался.
3. **Алиасы MCP в вызовах 2–6 не передавались явно** — скиллы работали
   с сессийными серверами settings.json, сверив их с файлом проектов, и
   честно отмечали это в отчётах (confidence). Шаг 2 кейса полноценно
   закрыт вызовом 1, где агент собрал аргументы из файла сам.
4. **SPEC: brainstorming**: discovery нашёл user-level superpowers-скилл
   спекирования; формат директории — конвенция проекта. Вшивания нет.

## Воспроизведение

```bash
node examples/demo-project/e2e/make_sandbox.mjs   # → путь песочницы
cd <путь> && qwen --model glm-5.3-flash -p "<вызов из SCENARIO.md>"
```

Сценарная развилка деплоя сидируется в `mcp-state.json`
(`jenkins.logs` перекрывает логи мока — правка mock.mjs: state-driven
LOGS); смоук перед прогоном обязателен, после смоука — сброс
`jenkins.{idx,byNum,polls,counter}` и `bitbucket`.
