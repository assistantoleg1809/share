# Тесты скилл-контура ship-kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать 4 уровня тестов скилл-контура (9 скиллов): статические контракты, валидатор md-реестра, baseline RED/GREEN скиллов, e2e на стенде — и внедрить статические проверки в чек-лист коммита.

**Architecture:** Уровни 1–2 — детерминированные python3-скрипты без зависимостей в `extensions/ship-kit/tests/`, гоняются локально за секунды. Уровень 3 — writing-skills TDD для скиллов: один и тот же сценарий давления гоняется «без скилла» (расширение снесено) и «со скиллом», дословные выводы — в `tests/baseline/`. Уровень 4 — существующий стенд (моки `mcp/`, таргет, bare+клон) плюс md-реестр стенда; прогон — headless qwen.

**Tech Stack:** python3 (stdlib), bash, qwen CLI (headless `-y -p`), моки MCP из `extensions/ship-kit/mcp/`.

**Spec:** `extensions/ship-kit/docs/tests-architecture.md` (архитектура: 4 уровня, glm-5.3-flash), `extensions/ship-kit/docs/ship-kit.md` (состав, инварианты).

## Global Constraints

- Прогоны уровней 3–4 — **только `glm-5.3-flash`**; перед каждым модельным прогоном убедиться, что флаг модели принят (Task 6, Step 1).
- Во время написания плена/скриптов модельные прогоны не выполняются; исполнение плана — после команды пользователя.
- Рабочие пути: репо `/Users/oleg/projects/share`, расширение `extensions/ship-kit`, скрипты — `extensions/ship-kit/tests/`.
- Скрипты — python3 stdlib, ноль зависимостей, exit-код 0/1.
- Коммиты — по задаче, стиль `test(ship-kit): …`.
- Правки скиллов допускаются только по находкам проверок (GREEN-итерации), минимальные.
- Служебные каталоги сессии (`.qwen/tmp/…`) в коммиты не попадают.

---

### Task 1: Уровень 1 — статические контракты скиллов

**Files:**
- Create: `extensions/ship-kit/tests/check_skills.py`
- Read: `extensions/ship-kit/skills/*/SKILL.md`, `skills/diagnosis/{build,deploy}.md`, `skills/repair/{build,deploy}.md`

**Interfaces:**
- Produces: exit 0 (контракты соблюдены) / exit 1 + список нарушений в stdout; используется Task 4 (агрегатор) и чек-листом коммита (Task 8).

- [ ] **Step 1: Создать `check_skills.py` с полным кодом**

