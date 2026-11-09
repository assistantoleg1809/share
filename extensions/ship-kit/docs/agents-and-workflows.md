# Эталон: агенты и workflows Qwen Code для сборки и автономной работы

Комплект из 11 агентов, 3 workflows и испытательного стенда (моки 6 MCP +
e2e-таргет с инжектированным багом), собранный по рабочему процессу
«Jira → OpenSpec → правки → PR → ревью → сборка → деплой → исправление».

Репозиторий сам является **расширением Qwen Code `ship-kit`** (манифест
`qwen-extension.json` в корне, ресурсы в `agents/`, `workflows/`, `skills/`).
Установка в целевой проект — `qwen extensions install <git-url этого репо>`
(для разработки — `qwen extensions link <путь к репо>`); workflows затем
запускаются под квалифицированными именами `/ship-kit:build-autofix` и т.д.
Альтернатива без расширения — режим копии: скопировать `agents/`, `workflows/`,
`skills/` в `.qwen/` проекта и донастроить по чек-листу §7. Выбор режима и
обязательные правила любой доработки — скилл
[skills/adapt-agents-workflows/SKILL.md](../skills/adapt-agents-workflows/SKILL.md).

Основа: Qwen Code 0.24.6, исследование [qwen-workflows.md](../qwen-workflows.md)
и [qwen-workflows-dev-guide.md](../qwen-workflows-dev-guide.md); e2e-уроки —
[mcp-jenkins-test](../mcp-jenkins-test/README.md) и [e2e/e2e-run.md](../e2e/e2e-run.md).

## 1. Состав

