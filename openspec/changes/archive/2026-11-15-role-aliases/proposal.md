# Proposal

## Why

Пользователь утвердил английские имена ролей алиасов
(tracker/docs/repo/build/deploy/quality), добавил две роли —
**vuln** (уязвимости) и **chat** (чаты/мессенджеры) — и потребовал
учесть, что одной роли может соответствовать несколько MCP.

## What Changes

- Канонические роли алиасов: `tracker · docs · repo · build · deploy ·
  quality · vuln · chat` (замена «вики»→docs; kind-файлы говорят
  ролями; в протоколы диагностики добавлен vuln).
- Формат алиаса `mcp-<роль>=<сервер[,сервер2…]]`: несколько MCP роли —
  все рабочие; чтение по всем, запись — в названный заданием сервер,
  иначе один вопрос.
- Конвенции песочниц (make_sandbox*.mjs) переведены на роли
  (mcp-tracker=jira, mcp-docs=wiki, mcp-repo=bb, mcp-build=jenkins,
  mcp-deploy=jenkins); QWEN/docs — примеры вызовов с ролями.

## Capabilities

### New Capabilities

(нет)

### Modified Capabilities

- `base-skills`: «Три скилла-фазы» (канонические роли EN + vuln/chat);
  «Работа без конфигурации» (формат алиаса, несколько MCP на роль,
  сценарии).

## Impact

- `skills/{task,pr,ci}/SKILL.md`, `ci/{build,deploy}.md`, `QWEN.md`,
  `docs/ship-kit.md`, `examples/demo-project/e2e/make_sandbox{,2}.mjs`;
  копия переустанавливается.
