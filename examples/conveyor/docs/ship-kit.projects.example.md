# Реестр проектов конвейера (md) — схема и пример

Реестр связывает конвейер с конкретным проектом: стадии
(`pipelineOrder`), записи знания (alias → serverId, джобы, стенды),
исполнители позиций (`executors`), серверы (`servers`), лимиты, политики.
Формат — Markdown: агенты читают связный текст и таблицы лучше
структур yaml (конвертировано из yaml-эпохи 2026-11-14).

- **Файл реестра**: `ship-kit.projects.md` в корне проекта, либо
  центральный `~/.qwen/ship-kit/projects.md` (на несколько проектов).
  Ищутся по цепочке в этом порядке, работает первый найденный.
- **Единственная точка ведения** — скилл `registry` этого примера.
  Механика `formatVersion` + миграций yaml-эпохи историческая: md-реестр
  не версионируется, изменения видны в git-истории файла.
- **Скиллы-исполнители реестр не читают.** Вызывающий (скилл `run` или
  человек) читает реестр и передаёт исполнителям значения аргументами
  вызова; исполнитель не знает ни о файле, ни о проекте.
- **Позиции** (кто исполняет стадию) задаёт манифест
  [positions.md](positions.md): набор позиций выводится из `kind`
  стадии; реестр может только подменить исполнителя позиции
  (`executors`) или сузить набор (`positions` у стадии).

## Формат

Markdown. Секции верхнего уровня: `## servers`, `## executors`,
`## <projectKey>` (по секции на проект); внутри проекта — `### stages`
(таблица) и `### knowledge` (записи).

### Проект — ключи

| Ключ | Обязателен | Смысл |
|---|---|---|
| `jiraProjectKey` | да | Префикс задач Jira (тег прогона матчится по нему) |
| `repoSshUrl` | да | ssh-репо (`git@host:team/repo.git`) |
| `artifactId` | да | КЭ — идентификатор для обращений по МСП |
| `defaultBranch` | нет | Целевая ветка (пуш в неё запрещён; args сильнее) |
| `branchPrefix` | нет | `task=feature, bug=bugfix` — шаблон рабочей ветки `<X>/<КЛЮЧ>` |
| `description` | нет | Что за проект |
| `limits` | нет | `maxRuns` (на стадию; деплой — на стенд), `maxRetries` (дефолт 1 — повтор flaky без гейта), `maxFixAttempts` (дефолт 3 — кругов «фикс → PR → MERGED → перезапуск»), `totalRunBudget` (минуты, заморожен в ожидании) |
| `errorPolicy` | нет | `unfixableCategories` — категории, при которых фикс-стадия не вызывается вовсе (вето поверх диагноза) |
| `pipelineOrder` | нет | Порядок обхода не-фикс стадий; дефолт `[do, build, deploy]` ∩ существующие |

### Стадия — колонки таблицы

| Колонка | Обязательна | Смысл |
|---|---|---|
| `id` | да | Уникален в проекте; счётчики и план ключуются им |
| `kind` | да | `DO` \| `BUILD` \| `DEPLOY` \| `FIX_DO` \| `FIX_BUILD` \| `FIX_DEPLOY`; задаёт набор позиций (манифест) и производный kind транспорта (build/deploy) |
| `positions` | нет | Сужение набора позиций kind (только подмножество) |
| `knowledgeRef` | да | Запись знания исполнителей стадии |
| `diagnosisRef` | нет | Запись диагноста (только BUILD/DEPLOY; дефолт `knowledgeRef`) |
| `repairRef` | нет | Запись ремонта (только FIX_BUILD/FIX_DEPLOY; дефолт `knowledgeRef`) |
| `nextStageId` | у FIX_* | Куда после MERGED (fixDeploy → build: пересборка) |
| `fixesStageId` | у FIX_* | Какую стадию чинит |
| `triggeredBy` | только FIX_DO | `pullRequestReview` (PR открыт — правка в тот же PR) \| `humanDirective` (PR уже MERGED — переделка по команде человека, правка новым PR) |
| `pullRequestOwner` | нет | Позиция-владелец PR стадии (обычно `pr`); отсутствие при правящем репозиторий исполнителе — предупреждение |
| `limits` | нет | Лимиты на стадию (переопределяют проектные) |