```
qwen-extension.json      манифест расширения ship-kit (name, version)
QWEN.md                  контекст расширения (краткая шпаргалка комплекта)
agents/                  11 агентов (поставляются расширением под своими именами)
  reviewer.md            ревью кода, без MCP
  openspec.md            Jira+Confluence+mmap → OpenSpec-документация
  build-status.md        только Jenkins: статус/лог/ожидание сборки
  build-trigger.md       только Jenkins: запуск сборки, одна попытка
  build-triage.md        5 MCP: разбор причин падения сборки
  build-fix.md           5 MCP + правки кода, TDD, commit, push
  deploy-status.md       только Jenkins: статус/лог/ожидание деплоя
  deploy-trigger.md      только Jenkins: запуск деплоя, одна попытка
  deploy-triage.md       5 MCP: разбор падения деплоя (приоритет DevOps/инфра)
  deploy-fix.md          5 MCP + правки конфига/кода, TDD, commit, push
  implementer.md         Jira+Bitbucket + код: реализация, PR, замечания
workflows/               workflows расширения (имена /ship-kit:<имя>)
  build-autofix.js       сборка с исправлением (3 попытки, run-журнал)
  deploy-autofix.js      deploy-джоба с разбором ошибок деплоя (run-журнал)
  autonomous-worker.js   один тик автономного воркера
skills/                  11 скиллов-ролей — строгое 1:1 с агентами (имена совпадают)
  reviewer/  openspec/  implementer/
  build-trigger/ build-status/ build-triage/ build-fix/
  deploy-trigger/ deploy-status/ deploy-triage/ deploy-fix/
  adapt-agents-workflows/ правила доработки агентов/workflows (мета, без пары-агента)
.qwen/
  settings.json          MCP-моки стенда (см. §6, при переносе заменить)
  autonomous-worker/     state.json воркера (gitignore)
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
| build-trigger | только trigger_build | — | — | — | — | — | — |
| build-triage | ✓ | ✓ | ✓ | ✓ | ✓ | — | только чтение (без shell) |
| build-fix | ✓ | ✓ | ✓ | ✓ | ✓ | — | полный: правки, shell, git, push |
| deploy-status | ✓ | — | — | — | — | — | чтение + `sleep` в shell |
| deploy-trigger | только trigger_deploy | — | — | — | — | — | — |
| deploy-triage | ✓ | ✓ | ✓ | ✓ | ✓ | — | только чтение (без shell) |
| deploy-fix | ✓ | ✓ | ✓ | ✓ | ✓ | — | полный: правки, shell, git, push |
| implementer | — | ✓ | — | — | ✓ | — | полный: правки, shell, git, push |

Механика ограничений:

- **Deny-list** (`disallowedTools: mcp__<server>`) у openspec, build-status,
  build-triage, build-fix, deploy-status, deploy-triage, deploy-fix,
  implementer — запрещает перечисленные серверы целиком. Серверов в списке
  нет — агент их наследует от сессии.
- **Allowlist** (`tools:`) у reviewer, build-trigger и deploy-trigger — только
  перечисленные инструменты; MCP в списке не назван — агент его не получит
  вовсе.
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

Аргументы: `{ job, branch?, maxAttempts? = 3, tag?, journal?, now?, modelFast?, modelExpert? }`.

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

**Run-журнал и продолжение после обрыва.** Каждый прогон ведёт журнал на диске:
план фаз, события, факты (номер запущенной сборки, попытка, коммит/ветка фикса),
историю завершённых прогонов и **одну строку `_resume`**
(`job=…;branch=…;number=…;attempt=…;status=…`) — только по ней следующий прогон
решает, продолжать ли: короткую строку быстрая модель эхирует дословно, поля
JSON — теряет и искажает (null → `"null"`, урок e2e 2026-11-09, прогоны B/D
ушли в дубль запуска, пока решение не переехало в строку). Путь: явный
`journal` → при `tag` — `openspec/changes/<tag>/run-build.json` (каталог задачи
OpenSpec, тот же тег `<префикс>-<номер>-<название>`, что и спека) → без тега —
`.qwen/ship-kit/runs/run-build.json`. Номер запущенной сборки записывается на
диск **до** начала ожидания — обрыв процесса или выключение компьютера не
теряют её. Повторный запуск с теми же `job`/`branch`/`journal` при
`status=RUNNING` и известном номере продолжает смотреть ту же сборку, повторный
trigger не выполняется. Терминальный статус (`SUCCESS`, `EXHAUSTED`,
`NOT_FIXABLE`, `TRIGGER_FAILED`, `TRIAGE_FAILED`, `FIX_FAILED`,
`WATCH_TIMEOUT`) закрывает прогон; следующий старт архивирует его в `history`
того же файла. `MCP_UNAVAILABLE` журнал не пишет — ничего запущено не было,
незакрытый `RUNNING` остаётся возобновимым. `now` (ISO-строка) — отметки
времени событий; воркер передаёт его сам. Журнал — бизнес-уровень (факты для
человека и нового прогона), он не заменяет детерминированный replay движка
(`resumeFromRunId`).

Лимиты, которые надо знать:

- 30 минут wall-clock на прогон по умолчанию. Сборки длиннее — поднять:
  `export QWEN_CODE_MAX_WORKFLOW_SECONDS=7200` (2 часа) в среде, где запускается.
- На агента — 10 минут; поэтому ожидание организовано цепочкой наблюдателей.
- Итог `WATCH_TIMEOUT` означает «не дождались за ~64 минуты», а не «сборка упала».

## 4a. `/deploy-autofix` — вторая ступень для EFS-проектов

Аргументы: `{ job, branch?, maxAttempts? = 2, tag?, journal?, now?, modelFast?, modelExpert? }`.
Run-журнал — тот же механизм, файл `run-deploy.json`, возобновление по номеру
запущенного деплоя (см. §4).
Тот же цикл, что у сборки, но из собственной линейки агентов: **deploy-trigger**
(только `trigger_deploy`) → **deploy-status** (ожидание) → **deploy-triage**
(приоритет деплой-специфики: открытые тикеты DevOps по тексту ошибки →
`devops-known`, инфраструктура → `infra`; обе категории `NOT_FIXABLE` с
тикетами для передачи DevOps) → **deploy-fix** в worktree, если причина
правится конфигом/кодом (`config`/`code`). Для EFS-проектов это закрывает
боль «лог деплой-жабы → известные проблемы DevOps» из
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
`PR_STUCK`) → при MERGED — вложенный `ship-kit:build-autofix` → SUCCESS и у
задачи есть `deployJob` → `DEPLOY` (следующий тик: вложенный
`ship-kit:deploy-autofix`) → `DONE`. Нет `deployJob` — после сборки сразу
`DONE`. Наличие деплоя — свойство задачи/проекта (поле `deployJob` в Jira или
реестре, собирается сканом или на шаге SPEC так же, как `jenkinsJob`).
Вложенным вызовам воркер передаёт `tag` (ключ задачи) и `journal`: run-журналы
сборки и деплоя лежат в каталоге задачи `openspec/changes/<тег>/` рядом со
спекой — обрыв тика/сессии не теряет запущенные джобы (см. §4).

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
  "task": { "key": "PRJ-42", "summary": "...", "url": "...", "jenkinsJob": "app-build", "deployJob": "app-deploy" },
  "specDir": "openspec/changes/PRJ-42-login-timeout",
  "branch": "task/PRJ-42",
  "prId": 137,
  "fixRetries": 0,
  "lastTick": "2026-11-06T12:00:00Z",
  "history": [ { "at": "...", "event": "picked", "task": "PRJ-42" } ]
}
```

