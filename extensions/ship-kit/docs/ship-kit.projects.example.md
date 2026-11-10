# Пример реестра проектов ship-kit (md)

Реестр связывает скиллы комплекта с конкретным проектом: какие MCP-серверы
использовать (alias → сервер), пути и точные названия джоб, jira-ключ,
ssh-репо, КЭ, лимиты запусков.

- **Файл реестра**: `ship-kit.projects.md` в корне проекта, либо центральный
  `~/.qwen/ship-kit/projects.md` (на несколько проектов). Ищутся по цепочке
  в этом порядке, работает первый найденный.
- **Единственная точка ведения** — скилл `ship-kit:projects`: изменения и
  добавление элементов реестра выполняются только через него.
- **Скиллы-роли реестр не читают.** Основной агент (или человек) читает
  реестр и передаёт скиллам значения **аргументами вызова**; скилл не знает
  ни о файле, ни о проекте.
- Замороженные workflows читают старый json-реестр `ship-kit.projects.json`
  (механика — §4 docs). Json-реестр не развивается; md — актуальный формат
  скилл-контура.

## Формат

Markdown, плоские строки `ключ: значение` внутри секций `## <имя проекта>`.
Секция `## [default]` задаёт проект по умолчанию. Комментарии — строки
начинающиеся с `#` внутри значения недопустимы (значение — вся строка после
`ключ:`).

### Ключи

| Ключ | Обязателен | Смысл |
|---|---|---|
| `project` (в `[default]`) | нет | Имя проекта по умолчанию |
| `jiraKey` | да | Jira-ключ проекта (префикс задач, напр. `PRJ`) |
| `repoSsh` | да | ssh-репо для клона (`git@host:team/repo.git`) |
| `ce` | да | КЭ — конфигурационный элемент: идентификатор объекта для обращений по МСП (например, МСП результатов проверок уязвимостей); передаётся скиллам аргументом |
| `branchDefault` | нет | Ветка по умолчанию (args сильнее) |
| `context` | нет | Что за проект и его особенности (строка) |
| `errorPolicy.notFixable` | нет | Категории триажа, при которых фикс не запускается (через запятую) |
| `<alias>.server` | при использовании | Фактический id MCP-сервера в `settings.json → mcpServers`, на который отображается alias |
| `<alias>.job.path` | для mcp-build / mcp-deploy | Путь до джобы (папки Jenkins) |
| `<alias>.job.name` | для mcp-build / mcp-deploy | Точное название джобы — идёт скиллу аргументом |
| `<alias>.projectKey` | для mcp-sonar | Ключ проекта в Sonar |
| `runLimit.build` / `runLimit.deploy` | нет | Максимум запусков джобы за прогон (регулирование количества запусков; скилл про лимит не знает — соблюдает вызывающий) |

### Аliases (фиксированы комплектом)

| Alias | Роль | Используют скиллы |
|---|---|---|
| `mcp-build` | Jenkins-сервер сборки | build-trigger, build-status, build-triage, build-fix |
| `mcp-deploy` | Jenkins-сервер деплоя | deploy-trigger, deploy-status, deploy-triage, deploy-fix |
| `mcp-sonar` | Качество/уязвимости (Sonar) | build-triage, build-fix, deploy-triage, deploy-fix |
| `mcp-jira` | Задачи (Jira) | openspec, implementer, triage, fix |
| `mcp-confluence` | Документация (Confluence) | openspec, triage, fix |
| `mcp-bitbucket` | Репозиторий/PR (Bitbucket) | implementer, triage, fix |
| `mcp-mmap` | Схемы/знания (mmap) | openspec |

Один физический сервер может закрывать несколько alias (например,
`mcp-build.server` и `mcp-deploy.server` — один id). Отсутствие alias-записи
= «в проекте этого MCP нет»: вызывающий обязан не передавать его скиллам,
а не подменять молча.

## Пример целиком

```markdown
# Реестр проектов ship-kit

<!-- Ведётся только через скилл ship-kit:projects. Скиллы-роли этот файл
     не читают: значения уходят им аргументами вызова. -->

## [default]
project: calc

## calc
jiraKey: PRJ
repoSsh: git@git.corp:team/calc.git
ce: CALC-APP
branchDefault: main
context: Калькулятор, EFS-деплой, длинные сборки (~40 мин)
errorPolicy.notFixable: infra, sonar
mcp-build.server: jenkins-conf
mcp-build.job.path: folder/team
mcp-build.job.name: calc-app
mcp-deploy.server: jenkins-conf
mcp-deploy.job.path: folder/team
mcp-deploy.job.name: calc-app-deploy
mcp-sonar.server: sonar-corp
mcp-sonar.projectKey: corp-calc
mcp-jira.server: jira-corp
mcp-confluence.server: confluence-corp
mcp-bitbucket.server: bitbucket-corp
mcp-mmap.server: mmap-team
runLimit.build: 3
runLimit.deploy: 2

## billing
jiraKey: BIL
repoSsh: git@git.corp:team/billing.git
ce: BILLING-CORE
branchDefault: develop
context: Биллинг, деплоя нет, сборка + sonar
mcp-build.server: jenkins-corp
mcp-build.job.path: folder/billing
mcp-build.job.name: billing-build
mcp-sonar.server: sonar-corp
mcp-sonar.projectKey: corp-billing
mcp-jira.server: jira-corp
mcp-confluence.server: confluence-corp
mcp-bitbucket.server: bitbucket-corp
runLimit.build: 2
```

Обратите внимание на `billing`: нет `mcp-deploy.*` (деплой-ступень
пропускается целиком) и нет `mcp-mmap.server` (openspec работает без mmap,
не запрашивая его).
