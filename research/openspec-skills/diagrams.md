# Схемы взаимодействия скиллов openspec

Дата исследования: 2026-11-18. Источник: `.agents/skills/openspec-*` (генерация openspec CLI 2.0.0, `generatedBy: "2.0.0"`).
Снимок исходников — в `skills/` рядом с этим файлом. Диаграммы составлены по содержимому SKILL.md; mermaid рендерится в Obsidian / Gitea / GitHub.

Диспетчера (аналога `using-superpowers`) в наборе нет: маршрутизация — по description/триггерам, а общий входной контроль (Store selection + Project check) повторён дословно в каждом из шести скиллов.

## 1. Вход и входной контроль (общие блоки всех скиллов)

```mermaid
flowchart TD
    START([запрос в проекте с openspec]) --> STORE{"назван store?<br/>(отдельный репозиторий OpenSpec на машине)"}
    STORE -->|"да"| SL["openspec store list --json → --store id<br/>флаг липкий на весь workflow"]
    STORE -->|"нет"| PC
    SL --> PC["PROJECT CHECK — во всех 6 скиллах<br/>openspec list --json → поле root"]
    PC --> ROOT{{"root есть?"}}
    ROOT -->|"root: null"| WAY{{"как выбран скилл"}}
    WAY -->|"авто-выбор: OpenSpec не назван"| PLAIN["ответить как без OpenSpec<br/>установку не предлагать и не упоминать"]
    WAY -->|"явный запрос OpenSpec / скилла"| ASK["спросить: init / --store / без OpenSpec,<br/>ждать ответа; корень не создавать побочно"]
    ROOT -->|"да"| ROUTE{"триггер запроса"}
    ROUTE -->|"«openspec propose / opsx propose»<br/>опиши, что построить"| PR[openspec-propose]
    ROUTE -->|"«openspec apply / implement»<br/>реализуй, продолжи задачи"| AP[openspec-apply-change]
    ROUTE -->|"«openspec explore»<br/>подумать, исследовать, уточнить"| EX[openspec-explore]
    ROUTE -->|"«openspec update change»<br/>пересмотри план, сведи артефакты"| UP[openspec-update-change]
    ROUTE -->|"«openspec sync»<br/>дельты → мейн-спеки"| SY[openspec-sync-specs]
    ROUTE -->|"«openspec archive»<br/>заверши и заархивируй"| AR[openspec-archive-change]
```

Отдельный случай `root: null`: ошибка `status`, начинающаяся с `Declared in` / `Invalid store declaration in`, означает «проект объявил store, который машина не разрешила» — это не «не инициализирован», стоп с показом `message` и `fix`.

## 2. Жизненный цикл change

```mermaid
flowchart TD
    IDEA([запрос «что построить / что менять»]) --> PR["openspec-propose<br/>PLANNING BOUNDARY: только артефакты, код не трогать"]
    PR --> SC["new change → status --change --json<br/>required set = applyRequires + транзитивные requires<br/>(status — только факт существования файла)"]
    SC --> LOOPA["для каждого ready-артефакта:<br/>instructions id --json → инспекция проекта (read-only) →<br/>template + context/rules как ограничения → файл"]
    LOOPA -->|"после каждого артефакта"| SC
    SC -->|"required set: done / skipped"| STOP1([артефакты готовы — СТОП<br/>apply только по новому явному запросу])
    STOP1 -->|"новый запрос: «реализуй»"| AP["openspec-apply-change<br/>instructions apply --json: contextFiles, задачи, N/M"]
    AP --> TASKS
    subgraph TASKLOOP["цикл задач"]
        TASKS["задача: сверить чекбокс на sourcePath:line →<br/>минимальная правка кода → [x] → повтор instructions"]
        TASKS --> MORE{{"ещё задачи?"}}
    end
    MORE -->|"да, чисто"| TASKS
    MORE -.->|"неясно / дизайн-проблема / added scope"| UP["openspec-update-change<br/>черновик в чате → подтверждение каждой правки →<br/>когерентность артефактов во все стороны"]
    UP -.->|"вернуться к задачам"| AP
    MORE -->|"нет: all_done"| AD([готово: ревью/верификация → предложить архив])
    AD -->|"новый запрос"| AR["openspec-archive-change"]
    AR --> CHK["проверки: артефакты done/skipped →<br/>задачи из list --json → дельты vs мейн-спеки"]
    CHK --> SYNCQ{{"дельты синхронизировать?"}}
    SYNCQ -->|"Sync now / Sync anyway"| SYNC["openspec-sync-specs INLINE<br/>синхронно, не в фоне → verify структуры →<br/>повторная сверка всех capability"]
    SYNCQ -->|"Archive without syncing / Archive now"| MV["mv changeRoot →<br/>changes/archive/YYYY-MM-DD-имя<br/>(без второго префикса даты)"]
    SYNC -->|"всё synced; провал → стоп, не двигать"| MV
    MV --> FIN([сводка архива])
```