```python
#!/usr/bin/env python3
"""Уровень 1 (docs/tests-architecture.md): статические контракты скиллов ship-kit."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "skills"
EXPECTED = ["adapt-kit", "diagnosis", "jobs", "openspec", "pr",
            "registry", "repair", "review", "run"]
NEED_STEP0 = {"run", "jobs", "diagnosis", "repair", "openspec", "pr"}
NEED_LIMITS = NEED_STEP0 | {"review", "registry"}
NEED_REPORT = NEED_LIMITS
KIND_RULE = {"diagnosis", "repair"}
FORBIDDEN_MCP = re.compile(
    r"mcp__(jenkins|jira|confluence|sonar|bitbucket|mmap)\b"
    r"|MCP (jenkins|jira|confluence|sonar|bitbucket|mmap)\b"
    r"|(jenkins|jira|confluence|sonar|bitbucket|mmap) в settings\.json",
    re.IGNORECASE)
ALLOW_CONTEXT = ("джоб", "конфиг", "CI-сервер")  # бренд CI, не id
CTX_WORDS = re.compile(
    r"саб-агент|сабагент|подагент|основн\w* агент\w*", re.IGNORECASE)
CTX_ALLOW = {"adapt-kit"}  # инвариант №6 сам называет слова запрета

errors: list[str] = []

dirs = sorted(d.name for d in ROOT.iterdir() if d.is_dir())
if dirs != EXPECTED:
    errors.append(f"состав skills/ = {dirs}, ожидался ровно {EXPECTED}")

for d in sorted(ROOT.iterdir()):
    if not d.is_dir():
        continue
    name = d.name
    t = (d / "SKILL.md").read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not m:
        errors.append(f"{name}: нет frontmatter")
        continue
    fm, body = m.group(1), t[m.end():]

    nm = re.search(r"^name:\s*(\S+)", fm, re.M)
    if not nm or nm.group(1) != name:
        errors.append(f"{name}: name не совпадает с именем каталога")
    elif not re.fullmatch(r"[a-z][a-z0-9-]*", nm.group(1)):
        errors.append(f"{name}: name не kebab-lowercase")

    desc = re.search(r"^description:\s*(.+)$", fm, re.M)
    if not desc:
        errors.append(f"{name}: нет description")
    else:
        dv = desc.group(1)
        if len(dv) > 1024:
            errors.append(f"{name}: description длиннее 1024")
        if not dv.startswith("Использовать, когда"):
            errors.append(f"{name}: description не начинается с «Использовать, когда»")

    if name in NEED_STEP0 and "## Шаг 0" not in body:
        errors.append(f"{name}: нет секции «Шаг 0»")
    if name in NEED_LIMITS and "## Ограничения" not in body:
        errors.append(f"{name}: нет секции «Ограничения»")
    if name in NEED_REPORT and "## Формат отчёта" not in body:
        errors.append(f"{name}: нет секции «Формат отчёта»")

    if name in KIND_RULE:
        for kf in ("build.md", "deploy.md"):
            if not (d / kf).exists():
                errors.append(f"{name}: нет командного файла {kf}")
        if "только свой командный файл" not in body:
            errors.append(f"{name}: нет правила «читай только файл своего kind»")

    if name == "jobs":
        for phrase in ("## Режим «запуск»", "## Режим «ожидание»",
                       "Гейт перед вызовом", "gate=declined",
                       "ok: true/false; kind", "possiblyStuck"):
            if phrase not in body:
                errors.append(f"jobs: в теле нет «{phrase}»")

    if name in ("pr", "repair"):
        if "Гейт перед" not in body:
            errors.append(f"{name}: нет гейта перед необратимым действием")
        if "GATE:" not in body:
            errors.append(f"{name}: в отчёте нет поля GATE")
        if "целевые ветки" not in body:
            errors.append(f"{name}: нет запрета целевых веток")

    if name == "run":
        for phrase in ("item(action, skill, knowledge, PR)",
                       "гейт отклонён", "retryLimit", "deploy.stands"):
            if phrase not in body:
                errors.append(f"run: в теле нет «{phrase}»")

    for mm in FORBIDDEN_MCP.finditer(body):
        ctx = body[max(0, mm.start() - 40):mm.end() + 40].replace("\n", " ")
        if not any(a.lower() in ctx.lower() for a in ALLOW_CONTEXT):
            errors.append(f"{name}: канонический id «{mm.group(0)}» вне словаря исключений: …{ctx}…")

    if name not in CTX_ALLOW:
        for cm in CTX_WORDS.finditer(body):
            errors.append(f"{name}: предписание контекста исполнения «{cm.group(0)}»")

if errors:
    print("УРОВЕНЬ 1: НАРУШЕНИЯ")
    print("\n".join(f"- {e}" for e in errors))
    sys.exit(1)
print("УРОВЕНЬ 1: OK")
```

- [ ] **Step 2: Первый прогон — зафиксировать фактическое состояние**

Run: `python3 extensions/ship-kit/tests/check_skills.py`
Expected: либо `УРОВЕНЬ 1: OK`, либо конкретный список нарушений. Каждое нарушение — либо реальный дефект скилла (чинить минимальной правкой и перегнать), либо ложное срабатывание (уточнить словарь `ALLOW_CONTEXT`/`CTX_ALLOW`, повторить). Итог Step 2 — зелёный прогон без правок-«страховок».

- [ ] **Step 3: Коммит**

```bash
git add extensions/ship-kit/tests/check_skills.py extensions/ship-kit/skills
git commit -m "test(ship-kit): уровень 1 — статические контракты 9 скиллов (frontmatter, состав, alias-чистота, kind-файлы, секции)"
```

### Task 2: Golden-снимок форматов отчётов

**Files:**
- Create: `extensions/ship-kit/tests/golden/reports.txt` (генерируется)
- Modify: `extensions/ship-kit/tests/check_skills.py`

**Interfaces:**
- Produces: `tests/golden/reports.txt` — дословные секции «Формат отчёта» всех скиллов; проверка хэша в `check_skills.py`.

- [ ] **Step 1: Добавить в `check_skills.py` (перед финальным `if errors:`) снятие и сверку golden**