Исполнители **не перечисляются в стадии**: набор позиций выводится из
`kind`.

### Запись знания

`### knowledge` — список записей; запись обязана покрывать всех
исполнителей своей стадии. Endpoint — строка `alias: serverId` с
необязательными ключами:

| Ключ | Обязателен | Смысл |
|---|---|---|
| `alias` | да | Закрытый набор: `MCP_BUILD`, `MCP_DEPLOY`, `MCP_SONAR`, `MCP_JIRA`, `MCP_CONFLUENCE`, `MCP_BITBUCKET`, `MCP_MAPP` |
| `serverId` | да | id подключения из `settings.json → mcpServers` (описан в `## servers`) |
| `runnerKind` | для транспорта | `JENKINS` → обязательны `jobFolder`+`jobName`; `CUSTOM` → `jobParameters`, `jobFolder`/`jobName` запрещены |
| `jobFolder` / `jobName` | см. runnerKind | Путь и точное название джобы |
| `environments` | при MCP_DEPLOY со стендами | Непустой список из `DEV, ST, IFT, PSI` в каноническом порядке |
| `environmentJobNames` | нет | Своя джоба на стенд (ключи из `environments`) |
| `jobParameters` | для CUSTOM | Параметры запуска (уходят как есть) |
| `projectKey` | для MCP_SONAR | Ключ проекта в Sonar |
| `toolNames` | нет | `{run, status, log}` — точные имена инструментов MCP (не задано — исполнитель ищет по описанию) |

Правила записей-потребителей: `diagnosisRef` обязан содержать
транспортный alias стадии с теми же `jobFolder`/`jobName` (иначе лог
нечем читать / не та джоба — ошибка валидации) и может добавлять
sonar/jira/confluence; `repairRef` — ровно один транспортный alias
(отличие джобы от `knowledgeRef` — замысел: упавшая вместо быстрой ci).
Отсутствие alias в записях проекта = «в этом проекте этого MCP нет» —
вызывающий не передаёт его исполнителям.

## Пример целиком

## servers

- jenkins-conf — CI сборки и деплоя calc (Jenkins)
- jira-corp — задачи Jira
- confluence-corp — документация и runbook'и
- bitbucket-corp — репозитории и PR
- sonar-corp — качество/уязвимости
- mapp-team — схемы/знания (mmap)

## executors

Все позиции на дефолтах манифеста — секция пуста. Подмена в конкретном
проекте — одной строкой:

- mechanic: superpowers:refactoring

## calc

- jiraProjectKey: PRJ
- repoSshUrl: git@git.corp:team/calc.git
- artifactId: CALC-APP
- defaultBranch: main
- branchPrefix: task=feature, bug=bugfix
- description: Калькулятор, длинные сборки (~40 мин)
- limits: maxRuns=3 maxRetries=1 maxFixAttempts=2 totalRunBudget=90
- errorPolicy.unfixableCategories: infra, sonar
- pipelineOrder: do → build → deploy

### stages

| id | kind | ref'ы | переходы | owner | limits |
|---|---|---|---|---|---|
| do | DO | knowledge=do-context | — | pr | |
| build | BUILD | knowledge=build-ci, diagnosis=build-diagnosis | — | | maxRuns=3 |
| deploy | DEPLOY | knowledge=deploy-cd, diagnosis=deploy-diagnosis | — | | maxRuns=2 (на стенд) |
| fixDo | FIX_DO | knowledge=fixdo-context | next=do, fixes=do, triggeredBy=pullRequestReview | pr | |
| fixBuild | FIX_BUILD | knowledge=fixbuild-ci, repair=fixbuild-repair | next=build, fixes=build | pr | |
| fixDeploy | FIX_DEPLOY | knowledge=fixdeploy-cd, repair=fixdeploy-repair | next=build (MERGED → пересборка), fixes=deploy | pr | |

### knowledge

**do-context** (task: jira/confluence/mapp; pr: bitbucket)

- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp
- MCP_MAPP: mapp-team
- MCP_BITBUCKET: bitbucket-corp

