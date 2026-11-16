from pathlib import Path

from test_app import client


def test_page_routes(client):
    _, request = client
    for route in ("/", "/t/app", "/t/merge", "/t/merge-dev"):
        assert request("GET", route)[0] == 200


def test_home_and_merge_markup():
    root = Path("app/web/templates")
    home = (root / "index.html").read_text()
    merge = (root / "merge.html").read_text()
    editor = (root / "editor.html").read_text()
    assert 'href="/t/app"' in home and 'href="/t/merge"' in home
    assert 'class="card hero-card"' in home
    assert 'data-i18n="hero.title"' in home and 'data-i18n="hero.description"' in home
    assert 'class="button-link" href="/t/app" data-i18n="hero.editCta"' in home
    assert 'href="/t/merge" data-i18n="hero.mergeCta"' in home
    assert 'hero-secondary' not in home
    assert home.count('class="button-link"') == 4
    assert '<img' not in home and 'style=' not in home
    css = (Path("app/web/static/css/merge.css")).read_text()
    assert ".hero-secondary" not in css
    assert ".hero-card .button-link,.home-card .button-link" in css
    assert 'app.css?v=15' in home and 'merge.css?v=6' in home
    assert 'href="/t/merge-dev"' not in home
    assert '<h1 class="ttl"><a class="brand-home-link" href="/">Video Editor</a></h1><h2 class="page-subtitle" data-i18n="page.singleEdit">Single Video Edit</h2>' in editor
    assert '<h1 class="ttl"><a class="brand-home-link" href="/">Video Editor</a></h1><h2 class="page-subtitle" data-i18n="page.merge">Video Merge</h2>' in merge
    assert 'class="home-link"' not in editor and 'class="home-link"' not in merge
    assert '<div class="work-status" aria-live="polite"><a class="home-control" href="/" data-i18n="nav.home">Home</a><span id="fileStatus"' in editor
    assert '<div class="work-status"><a class="home-control" href="/" data-i18n="nav.home">Home</a><span class="language-control"' in merge
    assert all('lang="en"' in page for page in (home, merge, editor))
    assert 'id="files" type="file"' in merge and "multiple" in merge
    assert 'id="mergeTimelineCanvas"' in merge and 'id="estimatedDuration"' in merge
    assert 'src="/static/js/app/merge.js"' in merge
