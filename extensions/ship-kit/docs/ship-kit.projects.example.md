# Реестр проектов ship-kit (yaml) — схема и пример

Реестр связывает конвейер с конкретным проектом: стадии (`pipelineOrder`),
записи знания (alias → serverId, джобы, стенды), исполнители позиций
(`executors`), серверы (`servers`), лимиты, политики.

- **Файл реестра**: `ship-kit.projects.yaml` в корне проекта, либо
  центральный `~/.qwen/ship-kit/projects.yaml` (на несколько проектов).
  Ищутся по цепочке в этом порядке, работает первый найденный.
- **Единственная точка ведения** — скилл `ship-kit:registry`; при расхождении
  `formatVersion` с комплектом registry проводит миграцию (дифф →
  подтверждение → применение).
- **Скиллы-исполнители реестр не читают.** Вызывающий (скилл `run` или
  человек) читает реестр и передаёт исполнителям значения **аргументами
  вызова**; исполнитель не знает ни о файле, ни о проекте.
- **Позиции** (кто исполняет стадию) задаёт манифест комплекта
  [ship-kit.positions.yaml](ship-kit.positions.yaml): набор позиций выводится
  из `kind` стадии; реестр может только подменить исполнителя позиции
  (`executors`) или сузить набор (`positions` у стадии).

## Формат

YAML. Верхний уровень:

| Ключ | Обязателен | Смысл |
|---|---|---|
| `formatVersion` | да | Версия формата (текущая — 1). Реестр новее комплекта — стоп «обновите комплект»; старее — миграция через registry |
| `defaultProject` | нет | Проект по умолчанию |
| `servers` | да (если есть endpoints) | serverId → описание; адреса/токены НЕ здесь, а в `settings.json → mcpServers` |
| `executors` | нет | Позиция → скилл (дефолты — из манифеста; писать только подмены) |
| `projects` | да | Список проектов |

### Проект

| Ключ | Обязателен | Смысл |
|---|---|---|
| `projectKey` | да | Короткий slug проекта |
| `jiraProjectKey` | да | Префикс задач Jira (тег прогона матчится по нему) |
| `repoSshUrl` | да | ssh-репо (`git@host:team/repo.git`) |
| `artifactId` | да | КЭ — идентификатор для обращений по МСП |
| `defaultBranch` | нет | Целевая ветка (пуш в неё запрещён; args сильнее) |
| `branchPrefix` | нет | `{task: feature, bug: bugfix}` — шаблон рабочей ветки `<X>/<КЛЮЧ>` |
| `description` | нет | Что за проект |
| `limits` | нет | `maxRuns` (на стадию; деплой — на стенд), `maxRetries` (дефолт 1 — повтор flaky без гейта), `maxFixAttempts` (дефолт 3 — кругов «фикс → PR → MERGED → перезапуск»), `totalRunBudget` (минуты, заморожен в ожидании) |
| `errorPolicy` | нет | `unfixableCategories` — категории, при которых фикс-стадия не вызывается вовсе (вето поверх диагноза) |
| `pipelineOrder` | нет | Порядок обхода не-фикс стадий; дефолт `[do, build, deploy]` ∩ существующие |
| `stages` | да | Стадии (ниже) |
| `knowledge` | да | Записи знания (ниже) |

### Стадия

| Ключ | Обязателен | Смысл |
|---|---|---|
| `id` | да | Уникален в проекте; счётчики и план ключуются им |
| `kind` | да | `DO` \| `BUILD` \| `DEPLOY` \| `FIX_DO` \| `FIX_BUILD` \| `FIX_DEPLOY`; kind задаёт набор позиций (манифест) и производный kind транспорта (build/deploy) |
| `positions` | нет | Сужение набора позиций kind (только подмножество) |
| `knowledgeRef` | да | Запись знания исполнителей стадии |
| `diagnosisRef` | нет | Запись диагноста (только BUILD/DEPLOY; дефолт `knowledgeRef`) |
| `repairRef` | нет | Запись ремонта (только FIX_BUILD/FIX_DEPLOY; дефолт `knowledgeRef`) |
| `nextStageId` | обязателен у FIX_* | Куда после MERGED (fixDeploy → build: пересборка) |
| `fixesStageId` | обязателен у FIX_* | Какую стадию чинит |
| `triggeredBy` | только у FIX_DO | `pullRequestReview` (PR открыт — правка в тот же PR) \| `humanDirective` (PR уже MERGED — переделка по команде человека, правка новым PR) |
| `pullRequestOwner` | нет | Позиция-владелец PR стадии (обычно `courier`); отсутствие при правящем репозиторий исполнителе — предупреждение |
| `limits` | нет | Лимиты на стадию (переопределяют проектные) |