`jenkinsJob` заполняется из задачи/реестра при скане или на шаге SPEC; без него
после merge вернётся `BUILD_FAILED` с подсказкой вписать вручную. `deployJob` —
то же самое для deploy-ступени: поле есть → после зелёной сборки воркер прогонит
`ship-kit:deploy-autofix` (фаза `DEPLOY`, падение — `DEPLOY_FAILED` со звуком
«Bottle»), поля нет → ступень пропускается целиком.

## 6. Включение и настройки

- **Установка комплекта**: `qwen extensions install <git-url репо ship-kit>` —
  или для разработки `qwen extensions link /path/to/ship-kit` (правки репо
  подхватываются без переустановки). После установки агенты доступны под
  своими именами, workflows — как `/ship-kit:build-autofix`,
  `/ship-kit:deploy-autofix`, `/ship-kit:autonomous-worker`. В проекте,
  где стоит расширение, не заводить `.qwen/agents/*.md` с теми же именами.
  Вложенные вызовы между workflow комплекта идут по квалифицированным
  именам (`ship-kit:...`) — голое имя ищет только проектные сохранённые
  workflows. Имя workflow для расширения берётся из `meta.name` (не из
  имени файла) и обязано быть kebab-lowercase — иначе скрипт молча
  пропускается загрузчиком (урок e2e, 2026-11-09).
- `tools.workflowsEnabled: true` — только User/System scope (workspace-файл
  игнорируется), после рестарта. Проверка: `/workflows`. Для headless-прогона
  достаточно env: `QWEN_CODE_ENABLE_WORKFLOWS=1`.
- `.qwen/settings.json` репозитория настроен на **моки стенда** (jenkins, jira,
  confluence, sonar, bitbucket, mmap — stdio, ноль зависимостей). В целевом
  проекте режим расширения требует **канонических id** серверов в mcpServers
  (агенты расширения править нельзя); режим копии допускает переименование id
  с правкой deny/allow-list (чек-лист §7).
- **Run-журналы** прогонов build/deploy-autofix: `openspec/changes/<тег>/run-*.json`
  (привязка к задаче, тот же тег, что и спека) и `.qwen/ship-kit/runs/run-*.json`
  (автономные запуски без тега). Файлы переживают перезагрузку и читаются
  человеком и новым прогоном: план, номер запущенной джобы, попытка,
  фикс-коммит, история завершённых прогонов (механика — §4).
  **Оба пути обязаны быть в `.gitignore` целевого проекта** (`.qwen/ship-kit/runs/`,
  `openspec/changes/*/run-*.json`): журнал — runtime-состояние, незакоммиченный
  файл «пачкает» дерево и роняет `isolation: 'worktree'` фикс-агентов (урок
  e2e №2/№3).
- Корпоративный режим: `tools.workflowNameOnly: true` + правила разрешения
  `Workflow(name:ship-kit:build-autofix)`,
  `Workflow(name:ship-kit:deploy-autofix)`,
  `Workflow(name:ship-kit:autonomous-worker)` — модель сможет запускать
  только эти workflows комплекта и ничего inline.
- Вложенный `workflow()` разделяет лимиты внешнего прогона: тик со сборкой
  укладывается в общий wall-clock — для сессии-драйвера поднять
  `QWEN_CODE_MAX_WORKFLOW_SECONDS` (например 14400).
