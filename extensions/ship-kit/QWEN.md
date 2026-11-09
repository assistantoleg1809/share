# Ship Kit

Универсальный комплект агентов и workflows для конвейера
«Jira → OpenSpec → правки → PR → ревью → сборка → деплой → исправление».
Полная документация: [docs/agents-and-workflows.md](docs/agents-and-workflows.md)
(состав, матрица доступа, e2e-стенд, чек-лист адаптации §7).

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
- **Скилл** `adapt-agents-workflows` — ОБЯЗАТЕЛЬНЫЕ правила любой доработки
  агентов и workflows (точки адаптации, инварианты, критерии «универсальный
  или проектный»). Читать его перед любой правкой комплекта.
- **11 скиллов-ролей** — строгое 1:1 с агентами (имена совпадают:
  build-trigger, build-status, build-triage, build-fix, deploy-trigger,
  deploy-status, deploy-triage, deploy-fix, openspec, implementer,
  reviewer): в скилле — вся методика роли; агент = границы (frontmatter) +
  подключение скилла без правок. Интерактивно человек идёт по тем же
  скиллам (`/ship-kit:build-trigger` → …; навигация — «Соседние шаги»);
  автономно — workflows диспатчат агентов, агенты грузят свои скиллы.

## Условия работы

- `tools.workflowsEnabled: true` (User/System scope) + рестарт сессии.
- MCP-серверы проекта должны носить канонические id: `jenkins`, `jira`,
  `confluence`, `sonar`, `bitbucket`, `mmap` — агенты расширения обращаются
  к ним по id, файлы расширения проект править не может. Другие id или
  нестандартный набор инструментов → не расширение, а локальная копия
  комплекта (критерии — в скилле adapt-agents-workflows).
- Не заводить в проекте `.qwen/agents/*.md` с теми же именами — конфликт
  с агентами расширения.
- Имена джоб (сборка/деплой) передаются args или берутся из задачи Jira
  (`jenkinsJob` / `deployJob`), никогда не хардкодятся.
