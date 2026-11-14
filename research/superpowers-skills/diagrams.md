# Схемы взаимодействия скиллов суперпауэрс

Дата исследования: 2026-11-14. Источник: `~/.qwen/skills/` (obra/superpowers, установлены 2026-09-09).
Снимок исходников — в `skills/` рядом с этим файлом. Диаграммы составлены по содержимому SKILL.md; mermaid рендерится в Obsidian / Gitea / GitHub.

## 1. Вход и маршрутизация (`using-superpowers`)

```mermaid
flowchart TD
    START([старт любой задачи]) --> US["using-superpowers<br/>скилл проверяется ДО любого действия<br/>процессные раньше имплементационных"]
    US -->|"строим X / меняем поведение"| BR[brainstorming]
    US -->|"баг / тест упал / неожиданное"| SD[systematic-debugging]
    US -->|"есть план — исполняй"| EX["subagent-driven-development<br/>или executing-plans"]
    US -->|"2+ независимых проблем"| PA[dispatching-parallel-agents]
    US -->|"создать / править скилл"| WS[writing-skills]
    US -->|"работа готова"| VC[verification-before-completion]

    NOTE["инструкции пользователя &gt; скиллы &gt; поведение по умолчанию<br/>в сабагентах using-superpowers не действует - SUBAGENT-STOP"]
```

## 2. Жизненный цикл фичи

```mermaid
flowchart TD
    BR["brainstorming — классификация задачи<br/>(храповик: путь только повышается)"]

    BR -->|SPIKE| SP["проба 2-3 фразы → кивок человека<br/>→ исследование → рекомендация<br/>код throwaway"]
    BR -->|BOUNDED| BD["вопросы по одной → мини-дизайн в чате<br/>→ ✅ одобрение человека"]
    BR -->|ARCHITECTURAL| Q["вопросы → 2-3 подхода с трейд-оффами<br/>→ дизайн по секциям - ✅ после каждой"]

    Q --> SPEC["спека docs/superpowers/specs/*.md<br/>→ self-review → ревью спеки человеком ✅"]
    SPEC --> WP["writing-plans<br/>план docs/superpowers/plans/*.md<br/>задачи = TDD-шаги 2-5 мин, Files + Interfaces<br/>никаких TBD"]

    WP --> CHOICE{{"выбор исполнения — человек"}}
    CHOICE -->|"1 - рекомендуется"| SDD["subagent-driven-development<br/>та же сессия, сабагенты"]
    CHOICE -->|"2 - нет сабагентов"| EP["executing-plans<br/>отдельная сессия"]

    BD --> WT["using-git-worktrees<br/>детект → нативный тул → fallback .worktrees/<br/>бейзлайн-тесты"]
    SDD --> WT
    EP --> WT

    WT --> IMPL["ИСПОЛНЕНИЕ ЗАДАЧ<br/>внутри: test-driven-development RED→GREEN→REFACTOR<br/>сбой → systematic-debugging<br/>«готово» → verification-before-completion"]

    IMPL -.->|"скрытая сложность — апгрейд пути"| BR

    IMPL --> FIN["finishing-a-development-branch<br/>полный тест-прогон → детект окружения"]
    FIN --> MENU{{"меню человека:<br/>merge локально / push+PR / оставить"}}
    MENU --> MG["merge: тесты на слитом → очистка worktree → удаление ветки<br/>discard — только по слову discard"]
```

## 3. Цикл задачи в subagent-driven-development

```mermaid
flowchart TD
    SETUP["setup: using-git-worktrees → scripts/sdd-workspace<br/>→ ledger progress.md → пред-флайт скан конфликтов плана"]

    SETUP --> TB
    subgraph LOOP["на каждую задачу плана"]
        TB["scripts/task-brief N → бриф-файл<br/>единственный источник требований"] --> IMP["ИМПЛЕМЕНТЕР-сабагент<br/>без наследования контекста сессии<br/>TDD, тесты, коммит, self-review"]
        IMP --> ST{{"статус отчёта"}}
        ST -->|"DONE"| PKG
        ST -->|"NEEDS_CONTEXT / BLOCKED"| HND["дать контекст / модель сильнее<br/>дробление / ruling по плану"]
        HND --> IMP
        PKG["scripts/review-package BASE..HEAD<br/>→ дифф-файлом, не в контекст"] --> REV["РЕВЬЮЕР-сабагент<br/>два вердикта: спека ✅/❌ + качество"]
        REV -->|"чисто"| DONE["ledger: Task N complete"]
        REV -->|"находки"| FIX{{"fix-loop, макс 5 раундов"}}
        FIX -->|"раунды 1-3"| R1["resume того же имплементера"]
        FIX -->|"раунды 4-5"| R2["свежий имплементер<br/>+ модель на тир выше"]
        R1 --> RR["scoped re-review<br/>ADDRESSED / NOT ADDRESSED<br/>новое — только в диффе фикса"]
        R2 --> RR
        RR -->|"все закрыты"| DONE
        RR -->|"кап 5 — breaker"| BRK["adjudicate:<br/>park с ruling / rule и дальше"]
        BRK --> DONE
    end

    DONE --> MORE{{"ещё задачи?"}}
    MORE -->|да| TB
    MORE -->|нет| FINR["ФИНАЛЬНЫЙ ревью всей ветки<br/>шаблон code-reviewer.md, топ-модель<br/>видит parked/deferred из ledger"]
    FINR -->|"находки"| WAVE["ОДНА fix-волна одним сабагентом<br/>+ один scoped re-review → adjudicate"]
    FINR -->|чисто| CLN
    WAVE --> CLN["rm workspace → финальное сообщение<br/>«Rulings I made» — все рулинги человеку"]
    CLN --> FDB[finishing-a-development-branch]
```

