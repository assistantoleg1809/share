# PLAN — mcp-jenkins-test (эталонный тестовый проект)

> Эталон: по этому проекту будут строиться остальные тестовые/рабочие проекты share.
> Основания: [about-my-work.md](../about-my-work.md) (релизный процесс), [qwen-workflows.md](../qwen-workflows.md),
> [qwen-workflows-dev-guide.md](../qwen-workflows-dev-guide.md), сценарий build-failure-triage (§5.3 / §9 dev-guide).
> Скиллы: bundled qwen-code (`workflow-authoring`, `workflow-creator`); qwen 0.26.6 (установлен 2026-11-03).

## 1. Цель

Показать на тестовом проекте связку **mcp-jenkins (заглушка) + Qwen Workflow**, закрывающую главную
«дженкинс-боль» из транскрипции: упавшая сборка/деплой → агент читает лог через MCP → классифицирует
ошибку → ищет известные решения и массовость на DevOps-борде → сводка человеку.
Проект-эталон задаёт структуру каталогов, конвенции именования и чеклист тиражирования.

## 2. Структура (создать при реализации)

```
mcp-jenkins-test/
├── README.md                      # эталон: назначение, запуск, чеклист тиражирования
├── PLAN.md                        # этот файл
├── .project.yaml                  # метаданные в формате share (как в корне)
├── .qwen/
│   ├── settings.json              # mcpServers: jenkins-mock → node mcp/jenkins-mock/server.js
│   └── workflows/
│       └── build-failure-triage.js # сохранённый workflow → slash-команда /build-failure-triage
├── mcp/
│   └── jenkins-mock/
│       ├── server.js              # stdio MCP-сервер (JSON-RPC 2.0, без зависимостей)
│       └── fixtures/              # build-success | build-compile-error | build-test-failure | deploy-infra-error
└── docs/
    └── release-flow.md            # карта релизного процесса из транскрипции + точки автоматизации
```

## 3. Что внутри каждого элемента

### 3.1 Workflow `build-failure-triage.js` (по §5.3 и чеклисту dev-guide §11)
- `export const meta`: name/description/whenToUse/phases (Triage → Known issues) — показываются до запуска.
- `args`: `{ jobName, buildNumber, project, devopsBoard, now }` — время только через args (детерминизм resume).
- Фаза 1 (Triage): агент вызывает `mcp__jenkins-mock__jenkins_get_build_log` и классифицирует ошибку:
  sonar / компиляция / тесты / инфра / деплой — ответ по JSON Schema.
- Фаза 2 (Known issues): `parallel` из thunk'ов: (а) поиск открытых тикетов DevOps по ошибке,
  (б) проверка массовости. Демонстрация точечного контроля MCP: у одного агента
  `disallowedTools: ['mcp__confluence']` — боль из транскрипции.
- Все `agent()` проверяются на `null`; промпты содержат цель/формат/ограничения/границы; размер «small, ≤6 агентов».
- Без `import`, `Date`, `Math.random`, FS/shell — вся I/O через MCP-инструменты агентов.

### 3.2 Mock MCP-сервер `server.js`
- Node ≥22, ноль зависимостей; MCP over stdio (initialize / tools/list / tools/call).
- Инструменты: `jenkins_get_job_status(job, build)`, `jenkins_get_build_log(job, build)`,
  `jenkins_trigger_build(job)` — ответы из фикстур по (job, build).
- Подмена на реальный mcp-jenkins = смена одной записи в `.qwen/settings.json` (в README).

### 3.3 Фикстуры (логи из практики транскрипции)
`build-success.log`, `build-compile-error.log`, `build-test-failure.log`, `deploy-infra-error.log` —
типовые хвосты логов Jenkins сборки/деплоя EFS-проектов.

### 3.4 README.md — разделы эталона
назначение → структура → запуск (включая: `tools.workflowsEnabled` только User-scope, рестарт qwen)
→ прогон `/build-failure-triage` с примером args → замена mock на реальный Jenkins →
**чеклист тиражирования** (как сделать следующий проект по этому эталону).

### 3.5 docs/release-flow.md
Карта процесса: Jira → ветка → правка → job сборки → job деплоя → тестирование;
для каждого шага — что уже делает workflow, что остаётся за человеком (из §5.1 qwen-workflows.md).

## 4. Этапы реализации (после подтверждения плана)

| # | Этап | Результат |
|---|------|-----------|
| 1 | Скелет + `.project.yaml` + README-заготовка | структура проекта |
| 2 | `mcp/jenkins-mock/server.js` + 4 фикстуры | MCP-заглушка отвечает по протоколу |
| 3 | `build-failure-triage.js` + `.qwen/settings.json` | slash-команда доступна в qwen |
| 4 | README (полный) + `docs/release-flow.md` | эталон документирован |
| 5 | Прогон: smoke MCP (tools/list) + `/build-failure-triage` на compile-error | работает end-to-end |
| 6 | Коммит + пуш результата | ветка/PR по подтверждению |

## 5. Критерии приёмки

- [ ] `node mcp/jenkins-mock/server.js` отвечает на initialize/tools/list/tools/call по MCP-протоколу.
- [ ] `/build-failure-triage` на фикстуре compile-error возвращает: классификацию, тикеты, массовость.
- [ ] В логе прогона видно фазы Triage → Known issues; ни один null не потерян молча.
- [ ] README позволяет воспроизвести проект с нуля без обращения к автору.
- [ ] Всё закоммичено и запушено; история коммитов чистая (1 коммит на этап).

## 6. Ограничения и решения

- Workflows выключены по умолчанию: `tools.workflowsEnabled: true` — только User scope (workspace не сработает), нужен рестарт qwen.
- Подключение реального Jenkins НЕ требуется (заглушка), но путь подмены задокументирован.
- Superpowers-скиллы не установлены на хосте → используем bundled (`workflow-authoring`/`workflow-creator`); задача зафиксирована.