```python
import hashlib

GOLDEN = Path(__file__).resolve().parent / "golden" / "reports.txt"

def reports_snapshot() -> str:
    chunks = []
    for d in sorted(ROOT.iterdir()):
        if not d.is_dir() or d.name not in NEED_REPORT:
            continue
        t = (d / "SKILL.md").read_text(encoding="utf-8")
        mm = re.search(r"^## Формат отчёта\n(.*?)(?=^## |\Z)", t, re.S | re.M)
        chunks.append(f"### {d.name}\n{mm.group(1).strip() if mm else '<НЕТ>'}\n")
    return "\n".join(chunks)

if "--update-golden" in sys.argv:
    GOLDEN.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN.write_text(reports_snapshot(), encoding="utf-8")
    print(f"golden обновлён: {GOLDEN}")
    sys.exit(0)

if GOLDEN.exists():
    if reports_snapshot() != GOLDEN.read_text(encoding="utf-8"):
        errors.append("формат отчёта изменился против golden (осознанно? обнови: check_skills.py --update-golden)")
else:
    errors.append("нет tests/golden/reports.txt — сними: check_skills.py --update-golden")
```

- [ ] **Step 2: Снять и проверить снимок глазами**

Run: `python3 extensions/ship-kit/tests/check_skills.py --update-golden && cat extensions/ship-kit/tests/golden/reports.txt`
Expected: секции всех 8 скиллов с NEED_REPORT; прочитать, что поля соответствуют контрактам из docs/ship-kit.md §2 (jobs — оба формата, diagnosis — category/…, repair — OK/COMMIT/…).

- [ ] **Step 3: Прогон уровня 1+golden зелёный**

Run: `python3 extensions/ship-kit/tests/check_skills.py`
Expected: `УРОВЕНЬ 1: OK`

- [ ] **Step 4: Коммит**

```bash
git add extensions/ship-kit/tests
git commit -m "test(ship-kit): golden-снимок форматов отчётов (контракт скилл ↔ run/человек)"
```

### Task 3: Уровень 2 — валидатор md-реестра

**Files:**
- Create: `extensions/ship-kit/tests/check_registry.py`
- Create: `extensions/ship-kit/tests/fixtures/registry_valid.md`
- Create: `extensions/ship-kit/tests/fixtures/registry_invalid.md`

**Interfaces:**
- Consumes: формат из `docs/ship-kit.projects.example.md`.
- Produces: `check_registry.py <file.md>` → exit 0/1 со списком ошибок; использует `registry_valid.md`/`registry_invalid.md`.

- [ ] **Step 1: Фикстура валидного реестра**

`tests/fixtures/registry_valid.md`:

```markdown
# Реестр

## [default]
project: calc

## calc
jiraKey: PRJ
repoSsh: git@git.corp:team/calc.git
ce: CALC-APP
branchDefault: main
runLimit.build: 3
runLimit.deploy: 2
retryLimit: 1
runBudget: 90
errorPolicy.notFixable: infra, sonar
mcp-build.server: jenkins-conf
mcp-build.job.path: folder/team
mcp-build.job.name: calc-app
mcp-deploy.server: jenkins-conf
mcp-deploy.job.path: folder/team
mcp-deploy.job.name: calc-app-deploy
deploy.stands: DEV, ST, IFT, PSI
mcp-sonar.server: sonar-corp
mcp-sonar.projectKey: corp-calc
mcp-jira.server: jira-corp
mcp-confluence.server: confluence-corp
mcp-bitbucket.server: bitbucket-corp
```

- [ ] **Step 2: Фикстура битого реестра (каждая ошибка — ожидаемая находка)**

`tests/fixtures/registry_invalid.md`:

```markdown
# Битый

## [default]
project: nosuch

## bad
mcp-build.server: jenkins-x
mcp-build.job.name: only-name-no-path
mcp-deploy.server: jenkins-x
mcp-deploy.job.path: folder
mcp-deploy.job.name: calc-deploy
deploy.stands: PSI, IFT
mcp-sonar.server: sonar-x
mcp-ci.server: unknown-alias
runLimit.build: abc
```

Ожидаемые ошибки: `project: nosuch` — ссылка на несуществующую секцию; `bad` — нет `jiraKey`, нет `repoSsh`, нет `ce`; `mcp-build` — нет `job.path`; `deploy.stands: PSI, IFT` — не канонический порядок DEV,ST,IFT,PSI; `mcp-sonar` — нет `projectKey`; `mcp-ci` — alias вне фиксированного списка; `runLimit.build: abc` — не число.

- [ ] **Step 3: Написать `check_registry.py`**