- Скиллы OpenSpec используются агентами openspec/implementer; сами скиллы
  ставятся отдельно (пользовательский или проектный уровень).

## 6a. Два режима исполнения: скиллы и агенты (1:1)

Соответствие строгое: **11 агентов ↔ 11 скиллов-ролей с теми же именами**
(исключение — мета-скилл `adapt-agents-workflows`, пары-агента у него
намеренно нет). Вся методика (шаг 0, протокол, ограничения, формат отчёта)
живёт в скилле; тело агента — границы (frontmatter: `tools`/
`disallowedTools`/`approvalMode`) плюс обязательное подключение: вызвать
`Skill` со своим скиллом и следовать целиком, без правок. Доступность
`Skill` сабагенту проверена (2026-11-09); у allowlist-агентов (reviewer,
build-trigger, deploy-trigger) `Skill` внесён в allowlist.

- **Интерактивный режим** — человек идёт по тем же скиллам-ролям в главной
  сессии (`/ship-kit:build-trigger` → `…:build-status` → `…:build-triage`
  → `…:build-fix`; навигация — «Соседние шаги» в хвосте каждого скилла).
  Работает и без расширения: скопировать `skills/<роль>/` в `.qwen/skills/`
  проекта. Без агентов запреты («пуш только в рабочие ветки», «статусы Jira
  не трогать») — дисциплина текста, не механика.
- **Автономный режим** — агенты и workflows: механические границы прав,
  контракты (schema), тики воркера. Воркер в скилл-режим не переводится:
  тик по расписанию без человека требует агентов и state.json.

Цикл (порядок шагов, ≤3 попыток сборки / ≤2 деплоя) знает workflow
(автономно) или человек (интерактивно); скилл-роль отвечает только за свой
шаг. Правка методики — только в скилле; правки методики в теле агента
запрещены (правило §2.3 скилла adapt-agents-workflows).

## 6b. Испытательный стенд (e2e)

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
- **Таргет с багом**: `extensions/ship-kit/e2e/target/app.py:19` — `def div(a, b)` без двоеточия;
  воспроизводится локально импортом (`python3 -c "import sys; sys.path.insert(0,'extensions/ship-kit/e2e/target'); import app"`), чинится правкой в один символ.
- **Изоляция прогона**: bare-репозиторий + клон (`extensions/ship-kit/e2e/bare.git`,
  `extensions/ship-kit/e2e/e2e-run`,
  оба в gitignore) — пуши workflow-агентов уходят в bare, реальный origin не
  затрагивается.
