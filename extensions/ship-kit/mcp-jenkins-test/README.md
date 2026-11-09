# mcp-jenkins-test — эталонный проект

Эталон для тиражирования: **MCP-моки (Jenkins + Sonar + сервис уязвимостей) + Qwen Workflows + скиллы Superpowers**.
Закрывает цикл из рабочего процесса: упавшая сборка → триаж → отчёты качества/уязвимостей → правки кода (TDD) → пересборка.

📚 [PLAN.md](PLAN.md) · Карта процесса: [docs/release-flow.md](docs/release-flow.md) · Выбор механизма: [docs/workflows-vs-subagents.md](docs/workflows-vs-subagents.md)

## Структура

```
.qwen/settings.json            # три MCP-мока (mcpServers)
.qwen/workflows/
  build-failure-triage.js      # /build-failure-triage — лог → классификация + тикеты + массовость
  build-fix-loop.js            # /build-fix-loop — сборка → триаж → sonar/vuln → фикс (TDD) → пересборка
mcp/{jenkins,sonar,vuln}-mock/ # stdio JSON-RPC серверы, ноль зависимостей, EPIPE-safe
mcp/fixtures/                  # 4 лога сборок + sonar-issues.json + vuln-findings.json
src/                           # таргет calc: БАГ-1 синтаксис (строка 14), БАГ-2 деление на ноль
src/tests/test_calc.py         # 6 тестов (ТЗ: div(x,0) → None)
docs/                          # release-flow, workflows-vs-subagents
```

## Быстрый старт

1. **Один раз**: `python3 -m venv .venv && .venv/bin/pip install pytest`
2. **Включить Workflows** (User scope, не workspace!): в `~/.qwen/settings.json` → `"tools": {"workflowsEnabled": true}`, затем рестарт qwen.
   Для headless-прогона достаточно env: `QWEN_CODE_ENABLE_WORKFLOWS=1 qwen -p "..."`
3. **Интерактивно** (из каталога проекта):
   - сообщение со словом `workflow`: «workflow: разбери упавшую сборку #1»
   - или slash-команда: `/build-failure-triage` (args спросятся) и `/build-fix-loop`
4. **Headless**:
   ```bash
   cd mcp-jenkins-test
   QWEN_CODE_ENABLE_WORKFLOWS=1 qwen -p "Запусти workflow build-failure-triage с args {jobName:'calc-app', buildNumber:1, project:'calc-app', devopsBoard:'DEVOPS'}"
   ```

## Как устроены моки

- **Детерминированное правило Jenkins**: `build=1 → FAILURE` (фикстура `build-compile-error.log`), `build≥2 → SUCCESS`.
  После правки кода «пересборка» (build+1) зелёная — цикл замыкается без реального Jenkins.
- **node по абсолютному пути** в settings.json (`~/.local/lib/qwen-code/node/bin/node`) — у пользователя нет node в PATH.
  Если в вашем окружении node есть — замените на `"command": "node"`.
- Фикстуры синхронны с `src/`: лог указывает на `src/calc.py:14`, локальный pytest даёт ту же ошибку.

## Модели и effort агентов

По умолчанию агенты работают на модели сессии; экономия/качество настраиваются effort-ом по роли:

| Агент | effort | Зачем |
|---|---|---|
| build-статус, known:*, check:sonar/vuln | low | механика: вызвать MCP и пересказать |
| triage (классификация лога) | high | главный диагноз |
| fix (правка кода) | high | качество правки |

Тонкая настройка моделями — необязательные args: `{..., modelFast: "<id дешёвой>", modelExpert: "<id дорогой>"}` — подставляются в model соответствующих агентов (хелпер withModel в workflow).

## Замена моков на реальные серверы

`.qwen/settings.json` → `mcpServers`: замените запись мока на реальный (пример для Jenkins):
```json
"jenkins": {"command": "npx", "args": ["-y", "mcp-jenkins", "--url", "https://ci.example.com", "--user", "ci-bot", "--token", "..."]}
```
Workflows менять не нужно: они обращаются к инструментам по имени сервера (`jenkins-mock` → переименуйте ключ или поправьте `mcp__jenkins-mock__` в промптах агентов на имя нового сервера).

## Скиллы Superpowers в этом проекте

| Скилл | Где применяется |
|---|---|
| writing-plans | PLAN.md |
| systematic-debugging | вход в триаж: сначала воспроизвести и диагностировать |
| test-driven-development | каждый фикс: красный → правка → зелёный |
| using-git-worktrees | изоляция правок (isolation: 'worktree' в build-fix-loop) |
| verification-before-completion | запрет «готово» без вывода тестов (прошито в промпты агентов) |
| subagent-driven-development | исполнение независимых задач сабагентами |

## Чеклист тиражирования (новый проект по эталону)

1. Скопировать каталог, переименовать; `.project.yaml` → name/stage нового проекта.
2. Заменить `src/` на целевой проект; фикстуры логов — под реальные ошибки проекта.
3. MCP-моки оставить или заменить на реальные серверы (раздел выше).
4. Промпты агентов в workflows: обновить пути (`mcp-jenkins-test/` → ваш каталог) и диагнозы.
5. Прогнать `/build-failure-triage` на известной красной фикстуре — убедиться в классификации.
6. Закоммитить: 1 коммит на этап (chore → feat(mcp) → feat(src) → feat(workflows) → docs → test: e2e).