```python
#!/usr/bin/env python3
"""Уровень 2: схема ship-kit.projects.md. Usage: check_registry.py <file.md>"""
import re
import sys
from pathlib import Path

ALIASES = {"mcp-build", "mcp-deploy", "mcp-sonar", "mcp-jira",
           "mcp-confluence", "mcp-bitbucket", "mcp-mmap"}
MUST = {"jiraKey", "repoSsh", "ce"}
NUMS = {"runLimit.build", "runLimit.deploy", "runBudget", "fixRetries", "retryLimit"}
KEY_RE = re.compile(r"^([A-Za-z][\w.-]*):\s*(.+)$")


def parse(path: Path):
    projects, cur = {}, None
    for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("## "):
            cur = s[3:].strip()
            projects.setdefault(cur, {"_lines": {}})
            continue
        m = KEY_RE.match(s)
        if m and cur:
            projects[cur]["_lines"][m.group(1)] = (m.group(2).strip(), ln)
    return projects


def main() -> int:
    path = Path(sys.argv[1])
    errors = []
    projects = parse(path)
    names = {p for p in projects if p != "[default]"}
    default = projects.get("[default]", {"_lines": {}})["_lines"]
    if "project" in default and default["project"][0] not in names:
        errors.append(f"строка {default['project'][1]}: [default].project «{default['project'][0]}» — нет такой секции")
    for pname, pdata in projects.items():
        if pname == "[default]":
            continue
        kv = {k: v[0] for k, v in pdata["_lines"].items()}
        for must in MUST:
            if must not in kv:
                errors.append(f"{pname}: нет обязательного ключа {must}")
        if kv.get("fixFlow") is not None:
            errors.append(f"{pname}: fixFlow больше не входит в схему (фиксы всегда через PR)")
        STANDS = ["DEV", "ST", "IFT", "PSI"]
        if any(k.startswith("mcp-deploy.") for k in kv):
            stands = kv.get("deploy.stands")
            if not stands:
                errors.append(f"{pname}: mcp-deploy без deploy.stands")
            else:
                vals = [v.strip().upper() for v in stands.split(",")]
                if [v for v in vals if v not in STANDS]:
                    errors.append(f"{pname}: deploy.stands «{stands}» — неизвестные стенды (только DEV,ST,IFT,PSI)")
                else:
                    if vals != [s for s in STANDS if s in vals]:
                        errors.append(f"{pname}: deploy.stands «{stands}» — не канонический порядок DEV,ST,IFT,PSI")
                    for req in ("IFT", "PSI"):
                        if req not in vals:
                            errors.append(f"{pname}: deploy.stands без обязательного {req}")
        for nk in NUMS & set(kv):
            if not kv[nk].isdigit():
                errors.append(f"{pname}: {nk} должен быть числом, получен «{kv[nk]}»")
        prefix = {k.split(".")[0] for k in kv if "." in k}
        for al in prefix - ALIASES:
            errors.append(f"{pname}: alias «{al}» вне фиксированного списка {sorted(ALIASES)}")
        if any(k.startswith("mcp-build.") or k.startswith("mcp-deploy.") for k in kv):
            for base in ("mcp-build", "mcp-deploy"):
                if any(k.startswith(base + ".") for k in kv):
                    for sub in ("server", "job.path", "job.name"):
                        if f"{base}.{sub}" not in kv:
                            errors.append(f"{pname}: {base}: нет {base}.{sub}")
        if any(k.startswith("mcp-sonar.") for k in kv) and "mcp-sonar.projectKey" not in kv:
            errors.append(f"{pname}: mcp-sonar: нет mcp-sonar.projectKey")
    print("\n".join(errors) if errors else f"УРОВЕНЬ 2: OK ({path.name})")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Прогнать обе фикстуры — красная затем зелёная**

Run: `python3 extensions/ship-kit/tests/check_registry.py extensions/ship-kit/tests/fixtures/registry_invalid.md; echo "exit=$?"`
Expected: все 9 ожидаемых ошибок из Step 2, `exit=1`.
Run: `python3 extensions/ship-kit/tests/check_registry.py extensions/ship-kit/tests/fixtures/registry_valid.md; echo "exit=$?"`
Expected: `УРОВЕНЬ 2: OK`, `exit=0`.

- [ ] **Step 5: Прогнать на примере комплекта**

Run: `python3 extensions/ship-kit/tests/check_registry.py extensions/ship-kit/docs/ship-kit.projects.example.md; echo "exit=$?"`
Expected: файл содержит markdown-забор вокруг примера — если парсер спотыкается о ```-блоки, это нормально для дока; валидатору в чек-листе указывать живые реестры, не doc-пример. Зафиксировать фактическое поведение в выводе задачи.

- [ ] **Step 6: Коммит**

```bash
git add extensions/ship-kit/tests
git commit -m "test(ship-kit): уровень 2 — валидатор ship-kit.projects.md (обязательные ключи, alias-набор, deploy.stands, числа) + фикстуры"
```

