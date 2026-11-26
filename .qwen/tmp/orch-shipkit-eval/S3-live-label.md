# S3 — Живой носитель slot:spec и все слот-метки проекта (отчёт агента S3, 2026-11-26)

Контроль оркестратора (grep -n): `slot:spec` — строка **3** файла (файл 175 строк) — совпадает с заявкой агента.

## (1) Цитата description openspec-propose + вердикт дословного совпадения

Файл: `/Users/oleg/projects/share/.agents/skills/openspec-propose/SKILL.md`, **строка 3** (frontmatter: стр.1 `---`, стр.2 `name`, стр.3 `description`, стр.4 `allowed-tools`):

```
description: Propose a new OpenSpec change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation. Also use when the user says "openspec propose" or "opsx propose". slot:spec
```

Метка в конце строки — `slot:spec`. Вердикт: **дословно совпадает** с искомой строкой `slot:spec` — строчные буквы, без пробела после двоеточия, без дополнительных символов. (В системном каталоге скиллов сессии она отображается как «slot:spec (project)», но «(project)» — системная метка location, в файле её нет.)

## (2) Таблица: 9 SKILL.md → slot-метки в frontmatter description

| Файл | slot-метки в description (дословно) | Кандидат слота |
|---|---|---|
| `.agents/skills/openspec-propose/SKILL.md` | `slot:spec` (стр. 3) | **spec** |
| `.agents/skills/openspec-apply-change/SKILL.md` | — не найдено | нет |
| `.agents/skills/openspec-archive-change/SKILL.md` | — не найдено | нет |
| `.agents/skills/openspec-explore/SKILL.md` | — не найдено | нет |
| `.agents/skills/openspec-sync-specs/SKILL.md` | — не найдено | нет |
| `.agents/skills/openspec-update-change/SKILL.md` | — не найдено | нет |
| `skills/ship-kit-task/SKILL.md` | — не найдено (в description) | нет |
| `skills/ship-kit-pr/SKILL.md` | — не найдено | нет |
| `skills/ship-kit-ci/SKILL.md` | — не найдено | нет |

Все 9 frontmatter перечислены полностью, не выборка. Контрольный grep по явным путям (`path=/Users/oleg/projects/share/.agents/skills` и `path=/Users/oleg/projects/share/skills`, паттерн `(?i)slot\s*:` — ловит и регистр, и пробел после двоеточия) дал ровно 3 совпадения в репо: одно в frontmatter (см. выше) и два в **теле** ship-kit-task — стр. 87 (``метка `slot:spec` в…``, описание каскада) и стр. 95 (`` `slot:business`/`slot:technical`…``). Эти два — упоминания словаря слотов в тексте инвариантов, а не носители меток в frontmatter; в таблицу носителей они не входят.

## (3) Вывод

- **Кандидатов слота `spec` в живой среде проекта — ровно один**: openspec-propose (`.agents/skills/openspec-propose/SKILL.md`, стр. 3). Словарь комплекта называет spec каноническим слотом — один кандидат ему соответствует.
- **Дословность**: совпадает — `slot:spec`, строчные, без пробела после двоеточия.
- **Посторонних меток в frontmatter нет**: ни в одном из 9 description нет меток вне словаря; `slot:tuning` — не найдено нигде. Единственные вхождения других слот-имён (`slot:business`, `slot:technical`) — это текст механики в теле ship-kit-task (стр. 87, 95), не метки скиллов.
