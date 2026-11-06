# Эталон: агенты и workflows Qwen Code для сборки и автономной работы

Комплект из 7 агентов и 2 workflows, собранный по рабочему процессу
«Jira → OpenSpec → правки → PR → ревью → сборка → исправление сборки».
Копируется в целевой проект целиком (`.qwen/agents/`, `.qwen/workflows/`) и
донастраивается по чек-листу в конце.

Основа: Qwen Code 0.24.6, исследование [qwen-workflows.md](../qwen-workflows.md)
и [qwen-workflows-dev-guide.md](../qwen-workflows-dev-guide.md).

## 1. Состав

```
.qwen/
  agents/
    reviewer.md         ревью кода, без MCP
    openspec.md         Jira+Confluence+mmap → OpenSpec-документация
    build-status.md     только Jenkins: статус/лог/ожидание
    build-trigger.md    только Jenkins: запуск, одна попытка
    build-triage.md     5 MCP: разбор причин падения сборки
    build-fix.md        5 MCP + правки кода, commit, push
    implementer.md      Jira+Bitbucket + код: реализация, PR, замечания
  workflows/
    build-autofix.js        /build-autofix — сборка с исправлением (3 попытки)
    autonomous-worker.js    /autonomous-worker — один тик автономного воркера
  autonomous-worker/
    state.json           состояние воркера (gitignore)
```

## 2. Матрица доступа агентов

| Агент | Jenkins | Jira | Confluence | Sonar | Bitbucket | mmap | Код (чтение/запись/shell/git) |
|---|---|---|---|---|---|---|---|
| reviewer | — | — | — | — | — | — | только чтение (read/grep/glob, plan-режим) |
| openspec | — | ✓ | ✓ | — | — | ✓ | чтение/запись (openspec-каталог, CLI) |
| build-status | ✓ | — | — | — | — | — | чтение + `sleep` в shell |
| build-trigger | только инструмент запуска | — | — | — | — | — | — |
| build-triage | ✓ | ✓ | ✓ | ✓ | ✓ | — | только чтение (без shell) |
| build-fix | ✓ | ✓ | ✓ | ✓ | ✓ | — | полный: правки, shell, git, push |
| implementer | — | ✓ | — | — | ✓ | — | полный: правки, shell, git, push |

Механика ограничений:

- **Deny-list** (`disallowedTools: mcp__<server>`) у openspec, build-status,
  build-triage, build-fix, implementer — запрещает перечисленные серверы
  целиком. Серверов в списке нет — агент их наследует от сессии.
- **Allowlist** (`tools:`) у reviewer и build-trigger — только перечисленные
  инструменты; MCP в списке не назван — агент его не получит вовсе.
- Появится новый MCP-сервер в settings.json — внеси его в deny-list агентов,
  которым он не нужен (deny-list защищает только от перечисленного).

## 3. Протокол «Шаг 0»: проверка MCP и шаблон ошибки

Каждый агент с MCP перед работой делает лёгкий вызов каждого нужного сервера.
Недоступен — работа останавливается и возвращается блок:

```
❌ MCP <server> недоступен
Симптом: <дословно что произошло>
Рекомендации:
1. Выполнить /mcp и посмотреть статус сервера.
2. Проверить запись сервера в settings.json → mcpServers.
3. Перезапустить сессию Qwen Code — клиент не перезапускает MCP-серверы сам.
4. Для удалённых серверов (httpUrl) — проверить сеть и токен.
```

Причина: у клиента Qwen Code нет команды перезапуска MCP-сервера — это действие
остаётся за человеком, поэтому ошибка обязана быть внятной и с инструкцией.
`build-autofix` дублирует проверку фазой «MCP check» до траты попыток.

## 4. `/build-autofix` — сборка с исправлением ошибки сборки

Аргументы: `{ job, branch?, maxAttempts? = 3 }`.

Цикл (до 3 попыток): **trigger** (одна попытка запуска, агент build-trigger) →
**watch** (цепочка агентов build-status, каждый до ~8 минут с `sleep 45`;
итого до ~64 минут на сборку) → SUCCESS — конец; падение → **triage**
(диагноз: категория, первопричина, fixable, fixHint, knownIssues) → **fix**
(build-fix: минимальная правка, локальная проверка, commit, push) → пересборка.

Статусы результата: `SUCCESS`, `EXHAUSTED` (попытки кончились, последний фикс
запушен), `NOT_FIXABLE` (инфра/массовая проблема — человеку), `TRIGGER_FAILED`,
`TRIAGE_FAILED`, `FIX_FAILED`, `WATCH_TIMEOUT`, `MCP_UNAVAILABLE`.

Фикс выполняется и после последней падавшей сборки: человек получает ветку с
исправлением, а не только список диагнозов.

Лимиты, которые надо знать:

- 30 минут wall-clock на прогон по умолчанию. Сборки длиннее — поднять:
  `export QWEN_CODE_MAX_WORKFLOW_SECONDS=7200` (2 часа) в среде, где запускается.
