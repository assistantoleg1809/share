#!/usr/bin/env python3
"""Уровень 1 (dev/ship-kit/tests-architecture.md): статические контракты скиллов ship-kit."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "extensions" / "ship-kit" / "skills"
EXPECTED = ["adapt-kit", "diagnosis", "jobs", "openspec", "pr",
            "registry", "repair", "run"]
NEED_STEP0 = {"run", "jobs", "diagnosis", "repair", "openspec", "pr"}
NEED_LIMITS = NEED_STEP0 | {"registry"}
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
