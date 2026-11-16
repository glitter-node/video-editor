import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_process_log_uses_a_valid_log_role_and_name():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    assert '<div id="log" class="log" role="log"' in html
    assert 'aria-label="Processing details"' in html
    assert 'aria-live="polite"' in html
    assert 'aria-atomic="false"' in html
    assert '<pre id="log"' not in html


def test_named_generic_regions_have_explicit_named_roles():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    assert 'id="timelineEditor" class="timeline-editor" hidden role="region"' in html
    assert 'id="timelineTrack" class="timeline-track" tabindex="0" role="group"' in html


def test_aria_id_references_resolve_to_template_ids():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    for attribute in ("aria-labelledby", "aria-describedby", "aria-controls", "aria-details"):
        for value in re.findall(rf'\b{attribute}="([^"]+)"', html):
            assert all(reference in ids for reference in value.split())
