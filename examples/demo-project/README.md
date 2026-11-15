# demo-project — целевой проект для базы ship-kit

Учебный пример «calc»: как на живом проекте работают три скилла базы
(`ship-kit:task` / `ship-kit:pr` / `ship-kit:ci`) — откуда берутся
данные вызова, как выглядят карточки гейтов и что происходит при
падении деплоя. Без реальных MCP: все ответы и логи ниже — дословные
образцы. Образец конвейера v2 — [../conveyor](../conveyor/README.md);
здесь — только база.

Файлы: [ship-kit.projects.md](ship-kit.projects.md) (файл проектов),
[ship-kit.workflows.md](ship-kit.workflows.md) (макрос «feature»),
[repo/](repo/) (мини-репозиторий), [skill-runs/PRJ-777/](skill-runs/PRJ-777/)
(состояние прогона), [INTERVIEW.md](INTERVIEW.md) (тест-интервью).

## Задание (вход)

> «PRJ-777 добавь экспорт отчётов в CSV. Профиль feature.»

## Данные вызова — из файла проектов

Агент сессии читает `ship-kit.projects.md` как обычный контекст и
собирает аргументы. Скиллы файл **не читают** — формат нигде не вшит.

| Строка файла проектов | Куда попадает |
|---|---|
| `mcp-jira = jira-corp` | аргумент `mcp-jira=jira-corp` в вызове task |
| `mcp-confluence = wiki-corp` | аргумент `mcp-confluence=wiki-corp` |
| `mcp-bitbucket = bb` | аргумент `mcp-bitbucket=bb` в вызове pr |
| `mcp-build/mcp-deploy = jenkins-corp` | аргументы вызова ci |
| джоба `calc-app` (jobFolder folder/team) | карточка запуска build |
| джоба `calc-app-deploy`, порядок DEV→ST→IFT→PSI | карточки запуска deploy |
| базовая `main`; ветки `feature/<КЛЮЧ>` | целевая ветка карточки pr; имя ветки |
| «Известные проблемы»: DEVOPS-311, runbook | источник диагноза ci при падении ST |
| Репозиторий `git@git.corp:team/calc.git` | сессия вне `repo/` → task клонирует и работает в клоне |

Два представления конвенции: этот файл — мастер записи calc; общая
картина команды — центральный каталог-индекс
[../central-catalog](../central-catalog/README.md) (каскад: репо-файл
сильнее каталога).

## Шаг 1 — `/ship-kit:task PRJ-777 …, mcp-jira=jira-corp, mcp-confluence=wiki-corp, mcp-bitbucket=bb`

**Шаг-0.** MCP-проверки: jira-corp ✓ (поиск по PRJ-777), wiki-corp ✓,
bb ✓. Порядок прогона: задание назвало «профиль feature» → макрос из
`ship-kit.workflows.md` развернулся в перечень → показан одним блоком:

```
Порядок прогона PRJ-777 (🔒 — строки с гейтом):
1. спека (скилл спекирования проекта)
2. имплементация (TDD)
3. ревью кода
4. /ship-kit:pr — 🔒 карточка «пуш+PR»
5. /ship-kit:ci — 🔒 build; 🔒 deploy DEV→ST→IFT→PSI
Подтверждаете порядок? (да/нет)
```

«Да» → чек-лист зафиксирован в `skill-runs/PRJ-777/plan.md`. Одно
подтверждение порядка за прогон.

**Спека.** В списке скиллов сессии найден один скилл спекирования
(description: оформление изменения до кода) — openspec-скилл проекта.
Работаем им по его правилам → изменение `prj-777-csv-export`
(proposal + чек-лист задач). Имя инструмента — факт этого проекта, в
файлы комплекта оно не вшито.

**TDD в repo/.** Красный: `assert.strictEqual(toCsv([[1,2],[3,4]]),
'1;2\n3;4')` — toCsv не существует. Правка `app.js` (добавлен toCsv).
Зелёный — дословно:

```
$ bash examples/demo-project/repo/test.sh
OK: 2 теста зелёные (add, toCsv)
```

Коммиты: `feat(PRJ-777): тест экспорта CSV`, `feat(PRJ-777): toCsv`.
Отчёт task (дословные строки прогона — над блоком):