## 4. Сбойный путь (`systematic-debugging`)

```mermaid
flowchart TD
    BUG["сбой: тест упал / баг / странное поведение"] --> P1
    P1["Phase 1 — КОРЕНЬ<br/>прочитать ошибки → воспроизвести → git diff<br/>→ инструментировать границы компонентов<br/>→ трассировать значение вверх до источника"]
    P1 --> P2["Phase 2 — ПАТТЕРН<br/>работающий аналог → все различия → зависимости"]
    P2 --> P3["Phase 3 — ГИПОТЕЗА<br/>одна, записать → минимальный тест → одна переменная"]
    P3 --> P4["Phase 4 — ФИКС<br/>failing test → TDD → ОДИН фикс без «заодно»<br/>→ verification-before-completion"]
    P4 --> OK{{"фикс сработал?"}}
    OK -->|"не сработало, попыток &lt; 3"| P1
    OK -->|"да"| END([готово — тест зелёный])
    OK -->|"≥ 3 фиксов упало"| ARCH["СТОП: вопрос АРХИТЕКТУРЕ<br/>обсуждение с человеком"]

    BUG -.->|"несколько НЕЗАВИСИМЫХ сбоев"| PA["dispatching-parallel-agents<br/>один сабагент на домен, параллельно<br/>→ проверка конфликтов → полный прогон"]
```

## 5. Ревью-контуры

```mermaid
flowchart LR
    subgraph REQ["requesting-code-review — я сделал работу"]
        R1["BASE_SHA..HEAD_SHA"] --> R2["сабагент-ревьюер<br/>шаблон code-reviewer.md<br/>без истории сессии"]
        R2 --> R3["Critical — немедленно<br/>Important — до продолжения<br/>Minor — в заметки<br/>ревьюер неправ → push back"]
    end

    subgraph REC["receiving-code-review — мне прислали замечания"]
        C1["READ → пересказать своими словами"] --> C2["VERIFY по кодовой базе"]
        C2 --> C3{{"источник и ясность"}}
        C3 -->|"человек"| C4["доверие, но уточнить скоуп"]
        C3 -->|"внешний"| C5["скептически + YAGNI-чек<br/>grep: используется ли вообще"]
        C3 -->|"что-то непонятно"| C6["СТОП — уточнить ВСЁ<br/>пункты могут быть связаны"]
        C6 --> C1
        C4 --> C7["IMPLEMENT: по одному, каждый с тестом"]
        C5 --> C7
    end

    REQ -.->|"находки приходят в основную сессию"| REC
```

## 6. Граф вызовов скилл-комплекта

```mermaid
flowchart LR
    US[using-superpowers] -.->|маршрутизирует| BR[brainstorming]
    US -.-> SD[systematic-debugging]

    BR -->|"только архитектурный путь"| WP[writing-plans]
    WP -->|"вариант 1 - рекомендуется"| SDD[subagent-driven-development]
    WP -->|"вариант 2"| EP[executing-plans]

    SDD --> WT[using-git-worktrees]
    EP --> WT
    SDD -->|"шаблон финального ревью"| RQ[requesting-code-review]
    SDD --> FIN[finishing-a-development-branch]
    EP --> FIN

    SD -->|"Phase 4: failing test"| TDD[test-driven-development]
    SD -->|"Phase 4: проверка"| VBC[verification-before-completion]
    WS[writing-skills] -->|"required background"| TDD
    FIN -.->|"чистит .worktrees/"| WT

    PA[dispatching-parallel-agents] o--o RCV[receiving-code-review]
```

## Матрица взаимодействий

| Скилл | Роль | Явно вызывает | Ключевые артефакты |
|---|---|---|---|
| using-superpowers | диспетчер | направляет на процессные | — |
| brainstorming | дизайн | writing-plans (только арх. путь) | `docs/superpowers/specs/*.md` |
| writing-plans | план | subagent-driven-development \| executing-plans | `docs/superpowers/plans/*.md` |
| subagent-driven-development | исполнение | using-git-worktrees, requesting-code-review (шаблон), finishing-a-development-branch | `.superpowers/sdd/<план>/`: ledger, брифы, пакеты ревью |
| executing-plans | исполнение | using-git-worktrees, finishing-a-development-branch | — |
| using-git-worktrees | изоляция | нативный тул или git | `.worktrees/<ветка>` |
| test-driven-development | дисциплина | — | тест → код → коммит |
| systematic-debugging | дисциплина | test-driven-development, verification-before-completion | failing test |
| verification-before-completion | дисциплина | — | свежий вывод команд |
| requesting-code-review | качество | сабагент-ревьюер | — |
| receiving-code-review | качество | — | — |
| finishing-a-development-branch | завершение | — (чистит worktrees суперпауэрса) | merge / PR |
| dispatching-parallel-agents | ортогональный | — | — |
| writing-skills | мета | test-driven-development (required background) | новый скилл (TDD: baseline-RED → скилл-GREEN → REFACTOR) |

## Человеко-гейты

| # | Гейт | Где |
|---|---|---|
| 1 | Одобрение дизайна до кода (на всех путях, даже bounded — «две фразы, но одобри») | brainstorming HARD GATE |
| 2 | Ревью написанной спеки | brainstorming |
| 3 | Выбор: сабагенты vs inline | writing-plans handoff |
| 4 | Согласие на worktree (если нет объявленного предпочтения) | using-git-worktrees |
| 5 | Четыре стопа SDD: необратимое, безопасность, side-effect наружу worktree, план сломан | subagent-driven-development |
| 6 | 3+ неудачных фикса → вопрос архитектуры | systematic-debugging |
| 7 | Меню merge / PR / оставить; discard только по слову «discard» | finishing-a-development-branch |
