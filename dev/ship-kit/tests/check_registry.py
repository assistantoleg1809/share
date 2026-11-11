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
        if s.startswith("## "):
            cur = s[3:].strip()
            projects.setdefault(cur, {"_lines": {}})
            continue
        if not s or s.startswith("#"):
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
        TOP_KEYS = ALIASES | {"deploy", "runLimit", "errorPolicy", "branch"}
        prefix = {k.split(".")[0] for k in kv if "." in k}
        for al in prefix - TOP_KEYS:
            errors.append(f"{pname}: alias «{al}» вне фиксированного списка {sorted(ALIASES)}")
        MODELS = {"jenkins": ("job.path", "job.name"), "custom": ("launch.params",)}
        for base in ("mcp-build", "mcp-deploy"):
            if not any(k.startswith(base + ".") for k in kv):
                continue
            if f"{base}.server" not in kv:
                errors.append(f"{pname}: {base}: нет {base}.server")
            model = kv.get(f"{base}.model", "jenkins")
            if model not in MODELS:
                errors.append(f"{pname}: {base}.model «{model}» — неизвестная модель ({'|'.join(MODELS)})")
            else:
                for sub in MODELS[model]:
                    if f"{base}.{sub}" not in kv:
                        errors.append(f"{pname}: {base} (model={model}): нет {base}.{sub}")
        if any(k.startswith("mcp-sonar.") for k in kv) and "mcp-sonar.projectKey" not in kv:
            errors.append(f"{pname}: mcp-sonar: нет mcp-sonar.projectKey")
    print("\n".join(errors) if errors else f"УРОВЕНЬ 2: OK ({path.name})")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
