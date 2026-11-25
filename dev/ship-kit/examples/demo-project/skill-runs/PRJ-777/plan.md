# Прогон PRJ-777 — экспорт отчётов в CSV

Порядок подтверждён: 2026-11-15 10:32 («да»; источник — макрос
«feature» из ship-kit.workflows.md; 🔒 — строки с гейтом).

- [x] 1. спека — openspec-скилл (discovery) → изменение prj-777-csv-export
- [x] 2. имплементация (TDD: красный → правка toCsv → зелёный) · 2 коммита feat(PRJ-777)
- [x] 3. ревью кода — чисто
- [x] 4. /ship-kit:pr — 🔒 карточка «пуш+PR» → PR-1 · MERGED
- [x] 5. /ship-kit:ci — 🔒 build #114 SUCCESS
- [x] 6. /ship-kit:ci — 🔒 deploy DEV #57 SUCCESS
- [x] 7. /ship-kit:ci — 🔒 deploy ST #23 FAILURE (infra → issues.md №1, эскалация)
- [x] 8. /ship-kit:ci — 🔒 deploy ST #24 SUCCESS (после «продолжи PRJ-777»)
- [x] 9. /ship-kit:ci — 🔒 deploy IFT #9 SUCCESS
- [x] 10. /ship-kit:ci — 🔒 deploy PSI #6 SUCCESS

## Журнал

- 10:32 — порядок подтверждён (🔒 на строках 4–10)
- 10:41 — спека готова: openspec-скилл, изменение prj-777-csv-export
- 10:58 — TDD зелёный, дословно: `OK: 2 теста зелёные (add, toCsv)`
- 11:03 — 🔒 «пуш+PR» confirmed → feature/PRJ-777, PR-1 создан
- 11:20 — PR-1 MERGED (замечаний не было)
- 11:21 — 🔒 build confirmed → calc-app #114 SUCCESS
- 11:26 — 🔒 deploy DEV confirmed → #57 SUCCESS
- 11:31 — 🔒 deploy ST confirmed → #23 FAILURE
- 11:33 — диагноз: DEVOPS-311 (массовая), FIXABLE: false → issues.md №1
       + эскалация DevOps; ретрай на том же агенте бесполезен
- 14:05 — «продолжи PRJ-777»: план сверен с реальностью (статусы
       джоб, PR-1), продолжение со строки 8
- 14:06 — 🔒 deploy ST confirmed → #24 SUCCESS
- 14:12 — 🔒 deploy IFT confirmed → #9 SUCCESS
- 14:19 — 🔒 deploy PSI confirmed → #6 SUCCESS — прогон завершён