- На агента — 10 минут; поэтому ожидание организовано цепочкой наблюдателей.
- Итог `WATCH_TIMEOUT` означает «не дождались за ~64 минуты», а не «сборка упала».

## 5. `/autonomous-worker` — автономный воркер

Workflow не может жить вечно (wall-clock, нет таймеров, детерминизм для resume),
поэтому воркер разделён:

- **`/autonomous-worker`** — один идемпотентный тик: читает
  `state.json`, исполняет **ровно один шаг** конвейера, пишет состояние обратно.
  Один шаг на тик — дёшево, предсказуемо и переживает падения (следующий тик
  продолжит с того же места).
- **Драйвер цикла «раз в 5 минут»** — loop/cron, вызывающий тик:

  ```
  /loop 5m Запусти сохранённый workflow autonomous-worker: вызови Workflow({ name: 'autonomous-worker', args: { now: '<подставь текущее время ISO>' } }). Ничего, кроме now, не меняй.
  ```

  Пока тик жив (например, ждёт сборку внутри build-autofix), очередной вызов
  ждёт своей очереди — тики не параллелятся, интервал «не чаще 5 минут».

Конвейер: `IDLE` (скан Jira: назначенные задачи) → `SPEC` (openspec-агент) →
`DEV` (implementer: ветка, коммиты, PR) → `PR_WAIT` (опрос Bitbucket) →
при замечаниях `PR_FIX`-цикл (implementer: устранить, запушить, максимум 3
попытки, дальше `PR_STUCK`) → при MERGED — вложенный
`workflow('build-autofix')` → `DONE`.

Терминальные фазы (`DONE`, `*_FAILED`, `PR_DECLINED`, `PR_STUCK`) на следующем
тике закрываются в историю, и воркер берёт следующую задачу из Jira. Ошибка
одной задачи не останавливает воркер.

`state.json` (пример):

```json
{
  "phase": "PR_WAIT",
  "task": { "key": "PRJ-42", "summary": "...", "url": "...", "jenkinsJob": "app-build" },
  "specDir": "openspec/changes/PRJ-42-login-timeout",
  "branch": "task/PRJ-42",
  "prId": 137,
  "fixRetries": 0,
  "lastTick": "2026-11-06T12:00:00Z",
  "history": [ { "at": "...", "event": "picked", "task": "PRJ-42" } ]
}
```

`jenkinsJob` заполняется из задачи/реестра при скане или на шаге SPEC; без него
после merge вернётся `BUILD_FAILED` с подсказкой вписать вручную.

## 6. Включение и настройки

- `tools.workflowsEnabled: true` — только User/System scope (workspace-файл
  игнорируется), после рестарта. Проверка: `/workflows`.
- Корпоративный режим: `tools.workflowNameOnly: true` + правила разрешения
  `Workflow(name:build-autofix)`, `Workflow(name:autonomous-worker)` — модель
  сможет запускать только эти сохранённые workflows и ничего inline.
- Вложенный `workflow()` разделяет лимиты внешнего прогона: тик со сборкой
  укладывается в общий wall-clock — для сессии-драйвера поднять
  `QWEN_CODE_MAX_WORKFLOW_SECONDS` (например 14400).
- Скиллы OpenSpec используются агентами openspec/implementer; сами скиллы
  ставятся отдельно (пользовательский или проектный уровень).

## 7. Чек-лист адаптации под целевой проект

1. **Имена MCP-серверов.** Здесь `jenkins`, `jira`, `confluence`, `sonar`,
   `bitbucket`, `mmap`. Сверь со своими id в settings.json → mcpServers и
   поправь deny-listы/allowlistы во всех agent-файлах. `mmap` — отдельный
   сервер схем/знаний; точное имя уточни у владельца конфигурации.
2. **Инструмент запуска Jenkins.** В `.qwen/agents/build-trigger.md` allowlist
   содержит `mcp__jenkins__trigger_build` — замени на точное имя из `/mcp`.
   Allowlist строгий: пока имя не совпадает, агент честно вернёт ошибку шага 0.
3. **Сборочная джоба.** Передай `job` в `/build-autofix` или укажи `jenkinsJob`
   в задаче Jira/реестре проектов, откуда его возьмёт скан.
4. **OpenSpec.** Убедись, что скиллы openspec-* установлены и CLI доступен.
5. **Статусы Jira.** Воркер не меняет их никогда (только чтение и PR-цикл);
   перевод статусов остаётся за человеком.
6. **Push-политика.** build-fix и implementer пушат только в рабочие ветки,
   никогда в main/master; это же условие проверяют их шаги 0.

## 8. Границы решения

- Reviewer не запускает код — только чтение; проверка исполнением остаётся за
  сборкой и локальными проверками build-fix.
- Ожидание approve — это тики раз в 5 минут, а не webhook: реакция на
  замечания занимает до ~5 минут.
- Воркер не пишет комментарии в Jira и не меняет статусы — при необходимости
  это отдельное явное решение, в эталон не включено.
