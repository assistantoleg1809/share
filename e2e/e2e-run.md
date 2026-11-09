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

## Прогон 12 — deploy-autofix на выделенной линейке deploy-* ✅

После рефакторинга (деплой-роли вынесены из workflow в `.qwen/agents/`:
deploy-status / deploy-trigger / deploy-triage / deploy-fix) — повторный прогон
без изменения поведения: `NOT_FIXABLE`, `devops-known` (high), DEVOPS-4821,
Sonar отсеян, в fixHint появился и временный обход (перевести джобу на другой
агент пула). 4 агента, ~2 минуты, runId `wf_821ea743e3e995e5`. Allowlist
deploy-trigger пропустил только `trigger_deploy` — разделение с build-trigger
подтверждено.

## Прогон 13 — комплект как расширение share-kit + DEPLOY-ступень воркера ✅

2026-11-09. Репозиторий развёрнут как расширение (`qwen-extension.json`,
ресурсы `agents/`, `workflows/`, `skills/` в корне), линк
`qwen extensions link`. Прогон в клоне, из которого локальные
`.qwen/agents|.qwen/workflows|.qwen/skills` удалены ЗАКОММИЧЕННЫМ коммитом
(удаление «вживую» пачкает дерево и роняет `isolation: 'worktree'` — та же
грабля, что `$version`, см. ниже):

- `share-kit:build-autofix` — **SUCCESS со 2-й попытки**: #1 красная
  (инжектированный SyntaxError) → триаж (code, fixable, high) → фикс в
  worktree, пуш `fix/app-py-syntax-colon` в bare → #2 зелёная. 8 агентов,
  0 ошибок. Агенты и workflow — только из расширения.
- Тик `share-kit:autonomous-worker` из рукописного state
  (`phase: DEPLOY`, `deployJob: app-deploy`) — вложенный
  `share-kit:deploy-autofix`: deploy #1 FAILURE (фикстура) → триаж
  `devops-known` (DEVOPS-4821, fixable=false) → **DEPLOY_FAILED**, state.json
  записан (phase/lastError/history `deploy-failed`), звук Bottle. Ровно по
  дизайну: инфра-причина не уходит в бессмысленный фикс.

**Находка C (meta.name):** workflows расширения берут имя из `meta.name`
(не из имени файла) и валидируют паттерном `^[a-z][a-z0-9-]{0,40}$`;
значения вида `Build with autofix` заставляют загрузчик МОЛЧА пропускать
скрипт — реестр расширения пуст, `Workflow('share-kit:...')` → «no workflow
with that name», при этом локальный `.qwen/workflows` то же имя принимает
(берёт из имени файла). Локальный прогон маскирует проблему — проверять
листинг расширения (`Workflow({name:'<ext>:<нет-такого>'})` → в тексте
ошибки список Available). Фикс: `meta.name` = kebab-lowercase = имени файла.
Инвариант внесён в скилл adapt-agents-workflows (§2.8) и docs §6.

**Находка D (грязный клон):** удаление локальной копии комплекта из клона
после checkout — незакоммиченные deletions → fix-агент с
`isolation: 'worktree'` не диспетчеризуется. Правильно: удалять отдельным
коммитом до прогона (как `$version`).

**Находка E (дорогой дефолт):** прогон без `modelFast`/`modelExpert` в args
отправил всех агентов (включая механику: probe/наблюдатели/trigger/state) на
дефолт сессии glm-5.3 — суммарно ~95 дорогих запросов за три прогона
(usage_record.jsonl). Стандарт: тестовые прогоны ТОЛЬКО на
`glm-5.3-flash` (оба ключа), e2e-команда в docs §6a обновлена.

## Прогон 14 — архитектура 1:1 (агенты-обёртки + скиллы-роли) ✅

2026-11-09. Рефакторинг: 11 агентов ↔ 11 скиллов-ролей (имена совпадают);
вся методика — в скилле, агент = frontmatter-границы + обязательный вызов
`Skill` со своим скиллом (без правок). Цикловые скиллы `*-manual` удалены
(методика развёрнута в роль-скиллы). Прогон `share-kit:build-autofix` в
клоне без локального комплекта:

- **SUCCESS со 2-й попытки**, 8 агентов, **все на glm-5.3-flash**
  (~6.6k токенов — модельные ключи в args, экономия сработала).
- Тонкие «кнопки» (build-trigger) работают: allowlist дополнен `Skill`,
  шаг 0 и одна попытка — из скилла.
- build-fix: TDD (красный py_compile → правка → зелёный), коммит, пуш
  `fix/div-missing-colon`.

**Находка F (контроль без скилла):** baseline-сессия без скиллов/агентов
тоже прошла тривиальный кейс (SyntaxError → фикс → зелёная) — на простом
баге скилл не создаёт разницы; его ценность — дисциплина (пуш-политика,
лимиты попыток, NOT_FIXABLE-эскалация, формат итога) на сложных кейсах.
Полный RED-GREEN по writing-skills не завершён (остановлен by design),
микро-проверки wording для роль-скиллов — TODO следующей доработки.

**Rebrand → `cicd-kit` (вечер 2026-11-09):** переименование проверено
DEPLOY-тиком `cicd-kit:autonomous-worker` — вложенный
`cicd-kit:deploy-autofix` резолвнулся, NOT_FIXABLE → DEPLOY_FAILED, 7/7
агентов на flash. Исторические имена `share-kit:*` в записях выше — как
было на момент прогонов.

**Rebrand → `ship-kit` (поздний вечер 2026-11-09):** ещё два переименования за вечер —
промежуточное `ticket2prod` отклонено Oleg'ом («не очень» — паттерн «слово2слово»), финальное
`ship-kit` выбрано им из вариантов. Оба проверены DEPLOY-тиком: `ticket2prod` — 7/7 агентов,
NOT_FIXABLE → DEPLOY_FAILED (~5.2k токенов); контрольный `ship-kit:autonomous-worker` — вложенный
`ship-kit:deploy-autofix` резолвнулся, деплой #1 → фикстура «нет места» → триаж devops-known
(DEVOPS-4821) → NOT_FIXABLE → DEPLOY_FAILED, 7/7 агентов на flash, 5171 токен. `qwen extensions
link` по пути каталога переживает переименования манифеста без пере-link. Исторические имена
`share-kit:*` / `cicd-kit:*` / `ticket2prod:*` в журнале не переписываются.

**Поставка → установленная копия (вечер 2026-11-09):** link заменён постоянной копией
`qwen extensions install <path> --consent` → `~/.qwen/extensions/ship-kit` (type `local`;
без `--consent` в headless виснет на запросе согласия — грабля). Контрольный DEPLOY-тик на
копии: `ship-kit:autonomous-worker` резолвнулся, вложенный `ship-kit:deploy-autofix` стартовал
(деплой #1: trigger + два наблюдателя, 3 опроса статуса); детерминированный финал
NOT_FIXABLE → DEPLOY_FAILED в этом прогоне не достигнут (~35 мин, тугой flash; заявленный
30-минутный wall-clock прогона не отсёк зависший этап — повод проверить лимит) —
детерминированная цепочка подтверждена двумя тиками выше в link-режиме.

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