**build-ci** (только транспорт запуска)

- MCP_BUILD: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app · toolNames run=jenkins_trigger_build, status=jenkins_get_build, log=jenkins_search_build_log

**build-diagnosis** (транспорт стадии + sonar/jira/confluence)

- MCP_BUILD: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app
- MCP_SONAR: sonar-corp · projectKey=corp-calc
- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp

**deploy-cd**

- MCP_DEPLOY: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app-deploy · environments=DEV,ST,IFT,PSI · environmentJobNames IFT=calc-app-deploy-ift

**deploy-diagnosis**

- MCP_DEPLOY: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app-deploy · environments=DEV,ST,IFT,PSI
- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp

**fixdo-context** (mmap не нужен: фикс идёт по замечаниям PR)

- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp
- MCP_BITBUCKET: bitbucket-corp

**fixbuild-ci** (быстрая ci-джоба + sonar/jira/bitbucket)

- MCP_BUILD: jenkins-conf · CUSTOM · jobFolder=folder/team · jobName=calc-app-ci · jobParameters SKIP_TESTS=true, MODE=fast
- MCP_SONAR: sonar-corp · projectKey=corp-calc
- MCP_JIRA: jira-corp
- MCP_BITBUCKET: bitbucket-corp

**fixdeploy-cd**

- MCP_DEPLOY: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app-deploy · environments=DEV,ST,IFT,PSI
- MCP_JIRA: jira-corp
- MCP_BITBUCKET: bitbucket-corp

**fixbuild-repair** (УПАВШАЯ сборка, не быстрая ci)

- MCP_BUILD: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app

**fixdeploy-repair** (карта стендов для чтения лога)

- MCP_DEPLOY: jenkins-conf · JENKINS · jobFolder=folder/team · jobName=calc-app-deploy · environments=DEV,ST,IFT,PSI · environmentJobNames IFT=calc-app-deploy-ift

## billing

Проект БЕЗ деплоя: нет стадий DEPLOY/FIX_DEPLOY и записей с MCP_DEPLOY —
ступень деплоя не планируется вовсе. `do` без `pr`: PR стадией не
оформляется (валидатор предупредит о fixBuild без pullRequestOwner).

- jiraProjectKey: BIL
- repoSshUrl: git@git.corp:team/billing.git
- artifactId: BILLING-CORE
- defaultBranch: develop
- description: Биллинг, деплоя нет, сборка + sonar
- limits: maxRuns=2 maxRetries=1 maxFixAttempts=2
- pipelineOrder: do → build

### stages

| id | kind | ref'ы | переходы | owner | limits |
|---|---|---|---|---|---|
| do | DO (positions: task) | knowledge=billing-do | — | | |
| build | BUILD | knowledge=billing-build-ci, diagnosis=null (дефолт knowledgeRef) | — | | maxRuns=2 |
| fixDo | FIX_DO | knowledge=billing-fixdo | next=do, fixes=do, triggeredBy=pullRequestReview | | |
| fixBuild | FIX_BUILD | knowledge=billing-fixbuild-ci, repair=null (дефолт knowledgeRef) | next=build, fixes=build | | |

### knowledge

**billing-do**

- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp

**billing-build-ci**

- MCP_BUILD: jenkins-corp · JENKINS · jobFolder=folder/billing · jobName=billing-build
- MCP_SONAR: sonar-corp · projectKey=corp-billing
- MCP_JIRA: jira-corp

**billing-fixdo**

- MCP_JIRA: jira-corp
- MCP_CONFLUENCE: confluence-corp
- MCP_BITBUCKET: bitbucket-corp

**billing-fixbuild-ci**

- MCP_BUILD: jenkins-corp · JENKINS · jobFolder=folder/billing · jobName=billing-build
- MCP_SONAR: sonar-corp · projectKey=corp-billing
- MCP_JIRA: jira-corp
- MCP_BITBUCKET: bitbucket-corp

Обратите внимание: у `billing` сервер `jenkins-corp` должен быть описан
в `## servers` (в примере выше опущен для краткости — в реальном файле
обязателен: каждый serverId из endpoints описан, каждый описанный
используется).
