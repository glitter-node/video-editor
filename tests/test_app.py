import asyncio
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from app.core.config import Settings, load_settings
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'nested' / 'test.sqlite3'}")
    app = create_app(settings)

    def request(method, path, body=None, headers=None, include_headers=False):
        async def execute():
            sent = []
            payload = json.dumps(body).encode() if body is not None else b""
            request_headers = [(b"host", b"localhost")]
            if body is not None:
                request_headers.append((b"content-type", b"application/json"))
            request_headers.extend((key.lower().encode(), value.encode()) for key, value in (headers or {}).items())
            received = False

            async def receive():
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": payload, "more_body": False}
                return {"type": "http.disconnect"}

            async def send(message):
                sent.append(message)

            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "", "headers": request_headers, "client": ("127.0.0.1", 1234), "server": ("localhost", 80)}
            async with app.router.lifespan_context(app):
                await app(scope, receive, send)
            status = next(item["status"] for item in sent if item["type"] == "http.response.start")
            response_headers = next(item["headers"] for item in sent if item["type"] == "http.response.start")
            data = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
            if include_headers:
                return status, data, {key.decode().lower(): value.decode() for key, value in response_headers}
            return status, data

        return asyncio.run(execute())

    return settings, request


def test_standalone_startup_and_sqlite(client, tmp_path):
    _, request = client
    assert request("GET", "/healthz") == (200, b"ok")
    assert (tmp_path / "nested" / "test.sqlite3").exists()


def test_configuration_without_env(tmp_path):
    settings = load_settings(tmp_path / "missing.env")
    assert settings.database_url.startswith("sqlite:///")
    assert settings.cors_origins == []
    assert not settings.preset_write_enabled


def test_static_and_presets(client):
    _, request = client
    assert request("GET", "/static/ffmpeg/ffmpeg-core.wasm")[0] == 200
    assert request("GET", "/static/favicon.svg")[0] == 200
    assert request("GET", "/static/favicon.ico")[0] == 200
    assert request("GET", "/favicon.ico")[0] == 200
    status, body = request("GET", "/api/presets")
    assert status == 200
    assert "web_1080p" in body.decode()


def test_editor_declares_svg_and_ico_favicons(client):
    _, request = client
    assert request("GET", "/t/app")[0] == 200
    html = Path("app/web/templates/editor.html").read_text()
    assert html.count('<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">') == 1
    assert html.count('<link rel="alternate icon" href="/static/favicon.ico" type="image/x-icon">') == 1


def test_editor_declares_one_nonempty_meta_description():
    html = Path("app/web/templates/editor.html").read_text()
    description = '<meta name="description" content="Edit videos directly in your browser with timeline trimming, segment removal, and local processing. Your video stays on your device.">' 
    assert html.count('<meta name="description"') == 1
    assert description in html
    assert html.count('<link rel="canonical" href="https://vedit.glitter.kr/t/app">') == 1


def test_robots_and_sitemap_expose_only_the_public_editor(client):
    _, request = client
    robots_status, robots_body, robots_headers = request("GET", "/robots.txt", include_headers=True)
    assert robots_status == 200
    assert robots_headers["content-type"] == "text/plain; charset=utf-8"
    robots = robots_body.decode()
    assert "Allow: /t/app" in robots
    assert "Disallow: /api/" in robots
    assert "Sitemap: https://vedit.glitter.kr/sitemap.xml" in robots

    sitemap_status, sitemap_body, sitemap_headers = request("GET", "/sitemap.xml", include_headers=True)
    assert sitemap_status == 200
    assert sitemap_headers["content-type"] == "application/xml; charset=utf-8"
    root = ET.fromstring(sitemap_body)
    namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    locations = [node.text for node in root.findall(f"{namespace}url/{namespace}loc")]
    assert locations == ["https://vedit.glitter.kr/t/app"]
    assert "/api/" not in sitemap_body.decode()
    assert "/docs" not in sitemap_body.decode()
    assert "/openapi.json" not in sitemap_body.decode()
    assert sitemap_headers["content-security-policy"]
    assert sitemap_headers["x-content-type-options"] == "nosniff"


def test_csp_and_security_headers_cover_normal_and_rejected_requests(client):
    _, request = client
    for method, path, headers in (
        ("GET", "/t/app", None),
        ("GET", "/static/js/app/app.js", None),
        ("GET", "/static/css/app.css", None),
        ("GET", "/static/ffmpeg/ffmpeg-core.wasm", None),
        ("POST", "/api/plan", {"content-length": "65537"}),
    ):
        status, _, response_headers = request(method, path, headers=headers, include_headers=True)
        assert status == (413 if headers else 200)
        csp = response_headers["content-security-policy"]
        assert "script-src 'self' 'wasm-unsafe-eval'" in csp
        assert "style-src 'self'" in csp
        assert "object-src 'none'" in csp
        assert "worker-src 'self' blob:" in csp
        assert "unsafe-inline" not in csp
        assert "'unsafe-eval'" not in csp
        assert "content-security-policy-report-only" not in response_headers
        assert response_headers["x-content-type-options"] == "nosniff"
        assert response_headers["x-frame-options"] == "SAMEORIGIN"
        assert response_headers["cross-origin-opener-policy"] == "same-origin"
        assert response_headers["cross-origin-resource-policy"] == "same-origin"


def test_validation_and_concat_order(client):
    _, request = client
    data = {"meta": {"duration_ms": 10000, "width": 1280, "height": 720, "fps": 30, "has_audio": True}, "recipe": {"remove_segments": [{"start_ms": 3000, "end_ms": 5000}]}}
    assert request("POST", "/api/recipe/validate", data)[0] == 200
    status, body = request("POST", "/api/plan", data)
    assert status == 200
    assert "[v0][a0][v1][a1]concat=n=2:v=1:a=1" in json.loads(body)["ffmpeg_args"][1]


def test_audio_extraction_respects_cuts(client):
    _, request = client
    data = {"meta": {"duration_ms": 10000, "width": 1280, "height": 720, "fps": 30}, "recipe": {"trim": {"start_ms": 1000, "end_ms": 9000}, "remove_segments": [{"start_ms": 3000, "end_ms": 5000}], "audio": {"mode": "extract", "extract_format": "mp3"}}}
    status, body = request("POST", "/api/plan", data)
    assert status == 200
    args = json.loads(body)["ffmpeg_args"]
    assert "atrim=start=1.000:end=3.000" in args[1]
    assert "atrim=start=5.000:end=9.000" in args[1]


def test_invalid_input_and_write_authorization(client):
    settings, request = client
    data = {"meta": {"duration_ms": 1000, "width": 10, "height": 10, "fps": 30}, "recipe": {"scale": {"keep_aspect": False, "width": 100}}}
    assert request("POST", "/api/recipe/validate", data)[0] == 422
    preset = {"key": "sample", "label": "Sample", "recipe_patch": {}}
    assert request("POST", "/api/presets/custom", preset)[0] == 403
    settings.preset_write_enabled = True
    settings.preset_write_key = "test-secret"
    assert request("POST", "/api/presets/custom", preset)[0] == 401
    assert request("POST", "/api/presets/custom", preset, {"x-app-key": "test-secret"})[0] == 200
