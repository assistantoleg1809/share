# Эталон: агенты и workflows Qwen Code для сборки и автономной работы

Комплект из 7 агентов, 3 workflows и испытательного стенда (моки 6 MCP +
e2e-таргет с инжектированным багом), собранный по рабочему процессу
«Jira → OpenSpec → правки → PR → ревью → сборка → деплой → исправление».
Копируется в целевой проект целиком (`.qwen/agents/`, `.qwen/workflows/`) и
донастраивается по чек-листу в конце.

Основа: Qwen Code 0.24.6, исследование [qwen-workflows.md](../qwen-workflows.md)
и [qwen-workflows-dev-guide.md](../qwen-workflows-dev-guide.md); e2e-уроки —
[mcp-jenkins-test](../mcp-jenkins-test/README.md) и [e2e/e2e-run.md](../e2e/e2e-run.md).

## 1. Состав

```
.qwen/
  agents/
    reviewer.md         ревью кода, без MCP
    openspec.md         Jira+Confluence+mmap → OpenSpec-документация
    build-status.md     только Jenkins: статус/лог/ожидание
    build-trigger.md    только Jenkins: запуск сборки/деплоя, одна попытка
    build-triage.md     5 MCP: разбор причин падения сборки
    build-fix.md        5 MCP + правки кода, TDD, commit, push
    implementer.md      Jira+Bitbucket + код: реализация, PR, замечания
  workflows/
    build-autofix.js        /build-autofix — сборка с исправлением (3 попытки)
    deploy-autofix.js       /deploy-autofix — deploy-джоба с разбором ошибок деплоя
    autonomous-worker.js    /autonomous-worker — один тик автономного воркера
  autonomous-worker/
    state.json           состояние воркера (gitignore)
  settings.json          MCP-моки стенда (см. §6, при переносе заменить)
mcp/                     6 stdio-моков + фикстуры логов (e2e-стенд)
e2e/
  target/                таргет с инжектированным багом (app.py:19) + тесты
  e2e-run.md             журнал e2e-прогонов
  bare.git/, e2e-run/    изолированный прогон (gitignore)
```

## 2. Матрица доступа агентов

| Агент | Jenkins | Jira | Confluence | Sonar | Bitbucket | mmap | Код (чтение/запись/shell/git) |
|---|---|---|---|---|---|---|---|
| reviewer | — | — | — | — | — | — | только чтение (read/grep/glob, plan-режим) |
| openspec | — | ✓ | ✓ | — | — | ✓ | чтение/запись (openspec-каталог, CLI) |
| build-status | ✓ | — | — | — | — | — | чтение + `sleep` в shell |
| build-trigger | только инструменты запуска (build/deploy) | — | — | — | — | — | — |
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

Аргументы: `{ job, branch?, maxAttempts? = 3, modelFast?, modelExpert? }`.

Цикл (до 3 попыток): **trigger** (одна попытка запуска, агент build-trigger) →
**watch** (цепочка агентов build-status, каждый до ~8 минут с `sleep 45`;
итого до ~64 минут на сборку) → SUCCESS — конец; падение → **triage**
(диагноз: категория, первопричина, fixable, fixHint, knownIssues) → **fix**
(build-fix в изолированном worktree: TDD «красный → правка → зелёный»,
commit, push в рабочую ветку) → пересборка.

Фикс выполняется в `isolation: 'worktree'` — основной чекаут не трогается;
после успешного фикса и зелёной/исчерпанной сборки workflow сам прибирает
worktree (ветка с фиксом остаётся). Протокол фикса текстовый:
`OK / COMMIT / BRANCH / PUSHED / SUMMARY / WORKTREE`.

Статусы результата: `SUCCESS`, `EXHAUSTED` (попытки кончились, последний фикс
запушен), `NOT_FIXABLE` (инфра/массовая проблема — человеку), `TRIGGER_FAILED`,
`TRIAGE_FAILED`, `FIX_FAILED` (в отчёте — диагноз и `lastFix`, если фикс
успел случиться на прошлой попытке), `WATCH_TIMEOUT`, `MCP_UNAVAILABLE`.

Фикс выполняется и после последней падавшей сборки: человек получает ветку с
исправлением, а не только список диагнозов.

Лимиты, которые надо знать:

- 30 минут wall-clock на прогон по умолчанию. Сборки длиннее — поднять:
  `export QWEN_CODE_MAX_WORKFLOW_SECONDS=7200` (2 часа) в среде, где запускается.
- На агента — 10 минут; поэтому ожидание организовано цепочкой наблюдателей.
- Итог `WATCH_TIMEOUT` означает «не дождались за ~64 минуты», а не «сборка упала».

