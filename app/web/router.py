from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse, Response

router = APIRouter()
TEMPLATES = Path(__file__).resolve().parent / "templates"
STATIC = Path(__file__).resolve().parent / "static"
ROBOTS = "User-agent: *\nAllow: /t/app\nDisallow: /api/\nDisallow: /docs\nDisallow: /redoc\nDisallow: /openapi.json\n\nSitemap: https://vedit.glitter.kr/sitemap.xml\n"
SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://vedit.glitter.kr/t/app</loc>\n  </url>\n</urlset>\n'


@router.get("/", include_in_schema=False)
def index():
    return FileResponse(TEMPLATES / "index.html", media_type="text/html")


@router.head("/", include_in_schema=False)
def index_head():
    return Response(status_code=204)


@router.get("/t/app", include_in_schema=False)
def app_page():
    return FileResponse(TEMPLATES / "editor.html", media_type="text/html")


@router.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(STATIC / "favicon.ico", media_type="image/x-icon")


@router.get("/robots.txt", include_in_schema=False)
def robots():
    return PlainTextResponse(ROBOTS)


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    return Response(content=SITEMAP, media_type="application/xml; charset=utf-8")


@router.head("/t/app", include_in_schema=False)
def app_head():
    return Response(status_code=204)


@router.get("/t/min", include_in_schema=False)
def minimal_page():
    return FileResponse(TEMPLATES / "minimal.html", media_type="text/html")


@router.get("/t/merge-dev", include_in_schema=False)
def merge_dev_page():
    return FileResponse(TEMPLATES / "merge-dev.html", media_type="text/html")


@router.get("/t/merge", include_in_schema=False)
def merge_page():
    return FileResponse(TEMPLATES / "merge.html", media_type="text/html")


@router.head("/t/min", include_in_schema=False)
def minimal_head():
    return Response(status_code=204)


@router.get("/healthz", include_in_schema=False)
def health():
    return PlainTextResponse("ok")