Эксплорация (`openspec-explore`) стоит сбоку от цикла: это режим мышления до/во время change с точкой входа «capture» — см. схему 5.

## 3. Цикл задачи в openspec-apply-change

```mermaid
flowchart TD
    SEL["выбор change: аргумент → контекст сессии →<br/>единственный активный → иначе list --json + вопрос<br/>объявить: Using change: имя"] --> INS["openspec instructions apply --change --json<br/>contextFiles, задачи с sourcePath/line,<br/>прогресс total/complete/remaining, state"]
    INS --> STATE{{"state"}}
    STATE -->|"blocked"| BLK["показ сообщения; missingArtifacts →<br/>status → следующий ready → instructions → создать;<br/>иначе чинить tracking-файл; имплементацию не начинать"]
    STATE -->|"all_done"| ADW([отчёт: всё готово → ревью/верификация, архив])
    STATE -->|"work"| READ["прочитать ВСЕ contextFiles с диска<br/>(proposal, specs, design, tasks — по JSON, не по именам)<br/>context — обязательный вход, guidance — advisory"]
    READ --> LOOP["задача N/M: сверить чекбокс на sourcePath:line<br/>с описанием → минимальная правка → [x]"]
    LOOP --> RERUN["повтор instructions: задача done, прогресс изменился"]
    RERUN --> NEXT{{"ещё задачи?"}}
    NEXT -->|"да"| LOOP
    NEXT -->|"нет"| ADW
    LOOP -.->|"пауза"| PAUSE{{"неясная задача / дизайн-проблема /<br/>работа за пределами спеки / ошибка / прерывание"}}
    PAUSE -->|"[варианты] вопрос человеку"| REPORT["Implementation Paused — ждать указаний"]
    REPORT -.-> LOOP
```

Правило чекбокса: `[x]` только при полной реализации указанного поведения — не при частичной и не при отложенной; молча сузить/отложить/принять исключение нельзя — вынести добавленный скоуп и спросить.

## 4. Синхронизация дельт (openspec-sync-specs, в т.ч. inline из archive)

```mermaid
flowchart TD
    ENTRY["вход: отдельный вызов ИЛИ inline из archive<br/>(archive передаёт снапшот specs-rules,<br/>повторный fetch запрещён)"] --> SRC["единственный источник дельт:<br/>artifactPaths.specs.existingOutputPaths<br/>сужение вызывающей стороной — не расширять"]
    SRC --> RULES["1× instructions specs --json<br/>non-zero / invalid JSON → стоп ДО записи"]
    RULES --> CAP{"мейн-спек capability существует?"}
    CAP -->|"нет — новая capability"| NEW["создание: только ADDED (+ Purpose из дельты дословно)<br/>MODIFIED/RENAMED → стоп (нечего менять, не выдумывать)<br/>REMOVED-only: retire_capabilities: true →<br/>already retired, иначе blocked"]
    CAP -->|"да"| MERGE["ИНТЕЛЛЕКТУАЛЬНОЕ СЛИЯНИЕ — не перезапись:<br/>ADDED: нет → добавить; есть → как MODIFIED<br/>MODIFIED: блок целиком, немытое сохранить<br/>REMOVED: удалить блок; ретир файла — только 6 условий<br/>RENAMED: FROM → TO; Purpose мейна неприкосновенен"]
    NEW --> V["openspec validate --specs"]
    MERGE --> V
    V -->|"ok"| SUM([сводка по capability; операция идемпотентна])
    V -->|"fail"| FAIL([отчёт; успех не заявлять])
    MERGE -.->|"blocked capability"| STOPC([стоп синка этой capability;<br/>archive в этом случае changeRoot не двигает])
```

Шесть условий ретира (удаления `spec.md`): этот прогон убрал последние требования; спек корректен (остался `## Purpose`); файл не был пуст до синка; все строки учтены каноном; `.openspec.yaml` объявляет `retire_capabilities: true`; путь внутри реального корня specs (без symlink наружу).

## 5. Explore-режим — stance, а не workflow

```mermaid
flowchart TD
    E([вход: смутная идея / конкретная проблема / застряли в середине]) --> LOOK["openspec list --json (changes) +<br/>list --specs (capabilities) + show --type spec<br/>config.yaml: context и rules — не воспроизводить"]
    LOOK --> THINK["stance: любопытно, без скрипта, без обязательного вывода<br/>вопросы по одному: почему важно + какое решение разблокирует<br/>ASCII-диаграммы (только ASCII-глифы), сравнения, трейд-оффы<br/>рекомендации — с обоснованием из кода"]
    THINK --> W{{"запись?"}}
    W -->|"read-only: свободно, без подтверждения;<br/>ответ на вопрос ≠ согласие писать"| THINK
    W -->|"идея оформилась"| OFFER["предложение: какой артефакт, какой скоуп<br/>прямое да/нет — ответом отдельным сообщением"]
    OFFER -->|"нет"| THINK
    OFFER -->|"да — только названный скоуп"| CAP["capture: new change (CLI, не руками) →<br/>status → instructions → названные артефакты<br/>запрошенные пререквизиты — спросить прежде чем создавать"]
    CAP --> NEXT([стоп: продолжение — propose / apply-change])
    THINK -.->|"просят реализовать"| HANDOFF([«explore не реализует» → openspec-propose])
```

