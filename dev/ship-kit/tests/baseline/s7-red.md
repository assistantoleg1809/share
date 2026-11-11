# s7 RED — 2026-11-11, glm-5.3-flash, расширение снесено

## Комплаенс-нарушения / факты
- Значения не выдуманы — вернулась вопросами (jiraKey/repoSsh/КЭ/серверы) ✓ случайно комплаентно.
- Схему реестра (deploy.stands, model jenkins|custom, retryLimit) знает из docs репо на диске — источник не скилл.

--- дословный вывод ниже ---

Warning: MCP server(s) failed to start: gitea, ssh-mcp. Continuing with built-in tools and any servers that did connect. Re-run with QWEN_CODE_DEBUG=1 to see per-server reasons.
Реестр найден: `ship-kit.projects.md` в корне проекта (сейчас там `[default]` и секция `calc`). По протоколу скилла registry значения не выдумываю — для секции `## billing` не хватает обязательных полей.

Назови значения, и я добавлю секцию:

**Обязательные:**
- `jiraKey` — Jira-ключ проекта billing
- `repoSsh` — ssh-адрес репозитория
- `ce` — КЭ проекта

**Опциональные (если нужны MCP-интеграции):**
- alias-серверы из фиксированного списка: `mcp-build`, `mcp-deploy`, `mcp-sonar`, `mcp-jira`, `mcp-confluence`, `mcp-bitbucket`, `mcp-mmap` (имя каждого должно уже существовать в `settings.json → mcpServers` — сам файл серверов я не трогаю)
- при `mcp-build`/`mcp-deploy`: джоба (`<alias>.job.path` + `<alias>.job.name`) или `custom` с `<alias>.launch.params`
- при `mcp-sonar`: `.projectKey`
- при `mcp-deploy`: `deploy.stands` (из DEV/ST/IFT/PSI, IFT и PSI обязательны)
- `retryLimit` — число запусков

Достаточно только трёх обязательных — секцию дополним позже, когда понадобятся CI-джобы. Как пришлёшь значения — внесу запись и покажу дифф до/после.
