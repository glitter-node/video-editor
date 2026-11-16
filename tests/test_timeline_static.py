import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_timeline_markup_and_modules_are_present():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    css = (ROOT / "app/web/static/css/app.css").read_text()
    timeline = (ROOT / "app/web/static/js/app/timeline.js").read_text()
    time = (ROOT / "app/web/static/js/app/time.js").read_text()
    thumbnails = (ROOT / "app/web/static/js/app/thumbnails.js").read_text()
    ffmpeg = (ROOT / "app/web/static/js/app/ffmpeg.js").read_text()

    assert '<html lang="en"' in html
    assert 'id="timelineEditor"' in html
    assert 'id="timelinePlayhead"' in html
    assert 'id="trimStartHandle"' in html
    assert 'id="trimEndHandle"' in html
    assert 'id="timelineSegments"' in html
    assert 'id="timelineThumbnails"' in html
    assert 'id="timelineZoomIn"' in html
    assert 'id="timelineZoomOut"' in html
    assert 'id="timelineZoomFit"' in html
    assert 'id="loopTrim"' in html
    assert 'id="sourceNote"' in html
    assert 'id="timelineTrimState"' in html
    assert 'id="timelineSegmentCount"' in html
    assert 'id="outputFileName"' in html
    assert 'id="outputFileSize"' in html
    assert '<details class="keyboard-help">' in html
    assert 'src="/static/js/app/app.js?v=7"' in html
    assert 'href="/static/css/app.css?v=14"' in html
    assert 'data-theme="light"' in html
    assert 'id="themeSelect"' in html
    assert 'id="languageSelect"' in html
    assert 'from "./i18n.js"' in (ROOT / "app/web/static/js/app/app.js").read_text()
    assert "#inputPreview[hidden],#inputEmpty[hidden]{display:none!important}" in css
    assert html.count('id="inputPreview"') == 1
    assert 'class="source-preview"' in html
    assert "pointerdown" in timeline
    assert "pointercancel" in timeline
    assert "onSegmentChange" in timeline
    assert "onSegmentDelete" in timeline
    assert "setZoom" in timeline
    assert "formatTime" in time
    assert "AbortController" in thumbnails
    assert "HAVE_CURRENT_DATA" in thumbnails
    assert "Timed out waiting for" in thumbnails
    assert 'from "./filename.js"' in ffmpeg
    assert ".timeline-playhead{z-index:30" in css
    assert "box-shadow:0 0 0 1px #fff" in css
    assert ".segchip,.download-panel a{color:var(--color-link)}" in css


def test_editing_controls_are_visible_and_wired_once():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    css = (ROOT / "app/web/static/css/app.css").read_text()
    app = (ROOT / "app/web/static/js/app/app.js").read_text()
    controls = html.split('class="card controls-card"', 1)[1].split("</section>", 1)[0]

    for element_id in ("loopTrim", "undoBtn", "redoBtn", "segStart", "segEnd", "addSeg", "segList", "clearSegs"):
        assert html.count(f'id="{element_id}"') == 1
        assert f'id="{element_id}"' in controls
        assert f'"{element_id}"' in app

    assert controls.index("Remove Segments") < controls.index('data-i18n="controls.loopPlayback"')
    assert controls.index('data-i18n="controls.loopPlayback"') < controls.index('data-i18n="controls.editHistory"')
    assert 'data-i18n="controls.presets"' in controls
    assert "id=\"loopTrim\" type=\"checkbox\" disabled" in controls
    assert "id=\"undoBtn\" type=\"button\" class=\"secondary\" disabled" in controls
    assert "id=\"redoBtn\" type=\"button\" class=\"secondary\" disabled" in controls
    assert ".history-actions{display:flex" in css
    assert ".loop-control input{" in css
    assert 'el.loopTrim.addEventListener("change"' in app
    assert "el.undoBtn.onclick" in app
    assert "el.redoBtn.onclick" in app
    assert "el.addSeg.onclick" in app
    assert "el.clearSegs.onclick" in app
    assert "el.timelineTrimState.textContent" in app
    assert "el.outputFileSize.textContent" in app
    assert "function setSourcePreview(showVideo)" in app
    assert "setSourcePreview(false)" in app
    assert "setSourcePreview(true)" in app
    shortcuts = (ROOT / "app/web/static/js/app/shortcuts.js").read_text()
    assert '"toggle-playback"' in shortcuts
    assert '"seek-fine-backward"' in shortcuts
    assert '"trim-start"' in shortcuts
    assert '"undo"' in shortcuts
    assert 'event.preventDefault()' in shortcuts
    assert 'document.addEventListener("keydown"' in shortcuts


def test_clear_resets_source_metadata_and_invalidates_pending_file_work():
    app = (ROOT / "app/web/static/js/app/app.js").read_text()
    empty_branch = app.split("if (!state.file || !state.meta)", 1)[1].split("return;", 1)[0]
    for field in ("metaName", "metaType", "metaSize", "metaResolution", "metaDuration"):
        assert f'el.{field}.textContent = "—"' in empty_branch
    assert 'el.fileStatus.textContent = t("source.noFile")' in empty_branch
    assert 'el.sourceNote.textContent = t("source.choose")' in empty_branch
    assert "runToken += 1" in app
    assert "state.recipeEditToken += 1" in app
    assert "URL.revokeObjectURL(inputBlobUrl)" in app
    assert "el.file.value = \"\"" in app