## 4a. `/deploy-autofix` — вторая ступень для EFS-проектов

Аргументы: `{ job, branch?, maxAttempts? = 2, modelFast?, modelExpert? }`.
Тот же цикл, но для deploy-джобы (`trigger_deploy`), и триаж с приоритетом
деплой-специфики: открытые тикеты DevOps по тексту ошибки (`devops-known`),
инфра (`infra`) — обе категории `NOT_FIXABLE` с тикетами для передачи DevOps;
`config`/`code` — фикс тем же build-fix-агентом в worktree. Для EFS-проектов
это закрывает боль «лог деплой-жабы → известные проблемы DevOps» из
[about-my-work.md](../about-my-work.md).

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
`DEV` (implementer **в изолированном worktree**: ветка, коммиты, PR; основной
чекаут свободен — боль «бурных дней» закрыта) → `PR_WAIT` (опрос Bitbucket) →
при замечаниях fix-цикл (implementer в том же worktree через `workingDir`:
ответить, поправить, запушить, закрыть замечание; максимум 3 попытки, дальше
`PR_STUCK`) → при MERGED — вложенный `workflow('build-autofix')` → `DONE`.

Терминальные фазы (`DONE`, `*_FAILED`, `PR_DECLINED`, `PR_STUCK`) на следующем
тике закрываются в историю (worktree прибирается), и воркер берёт следующую
задачу из Jira. Ошибка одной задачи не останавливает воркер.

**Звук-уведомления** (стандарт Oleg): терминальный тик играет системный звук —
`Tink` при `DONE`, `Bottle` при `*_FAILED`/`PR_DECLINED`/`PR_STUCK` (afplay
через shell-агента; в headless-прогоне тоже срабатывает).

**Модели и effort**: механика (скан Jira, pr:check, наблюдатели, запуск) —
`effort: 'low'` + опциональный `modelFast`; триаж/спека/реализация/фикс —
`effort: 'high'` + опциональный `modelExpert`. Оба параметра передаются в
args: `{ now, modelFast: '<id>', modelExpert: '<id>' }`; без них — модель
сессии.

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
  игнорируется), после рестарта. Проверка: `/workflows`. Для headless-прогона
  достаточно env: `QWEN_CODE_ENABLE_WORKFLOWS=1`.
- `.qwen/settings.json` репозитория настроен на **моки стенда** (jenkins, jira,
  confluence, sonar, bitbucket, mmap — stdio, ноль зависимостей). При переносе
  в целевой проект замени записи на реальные серверы; workflows и агенты не
  меняются — они обращаются к серверам по id.
- Корпоративный режим: `tools.workflowNameOnly: true` + правила разрешения
  `Workflow(name:build-autofix)`, `Workflow(name:deploy-autofix)`,
  `Workflow(name:autonomous-worker)` — модель сможет запускать только эти
  сохранённые workflows и ничего inline.
- Вложенный `workflow()` разделяет лимиты внешнего прогона: тик со сборкой
  укладывается в общий wall-clock — для сессии-драйвера поднять
  `QWEN_CODE_MAX_WORKFLOW_SECONDS` (например 14400).
- Скиллы OpenSpec используются агентами openspec/implementer; сами скиллы
  ставятся отдельно (пользовательский или проектный уровень).

## 6a. Испытательный стенд (e2e)

Моки живут в `mcp/` и подключены `.qwen/settings.json` под **продакшн-id**
(`jenkins`, а не `jenkins-mock`) — чтобы проверялись сами allowlist/deny-list
агентов. Ключевые решения:

- **Файловое состояние моков**: каждый workflow-агент получает СВОЙ stdio-
  процесс MCP-сервера, память процесса не переживает агентов. Счётчики
  джenkins-мока и PR-состояние bitbucket-мока лежат в
  `.qwen/tmp/*-mock-state.json` (cwd сессии). Сброс перед прогоном:
  `rm -f .qwen/tmp/*-mock-state.json`.
- **Детерминизм**: первый запуск сборки/деплоя → FAILURE (фикстура лога),
  далее SUCCESS; первый опрос статуса → RUNNING (тренирует цепочку
  наблюдателей и sleep-цикл), далее терминальный.
- **Таргет с багом**: `e2e/target/app.py:19` — `def div(a, b)` без двоеточия;
  воспроизводится локально импортом (`python3 -c "import sys; sys.path.insert(0,'e2e/target'); import app"`), чинится правкой в один символ.
- **Изоляция прогона**: bare-репозиторий + клон (`e2e/bare.git`, `e2e/e2e-run`,
  оба в gitignore) — пуши workflow-агентов уходят в bare, реальный origin не
  затрагивается.
