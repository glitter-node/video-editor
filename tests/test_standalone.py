import asyncio
import json
import tempfile
from contextlib import contextmanager
from pathlib import Path

from app.core.config import Settings
from app.core.db import create_database
from app.main import create_app


class StandaloneTests:
    def assertEqual(self, actual, expected):
        assert actual == expected, (actual, expected)

    def assertTrue(self, actual):
        assert actual

    def assertIn(self, expected, actual):
        assert expected in actual, (expected, actual)

    @contextmanager
    def assertRaises(self, expected):
        try:
            yield
        except expected:
            return
        raise AssertionError(f"Expected {expected.__name__}")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "nested" / "test.sqlite3"
        self.settings = Settings(database_url=f"sqlite:///{self.db_path}")
        self.app = create_app(self.settings)

    def tearDown(self):
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        async def run():
            sent = []
            payload = json.dumps(body).encode() if body is not None else b""
            pairs = [(b"host", (headers or {}).get("host", "localhost").encode())]
            if body is not None:
                pairs.append((b"content-type", b"application/json"))
            pairs.extend((key.lower().encode(), value.encode()) for key, value in (headers or {}).items() if key.lower() != "host")
            received = False

            async def receive():
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": payload, "more_body": False}
                return {"type": "http.disconnect"}

            async def send(message):
                sent.append(message)

            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "", "headers": pairs, "client": ("127.0.0.1", 1), "server": ("localhost", 80)}
            async with self.app.router.lifespan_context(self.app):
                await self.app(scope, receive, send)
            status = next(item["status"] for item in sent if item["type"] == "http.response.start")
            data = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
            return status, data

        return asyncio.run(run())

    def test_pages_health_and_database(self):
        for path in ("/", "/healthz", "/t/app", "/t/min", "/static/ffmpeg/ffmpeg-core.wasm"):
            self.assertEqual(self.request("GET", path)[0], 200)
        self.assertTrue(self.db_path.is_file())
        engine, _ = create_database(f"sqlite:///{self.db_path}")
        try:
            with engine.connect() as connection:
                self.assertEqual(connection.exec_driver_sql("PRAGMA foreign_keys").scalar(), 1)
                self.assertEqual(connection.exec_driver_sql("PRAGMA busy_timeout").scalar(), 5000)
        finally:
            engine.dispose()

    def test_plan_and_validation(self):
        body = {"meta": {"duration_ms": 10000, "width": 1280, "height": 720, "fps": 30, "has_audio": True}, "recipe": {"trim": {"start_ms": 1000, "end_ms": 9000}, "remove_segments": [{"start_ms": 3000, "end_ms": 5000}]}}
        self.assertEqual(self.request("POST", "/api/recipe/validate", body)[0], 200)
        status, raw = self.request("POST", "/api/plan", body)
        self.assertEqual(status, 200)
        self.assertIn("[v0][a0][v1][a1]concat=n=2:v=1:a=1", json.loads(raw)["ffmpeg_args"][1])
        body["recipe"]["audio"] = {"mode": "extract", "extract_format": "mp3"}
        status, raw = self.request("POST", "/api/plan", body)
        self.assertEqual(status, 200)
        self.assertIn("atrim=start=5.000:end=9.000", json.loads(raw)["ffmpeg_args"][1])
        body["recipe"]["remove_segments"] = [{"start_ms": 0, "end_ms": 10000}]
        self.assertEqual(self.request("POST", "/api/recipe/validate", body)[0], 422)

    def test_preset_authorization_and_persistence(self):
        preset = {"key": "sample", "label": "Sample", "recipe_patch": {"audio": {"mode": "mute"}}}
        self.assertEqual(self.request("POST", "/api/presets/custom", preset)[0], 403)
        self.settings.preset_write_enabled = True
        self.settings.preset_write_key = "test-secret"
        self.assertEqual(self.request("POST", "/api/presets/custom", preset)[0], 401)
        auth = {"x-app-key": "test-secret"}
        self.assertEqual(self.request("POST", "/api/presets/custom", preset, auth)[0], 200)
        self.assertIn("sample", self.request("GET", "/api/presets")[1].decode())
        preset["recipe_patch"] = {"unknown": True}
        self.assertEqual(self.request("POST", "/api/presets/custom", preset, auth)[0], 422)
        self.assertEqual(self.request("DELETE", "/api/presets/custom/sample", headers=auth)[0], 200)

    def test_security_and_sqlite_only(self):
        with self.assertRaises(ValueError):
            Settings(database_url="mysql+pymysql://localhost/video")
        self.assertEqual(self.request("GET", "/healthz", headers={"host": "evil.example"})[0], 400)
        self.assertEqual(self.request("POST", "/api/plan", {"payload": "x" * 65536})[0], 413)


if __name__ == "__main__":
    suite = StandaloneTests()
    methods = [name for name in dir(suite) if name.startswith("test_")]
    for name in methods:
        suite.setUp()
        try:
            getattr(suite, name)()
            print(f"PASS {name}")
        finally:
            suite.tearDown()
    print(f"{len(methods)} tests passed")
