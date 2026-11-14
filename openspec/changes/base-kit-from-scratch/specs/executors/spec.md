# Spec Delta

## REMOVED Requirements

### Requirement: Манифест позиций

**Reason**: Словарь позиций (analyst/courier/operator/detective/mechanic)
и их подмены — слой косвенности конвейера; в базе три скилла-фазы с
прямыми именами (см. `base-skills`).
**Migration**: Манифест — `examples/conveyor/docs/`.

### Requirement: Скиллы-исполнители комплекта (Профессии, 7)

**Reason**: Состав поставки меняется: с нуля пишутся три скилла
`task`/`pr`/`ci`; имена analyst/courier/operator/doctor/registry/
adapt-kit/run в поставке не существуют.
**Migration**: Поведение базы — capability `base-skills`; v2-тексты —
`examples/conveyor/`.

### Requirement: Исполнители получают MCP и джобы из записи своей стадии

**Reason**: Источник аргументов меняется: не запись реестра, а аргументы
вызова от человека (см. `base-skills`).
**Migration**: Механика записей знания — `examples/conveyor/docs/`.

### Requirement: Ask-правила позиции

**Reason**: Табличные ask-правила позиций заменяются едиными тремя
правилами гейтов необратимого для всех скиллов базы (см. `base-skills`).
**Migration**: Ask-таблицы — тексты скиллов в `examples/conveyor/`.

### Requirement: Производный kind для knowledge-пака

**Reason**: Командные файлы build/deploy остаются, но выбираются по kind
запуска внутри `ci`, без стадийной модели (см. `base-skills`).
**Migration**: Правило kind-пака — снимок в `examples/conveyor/docs/`.

### Requirement: PR только через владельца позиции

**Reason**: Владелец доставки больше не «позиция courier», а скилл `pr`;
правка+доставка — фазы, вызываемые человеком явно (см. `base-skills`).
**Migration**: Правило pullRequestOwner — снимок в
`examples/conveyor/docs/`.
