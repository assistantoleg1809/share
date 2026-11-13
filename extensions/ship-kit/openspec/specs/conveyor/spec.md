# conveyor Specification

## Purpose

Диспетчер прогона: как скилл `run` ведёт конвейер стадий проекта — обход,
вызов позиций, обработка падений, фикс-циклы, ожидания, остановки и гейты.

## Requirements

### Requirement: Обход конвейера по стадиям

Скилл `run` MUST обходить стадии проекта в порядке `pipelineOrder` из
yaml-реестра. Фикс-стадии в обход не входят: вызываются по падению стадии
(`fixesStageId`) или по замечаниям PR (`triggeredBy`).

#### Scenario: полный прогон

- **WHEN** задание «полный прогон <тег>», проект calc (`pipelineOrder: [do, build, deploy]`)
- **THEN** run проходит do → build → deploy; каждый запуск джобы (включая каждый стенд) — через 🔒 гейт; итог SUCCESS только при зелёных сборке и всех стендах

#### Scenario: возврат после MERGED

- **WHEN** фикс-стадия получила MERGED своего PR
- **THEN** run продолжает обход со стадии `nextStageId` этой фикс-стадии (fixBuild → build; fixDeploy → build — пересборка, затем стенды заново)

#### Scenario: вход fixDo по замечаниям

- **WHEN** у PR-1 стадии do есть нерешённые замечания ревью, а у fixDo `triggeredBy: pullRequestReview`
- **THEN** run вызывает fixDo (позиции analyst, courier); замечания правятся пушем в тот же PR-1; кругов больше `maxFixAttempts` или DECLINED — задача в issues.md, стоп

### Requirement: Вызов позиций по kind стадии

Набор позиций стадии MUST определяться kind по манифесту комплекта (DO →
analyst, courier; BUILD/DEPLOY → operator; FIX_DO → analyst, courier;
FIX_BUILD → analyst, mechanic, courier; FIX_DEPLOY → mechanic, courier);
поле `positions` стадии может только сузить набор. Исполнители позиций
берутся из `executors` проекта (дефолты — скиллы комплекта). У фикс-стадии
после диагноза вызывается одна позиция: категория «код» → analyst, «не-код»
→ mechanic, если она есть у стадии.

#### Scenario: не-код с объявленной mechanic

- **WHEN** build упала, `doctor: diagnose` дал категорию «не-код», fixable, у fixBuild есть позиция mechanic
- **THEN** run вызывает исполнителя позиции mechanic (дефолт ship-kit:doctor в режиме fix): TDD-фикс, 🔒 карточка пуша, PR-2, MERGED → пересборка

#### Scenario: не-код без mechanic

- **WHEN** категория «не-код», а позиции mechanic у фикс-стадии нет
- **THEN** исход notFixable: задача в issues.md, прогон STOPPED

### Requirement: Исходы падения деплоя: WAIT и notFixable

После `doctor: diagnose` падения деплоя run MUST различать: fixable-правка
репозитория → фикс-стадия (PR-3); not-fixable категории infra/devops-known
(чинить вне репозитория) → WAIT — правок репозитория нет, PR не создаётся,
прогон и бюджет заморожены, возобновление «продолжи прогон <тег>» через 🔒
гейт; прочий notFixable → issues.md, STOPPED.

#### Scenario: деплой упал — инфраструктура

- **WHEN** deploy упал на стенде, категория `devops-known`
- **THEN** прогон WAIT («починка джобы»); после «продолжи прогон» — повтор деплоя через 🔒 гейт

### Requirement: Счётчики и loop guard по id стадии

Попытки, retry и строка плана MUST ключоваться id стадии, а не действием;
`maxRuns` — на стадию (деплой — на каждый стенд), `maxRetries` — повтор
flaky/таймаута без нового гейта. Круг фикс-цикла «фикс → PR → MERGED →
перезапуск» = +1 к `maxFixAttempts`; новый PR счётчик не сбрасывает;
исчерпан — STOPPED.

#### Scenario: две сборки с независимыми лимитами

- **WHEN** `pipelineOrder: [do, buildApp, buildLib, deploy]`, buildApp исчерпал `maxRuns`, очередь дошла до buildLib
- **THEN** buildLib запускается со своим независимым счётчиком попыток

#### Scenario: loop guard

- **WHEN** fixBuild прошёл третий круг «фикс → PR-2..N → MERGED → пересборка», а `maxFixAttempts: 2`
- **THEN** run останавливает прогон с задачей в issues.md, новой попытки фикса нет

### Requirement: Гейт-контракт prepare → confirm → apply

Необратимое действие (запуск джобы, пуш, создание PR) MUST выполняться в три
шага: исполнитель готовит карточку (payload: для джобы — kind, джоба, ветка,
стенд, параметры с источниками; для пуша — ветка, коммиты, суть; для PR —
ветка, база, описание) и не применяет; карточка-превью показывается человеку;
применение — отдельный вызов, только подтверждённой карточки. Нет «да» =
ничего не применено (fail-closed), отказ = STOPPED без молчаливых
альтернатив.

#### Scenario: отказ гейта

- **WHEN** человек ответил «нет» на карточку запуска джобы
- **THEN** вызова запуска нет; прогон STOPPED «гейт отклонён»; в плане карточка с исходом declined

### Requirement: Подтверждение привязано к карточке

`pre-approved(источник)` и `inherited(причина)` MUST действовать только для
идентичной карточки: flaky-повтор тех же параметров наследует гейт без
вопроса; изменение хотя бы одного параметра — новая карточка и новый вопрос.

#### Scenario: параметры изменились

- **WHEN** сборка #N была подтверждена, а после фикса запуск идёт с изменённым параметром
- **THEN** наследования нет — новая карточка, новый вопрос человеку

### Requirement: Вето проекта на категории диагноза

Категория из `errorPolicy.unfixableCategories` MUST блокировать запуск
фикс-стадии заранее, даже если диагноз помечает падение fixable.

#### Scenario: sonar под вето

- **WHEN** диагноз категории `sonar`, а `unfixableCategories: [infra, sonar]`
- **THEN** фикс-стадия не вызывается; прогон STOPPED с задачей в issues.md