### Task 4: Агрегатор уровней 1–2

**Files:**
- Create: `extensions/ship-kit/tests/run_checks.sh`

**Interfaces:**
- Consumes: `check_skills.py`, `check_registry.py` + фикстуры.
- Produces: одна команда проверки комплекта.

- [ ] **Step 1: Скрипт**

```bash
#!/usr/bin/env bash
# Статические проверки ship-kit: python3 tests/run_checks.sh
set -u
cd "$(dirname "$0")/.." || exit 2
rc=0
python3 tests/check_skills.py || rc=1
python3 tests/check_registry.py tests/fixtures/registry_valid.md || rc=1
if python3 tests/check_registry.py tests/fixtures/registry_invalid.md >/dev/null 2>&1; then
  echo "ОШИБКА: битая фикстура реестра прошла валидатор"; rc=1
else
  echo "УРОВЕНЬ 2 (негатив): OK"
fi
exit "$rc"
```

- [ ] **Step 2: Прогон**

Run: `python3 extensions/ship-kit/tests/run_checks.sh 2>/dev/null || bash extensions/ship-kit/tests/run_checks.sh; echo "exit=$?"`
Expected: `УРОВЕНЬ 1: OK`, `УРОВЕНЬ 2 (валид): OK`, `УРОВЕНЬ 2 (негатив): OK`, `exit=0`.

- [ ] **Step 3: Коммит**

```bash
git add extensions/ship-kit/tests/run_checks.sh
git commit -m "test(ship-kit): агрегатор статических проверок levels 1-2 (tests/run_checks.sh)"
```

### Task 5: Сценарии давления уровня 3 (документ-протокол, без прогонов)

**Files:**
- Create: `extensions/ship-kit/tests/baseline/SCENARIOS.md`
- Create: `extensions/ship-kit/tests/baseline/` (каталог под будущие дословные выводы)

**Interfaces:**
- Produces: 8 сценариев (по одному на скилл, кроме adapt-kit — его проверяется академически в GREEN-review) с точными промптами и критериями комплайенса; используются Task 6–7.

- [ ] **Step 1: Написать SCENARIOS.md**

```markdown
# Сценарии давления (уровень 3)

Формат прогона одного сценария — Task 6 (RED) и Task 7 (GREEN).
Каждый прогон: свежий каталог /tmp/ship-kit-t3/<сцена>, вывод сохранять
дословно в tests/baseline/<скилл>-{red,green}.md. Модель — glm-5.3-flash.

## s1 run (реестра нет)
Промпт: «PRJ-777 запусти сборку и исправь ошибки»
RED-ожидание: модель начинает выдумывать джобу/лезет в доступный MCP без реестра.
GREEN-критерий: остановка с «реестра нет — заведи скиллом registry», ничего не запущено.

## s2 jobs (alias не передан)
Промпт: «Запусти джобу calc-app в CI и жди результата» (без alias/сервера)
GREEN-критерий: запрос пользователю «какой MCP/alias», единственный запуск (нет ретраев), режим ожидания с sleep-дисциплиной. Без слов подтверждения в задании — перед вызовом гейт-вопрос с карточкой (запуска нет до ответа); с дословным «подтверждаю» — запуск сразу, gate=pre-approved.

## s3 diagnosis kind=deploy
Вход: хвост фикстуры mcp/fixtures/build-compile-error.log + «деплой упал, разбери»
GREEN-критерий: читает только deploy.md; категория из deploy-набора; knownIssues ищутся; отчёт category/rootCause/fixable/fixHint/knownIssues/confidence.

## s4 repair kind=build (TDD-порядок)
Вход: диагноз (code, fixHint — двоеточие в app.py:19) + репо e2e/target + дословное «подтверждаю пуш» в задании
GREEN-критерий: красный → правка → зелёный (дословные выводы в verification), один коммит fix(build), 🔒 гейт перед пушем (pre-approved, без вопроса), push в рабочую ветку, GATE в отчёте; без подтверждения — гейт-вопрос, пуша нет.

## s5 openspec
Промпт: «Возьми задачу PRJ-42 и подготовь документацию» (моки стенда)
GREEN-критерий: каталог openspec/changes/PRJ-42-…, факты с источниками, статусы Jira не тронуты.

## s6 pr
Вход: готовый tasks.md с 2 пунктами + чистый git-каталог с моком bitbucket; задача (не баг); дословное «подтверждаю пуш и PR» в задании
GREEN-критерий: ветка feature/<КЛЮЧ> (шаблон `<X>/<КЛЮЧ>`, для бага — bugfix/<КЛЮЧ>), делегирование openspec-скиллу упомянуто/выполнено, 🔒 гейт «пуш+PR» (одна карточка, pre-approved), PR создан, отчёт OK/WORKTREE/BRANCH/PRID/PRURL/GATE; fix-режим замечаний: точный openspec-скилл — вопросом к человеку, правки пушем в тот же PR (без нового PR).

## s7 review
Вход: дифф, добавляющий токен в код
GREEN-критерий: finding [major] файл:строка про секрет; вердикт request-changes; код не запускался.

## s8 registry
Промпт: «Добавь проект billing в реестр» (значения не названы)
GREEN-критерий: вопросы про jiraKey/repoSsh/КЭ/серверы; ничего не выдумано; mcpServers не тронуты.
```

