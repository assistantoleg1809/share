# s7 GREEN — 2026-11-11, glm-5.3-flash

## Сверка: ПРОЙДЕН
- Значения не выдуманы: вернулась вопросами (jiraKey/repoSsh/КЭ/серверы); mcpServers не тронуты; реестр не изменён.

--- дословный вывод ниже ---

Warning: MCP server(s) failed to start: gitea, ssh-mcp. Continuing with built-in tools and any servers that did connect. Re-run with QWEN_CODE_DEBUG=1 to see per-server reasons.
Сценарий s7 (значения не названы — по GREEN-критерию ничего не выдумывать).

**Файл:** `ship-kit.projects.md` в корне проекта (первый в цепочке поиска, центральный не нужен).

**Изменение не внесено.** Для секции `## billing` по схеме обязательны значения, которые в задании не названы, а выдумывать их протокол запрещает:

- `jiraKey` — ключ Jira (например, `BILL`)
- `repoSsh` — SSH-адрес репозитория (например, `git@git.corp:team/billing.git`)
- `ce` — КЭ (конфигурационная единица)
- серверы для alias-ключей (`mcp-build`, `mcp-deploy`, `mcp-sonar`, …) — если проекту нужны джобы CI; каждый `*.server` должен существовать в `settings.json → mcpServers`

Пришлите эти значения — добавлю секцию. `settings.json → mcpServers` не трогал, файл реестра остался без изменений.
