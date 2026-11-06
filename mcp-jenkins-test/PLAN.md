# PLAN — mcp-jenkins-test (эталонный тестовый проект), v2

> Эталон: по этому проекту будут строиться остальные проекты share.
> Основания: [about-my-work.md](../about-my-work.md) (релизный процесс), [qwen-workflows.md](../qwen-workflows.md),
> [qwen-workflows-dev-guide.md](../qwen-workflows-dev-guide.md).
> Стек: Qwen Code 0.26.6 + **Superpowers 7.0.1** (скиллы от Claude-маркета, установлены в `~/.qwen/extensions/superpowers`)
> + bundled-скиллы (`workflow-authoring`, `workflow-creator`).

## Изменения v2 (по замечаниям оператора)

1. В процесс встроены скиллы **Superpowers** (TDD, systematic-debugging, verification-before-completion, writing-plans, subagent-driven-development) — эталон задаёт не только структуру, но и ПРОЦЕСС.
2. Добавлен **полный цикл**: сборка → триаж ошибки → MCP-sonar / MCP-сервис уязвимостей (заглушки) → правки кода → пересборка → повтор.
3. Добавлен ответ на вопрос «нужны ли Qwen Workflows или достаточно субагентов» (§7 и docs/workflows-vs-subagents.md).

## 1. Цель

Эталонный проект показывает связку **моки MCP (Jenkins + Sonar + сервис уязвимостей) + Qwen Workflow + скиллы Superpowers**, закрывающую полный цикл из транскрипции:
упавшая сборка → агент читает лог через MCP → классифицирует (sonar / компиляция / тесты / инфра / деплой / уязвимость) → при необходимости тянет отчёты sonar/vuln → правит код (TDD, в worktree) → пересобирает → итог человеку.
Задаёт структуру каталогов, конвенции и чеклист тиражирования для следующих проектов.

## 2. Структура

```
mcp-jenkins-test/
├── README.md                        # эталон: запуск, чеклист тиражирования
├── PLAN.md                          # этот файл
├── .project.yaml                    # метаданные формата share
├── .qwen/
│   ├── settings.json                # mcpServers: jenkins-mock, sonar-mock, vuln-mock
│   └── workflows/
│       ├── build-failure-triage.js  # триаж: лог → классификация + тикеты DevOps + массовость
│       └── build-fix-loop.js        # полный цикл: сборка → триаж → sonar/vuln → правка → пересборка (лимит итераций)
├── mcp/
│   ├── jenkins-mock/server.js       # stdio MCP: trigger_build, get_job_status, get_build_log
│   ├── sonar-mock/server.js         # stdio MCP: get_issues (фикстуры отчёта)
│   ├── vuln-mock/server.js          # stdio MCP: get_findings (фикстуры уязвимостей)
│   └── fixtures/                    # build-success/compile-error/test-failure/deploy-infra-error + sonar/vuln отчёты
├── src/                             # таргет-мини-проект (python+pytest) с инжектированными багами
│   ├── calc.py
│   └── tests/test_calc.py
└── docs/
    ├── release-flow.md              # карта релисного процесса из транскрипции + точки автоматизации
    └── workflows-vs-subagents.md    # критерии выбора механизма
```

## 3. Ключевые решения

### 3.1 Superpowers как процесс эталона
- **writing-plans** — этот план; **brainstorming** — перед новыми фичами эталона.
- **systematic-debugging** — обязательный вход в триаж ошибок сборки (сначала диагноз, потом фикс).
- **test-driven-development** — каждая правка кода в цикле: красный тест → фикс → зелёный.
- **subagent-driven-development / dispatching-parallel-agents** — исполнение независимых задач сабагентами.
- **verification-before-completion** — никакого «готово» без прогона и вывода команд.
- **using-git-worktrees** — правки в изоляции, рабочий каталог чист (боль «бурных дней» из транскрипции).

