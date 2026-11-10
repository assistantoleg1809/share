# Ship Kit

Универсальный комплект агентов и workflows для конвейера
«Jira → OpenSpec → правки → PR → ревью → сборка → деплой → исправление».
Полная документация: [docs/agents-and-workflows.md](docs/agents-and-workflows.md)
(состав, матрица доступа, e2e-стенд, чек-лист адаптации §7).

## Статус разработки (2026-11-10)

**Агенты (`agents/*.md`) и workflows (`workflows/*.js`) заморожены** в текущем
виде: доработка и создание новых — только по явной команде пользователя.
Приоритет — скиллы: развитие идёт в `skills/`. Замороженные workflows
продолжают работать как есть; их json-реестр `ship-kit.projects.json`
не развивается — скилл-контур использует md-реестр
[ship-kit.projects.md](docs/ship-kit.projects.example.md), который ведёт
скилл `ship-kit:projects`.

## Что даёт расширение

- **Агенты** (`agents/*.md`, регистрируются под своими именами): reviewer,
  openspec, build/deploy × status/trigger/triage/fix, implementer.
- **Workflows** (запуск с квалифицированным именем `/ship-kit:<имя>`):
  - `/ship-kit:build-autofix` — сборка Jenkins с автоисправлением (3 попытки);
  - `/ship-kit:deploy-autofix` — deploy-джоба с разбором ошибок деплоя;
  - `/ship-kit:autonomous-worker` — один тик автономного воркера
    (Jira → спека → реализация → PR → сборка → деплой, если у задачи есть
    `deployJob`).
- **Run-журналы**: прогоны build/deploy-autofix пишут план и факты на диск
  (`openspec/changes/<tag>/run-*.json` при `tag`, иначе `.qwen/ship-kit/runs/`);
  после обрыва (вплоть до перезагрузки) прогон продолжает уже запущенную
  джобу, не запуская дубль. Воркер передаёт `tag`/`journal` вложенным вызовам.
  Скилл-контур ведёт свою историю в `skill-runs/<тег>/` в корне проекта
  (план + выполненные шаги + задачи с ошибками, см. docs §10).
- **Реестр проектов**: скилл-контур — md-реестр `ship-kit.projects.md`
  (корень проекта) или `~/.qwen/ship-kit/projects.md`: jira-ключ, ssh-репо,
  КЭ, alias MCP (`mcp-build`/`mcp-deploy`/`mcp-sonar`/…) → фактический
  сервер, пути/названия джоб, лимиты запусков; ведётся только скиллом
  `ship-kit:projects`, схема — docs/ship-kit.projects.example.md.
  Замороженные workflows читают старый `ship-kit.projects.json`
  (`jenkinsJob`/`deployJob`/`branchDefault`/`context`/
  `errorPolicy.notFixableCategories`) — он не развивается.
- **Скилл** `adapt-agents-workflows` — обязательные правила доработки
  агентов и workflows (заморожены); правила доработки **скиллов** — скилл
  `adapt-skills`. Читать соответствующий перед любой правкой комплекта.
- **11 скиллов-ролей** — строгое 1:1 с агентами (имена совпадают:
  build-trigger, build-status, build-triage, build-fix, deploy-trigger,
  deploy-status, deploy-triage, deploy-fix, openspec, implementer,
  reviewer): в скилле — вся методика роли. Роли работают **только с MCP,
  переданными аргументами вызова** (alias→сервер разрешает вызывающий);
  файл проектов роли не читают; явный вызов одной роли не запускает
  следующие. Мета-скиллы без пар-агентов: `adapt-agents-workflows`,
  `adapt-skills`, `projects` (ведение md-реестра), `run` — диспетчер и
  прогон: вход «`<тег> <что сделать>`» (напр. «PRJ-123 запусти джобу и
  исправь ошибки»), сам выбирает ступени, ведёт план `skill-runs/<тег>/`
  (состояние + аргументы джоб с источниками), циклы до успеха с fixFlow
  direct|pr и ожиданием апрува (waiting-approval → «продолжи прогон»),
  лимиты/бюджет из реестра, ETA из истории джобы.

## Условия работы

- `tools.workflowsEnabled: true` (User/System scope) + рестарт сессии
  (для замороженных workflows).
- **Скиллы-роли** MCP-серверы не выбирают: вызывающий (человек или скилл
  `run`) передаёт им alias→сервер аргументами из md-реестра. **Замороженные
  агенты/workflows** по-прежнему требуют канонических id (`jenkins`,
  `jira`, `confluence`, `sonar`, `bitbucket`, `mmap`) в
  `settings.json → mcpServers`.
- Не заводить в проекте `.qwen/agents/*.md` с теми же именами — конфликт
  с агентами расширения.
- Имена джоб (сборка/деплой) живут в md-реестре (скилл-контур) или
  передаются args (замороженный контур), никогда не хардкодятся.