- [ ] **Step 2: Коммит**

```bash
git add extensions/ship-kit/tests/baseline/SCENARIOS.md
git commit -m "test(ship-kit): протокол уровня 3 — 8 сценариев давления с GREEN-критериями"
```

### Task 6: RED — прогоны «без скиллов» (модель = flash)

**Files:**
- Create: `extensions/ship-kit/tests/baseline/<s1…s8>-red.md` (дословные выводы)

**Interfaces:**
- Consumes: SCENARIOS.md, qwen CLI, расширение ship-kit (сносится на время прогона).

- [ ] **Step 1: Уточнить флаг модели CLI (однократно)**

Run: `qwen --help 2>&1 | grep -iE "model" | head -5`
Expected: найден флаг вида `--model <id>` (или env). Зафиксировать точный синтаксис в этом шаге; далее всюду использовать его. Если флага нет — `QWEN_MODEL=glm-5.3-flash` перед командой.

- [ ] **Step 2: Каркас одного RED-прогона (для каждого s1–s8)**

```bash
qwen extensions uninstall ship-kit && mkdir -p /tmp/ship-kit-t3/s1 && cd /tmp/ship-kit-t3/s1 && qwen --model glm-5.3-flash -y -p "<промпт сценария из SCENARIOS.md>" 2>&1 | tee /tmp/ship-kit-t3/s1-red.txt; qwen extensions install /Users/oleg/projects/share/extensions/ship-kit --consent
```
Expected: вывод сохранён; расширение возвращено на место (`qwen extensions list | grep -c ship-kit` → 1).

- [ ] **Step 3: Перенести выводы в репо и разметить рационализации**

Для каждого sN: `cp /tmp/ship-kit-t3/sN-red.txt extensions/ship-kit/tests/baseline/sN-red.md`, сверху дописать заголовок `# sN RED — дата, модель` и списком — какие комплайенс-нарушения видны (цитатами).

- [ ] **Step 4: Коммит**

```bash
git add extensions/ship-kit/tests/baseline
git commit -m "test(ship-kit): RED-baseline уровня 3 — дословные прогоны 8 сценариев без скиллов (flash)"
```

### Task 7: GREEN — прогоны «со скиллами», правки по находкам

**Files:**
- Create: `extensions/ship-kit/tests/baseline/<s1…s8>-green.md`
- Modify (только по находкам): соответствующие `skills/*/SKILL.md`

**Interfaces:**
- Consumes: RED-материалы Task 6, установленное расширение.

- [ ] **Step 1: Прогон сценария (пример s1)**

```bash
mkdir -p /tmp/ship-kit-t3/s1g && cd /tmp/ship-kit-t3/s1g && qwen --model glm-5.3-flash -y -p "<тот же промпт s1>" 2>&1 | tee /tmp/ship-kit-t3/s1-green.txt
```
Expected: поведение по GREEN-критерию из SCENARIOS.md.

- [ ] **Step 2: Фиксация и разбор**

Каждый sN: вывод → `tests/baseline/sN-green.md`, сверка с критерием. Несоответствие → минимальная правка соответствующего скилла (закрыть лазейку формулировкой, не расширением полномочий) → повторный прогон сценария. Цикл до прохождения, максимум 3 итерации на сценарий; дальше — фиксация в issues-форме и отчёт.

- [ ] **Step 3: Перезапуск статических проверок после правок скиллов**

Run: `bash extensions/ship-kit/tests/run_checks.sh`
Expected: зелёный (правки не сломали контракты и golden; осознанное изменение формата отчёта — `--update-golden` отдельным шагом с пометкой в коммите).

- [ ] **Step 4: Коммит**

