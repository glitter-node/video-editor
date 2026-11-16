from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_typography_tokens_and_readable_process_log_are_present():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    html = (ROOT / "app/web/templates/editor.html").read_text()
    for token in ("--font-size-caption", "--font-size-helper", "--font-size-status", "--font-size-log", "--line-height-helper", "--line-height-log"):
        assert token in css
    assert ".field-help,.group-help{font-size:var(--font-size-helper)" in css
    assert ".log{min-height:80px;padding:12px;font-size:var(--font-size-log);line-height:var(--line-height-log)" in css
    assert "overflow-wrap:anywhere" in css
    assert "overflow-y:auto" in css
    assert "@media(max-width:760px)" in css
    assert 'href="/static/css/app.css?v=14"' in html