### 3.2 Моки MCP (все — node ≥22, ноль зависимостей, JSON-RPC 2.0 over stdio)
| Мок | Инструменты | Фикстуры |
|---|---|---|
| jenkins-mock | jenkins_trigger_build, jenkins_get_job_status, jenkins_get_build_log | логи: success, compile-error, test-failure, deploy-infra-error |
| sonar-mock | sonar_get_issues | issues: code-smell ×2, bug ×1, security-hotspot ×1 |
| vuln-mock | vuln_get_findings | findings: зависимость с CVE (critical), лицензионное предупреждение |
Подмена на реальные серверы = правка одной записи в `.qwen/settings.json` (в README).

### 3.3 Workflows
`build-failure-triage.js` (§5.3): фазы Triage → Known issues; классификация по схеме; параллельный поиск тикетов DevOps + массовость; демонстрация `disallowedTools` (точечное отключение MCP).
`build-fix-loop.js`: `args { jobName, buildNumber, maxIterations, now }`:
1. `jenkins_trigger_build` → статус
2. упала → триаж (лог → класс)
3. класс sonar/vuln → `sonar_get_issues` / `vuln_get_findings`
4. правка: агент в `isolation:'worktree'` по TDD (сначала воспроизводящий тест)
5. пересборка; счётчик итераций; после лимита — стоп и отчёт
Детерминизм: без Date/Math.random, время через args; все agent() проверены на null; thunks в parallel; размер «small, ≤8 агентов».

## 4. Этапы реализации (после подтверждения)

| # | Этап | Коммит |
|---|------|--------|
| 1 | Скелет + .project.yaml + README-заготовка | chore: skeleton |
| 2 | Три MCP-мока + фикстуры | feat(mcp): mocks |
| 3 | src-мини-проект с багами + тесты | feat(src): target project |
| 4 | Два workflow + .qwen/settings.json | feat(workflows) |
| 5 | README полный + docs (release-flow, workflows-vs-subagents) | docs |
| 6 | Прогон: /build-failure-triage и /build-fix-loop до зелёной сборки | test: e2e |

## 5. Критерии приёмки

- [ ] Моки отвечают по MCP-протоколу (initialize / tools/list / tools/call).
- [ ] `/build-failure-triage` на compile-error: классификация + тикеты + массовость.
- [ ] `/build-fix-loop`: на входе падающая сборка → правка кода в worktree → пересборка зелёная; лог итераций виден.
- [ ] Правки прошли TDD (красный → зелёный) и verification-before-completion.
- [ ] README позволяет воспроизвести проект с нуля; замена моков на реальные MCP — одна запись.
- [ ] История: 1 коммит на этап, автор — evol1809.

## 6. Ограничения

- `tools.workflowsEnabled: true` — только User scope + рестарт qwen (после установки Superpowers рестарт всё равно нужен).
- Реальные Jenkins/Sonar/vuln не подключаются (моки), путь подмены задокументирован.
- Скиллы Superpowers применяются в интерактивных сессиях qwen; в workflow-скриптах их роль играют промпты агентов (в промпты включены соответствующие дисциплины: «сначала воспроизводящий тест», «не заявляй успех без прогона»).

## 7. Workflows или субагенты? (короткий ответ)

**Оба, у них разные роли.**
- **Субагенты** (superpowers: subagent-driven-development, dispatching-parallel-agents; qwen: agent-delegation) — интерактивная работа человека в сессии: исследовать, спланировать, выполнить разрозненные задачи. Гибко, дёшево, без включения workflows.
- **Qwen Workflows** — повторяемый конвейер с гарантиями: JSON-схемы ответов, лимиты/бюджет, resume, параллельность thunks, worktree-изоляция, точечный контроль MCP. Это ровно наш цикл «сборка → триаж → правка → пересборка».
- **Критерий**: одноразовая задача → субагент; процесс, который повторяется и должен быть предсказуемым → workflow. В эталоне: конвейер — workflow, исполнители внутри — субагенты.
Подробно с матрицей выбора — docs/workflows-vs-subagents.md.
