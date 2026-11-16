from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def luminance(color):
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    channels = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(first, second):
    light = luminance(first)
    dark = luminance(second)
    return (max(light, dark) + 0.05) / (min(light, dark) + 0.05)


def test_theme_contrast_tokens_are_present_and_readable():
    css = (ROOT / "app/web/static/css/app.css").read_text()
    for token in (
        "--color-disabled-bg",
        "--color-disabled-text",
        "--color-disabled-border",
        "--color-placeholder",
        "--color-secondary-bg",
        "--color-status-validating-bg",
        "--color-status-processing-bg",
        "--color-status-completed-bg",
        "--color-status-error-bg",
    ):
        assert token in css
    assert "button:disabled{opacity:1" in css
    assert "input:disabled,select:disabled{opacity:1" in css
    pairs = (
        ("#475569", "#e2e8f0"),
        ("#526174", "#ffffff"),
        ("#64748b", "#ffffff"),
        ("#aebed3", "#263449"),
        ("#9db0c6", "#111827"),
        ("#174ea6", "#ffffff"),
        ("#8ab5ff", "#111827"),
    )
    for foreground, background in pairs:
        assert contrast(foreground, background) >= 4.5
    assert "--color-disabled-text:#475569" in css
    assert "--color-disabled-bg:#e2e8f0" in css
    assert "--color-link:#174ea6" in css
    assert "--color-link:#8ab5ff" in css
    assert ".segchip,.download-panel a{color:var(--color-link)}" in css