Исполнители **не перечисляются в стадии**: набор позиций выводится из `kind`.

### Запись знания

`knowledge: [{id, endpoints: [...]}]`. Запись обязана покрывать всех
исполнителей своей стадии. Endpoint:

| Ключ | Обязателен | Смысл |
|---|---|---|
| `alias` | да | Закрытый набор: `MCP_BUILD`, `MCP_DEPLOY`, `MCP_SONAR`, `MCP_JIRA`, `MCP_CONFLUENCE`, `MCP_BITBUCKET`, `MCP_MAPP` |
| `serverId` | да | id подключения из `settings.json → mcpServers` (описан в `servers:`) |
| `runnerKind` | для транспорта | `JENKINS` → обязательны `jobFolder`+`jobName`; `CUSTOM` → `jobParameters` (карта), `jobFolder`/`jobName` запрещены |
| `jobFolder` / `jobName` | см. runnerKind | Путь и точное название джобы |
| `environments` | при MCP_DEPLOY со стендами | Непустой список из `DEV, ST, IFT, PSI` в каноническом порядке |
| `environmentJobNames` | нет | Своя джоба на стенд (ключи из `environments`) |
| `jobParameters` | для CUSTOM | Карта параметров запуска (уходит как есть) |
| `projectKey` | для MCP_SONAR | Ключ проекта в Sonar |
| `toolNames` | нет | `{run, status, log}` — точные имена инструментов MCP (не задано — исполнитель ищет по описанию) |

Правила записей-потребителей: `diagnosisRef` обязан содержать транспортный
alias стадии с теми же `jobFolder`/`jobName` (иначе лог нечем читать / не та
джоба — ошибка валидации) и может добавлять sonar/jira/confluence;
`repairRef` — ровно один транспортный alias (отличие джобы от `knowledgeRef`
— замысел: упавшая вместо быстрой ci). Отсутствие alias в записях проекта =
«в этом проекте этого MCP нет» — вызывающий не передаёт его исполнителям.

## Пример целиком

