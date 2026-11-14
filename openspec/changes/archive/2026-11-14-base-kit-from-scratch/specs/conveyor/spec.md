# Spec Delta

## REMOVED Requirements

### Requirement: Обход конвейера по стадиям

**Reason**: Диспетчер `run` и стадийная модель покидают поставку — база
строится на фазовых скиллах без прозаического движка (решение
«base-kit from scratch», 2026-11-14).
**Migration**: Полный конвейер как образец — `examples/conveyor/`
(тексты скиллов копируются в `.qwen/skills` проекта); семантика — снимок
спеки в `examples/conveyor/docs/`.

### Requirement: Вызов позиций по kind стадии

**Reason**: Позиции и kind-стадии — механика диспетчера `run`, не входящая
в базу; единица работы базы — фаза, вызываемая человеком.
**Migration**: Манифест позиций и правила kind — в `examples/conveyor/docs/`.

### Requirement: Исходы падения деплоя: WAIT и notFixable

**Reason**: Обработку исходов вёл `run`; в базе падения разбирает секция
диагностики `ci`, не-кодовые уходят в issues.md с эскалацией
человеку (см. `base-skills`).
**Migration**: Режим WAIT и категории — снимок в `examples/conveyor/docs/`.

### Requirement: Счётчики и loop guard по id стадии

**Reason**: Счётчики вёл `run` по стадиям реестра; в базе единственная
учётная запись — попытки числом в строке чек-листа plan.md.
**Migration**: Правила счётчиков — снимок в `examples/conveyor/docs/`.

### Requirement: Гейт-контракт prepare → confirm → apply

**Reason**: Полный контракт с prepare/apply-разделением принадлежит
движку; база использует три простых правила гейтов без отдельных фаз
вызова (см. `base-skills`).
**Migration**: Контракт — снимок в `examples/conveyor/docs/` и текст
скилла `run` в примере.

### Requirement: Подтверждение привязано к карточке

**Reason**: Семантика наследования подтверждений по идентичности карточки
удалена как непроверяемая в прозе («криптография карточек»); повтор
flaky-джобы — переспрос одной строкой (см. `base-skills`).
**Migration**: Снимок в `examples/conveyor/docs/`.

### Requirement: Вето проекта на категории диагноза

**Reason**: `errorPolicy.unfixableCategories` — правило реестра и
диспетчера; ни того, ни другого в базе нет.
**Migration**: Схема реестра и вето — `examples/conveyor/docs/`.