- **Полный сценарий**: скан Jira (PRJ-42 с jenkinsJob) → спека → реализация в
  worktree → PR c замечанием → устранение → MERGED → вложенный build-autofix
  (красная #1 → TDD-фикс → зелёная #2) → DONE + звук. У PRJ-42 нет `deployJob`,
  поэтому DEPLOY-ступень пропускается (проверяется отдельно, см. журнал).

Прогон (из корня репо, одна строка; нужно установленное расширение ship-kit —
постоянная копия `qwen extensions install /путь/к/ship-kit --consent` (кладётся
в `~/.qwen/extensions/ship-kit`; без `--consent` в headless виснет на запросе
согласия) или дев-режим `qwen extensions link /путь/к/ship-kit` — агенты и
workflows в клон не входят, клон несёт только моки settings и таргет):

```
rm -rf extensions/ship-kit/e2e/bare.git extensions/ship-kit/e2e/e2e-run && git init --bare -q extensions/ship-kit/e2e/bare.git && git push -q extensions/ship-kit/e2e/bare.git main:main && git clone -q extensions/ship-kit/e2e/bare.git extensions/ship-kit/e2e/e2e-run && rm -f extensions/ship-kit/e2e/e2e-run/.qwen/tmp/*-mock-state.json 2>/dev/null; cd extensions/ship-kit/e2e/e2e-run && QWEN_CODE_ENABLE_WORKFLOWS=1 qwen -y -p "Запусти сохранённый workflow build-autofix из расширения ship-kit: вызови Workflow({ name: 'ship-kit:build-autofix', args: { job: 'calc-app', modelFast: 'glm-5.3-flash', modelExpert: 'glm-5.3-flash' } }) и верни итог."
```

`modelFast`/`modelExpert` = `glm-5.3-flash` в тестовых прогонах обязательны (стандарт Oleg):
без них агенты уходят на дефолт сессии (glm-5.3) и сжигают кредиты подписки —
урок прогона 13, ~95 дорогих запросов за три прогона.

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

Ниже — минимальный список точек адаптации для **режима копии**. В **режиме
расширения** файлы комплекта не правятся: единственная точка — канонические id
MCP-серверов (`jenkins`, `jira`, `confluence`, `sonar`, `bitbucket`, `mmap`) в
`settings.json` проекта; не сводится к ним — это режим копии или проектный
форк. Полные обязательные правила доработки (инварианты, критерии «универсальный
или проектный», когда создавать проектных агентов/workflows) — скилл
[adapt-agents-workflows](../skills/adapt-agents-workflows/SKILL.md);
этот чек-лист — его раздел 1, менять список точек можно только вместе с ним.

1. **Имена MCP-серверов.** Здесь `jenkins`, `jira`, `confluence`, `sonar`,
   `bitbucket`, `mmap`. Сверь со своими id в settings.json → mcpServers и
   поправь deny-listы/allowlistы во всех agent-файлах. `mmap` — отдельный
   сервер схем/знаний; точное имя уточни у владельца конфигурации.
2. **Инструменты запуска Jenkins.** Allowlist-агенты строгие: в
   `.qwen/agents/build-trigger.md` — `mcp__jenkins__trigger_build`, в
   `.qwen/agents/deploy-trigger.md` — `mcp__jenkins__trigger_deploy`; замени
   на точные имена из `/mcp`. Пока имя не совпадает, агент честно вернёт
   ошибку шага 0.
3. **Сборочная джоба.** Передай `job` в `/build-autofix` или укажи `jenkinsJob`
   в задаче Jira/реестре проектов, откуда его возьмёт скан.
4. **OpenSpec.** Убедись, что скиллы openspec-* установлены и CLI доступен.
5. **Статусы Jira.** Воркер не меняет их никогда (только чтение и PR-цикл);
   перевод статусов остаётся за человеком.
6. **Push-политика.** build-fix, deploy-fix и implementer пушат только в
   рабочие ветки, никогда в main/master; это же условие проверяют их шаги 0.
7. **Парность build/deploy.** build-autofix.js и deploy-autofix.js —
   структурные близнецы (песочница запрещает import): правку схем/хелперов/
   цикла одного файла вносить синхронно в оба и сверять diff. Строки из
   отчётов агентов (WORKTREE/ветка/ключ) интерполируются в shell-промпты
   только через валидаторы формы (SAFE_WORKTREE/SAFE_BRANCH/SAFE_KEY) — новые
   точки интерполяции ограждать так же.

## 8. Границы решения

- Reviewer не запускает код — только чтение; проверка исполнением остаётся за
  сборкой и TDD-проверками build-fix.
- Run-журнал — бизнес-уровень (номер джобы, попытки, фиксы) для восстановления
  после обрыва и для человека; детерминированный replay того же прогона —
  механизм движка (`resumeFromRunId`). Они дополняют друг друга: журнал
  переживает даже потерю runId (новая сессия, перезагрузка).
- Ожидание approve — это тики раз в 5 минут, а не webhook: реакция на
  замечания занимает до ~5 минут.
- Воркер не пишет комментарии в Jira и не меняет статусы — при необходимости
  это отдельное явное решение, в эталон не включено.
- Звук-уведомление играет на машине, где живёт сессия-драйвер; в корп. среде
  с headless-демоном замените afplay на нужный канал (Jira-комментарий,
  мессенджер).

## 9. Связь с mcp-jenkins-test

В репозитории два эталона, они дополняют друг друга:

- **Этот комплект** — архитектура ролей: 11 агентов (линейки build-* и
  deploy-* + общие) с MCP-матрицей, 3 workflow, звук, worktree-изоляция,
  протокол «Шаг 0».
- **[mcp-jenkins-test](../mcp-jenkins-test/README.md)** — самостоятельный
  мини-эталон TDD-цикла (`/build-failure-triage`, `/build-fix-loop`) со своими
  моками и e2e; его прогоны дали уроки, зашитые сюда (args-строка, имена
  переменных, determinism).