```yaml
# Реестр проектов ship-kit. Ведётся только скиллом ship-kit:registry.
formatVersion: 1
defaultProject: calc

servers:
  jenkins-conf:    CI сборки и деплоя calc (Jenkins)
  jira-corp:       задачи Jira
  confluence-corp: документация и runbook'и
  bitbucket-corp:  репозитории и PR
  sonar-corp:      качество/уязвимости
  mapp-team:       схемы/знания (mmap)

# executors: все позиции на дефолтах комплекта — секцию не пишем.
  # Подмена в конкретном проекте — одной строкой:
  # mechanic: superpowers:refactoring

projects:
  - projectKey: calc
    jiraProjectKey: PRJ
    repoSshUrl: git@git.corp:team/calc.git
    artifactId: CALC-APP
    defaultBranch: main
    branchPrefix: { task: feature, bug: bugfix }
    description: Калькулятор, длинные сборки (~40 мин)
    limits: { maxRuns: 3, maxRetries: 1, maxFixAttempts: 2, totalRunBudget: 90 }
    errorPolicy: { unfixableCategories: [infra, sonar] }
    pipelineOrder: [do, build, deploy]

    stages:
      - id: do
        kind: DO
        knowledgeRef: do-context
        pullRequestOwner: courier
      - id: build
        kind: BUILD
        knowledgeRef: build-ci
        diagnosisRef: build-diagnosis
        limits: { maxRuns: 3 }
      - id: deploy
        kind: DEPLOY
        knowledgeRef: deploy-cd
        diagnosisRef: deploy-diagnosis
        limits: { maxRuns: 2 }        # на каждый стенд
      - id: fixDo
        kind: FIX_DO
        knowledgeRef: fixdo-context
        nextStageId: do
        fixesStageId: do
        triggeredBy: pullRequestReview
        pullRequestOwner: courier
      - id: fixBuild
        kind: FIX_BUILD
        knowledgeRef: fixbuild-ci
        repairRef: fixbuild-repair
        nextStageId: build
        fixesStageId: build
        pullRequestOwner: courier
      - id: fixDeploy
        kind: FIX_DEPLOY
        knowledgeRef: fixdeploy-cd
        repairRef: fixdeploy-repair
        nextStageId: build            # MERGED → сначала пересборка
        fixesStageId: deploy
        pullRequestOwner: courier

    knowledge:
      - id: do-context                # analyst (jira/confluence/mapp) + courier (bitbucket)
        endpoints:
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
          - { alias: MCP_MAPP, serverId: mapp-team }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
      - id: build-ci                  # сама сборка — только транспорт запуска
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
            toolNames: { run: jenkins_trigger_build, status: jenkins_get_build, log: jenkins_search_build_log }
      - id: build-diagnosis           # diagnosisRef: транспорт стадии + sonar/jira/confluence
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
          - { alias: MCP_SONAR, serverId: sonar-corp, projectKey: corp-calc }
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
      - id: deploy-cd
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
            environmentJobNames: { IFT: calc-app-deploy-ift }
      - id: deploy-diagnosis
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
      - id: fixdo-context             # mmap не нужен: фикс идёт по замечаниям PR
        endpoints:
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
      - id: fixbuild-ci               # оформление правки: быстрая ci-джоба + sonar/jira/bitbucket
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-ci
            jobParameters: { SKIP_TESTS: "true", MODE: fast }
          - { alias: MCP_SONAR, serverId: sonar-corp, projectKey: corp-calc }
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
      - id: fixdeploy-cd
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
      - id: fixbuild-repair           # repairRef: УПАВШАЯ сборка, не быстрая ci
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app
      - id: fixdeploy-repair          # repairRef: карта стендов для чтения лога
        endpoints:
          - alias: MCP_DEPLOY
            serverId: jenkins-conf
            runnerKind: JENKINS
            jobFolder: folder/team
            jobName: calc-app-deploy
            environments: [DEV, ST, IFT, PSI]
            environmentJobNames: { IFT: calc-app-deploy-ift }

  # Проект БЕЗ деплоя: нет стадий DEPLOY/FIX_DEPLOY и записей с MCP_DEPLOY —
  # ступень деплоя не планируется вовсе. do без courier: PR вне стадии
  # не оформляется (валидатор предупредит о fixBuild без pullRequestOwner).
  - projectKey: billing
    jiraProjectKey: BIL
    repoSshUrl: git@git.corp:team/billing.git
    artifactId: BILLING-CORE
    defaultBranch: develop
    description: Биллинг, деплоя нет, сборка + sonar
    limits: { maxRuns: 2, maxRetries: 1, maxFixAttempts: 2 }
    pipelineOrder: [do, build]
    stages:
      - id: do
        kind: DO
        positions: [analyst]          # courier нет: PR стадией не оформляется
        knowledgeRef: billing-do
      - id: build
        kind: BUILD
        knowledgeRef: billing-build-ci
        diagnosisRef: null            # явный дефолт: диагност читает knowledgeRef
        limits: { maxRuns: 2 }
      - id: fixDo
        kind: FIX_DO
        knowledgeRef: billing-fixdo
        nextStageId: do
        fixesStageId: do
        triggeredBy: pullRequestReview
      - id: fixBuild
        kind: FIX_BUILD
        knowledgeRef: billing-fixbuild-ci
        repairRef: null               # явный дефолт: ремонт читает knowledgeRef
        nextStageId: build
        fixesStageId: build
    knowledge:
      - id: billing-do
        endpoints:
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
      - id: billing-build-ci
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-corp
            runnerKind: JENKINS
            jobFolder: folder/billing
            jobName: billing-build
          - { alias: MCP_SONAR, serverId: sonar-corp, projectKey: corp-billing }
          - { alias: MCP_JIRA, serverId: jira-corp }
      - id: billing-fixdo
        endpoints:
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_CONFLUENCE, serverId: confluence-corp }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
      - id: billing-fixbuild-ci
        endpoints:
          - alias: MCP_BUILD
            serverId: jenkins-corp
            runnerKind: JENKINS
            jobFolder: folder/billing
            jobName: billing-build
          - { alias: MCP_SONAR, serverId: sonar-corp, projectKey: corp-billing }
          - { alias: MCP_JIRA, serverId: jira-corp }
          - { alias: MCP_BITBUCKET, serverId: bitbucket-corp }
```

Обратите внимание: у `billing` сервер `jenkins-corp` должен быть описан в
`servers:` (в примере выше опущен для краткости — в реальном файле обязателен:
каждый serverId из endpoints описан, каждый описанный используется).
