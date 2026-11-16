import hmac

from fastapi import HTTPException, Request


def require_preset_write(request: Request) -> None:
    settings = request.app.state.settings
    if not settings.preset_write_enabled or not settings.preset_write_key:
        raise HTTPException(status_code=403, detail="Preset writes are disabled")
    supplied = request.headers.get("x-app-key", "")
    if not hmac.compare_digest(supplied, settings.preset_write_key):
        raise HTTPException(status_code=401, detail="Invalid preset write key")
