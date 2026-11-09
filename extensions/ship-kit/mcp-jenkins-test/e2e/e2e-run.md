# E2E-прогоны эталона (2026-11-03)

Окружение: Qwen Code 0.26.6, Superpowers 7.0.1, headless `QWEN_CODE_ENABLE_WORKFLOWS=1`, yolo-режим,
MCP-моки из `.qwen/settings.json`. Логи прогонов: /tmp/e2e-triage.log, /tmp/e2e-triage2.log, /tmp/e2e-loop.log.

## Прогон 1 — build-failure-triage v1 (16:14–16:21) ✅ по сути + найдены 2 бага скрипта

Классификация верная (компиляция, src/calc.py:14), но e2e вскрыл:
1. **args приходит строкой** при headless-запуске → `args.jobName` = undefined (агенты само-восстановились через моки);
2. **error: log** — референс забытой переменной логированиия, поле выпало из JSON.
Исправлено в `991af0c` (нормализация `const A = typeof args === 'string' ? JSON.parse(args) : args`; `error: cls`).

## Прогон 2 — build-failure-triage v2 (16:24–16:30) ✅ чистый

- error: **компиляция** — SyntaxError `src/calc.py:14` (`def div(a, b)` без двоеточия), evidence с цитатами из лога, проверено по репозиторию.
- tickets: [] — DEVOPS-4821/4877 из деплой-фикстуры отклонены (другая категория).
- mass: не массовая — обоснованно (проверены лог сборки, DevOps-фикстуры, test-failure, vuln, grep по проекту).

## Прогон 3 — build-fix-loop (16:40–16:46) ✅ критерий приёмки достигнут

```
Итерация 1: build #1 → FAILURE
  triage: компиляция — src/calc.py:14, «добавить : в def div(a, b)»
  checks:  sonar CRITICAL python:S2076 (eval-подобный вызов, :20)
           vuln   CRITICAL CVE-2018-18074 (requests==2.19.0, VULN-001)
  fix:     1) двоеточие добавлено; 2) после снятия синтаксиса тесты вскрыли БАГ-2 —
           div дополнен `if b == 0: return None` (по ТЗ test_div_by_zero_returns_none), TDD: красный → зелёный
Итерация 2: build #2 → SUCCESS
result: "зелёная сборка на итерации 2"
```

## Чеклист приёмки (PLAN.md §5)

- [x] Моки отвечают по MCP (initialize/tools/list/tools/call; smoke + реальные прогоны)
- [x] /build-failure-triage: классификация + тикеты + массовость
- [x] /build-fix-loop: красная сборка → правка в worktree → зелёная; лог итераций виден
- [x] Правки по TDD (syntax → красный тест логики → зелёный), verification прошит в промпты
- [x] README воспроизводим; замена моков — одна запись settings.json
- [x] История: коммит на этап, автор evol1809

## Выводы для тиражирования

- Headless-запуски: всегда нормализуйте args (строка!) — фикс `const A`.
- Не называйте переменные именами глобалов песочницы (`log`, `phase`, `agent`...).
- Determinism-правила (без Date/Math.random) подтверждаю: resume-журнал пишется, прогоны повторяемы.
- Экономия: effort low на механике (build/checks/known), high на триаже и фиксах — см. README «Модели и effort».