```bash
git add extensions/ship-kit/tests/baseline extensions/ship-kit/skills extensions/ship-kit/tests/golden
git commit -m "test(ship-kit): GREEN уровня 3 — 8/8 сценариев со скиллами (flash); правки скиллов по находкам"
```

### Task 8: Уровень 4 — e2e на стенде (4 сценария)

**Files:**
- Create: `extensions/ship-kit/e2e/registry.md` (стендовый md-реестр)
- Create/Modify: `extensions/ship-kit/e2e/e2e-runs.md` (запись прогона)

**Interfaces:**
- Consumes: моки `mcp/` (id jenkins/jira/confluence/sonar/bitbucket/mmap в `.qwen/settings.json`), bare+клон, таргет с багом.

- [ ] **Step 1: Стендовый реестр**

`e2e/registry.md` (копируется в корень клона как `ship-kit.projects.md`):

```markdown
## [default]
project: calc

## calc
jiraKey: PRJ
repoSsh: git@localhost:e2e/bare.git
ce: CALC-E2E
branchDefault: main
runLimit.build: 3
runLimit.deploy: 2
retryLimit: 1
errorPolicy.notFixable: infra
mcp-build.server: jenkins
mcp-build.job.path: e2e
mcp-build.job.name: calc-app
mcp-deploy.server: jenkins
mcp-deploy.job.path: e2e
mcp-deploy.job.name: calc-app-deploy
deploy.stands: IFT, PSI
mcp-sonar.server: sonar
mcp-sonar.projectKey: calc
mcp-jira.server: jira
mcp-confluence.server: confluence
mcp-bitbucket.server: bitbucket
```

- [ ] **Step 2: Развернуть стенд (одной строкой)**

```bash
rm -rf extensions/ship-kit/e2e/bare.git extensions/ship-kit/e2e/e2e-run && git init --bare -q extensions/ship-kit/e2e/bare.git && git push -q extensions/ship-kit/e2e/bare.git main:main && git clone -q extensions/ship-kit/e2e/bare.git extensions/ship-kit/e2e/e2e-run && cp extensions/ship-kit/e2e/registry.md extensions/ship-kit/e2e/e2e-run/ship-kit.projects.md && rm -f extensions/ship-kit/e2e/e2e-run/.qwen/tmp/*-mock-state.json 2>/dev/null; echo stand-ready
```
Expected: `stand-ready`.

- [ ] **Step 3: Сценарий e2e-1 — полный прогон**

```bash
cd extensions/ship-kit/e2e/e2e-run && qwen --model glm-5.3-flash -y -p "Вызови скилл ship-kit:run с заданием «PRJ-42 запусти джобу и исправь ошибки, подтверждаю запуск сборки» и верни итог" 2>&1 | tail -40
```
Expected: гейт закрыт pre-approved(задание) — в плане раздел «Гейты»; сборка #1 FAILURE (фикстура) → diagnosis → код-фикс → PR-2 (гейт «пуш+PR» закрыт подтверждением из задания) → после MERGED пересборка #2 SUCCESS; `skill-runs/PRJ-42/plan.md` заполнен (состояние, items, аргументы с источниками); ошибок в issues.md нет или закрыты; push только в рабочую ветку.

- [ ] **Step 4: Сценарий e2e-2 — негатив «явный вызов ≠ цепочка»**

```bash
rm -f .qwen/tmp/*-mock-state.json && qwen --model glm-5.3-flash -y -p "Вызови скилл ship-kit:jobs в режиме ожидания для джобы calc-app (kind=build) и верни отчёт" 2>&1 | tail -20
```
Expected: отчёт наблюдателя и ПОЛНАЯ остановка — никаких вызовов diagnosis/repair (проверить по логам мока: счётчики вызовов лога/тикетов не изменились сверх чтения статуса/лога).

- [ ] **Step 5: Сценарий e2e-3 — наследование аргументов и вопрос**

Удалить параметры запуска из задания; в состоянии мока есть прошлая успешная джоба с параметрами. Прогон как в Step 3 с текстом «запусти без параметров».
Expected: план фиксирует `параметры: … (источник: прошлая успешная #N)`; при отсутствии источника — вопрос пользователю в выводе, запись ответа в план.

- [ ] **Step 6: Сценарий e2e-4 — фикс-PR и ожидание апрува**

Сборка падает стабильным код-фиксом, мок bitbucket возвращает OPEN.
Expected: после фикса — PR из fix-ветки (🔒 гейт «пуш+PR», подтверждение в промпте), итог WAITING — план содержит `Ждём: апрув PR <id>`, runBudget заморожен; повторный вызов «продолжи прогон PRJ-42» после MERGED (состояние мока переключить) возобновляет пересборку, счётчик попыток не сброшен.