- **Полный сценарий**: скан Jira (PRJ-42 с jenkinsJob) → спека → реализация в
  worktree → PR c замечанием → устранение → MERGED → вложенный build-autofix
  (красная #1 → TDD-фикс → зелёная #2) → DONE + звук.

Прогон (из корня репо, одна строка):

```
rm -rf e2e/bare.git e2e/e2e-run && git init --bare -q e2e/bare.git && git push -q e2e/bare.git main:main && git clone -q e2e/bare.git e2e/e2e-run && rm -f e2e/e2e-run/.qwen/tmp/*-mock-state.json 2>/dev/null; cd e2e/e2e-run && QWEN_CODE_ENABLE_WORKFLOWS=1 qwen -y -p "Запусти сохранённый workflow build-autofix: вызови Workflow({ name: 'build-autofix', args: { job: 'calc-app' } }) и верни итог."
```

Грабли, пойманные e2e (уже закрыты в эталоне, помни о них при тиражировании):

1. `args` в headless приходит **строкой** — нормализация
   `const A = typeof args === 'string' ? JSON.parse(args) : args` в каждом
   скрипте (урок [mcp-jenkins-test e2e](../mcp-jenkins-test/e2e/e2e-run.md)).
2. qwen при старте дописывает `"$version": N` в settings.json — свежий клон
   становится «грязным» и `isolation: 'worktree'` отказывает. Эталон
   коммитит `$version` заранее.
3. Worktree-механизм генерирует `.qwen/.gitignore` (`worktrees/`) — пока файл
   не закоммичен, второй isolation-вызов в том же репозитории отказывает.
   Эталон коммитит его.
4. Мок с состоянием в памяти процесса не виден следующему агенту — состояние
   только в файле (см. выше).
5. Агенты, пишущие в основной чекаут (openspec-каталог), «пачкают» дерево —
   а `isolation: 'worktree'` требует чистое дерево. Воркер сам коммитит спеку
   (шаг `spec:commit`).
6. Worktree isolation-агента убирается рантаймом после тика — не храните его
   путь как `workingDir` для будущих тиков: следующему агенту давайте СВОЙ
   свежий worktree + `git checkout <ветка задачи>`.

Журнал прогонов с находками: [e2e/e2e-run.md](../e2e/e2e-run.md).

## 7. Чек-лист адаптации под целевой проект

1. **Имена MCP-серверов.** Здесь `jenkins`, `jira`, `confluence`, `sonar`,
   `bitbucket`, `mmap`. Сверь со своими id в settings.json → mcpServers и
   поправь deny-listы/allowlistы во всех agent-файлах. `mmap` — отдельный
   сервер схем/знаний; точное имя уточни у владельца конфигурации.
2. **Инструменты запуска Jenkins.** В `.qwen/agents/build-trigger.md` allowlist
   содержит `mcp__jenkins__trigger_build` и `mcp__jenkins__trigger_deploy` —
   замени на точные имена из `/mcp`. Allowlist строгий: пока имя не совпадает,
   агент честно вернёт ошибку шага 0.
3. **Сборочная джоба.** Передай `job` в `/build-autofix` или укажи `jenkinsJob`
   в задаче Jira/реестре проектов, откуда его возьмёт скан.
4. **OpenSpec.** Убедись, что скиллы openspec-* установлены и CLI доступен.
5. **Статусы Jira.** Воркер не меняет их никогда (только чтение и PR-цикл);
   перевод статусов остаётся за человеком.
6. **Push-политика.** build-fix и implementer пушат только в рабочие ветки,
   никогда в main/master; это же условие проверяют их шаги 0.

## 8. Границы решения

- Reviewer не запускает код — только чтение; проверка исполнением остаётся за
  сборкой и TDD-проверками build-fix.
- Ожидание approve — это тики раз в 5 минут, а не webhook: реакция на
  замечания занимает до ~5 минут.
- Воркер не пишет комментарии в Jira и не меняет статусы — при необходимости
  это отдельное явное решение, в эталон не включено.
- Звук-уведомление играет на машине, где живёт сессия-драйвер; в корп. среде
  с headless-демоном замените afplay на нужный канал (Jira-комментарий,
  мессенджер).

## 9. Связь с mcp-jenkins-test

В репозитории два эталона, они дополняют друг друга:

- **Этот комплект** — архитектура ролей: 7 агентов с MCP-матрицей, 3 workflow,
  звук, worktree-изоляция, протокол «Шаг 0».
- **[mcp-jenkins-test](../mcp-jenkins-test/README.md)** — самостоятельный
  мини-эталон TDD-цикла (`/build-failure-triage`, `/build-fix-loop`) со своими
  моками и e2e; его прогоны дали уроки, зашитые сюда (args-строка, имена
  переменных, determinism).
