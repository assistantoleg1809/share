# E2E-прогоны эталона агентов и workflows (2026-11-06)

Окружение: Qwen Code 0.24.6 (`/opt/homebrew/bin/qwen`), headless
`QWEN_CODE_ENABLE_WORKFLOWS=1 qwen -y -p …`, моки из `mcp/` (подключены
`.qwen/settings.json` под продакшн-id), изоляция — bare `e2e/bare.git` + клон
`e2e/e2e-run` (пуши агентов уходят только в bare).

Таргет: `e2e/target/app.py:19` — `def div(a, b)` без двоеточия (красное
состояние воспроизводится импортом; зелёное — 3 теста, включая
`test_div_by_zero_returns_none`).

## Прогон 1 — build-autofix v1 (FIX_FAILED → находки)

Цикл дошёл до фикса, триаж точный (`code`, high, `app.py:19`, тикет PRJ-42),
но fix-агент с `isolation: 'worktree'` отказал: родительское дерево клона
«грязное». Две причины:

1. qwen при старте дописывает `"$version": N` в settings.json → **фикс:
   коммитим `$version` в эталон** (`a843bcf`).
2. Worktree-механизм генерирует untracked `.qwen/.gitignore` (`worktrees/`) →
   **фикс: коммитим его** (`890bb0b`).

## Прогон 2 — resume прогона 1 (FIX_FAILED → находки)

Resume отработал образцово (кэш префикса: probe/trigger/watch/triage взяты из
журнала, живьём — только фикс). Фикс попытки 1 сделан по TDD и запушен
(`a213847`, ветка `fix/app-py-div-colon`), но попытка 2 упала в две системные
проблемы:

1. **Состояние мока в памяти процесса**: каждый workflow-агент получает СВОЙ
   stdio-процесс MCP-сервера — счётчик сбрасывался, «пересборка» снова была
   #1/FAILURE. **Фикс: состояние моков в файле**
   `.qwen/tmp/*-mock-state.json` (`890bb0b`).
2. `.qwen/.gitignore` ещё не был закоммичен (см. прогон 1) — второй
   isolation-вызов отказал. Закрыто тем же коммитом.
3. Замечено: `FIX_FAILED` терял успешный `lastFix` прошлой попытки —
   **исправлено** (`890bb0b`).

## Прогон 3 — build-autofix v2, чистый ✅

```
probe:jenkins ok → build #1 FAILURE (SyntaxError app.py:19)
→ triage: code, high → fix: worktree, py_compile красный → правка → зелёный,
   commit 7595dfb → push fix/div-missing-colon
→ build #2 SUCCESS (attempt 2) → worktree убран
```

8 агентов, 0 ошибок, ~9.7k токенов, runId `wf_ae7dc93b59d99a83`.

## Прогон 4 — deploy-autofix ✅ (ожидаемый NOT_FIXABLE)

Деплой #1 падает (инфра: ENOSPC на deploy-agent-03) → триаж
`devops-known` (high), найден тикет **DEVOPS-4821** (5 дублей), Sonar корректно
отсеян (MINOR, не причина). Итог `NOT_FIXABLE` с рекомендацией эскалации в
DevOps, код не тронут. 4 агента, runId `wf_04e55b7af6c40eaf`.

## Прогоны 5–11 — автономный воркер, полный цикл ✅

| Тик | Статус | Что произошло |
|---|---|---|
| 1 | TASK_PICKED | IDLE → скан Jira (PRJ-42, jenkinsJob подхвачен), state.json создан |
| 2 | SPEC_DONE | openspec-каталог + 5 вопросов (openspec-скиллов в окружении нет — структура вручную, честно отражено) |
| 3 | DEV_FAILED → PR_OPEN | См. находку A; после фикса — DEV в worktree: ветка task/PRJ-42, правка 1 строка, тесты зелёные, PR #137 |
| 4 | PR_FIXED | pr:check (замечание lead) → fix в свежем worktree: ответ + resolve + push `1a79311` |
| 5 | PR_FIXED | ответ-комментарий в моке создал новое «нерешённое» (id 101) — закрыт, PR стал MERGED |
| 6 | **DONE** | MERGED → вложенный build-autofix: #1 красная → фикс → #2 SUCCESS (attempt 2); 12 агентов, 0 ошибок; звук Tink |
| 7 | TASK_CLOSED | задача закрыта в историю, worktree-уборка (толерантна к отсутствию), воркер в IDLE |

**Находка A (тик 3):** openspec-агент пишет каталог `openspec/` в основной
чекаут → untracked → DEV-шаг с `isolation: 'worktree'` отказывает. **Фикс:
шаг `spec:commit`** — тик сам коммитит спеку после SPEC (`9e08be8`).

**Находка B (после тика 3):** worktree DEV-шага убирается рантаймом после
пуша → `state.worktreePath` протухает, `workingDir` по нему роняет
диспетчеризацию fix-агента. **Фикс: pr:fix получает СВОЙ свежий worktree и
первым делом `git checkout <ветка задачи>`** (`b2365f9`).

## Итоговая приёмка

- [x] `/build-autofix`: красная → TDD-фикс в worktree → зелёная (прогон 3)
- [x] `/deploy-autofix`: инфра-падение → NOT_FIXABLE + тикет DevOps (прогон 4)
- [x] `/autonomous-worker`: полный конвейер Jira → OpenSpec → реализация →
      PR → замечания → MERGED → вложенная сборка → DONE + звук (прогоны 5–11)
- [x] MCP-ограничения агентов соблюдены (моки под продакшн-id: allowlist
      build-trigger пропустил только trigger_*, deny-listы — остальные)
- [x] Протокол «Шаг 0» отработал во всех агентах
- [x] Терминология ошибок: FIX_FAILED/NOT_FIXABLE несут диагноз и lastFix

Повторение сценария — одной строкой в [docs/agents-and-workflows.md §6a](../docs/agents-and-workflows.md).
