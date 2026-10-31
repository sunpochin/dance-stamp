#!/usr/bin/env python3
"""檔案用途：用標準函式庫驗證套件完整與相對連結。所在層：維護檢查。主要關聯：tests/test_bundle.py、provenance.json。"""
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
IGNORED = {".git", "__pycache__", ".venv", "node_modules", "dist"}


def public_problems(path, content):
    problems = []
    if any(part == ".env" or part.startswith(".env.") for part in path.parts) or path.suffix in {".pem", ".p12", ".pfx", ".key"}:
        problems.append("protected-file")
    if re.search(r"ghp_[A-Za-z0-9]{36}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", content):
        problems.append("credential-pattern")
    if re.search(r"/(?:Users|home)/(?!example(?:/|\b))[^/\s]+", content):
        problems.append("personal-home-path")
    return problems


def link_errors(path, boundary):
    errors = []
    for link in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", path.read_text()):
        parsed = urlsplit(link)
        if parsed.scheme in {"https", "http", "mailto"}:
            continue
        if parsed.scheme or parsed.netloc:
            errors.append(f"{path.name}: unsupported-link")
            continue
        target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path.resolve()
        # 先核對邊界，不能因為作者機器剛好有那個檔案就把跨目錄相依判成通過。
        if not target.is_relative_to(boundary.resolve()):
            errors.append(f"{path.name}: escaped-reference")
        elif not target.is_file():
            errors.append(f"{path.name}: missing-reference")
    return errors


def validate_skill(skill):
    errors = []
    # 先拒絕連結再讀任何內容，避免檢查器自己跟著連結讀到套件以外的檔案。
    if skill.is_symlink():
        return [f"{skill.name}: symlink"]
    for path in skill.rglob("*"):
        if path.is_symlink():
            errors.append(f"{skill.name}/{path.name}: symlink")
    if errors:
        return errors
    for name in ["SKILL.md", "LICENSE", "NOTICE.md", "references/guide.md"]:
        if not (skill / name).is_file():
            errors.append(f"{skill.name}/{name}: missing-file")
    entry = skill / "SKILL.md"
    if not entry.is_file():
        return errors
    try:
        match = re.match(r"\A---\n(.*?)\n---\n", entry.read_text(), re.S)
        if not match:
            raise ValueError("frontmatter")
        # 本套件刻意只用 JSON 引號字串這個 YAML 子集，不自行實作通用 YAML parser。
        fields = {}
        for line in match[1].splitlines():
            key, value = line.split(":", 1)
            if key in fields:
                raise ValueError("duplicate field")
            fields[key] = json.loads(value)
        if set(fields) != {"name", "description", "license"} or any(not isinstance(v, str) or not v.strip() for v in fields.values()):
            raise ValueError("fields")
        name = fields["name"]
        if name != skill.name or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) or len(name) > 64:
            raise ValueError("name")
        if len(fields["description"]) > 1024 or fields["license"] != "MIT":
            raise ValueError("metadata")
    except (ValueError, TypeError):
        errors.append(f"{skill.name}: invalid-frontmatter")
    for path in skill.rglob("*"):
        if path.is_symlink():
            errors.append(f"{skill.name}/{path.name}: symlink")
            continue
        if path.is_file() and path.suffix == ".md":
            errors.extend(link_errors(path, skill))
            if path.name != "NOTICE.md" and re.search(r"dance[- ]stamp|jia[- ]jian[- ]log|patient_id|RECORD_COMPARE\.md", path.read_text(), re.I):
                errors.append(f"{skill.name}/{path.name}: product-dependency")
    return errors


def validate_repository(root):
    errors = []
    for path in root.rglob("*"):
        if not any(part in IGNORED for part in path.relative_to(root).parts) and path.is_symlink():
            errors.append(f"{path.relative_to(root)}: symlink")
    if errors:
        return errors
    provenance = json.loads((root / "provenance.json").read_text())
    skills = [path for path in (root / "skills").iterdir() if path.is_dir()]
    if {p.name for p in skills} != set(provenance["skills"]):
        errors.append("skills: provenance-mismatch")
    license_bytes = (root / "LICENSE").read_bytes()
    if hashlib.sha256(license_bytes).hexdigest() != provenance["sourceLicenseSha256"]:
        errors.append("LICENSE: source-notice-changed")
    for skill in skills:
        errors.extend(validate_skill(skill))
        if (skill / "LICENSE").is_file() and (skill / "LICENSE").read_bytes() != license_bytes:
            errors.append(f"{skill.name}: license-mismatch")
    for path in root.rglob("*"):
        if any(part in IGNORED for part in path.relative_to(root).parts):
            continue
        if path.is_symlink():
            errors.append(f"{path.relative_to(root)}: symlink")
            continue
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        # 先拒絕敏感檔名，不為了掃描而讀取這些檔案的內容。
        problems = public_problems(relative, "")
        if not problems:
            try:
                content = path.read_text()
            except UnicodeDecodeError:
                problems = ["unexpected-binary"]
            else:
                problems = public_problems(relative, content)
                if path.suffix == ".md" and "skills" not in relative.parts:
                    errors.extend(link_errors(path, root))
        errors.extend(f"{relative}: {problem}" for problem in problems)
    return errors


if __name__ == "__main__":
    problems = validate_repository(ROOT)
    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)
    print("Bundle check passed: complete skills, local references, notices and public-content patterns. Agent behavior is not certified.")
