# Манифест позиций конвейера — словарь исполнителей (md)

Позиция = именованный слот: контракт исполнителя + тип. Скиллы конвейера
(`run`, `doctor`) пишутся под контракт; проект подменляет исполнителя
позиции в `executors:` своего реестра ([ship-kit.projects.md](
ship-kit.projects.md)), не трогая стадии. Комплект исполнителей не
подбирает сам (trust discovery-only). Историческая механика версий
формата yaml-эпохи (`formatVersion` + миграции) в md-формате не
применяется.

## Позиции

| Позиция | Тип | Описание | Контракт |
|---|---|---|---|
| `task` | executor | Спека и правки кода: контекст задачи (Jira/Confluence/mmap), оформление изменения, реализация, код-фиксы по замечаниям и диагнозу | Шаг-0: проверить переданные MCP; отчёт `OK · CHANGE · BRANCH · GATE · SUMMARY`; пуш/PR — не у него (делает `pr`) |
| `pr` | executor | Доставка: рабочая ветка `<X>/<КЛЮЧ>`, атомарные коммиты, PR, цикл замечаний (пуш в тот же PR; новый PR — только на новый фикс) | Шаг-0: MCP + чистый git-каталог; отчёт `OK · WORKTREE · BRANCH · PRID · PRURL · GATE`; пуш и создание PR — ask · всегда, одной карточкой |
| `ci` | executor | Запуск и наблюдение джоб (kind=build/deploy, стенды) | Шаг-0: MCP; отчёт запуска `ok/kind/stand/number/url/gate`, ожидания `state/kind/number/errorSnippet/logTail/eta/possiblyStuck`; запуск — ask · всегда |
| `detective` | executor | Диагноз падения джобы (служебная: вызывает `run` между падением стадии и выбором фикс-стадии; в наборы стадий не входит) | только чтение; отчёт `category · rootCause · fixable · fixHint · knownIssues · confidence` |
| `mechanic` | executor | Не-код фикс по диагнозу: минимальная правка репозитория, локальная проверка (красный → правка → зелёный), коммит, 🔒 карточка пуша | Шаг-0: транспорт (лог упавшей) + git; отчёт `OK · COMMIT · BRANCH · PUSHED · GATE · SUMMARY · WORKTREE` |

## Наборы позиций по kind стадии

Поле `positions` у стадии может только сузить набор (подмножество).

- `DO` → task, pr
- `BUILD` → ci
- `DEPLOY` → ci
- `FIX_DO` → task, pr
- `FIX_BUILD` → task, mechanic, pr (mechanic можно срезать: `positions: [task, pr]`)
- `FIX_DEPLOY` → mechanic, pr

## Маршрутизация «категория диагноза → позиция» (fixRouting)

- `FIX_DO`: code → task (вход — `triggeredBy`: замечания PR / команда человека)
- `FIX_BUILD`: code → task, noncode → mechanic
- `FIX_DEPLOY`: anyFixable → mechanic

## Дефолтные исполнители

Соответствуют скиллам базового комплекта; проект подменяет любую
позицию в `executors:` реестра.

- task → `ship-kit:task`
- pr → `ship-kit:pr`
- ci → `ship-kit:ci`
- detective → `doctor` (режим diagnose; скилл примера)
- mechanic → `doctor` (режим fix; скилл примера)
