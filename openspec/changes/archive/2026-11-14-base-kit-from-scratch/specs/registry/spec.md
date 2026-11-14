# Spec Delta

## REMOVED Requirements

### Requirement: Единая точка ведения yaml-реестра

**Reason**: Реестра в базовом комплекте нет вообще — всё необходимое
передаётся аргументами вызова (решение «base-kit from scratch»,
2026-11-14); вести нечего.
**Migration**: Схема реестра и текст скилла `registry` —
`examples/conveyor/` для проектов, которым нужен полный конвейер.

### Requirement: Валидация реестра при ведении

**Reason**: Без реестра в базе нет и его валидации.
**Migration**: Правила валидации и валидатор — `examples/conveyor/`
(снимок), применение — на стороне проекта, оживившего конвейер.

### Requirement: Версионирование и миграции формата реестра

**Reason**: `formatVersion` — жизненный цикл формата реестра; реестр не
часть базы, версионировать нечего.
**Migration**: Механика миграций — снимок в `examples/conveyor/docs/`.

### Requirement: Секция servers

**Reason**: Сопоставление alias→serverId было частью реестра; в базе
алиасы MCP передаются аргументами вызова и сверяются с settings.json
проекта (см. `base-skills`).
**Migration**: Схема секции — `examples/conveyor/docs/`.
