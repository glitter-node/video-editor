import http.client
import json
import mimetypes
import os
import secrets
import socket
import time
from pathlib import Path
from urllib.parse import quote, urlsplit


class SttClientError(Exception):
    def __init__(self, status_code: int | None = None, kind: str = "upstream_error"):
        super().__init__(kind)
        self.status_code = status_code
        self.kind = kind


class SharedSttClient:
    def __init__(self, base_url, api_key, connect_timeout, upload_timeout, request_timeout, retry_count):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.connect_timeout = connect_timeout
        self.upload_timeout = upload_timeout
        self.request_timeout = request_timeout
        self.retry_count = retry_count
        parsed = urlsplit(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.query or parsed.fragment:
            raise ValueError("Invalid STT base URL")
        self._scheme = parsed.scheme
        self._host = parsed.hostname
        self._port = parsed.port
        self._prefix = parsed.path.rstrip("/")

    def submit(self, path: str, filename: str, content_type: str | None, language: str) -> dict:
        boundary = f"----VideoEditor{secrets.token_hex(16)}"
        safe_name = "".join(char for char in os.path.basename(filename) if ord(char) >= 32 and char not in {"\x7f", '"'}) or "upload.bin"
        mime = content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        prefix = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n{language}\r\n" f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe_name.replace(chr(34), '')}\"\r\n" f"Content-Type: {mime}\r\n\r\n").encode("utf-8")
        suffix = f"\r\n--{boundary}--\r\n".encode("ascii")
        total = len(prefix) + Path(path).stat().st_size + len(suffix)
        connection = self._connection(self.upload_timeout)
        try:
            connection.putrequest("POST", self._path("/api/v1/transcriptions"))
            self._put_headers(connection, {"Content-Type": f"multipart/form-data; boundary={boundary}", "Content-Length": str(total)})
            connection.endheaders()
            connection.send(prefix)
            with open(path, "rb") as media:
                while chunk := media.read(1024 * 1024):
                    connection.send(chunk)
            connection.send(suffix)
            return self._read_json(connection)
        except (OSError, socket.timeout) as exc:
            raise SttClientError(kind="connection_error") from exc
        finally:
            connection.close()

    def get_status(self, upstream_job_id: str) -> dict:
        return self._request_json("GET", f"/api/v1/jobs/{quote(upstream_job_id, safe='')}", retry=True)

    def get_result(self, upstream_job_id: str) -> dict:
        return self._request_json("GET", f"/api/v1/jobs/{quote(upstream_job_id, safe='')}/result", retry=True)

    def cancel(self, upstream_job_id: str) -> dict:
        return self._request_json("POST", f"/api/v1/jobs/{quote(upstream_job_id, safe='')}/cancel", retry=False)

    def _request_json(self, method: str, path: str, retry: bool) -> dict:
        attempts = self.retry_count + 1 if retry else 1
        for attempt in range(attempts):
            connection = self._connection(self.request_timeout)
            try:
                connection.request(method, self._path(path), headers=self._headers())
                response = connection.getresponse()
                body = response.read(2 * 1024 * 1024)
                if 500 <= response.status <= 599 and attempt + 1 < attempts:
                    time.sleep(min(0.25 * (2**attempt), 1.0))
                    continue
                if response.status < 200 or response.status >= 300:
                    raise SttClientError(status_code=response.status, kind="upstream_http_error")
                return self._decode(body)
            except SttClientError:
                raise
            except (OSError, socket.timeout) as exc:
                if attempt + 1 < attempts:
                    time.sleep(min(0.25 * (2**attempt), 1.0))
                    continue
                raise SttClientError(kind="connection_error") from exc
            finally:
                connection.close()
        raise SttClientError(kind="connection_error")

    def _read_json(self, connection) -> dict:
        response = connection.getresponse()
        body = response.read(2 * 1024 * 1024)
        if response.status < 200 or response.status >= 300:
            raise SttClientError(status_code=response.status, kind="upstream_http_error")
        return self._decode(body)

    @staticmethod
    def _decode(body: bytes) -> dict:
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SttClientError(kind="invalid_upstream_response") from exc
        if not isinstance(value, dict):
            raise SttClientError(kind="invalid_upstream_response")
        return value

    def _connection(self, timeout: float):
        if self._scheme == "https":
            return http.client.HTTPSConnection(self._host, self._port, timeout=timeout)
        return http.client.HTTPConnection(self._host, self._port, timeout=timeout)

    def _path(self, path: str) -> str:
        return f"{self._prefix}{path}"

    def _headers(self, extra=None) -> dict:
        headers = {"X-API-Key": self.api_key or ""}
        if extra:
            headers.update(extra)
        return headers

    def _put_headers(self, connection, headers):
        for name, value in self._headers(headers).items():
            connection.putheader(name, value)