def test_editor_ids_are_unique_and_mobile_controls_have_touch_space():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    css = (ROOT / "app/web/static/css/app.css").read_text()
    ids = re.findall(r'id="([^"]+)"', html)
    assert len(ids) == len(set(ids))
    assert '@media(max-width:760px)' in css
    assert '.timeline-tool{min-width:40px;min-height:38px' in css
    assert '.timeline-ruler{height:26px;font-size:11px}' in css
    assert '.source-grid,.control-grid{grid-template-columns:1fr}' in css
    assert '.source-preview{display:flex' in css


def test_theme_tokens_and_storage_module_are_present():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    theme = (ROOT / "app/web/static/js/app/theme.js").read_text()
    app = (ROOT / "app/web/static/js/app/app.js").read_text()
    for token in ("--color-bg", "--color-surface", "--color-text", "--color-primary", "--color-focus", "--color-playhead", "--color-trim-range", "--color-trim-handle", "--color-removed-segment"):
        assert token in css
    assert ':root[data-theme="dark"]' in css
    assert 'document.documentElement.dataset.theme' in theme
    assert 'localStorage' in theme
    assert 'initializeTheme(el.themeSelect)' in app
    assert 'initializeLanguage(el.languageSelect' in app
    assert 'document.documentElement.lang' in (ROOT / "app/web/static/js/app/i18n.js").read_text()


def test_header_is_single_row_and_old_descriptive_copy_is_removed():
    html = (ROOT / "app/web/templates/editor.html").read_text()
    css = (ROOT / "app/web/static/css/app.css").read_text()
    i18n = (ROOT / "app/web/static/js/app/i18n.js").read_text()
    assert '<p class="eyebrow"' not in html
    assert 'class="sub"' not in html
    assert 'data-i18n="header.workspace"' not in html
    assert 'data-i18n="header.subtitle"' not in html
    assert '<h1 class="ttl"><a class="brand-home-link" href="/">Video Editor</a></h1><h2 class="page-subtitle" data-i18n="page.singleEdit">Single Video Edit</h2>' in html
    assert 'id="fileStatus"' in html
    assert 'id="languageSelect"' in html
    assert 'id="themeSelect"' in html
    assert 'display:flex;align-items:center;justify-content:space-between' in css
    assert 'max-width:clamp(120px,24vw,300px)' in css
    assert '.hdr{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0;padding-bottom:0;border:0}' in css
    assert '.card{margin-top:16px' in css
    assert 'header.workspace' not in i18n
    assert 'header.subtitle' not in i18n


def test_card_depth_hover_and_motion_safety_rules_are_present():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    assert "--shadow-card:" in css
    assert "--shadow-card-hover:" in css
    assert ':root[data-theme="dark"]{--shadow-card:' in css
    assert "@media (hover:hover) and (pointer:fine)" in css
    assert ".source-card:hover,.controls-card:hover{box-shadow:var(--shadow-card-hover)" in css
    assert ".action-card:hover{box-shadow:var(--shadow-card-hover)" in css
    assert "button:hover:not(:disabled){box-shadow:var(--shadow-button)}" in css
    assert "@media (prefers-reduced-motion:reduce)" in css
    assert ".timeline-track" not in css.split("@media (hover:hover) and (pointer:fine)", 1)[1].split("@media (prefers-reduced-motion:reduce)", 1)[0]


def test_one_shot_card_wobble_is_limited_to_top_level_cards():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    assert "@keyframes card-wobble-once" in css
    assert "transform:translate(-2px,0)" in css
    assert "animation:card-wobble-once .45s ease-out 1 both" in css
    assert "animation-iteration-count:1" in css
    assert ".controls-card:hover:not(:has(:focus)),.action-card:hover:not(:has(:focus))" in css
    assert ".source-card:hover:not(:has(:focus))" not in css
    assert ".control-group:hover:not(:has(:focus))" not in css
    assert ".controls-card:hover,.action-card:hover{animation:none!important}" in css


def test_cursor_policy_preserves_links_and_timeline_controls():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    assert "cursor:text" in css
    assert "select:not(:disabled){cursor:pointer}" in css
    assert "input[type=\"checkbox\"]:not(:disabled)" in css
    assert "input[type=\"file\"]:not(:disabled)" in css
    assert "input:disabled,select:disabled,textarea:disabled{cursor:not-allowed}" in css
    assert "input[readonly],textarea[readonly]{cursor:default}" in css
    assert "a,a:hover{cursor:pointer}" in css
    assert "text-decoration" not in css.split("a,a:hover{cursor:pointer}", 1)[1].split("\n", 1)[0]
    assert ".timeline-handle" in css and "cursor:ew-resize" in css
    assert ".timeline-playhead" in css and "cursor:ew-resize" in css