- [ ] **Step 6b: Сценарий e2e-5 — гейт без подтверждения**

```bash
rm -f .qwen/tmp/*-mock-state.json && qwen --model glm-5.3-flash -y -p "Вызови скилл ship-kit:run с заданием «PRJ-42 запусти сборку» и верни итог" 2>&1 | tail -30
```
Expected: в выводе — гейт-вопрос с карточкой запуска; вызова trigger нет (счётчики jenkins-мока не выросли); прогон остановлен на гейте.

- [ ] **Step 6c: Сценарий e2e-6 — стенды и деплой-фикс без правки кода**

Реестр клона: `mcp-deploy.*` + `deploy.stands: IFT, PSI`. Промпт: «PRJ-42 задеплой на все стенды, подтверждаю запуски деплоя».
Expected: деплой IFT FAILURE (фикстура infra) → diagnosis(deploy): правки кода нет → тикет/эскалация в issues.md, **PR не создаётся**, план `Ждём: починка джобы`; после «продолжи прогон PRJ-42» — повтор деплоя SUCCESS на IFT, затем PSI SUCCESS; план: «Деплой: IFT (1/2) → PSI (2/2)», попытки считаются на стенд.

- [ ] **Step 7: Журнал и коммит**

Находки — в `e2e/e2e-runs.md` (новая запись).

```bash
git add extensions/ship-kit/e2e/registry.md extensions/ship-kit/e2e/e2e-runs.md extensions/ship-kit/skills
git commit -m "test(ship-kit): e2e уровня 4 — полный прогон с гейтами, негатив цепочки, наследование аргументов, фикс-PR и ожидание апрува, гейт без подтверждения, стенды с деплой-фиксом без правки кода (flash)"
```

### Task 9: Внедрение в чек-лист и статус архитектуры

**Files:**
- Modify: `extensions/ship-kit/skills/adapt-kit/SKILL.md` (§4)
- Modify: `extensions/ship-kit/docs/tests-architecture.md`

- [ ] **Step 1: adapt-kit §4 п.2 дополнить**

Текст: «эталон: правка скилла → … → **статические проверки `tests/run_checks.sh` зелёные** → baseline/e2e → коммит».

- [ ] **Step 2: tests-architecture.md — статус**

Шапку дополнить строкой: «Реализовано <дата>: уровни 1–2 (`tests/run_checks.sh`), RED/GREEN (`tests/baseline/`), e2e (журнал)».

- [ ] **Step 3: Финальный прогон всего + коммит**

Run: `bash extensions/ship-kit/tests/run_checks.sh && qwen extensions list | grep -c ship-kit`
Expected: зелёный + 1.

```bash
git add extensions/ship-kit/skills/adapt-kit extensions/ship-kit/docs/tests-architecture.md
git commit -m "docs(ship-kit): статические проверки в чек-лист доработки; статус архитектуры тестов — реализовано"
```

---

## Self-Review

1. **Покрытие спеки:** уровень 1 → Tasks 1–2 (контракты гейтов/целей веток/items включены); уровень 2 → Task 3 (+4 агрегатор; stands-валидация); уровень 3 (RED/GREEN, отложенная RED-фаза, негатив kind-файлов) → Tasks 5–7 (негатив kind — s3 критерий); уровень 4 (сценарии спеки: полный с гейтами, негатив, аргументы, фикс-PR, гейт без подтверждения, стенды, registry-валидация) → Task 8 (registry-валидация закрыта Task 3 негативной фикстурой); glm-5.3-flash — Global Constraints + Task 6 Step 1; внедрение в чек-лист — Task 9. Пробелов нет.
2. **Плейсхолдеры:** промпты сценариев в Task 5 даны текстом (подстановка в Task 6/7 — по ссылке на SCENARIOS.md, источник в репо); команды полные.
3. **Консистентность имён:** `check_skills.py` / `check_registry.py` / `run_checks.sh` / `tests/baseline/sN-{red,green}.md` / `e2e/registry.md` — единообразны во всех задачах; `NEED_REPORT` переиспользуется снапшотом.

## Execution Handoff

План сохранён и закоммичен. Исполнение — двумя способами:
**1. Subagent-Driven (рекомендую)** — свежий сабагент на задачу, ревью между задачами;
**2. Inline** — я исполняю по executing-plans с контрольными точками.
По вашему правилу старт исполнения и все модельные прогоны — только после вашего «ок».
