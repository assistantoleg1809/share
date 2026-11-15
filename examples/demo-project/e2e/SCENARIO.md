# SCENARIO — живой прогон PRJ-777 на моках (кейс пользователя, 5 шагов)

Модель — только glm-5.3-flash. Сборка песочницы:

```bash
node examples/demo-project/e2e/make_sandbox.mjs   # напечатает путь песочницы
```

Гейты неинтерактивны: подтверждаются дословными «подтверждаю …» в
заданиях (равносильно «да» по трём правилам, источник фиксируется в
отчётах). Состояние между вызовами — `skill-runs/PRJ-777/plan.md`
(проверяется токен возобновления). Все вызовы — с cwd песочницы.

## Кейс (шаги пользователя → вызовы)

| Шаг кейса | Вызов |
|---|---|
| 1. ввод команды | вызов 1: `/ship-kit:task …` |
| 2. аргументы из файла проектов; деплой только IFT | агент читает ship-kit.projects.md (вызовы 1–3) |
| 3. проверка MCP | Шаг-0 каждого скилла (моки живы) |
| 4. директория спеки по правилу проекта | конвенция в файле проектов → `specs/PRJ-700-<название из jira>/` |
| 5. деплой зелёный после фикса | вызовы 3 (IFT #1 ❌ код в диффе) → 4 fix → 5 PR-2 → 6 IFT #2 ✅ |

## Вызовы (дословно)

1. `qwen --model glm-5.3-flash -p "/ship-kit:task PRJ-777 добавь экспорт отчётов в CSV. Аргументы MCP возьми из ship-kit.projects.md этого проекта. Конвенции спеки — из файла проектов. Порядок прогона подтверждаю: фазы комплекта по умолчанию."`
2. `qwen --model glm-5.3-flash -p "/ship-kit:pr отправь на ревью. Подтверждаю пуш ветки и создание PR."`
3. `qwen --model glm-5.3-flash -p "/ship-kit:ci запусти сборку и деплой на IFT. Подтверждаю запуск сборки calc-app. Подтверждаю запуск деплоя calc-app-deploy на IFT."`
4. (IFT #1 FAILURE, RELATED: task-diff) `qwen --model glm-5.3-flash -p "/ship-kit:task PRJ-777 исправь по последнему диагнозу из плана прогона skill-runs/PRJ-777/plan.md. Прежний PR уже MERGED — фикс отдельной веткой от main."`
5. `qwen --model glm-5.3-flash -p "/ship-kit:pr отправь фикс новой веткой. Подтверждаю пуш ветки и создание PR."`
6. `qwen --model glm-5.3-flash -p "/ship-kit:ci повтори деплой на IFT. Подтверждаю повторный запуск деплоя calc-app-deploy на IFT."`

## Ожидаемые артефакты песочницы (приёмка)

- `specs/PRJ-700-dobav-eksport-otchetov-v-csv/` (или иной slug из summary
  задачи jira) с proposal.md + tasks.md — правило проекта;
- ветки feature/PRJ-777 и bugfix/PRJ-777 с коммитами; PR-1 и PR-2 в
  state мока bitbucket (MERGED);
- `skill-runs/PRJ-777/plan.md` — чек-лист и журнал всех вызовов;
- jenkins state: calc-app #N SUCCESS; calc-app-deploy:IFT #N+1 FAILURE →
  #N+2 SUCCESS; `.qwen/settings.json` с `$version`-хвостом (ожидаемо).

Отклонения фиксируются в RUN.md честно.