Правила stance: не реализовывать (в т.ч. не трогать схемы/шаблоны/config.yaml — это change), не выдумывать понимание, не торопить, не навязывать структуру, не автозахватывать инсайты, changes/ руками не создавать.

## 6. Граф вызовов скилл-комплекта

```mermaid
flowchart LR
    EX[openspec-explore] -.->|"handoff: не реализую здесь"| PR[openspec-propose]
    PR -.->|"новый запрос человека"| AP[openspec-apply-change]
    AP -.->|"дизайн-проблема / added scope"| UP[openspec-update-change]
    UP -.->|"указать следующий шаг (никогда не действовать)"| AP
    UP -.->|"всё реализовано"| AR[openspec-archive-change]
    AP -.->|"all_done: предложить"| AR
    AR ==>|"inline, синхронно, не в фоне"| SY[openspec-sync-specs]

    PR --> CLI[(openspec CLI)]
    AP --> CLI
    UP --> CLI
    SY --> CLI
    EX -->|"list / show / new change при capture"| CLI
    AR -->|"mv changeRoot по контракту CLI"| ARC[(openspec/changes/archive)]
```

Сплошные стрелки — фактические вызовы внутри одного скилла; пунктир — переходы/handoff (всегда через новое действие человека, кроме inline-sync из archive); жирная — единственный вызов скилла скиллом.

## Матрица взаимодействий

| Скилл | Роль | Явно вызывает | Ключевые артефакты |
|---|---|---|---|
| openspec-explore | мышление | CLI: `list`, `list --specs`, `show --type spec`, `new change` + `instructions` при capture; handoff → propose / apply | артефакты capture, названные запросом |
| openspec-propose | планирование | CLI: `context`, `new change`, `status`, `instructions <artifact>`, `schemas` (по запросу) | `changes/<имя>/`: proposal.md, specs/<capability>/spec.md (дельта), design.md, tasks.md |
| openspec-update-change | ревизия | CLI: `list`, `status`, `instructions` | правки `existingOutputPaths` артефактов (+ файл под частично заполненный glob) |
| openspec-apply-change | исполнение | CLI: `list`, `status`, `instructions apply` | `[x]` в tasks-артефакте, код проекта |
| openspec-sync-specs | спеки-контур | CLI: `status`, `instructions specs`, `validate --specs` | `openspec/specs/<capability>/spec.md` |
| openspec-archive-change | завершение | CLI: `instructions archive` (advisory) / `specs`; INLINE openspec-sync-specs; `mkdir`+`mv` | `changes/archive/YYYY-MM-DD-<имя>/` |

Общий контракт с CLI у всех: `store list --json` и `list --json` (project check) на входе; JSON-статусы (`status`, `instructions`, `list`) — единственный источник истины о состоянии; `context`/`operationGuidance` — advisory-вход, не доказательство готовности.

## Человеко-гейты

| # | Гейт | Где |
|---|---|---|
| 1 | Без root ни одной записи; `openspec init` / `--store` — только по явному ответу человека; корень не создаётся побочно ни одной командой | Project check, все 6 |
| 2 | Planning boundary: после артефактов стоп; apply — только новый явный запрос, даже если исходный запрос просил «построить» | propose |
| 3 | Материальная неоднозначность (скоуп, наблюдаемое поведение, совместимость, критерии приёмки) — вопрос до создания change; мелочи — допущение с записью в артефакт | propose |
| 4 | Запись в explore — прямое да/нет отдельным сообщением на названный скоуп; ответ на вопрос ≠ согласие писать; подтверждение не расширяет скоуп | explore |
| 5 | Каждая правка артефакта — подтверждение до записи (черновик в чате); смена интеншена change → отдельный новый change (Update vs Start Fresh) | update-change |
| 6 | Пауза при неясной задаче / дизайн-проблеме / работе за пределами спеки; `[x]` только при полной реализации — молча не сужать, не откладывать, не принимать исключения | apply-change |
| 7 | Архив с незавершёнными артефактами/задачами — только после подтверждения; выбор синка: Sync now / Archive without syncing / Cancel; отказ от выбора — не архивировать | archive-change |
| 8 | Стоп на blocked capability до записи мейн-спека; ретир capability только при `retire_capabilities: true`; пустую секцию `## Requirements` не оставлять | sync-specs |