```
OK: true
CHANGE: prj-777-csv-export
SPEC: openspec-скилл (discovery)
BRANCH: feature/PRJ-777
GATE: —
SUMMARY: экспорт CSV (toCsv) + тест; 2 коммита
HANDOFF: pr
```

## Шаг 2 — `/ship-kit:pr отправь на ревью, mcp-bitbucket=bb`

Шаг-0: bb ✓, ветка feature/PRJ-777, состояние чистое. Ревью (строка 3
порядка) — чисто. Карточка — одно подтверждение на пуш и PR вместе:

```
🔒 Карточка «пуш+PR»
Ветка: feature/PRJ-777 · коммитов: 2 · целевая: main (пуш в main — NEVER)
PR: «PRJ-777: экспорт отчётов в CSV» — что/зачем/как проверить + ссылка на задачу
```

«Да» → пуш + PR-1. Отчёт:

```
OK: true
WORKTREE: —
BRANCH: feature/PRJ-777
PRID: 1
PRURL: https://git.corp/team/calc/pull-requests/1
GATE: confirmed
HANDOFF: ci (после MERGED)
```

PR-1 MERGED (замечаний не было; пришли бы — правка пушем в тот же
PR-1, отдельная карточка пуша).

## Шаг 3 — `/ship-kit:ci запусти сборку и деплой, mcp-build=jenkins-corp, mcp-deploy=jenkins-corp`

Джобы — из файла проектов («ничего не искать»). Каждый запуск — своя
карточка.

```
🔒 Карточка запуска (build)
kind: build · джоба: calc-app (folder/team — файл проектов) · ветка: main
```

«Да» → **BUILD #114 SUCCESS**. Затем деплой по стендам:

```
🔒 Карточка запуска (deploy · DEV)
kind: deploy · джоба: calc-app-deploy · стенд: DEV
```

→ **DEV #57 SUCCESS**.

```
🔒 Карточка запуска (deploy · ST)
kind: deploy · джоба: calc-app-deploy · стенд: ST
```

→ **ST #23 FAILURE**. Дословный хвост лога (в отчёте — над блоком):

```
14:31:02 [deploy] стенд ST, агент st-agent-02
14:31:03 ERROR: агент недоступен: Connection refused (st-agent-02:22)
14:31:03 Build step 'Execute shell' marked build as failure
14:31:04 Finished: FAILURE
```

**Диагноз** (kind=deploy → [deploy.md](../../extensions/ship-kit/skills/ci/deploy.md)
протокола примера): первая ошибка — отказ соединения с агентом; в
файле проектов «Известные проблемы» и mcp-jira: тикет DEVOPS-311
открыт, массовый; runbook — перезапуск силами DevOps. Правки репо не
требует, ретрай на том же агенте бесполезен. Отчёт ci:

```
OK: true
JOB: calc-app-deploy · #23 · FAILURE
CATEGORY: infra
FIXABLE: false
RELATED: —
CONFIDENCE: high
HANDOFF: human
```

## Шаг 4 — issues.md + эскалация

Не-кодовое падение → задача в `skill-runs/PRJ-777/issues.md` (см.
файл) + эскалация DevOps. Бизнес-PR слит, код не тронут, IFT/PSI не
запускались.

## Шаг 5 — «продолжи PRJ-777»

DevOps перезапустил агент (тикет закрыт). `ci` читает план, сверяется
с реальностью (статусы #23, PR-1) и продолжает с зафиксированного
шага — новые карточки: **ST #24 ✅ → IFT #9 ✅ → PSI #6 ✅**. Прогон
завершён: все стенды зелёные, `OK: true` с дословными хвостами логов.

## Итог прогона

7 карточек-гейтов за прогон (пуш+PR, build, DEV, ST#23, ST#24, IFT,
PSI); одно подтверждение порядка; один провал → одна задача в
issues.md → возобновление по плану. Полное состояние —
[skill-runs/PRJ-777/plan.md](skill-runs/PRJ-777/plan.md).

Проверить, что пример доносит модель, — [INTERVIEW.md](INTERVIEW.md).
Соответствие базы — на момент коммита.
