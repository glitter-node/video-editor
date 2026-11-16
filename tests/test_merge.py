import json
import shutil
import subprocess

import pytest

from app.api.merge_models import MergeRecipe
from app.api.merge_plan import build_merge_plan
from test_app import client


@pytest.fixture
def recipe():
    return {
        "inputs": [
            {"id": "a", "duration_ms": 30000, "width": 1920, "height": 1080, "fps": 30, "has_audio": True},
            {"id": "b", "duration_ms": 20000, "width": 1280, "height": 720, "fps": 24, "has_audio": False, "container": "webm"},
        ],
        "clips": [
            {"input_id": "a", "start_ms": 1000, "end_ms": 10000},
            {"input_id": "b", "start_ms": 2000, "end_ms": 15000},
        ],
        "output": {"container": "mp4", "width": 1280, "height": 720, "fps": 30, "video_codec": "libx264", "audio_codec": "aac"},
    }


def test_api_plan(client, recipe):
    _, request = client
    status, body = request("POST", "/api/merge/plan", recipe)
    assert status == 200
    plan = json.loads(body)
    assert plan["inputs"] == ["input_0.mp4", "input_1.webm"]
    assert plan["estimated_duration_ms"] == 22000
    assert plan["output_filename"] == "merged.mp4"
    assert "-i" not in plan["ffmpeg_args"]
    graph = plan["ffmpeg_args"][1]
    assert "[0:v]trim=start=1.000:end=10.000" in graph
    assert "[1:v]trim=start=2.000:end=15.000" in graph
    assert "[0:a]atrim" in graph
    assert "[1:a]" not in graph
    assert "anullsrc=r=48000:cl=stereo,atrim=duration=13.000" in graph
    assert "[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]" in graph
    assert "scale=1280:720" in graph and "fps=30" in graph


def test_order_reuse_and_three_clips(recipe):
    recipe["clips"] = [recipe["clips"][1], recipe["clips"][0], recipe["clips"][1]]
    plan = build_merge_plan(MergeRecipe.model_validate(recipe))
    graph = plan.ffmpeg_args[1]
    assert "[1:v]trim=start=2.000:end=15.000" in graph
    assert "[0:v]trim=start=1.000:end=10.000" in graph
    assert "[v0][a0][v1][a1][v2][a2]concat=n=3" in graph
    assert plan.estimated_duration_ms == 35000


@pytest.mark.parametrize("change", [
    lambda r: r["inputs"].pop(),
    lambda r: r["clips"].pop(),
    lambda r: r["inputs"][1].update(id="a"),
    lambda r: r["clips"][1].update(input_id="missing"),
    lambda r: r["clips"][0].update(start_ms=-1),
    lambda r: r["clips"][0].update(end_ms=1000),
    lambda r: r["clips"][0].update(end_ms=30001),
    lambda r: r["output"].update(video_codec="copy"),
    lambda r: r["output"].update(audio_codec="libopus"),
    lambda r: r["output"].update(container="webm"),
    lambda r: r.update(inputs=r["inputs"] * 11),
    lambda r: (r["inputs"][0].update(duration_ms=86400000), r["inputs"][1].update(duration_ms=86400000), r.update(clips=[{"input_id": "a", "start_ms": 0, "end_ms": 86400000}, {"input_id": "b", "start_ms": 0, "end_ms": 86400000}])),
    lambda r: r["clips"][1].update(input_id="a"),
    lambda r: r["output"].update(width=99999),
    lambda r: r["output"].update(height=721),
    lambda r: r["clips"][0].update(start_ms="1"),
])
def test_invalid_recipe(client, recipe, change):
    _, request = client
    change(recipe)
    status, _ = request("POST", "/api/merge/plan", recipe)
    assert status == 422


def test_audio_variants(recipe):
    recipe["inputs"][0]["has_audio"] = False
    graph = build_merge_plan(MergeRecipe.model_validate(recipe)).ffmpeg_args[1]
    assert graph.count("anullsrc=") == 2
    recipe["inputs"][0]["has_audio"] = True
    recipe["inputs"][1]["has_audio"] = True
    graph = build_merge_plan(MergeRecipe.model_validate(recipe)).ffmpeg_args[1]
    assert graph.count("atrim=start=") == 2
    assert "anullsrc=" not in graph


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_fps_rejected(recipe, value):
    from pydantic import ValidationError
    recipe["output"]["fps"] = value
    with pytest.raises(ValidationError):
        MergeRecipe.model_validate(recipe)


@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_nonfinite_json_rejected(client, recipe, value):
    _, request = client
    recipe["output"]["fps"] = value
    assert request("POST", "/api/merge/plan", recipe)[0] == 422


def test_existing_plan_unchanged(client):
    _, request = client
    body = {"meta": {"duration_ms": 10000, "width": 1280, "height": 720, "fps": 30, "has_audio": True}, "recipe": {}}
    status, response = request("POST", "/api/plan", body)
    assert status == 200
    assert json.loads(response)["mode"] == "video"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="system FFmpeg unavailable")
def test_system_ffmpeg_execution(tmp_path, recipe):
    first = tmp_path / "input_0.mp4"
    second = tmp_path / "input_1.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=15:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", str(first)], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=96x72:rate=12:duration=1", "-an", "-c:v", "libx264", str(second)], check=True, capture_output=True)
    recipe["inputs"][0].update(duration_ms=1000, width=160, height=90, fps=15)
    recipe["inputs"][1].update(duration_ms=1000, width=96, height=72, fps=12, container="mp4")
    recipe["clips"] = [{"input_id": "a", "start_ms": 100, "end_ms": 700}, {"input_id": "b", "start_ms": 100, "end_ms": 700}]
    recipe["output"].update(width=160, height=90, fps=15)
    plan = build_merge_plan(MergeRecipe.model_validate(recipe))
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(first), "-i", str(second), *plan.ffmpeg_args, str(tmp_path / plan.output_filename)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / plan.output_filename).stat().st_size > 0
