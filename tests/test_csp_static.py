import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "app/web"


def test_templates_load_local_scripts_without_inline_execution():
    for template in (ROOT / "templates").glob("*.html"):
        html = template.read_text()
        scripts = re.findall(r"<script\b([^>]*)>(.*?)</script\s*>", html, re.I | re.S)
        for attributes, body in scripts:
            match = re.search(r'\bsrc\s*=\s*(["\'])(.*?)\1', attributes, re.I)
            assert match and match.group(2).startswith("/static/js/")
            assert not body.strip()
            assert (ROOT / match.group(2).split("?", 1)[0].lstrip("/")).is_file()
        assert not re.search(r"\son[a-z]+\s*=", html, re.I)
        assert not re.search(r"javascript\s*:", html, re.I)
        assert not re.search(r"\sstyle\s*=|<style\b", html, re.I)


def test_application_javascript_avoids_string_execution_and_html_injection():
    for source in (ROOT / "static/js/app").glob("*.js"):
        script = source.read_text()
        assert not re.search(r"\beval\s*\(|\bnew\s+Function\s*\(", script)
        assert not re.search(r"\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b", script)
        assert not re.search(r"\b(?:setTimeout|setInterval)\s*\(\s*['\"]", script)
