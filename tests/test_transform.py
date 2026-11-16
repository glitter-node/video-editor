import json
import shutil
import subprocess

import pytest
from pydantic import ValidationError

from test_app import client as imported_client

from app.api.plan import plan
from app.api.video import Recipe, ValidateRequest, VideoMeta, _output_dimensions, validate

META = {"duration_ms": 1000, "width": 64, "height": 32, "fps": 10, "has_audio": True}


def make_plan(recipe: dict):
    request = ValidateRequest.model_validate({
        "meta": META,
        "recipe": recipe,
    })
    return plan(request)


@pytest.mark.parametrize(
    ("transform", "expected"),
    [
        ({}, None),
        ({"rotation": 90}, "transpose=1"),
        ({"rotation": 180}, "hflip,vflip"),
        ({"rotation": 270}, "transpose=2"),
        ({"flip_horizontal": True}, "hflip"),
        ({"flip_vertical": True}, "vflip"),
        ({"rotation": 90, "flip_horizontal": True}, "transpose=1,hflip"),
        ({"rotation": 270, "flip_vertical": True}, "transpose=2,vflip"),
        ({"flip_horizontal": True, "flip_vertical": True}, "hflip,vflip"),
        ({"rotation": 90, "flip_horizontal": True, "flip_vertical": True}, "transpose=1,hflip,vflip"),
    ],
)
def test_filter_order(transform, expected):
    graph = make_plan({"transform": transform}).ffmpeg_args[1]
    if expected is None:
        assert not any(token in graph for token in ("transpose=", "hflip", "vflip"))
    else:
        assert f",{expected}[v0]" in graph


@pytest.mark.parametrize("value", [-90, 45, 360, "90", 90.0, True, None])
def test_invalid_rotation(value):
    with pytest.raises(ValidationError):
        Recipe.model_validate({"transform": {"rotation": value}})


@pytest.mark.parametrize("key,value", [("flip_horizontal", 1), ("flip_horizontal", "true"), ("flip_vertical", 0), ("flip_vertical", None)])
def test_invalid_flip(key, value):
    with pytest.raises(ValidationError):
        Recipe.model_validate({"transform": {key: value}})


def test_invalid_transform_shape_and_extra_field():
    for value in (None, [], {"flip_diagonal": True}):
        with pytest.raises(ValidationError):
            Recipe.model_validate({"transform": value})


@pytest.fixture(name="api_client")
def provide_api_client(api_client_fixture):
    return api_client_fixture

def test_legacy_recipe_and_api(api_client):
    request = {
        "meta": META,
        "recipe": {"crop": {"x": 0, "y": 0, "w": 32, "h": 32}},
    }
    _, send = api_client
    status, body = send("POST", "/api/recipe/validate", request)
    assert status == 200
    assert json.loads(body)["normalized"]["transform"] == {"rotation": 0, "flip_horizontal": False, "flip_vertical": False}
    request["recipe"]["transform"] = {"rotation": 90, "flip_horizontal": True}
    status, body = send("POST", "/api/plan", request)
    assert status == 200
    assert "crop=32:32:0:0:exact=1,transpose=1,hflip" in json.loads(body)["ffmpeg_args"][1]
    request["recipe"]["transform"]["flip_horizontal"] = "true"
    status, body = send("POST", "/api/plan", request)
    assert status == 422
    assert any("flip_horizontal" in str(item["loc"]) for item in json.loads(body)["detail"])


def test_audio_extraction_excludes_video_filters():
    result = make_plan({"transform": {"rotation": 90, "flip_horizontal": True}, "audio": {"mode": "extract", "extract_format": "mp3"}})
    assert result.mode == "audio"
    assert "-vn" in result.ffmpeg_args
    assert not any(token in " ".join(result.ffmpeg_args) for token in ("transpose", "hflip", "vflip", "crop=", "scale="))


def test_frame_capture_and_dimensions():
    result = make_plan({"transform": {"rotation": 270, "flip_vertical": True}, "frame_capture": {"at_ms": 0}, "crop": {"x": 0, "y": 0, "w": 32, "h": 16}, "scale": {"width": 20, "height": 10, "keep_aspect": False}})
    assert result.mode == "frame"
    assert result.ffmpeg_args[-2:] == ["-vf", "crop=32:16:0:0:exact=1,scale=20:10:flags=bicubic,transpose=2,vflip"]
    meta = VideoMeta.model_validate(META)

    transform_90 = Recipe.model_validate({"transform": {"rotation": 90}}).transform
    transform_180 = Recipe.model_validate({"transform": {"rotation": 180}}).transform

    assert _output_dimensions(meta, None, None, transform_90) == (32, 64)
    assert _output_dimensions(meta, None, None, transform_180) == (64, 32)


def test_rotated_dimensions_validate_overlay_position():
    overlay = {"id": "image-1", "file_ref": "overlay-image-1", "filename": "image.png", "mime_type": "image/png", "file_size": 100, "image_width": 8, "image_height": 16, "start_ms": 0, "end_ms": 500, "x_pct": 0, "y_pct": 20, "width_pct": 50, "opacity": 1}
    request = ValidateRequest.model_validate({
        "meta": META,
        "recipe": {
            "transform": {"rotation": 90},
            "image_overlays": [overlay],
        },
    })

    assert validate(request).ok


def test_transform_with_existing_filters_and_overlays():
    recipe = {"crop": {"x": 0, "y": 0, "w": 32, "h": 16}, "scale": {"width": 20, "height": 10, "keep_aspect": False}, "transform": {"rotation": 90, "flip_horizontal": True}, "color_adjustment": {"brightness": 0.1}, "text_overlays": [{"text": "A", "start_ms": 0, "end_ms": 500, "x": 0.5, "y": 0.5, "font_size": 12, "color": "#FFFFFF"}], "subtitles": {"cues": [{"id": "subtitle-1", "start_ms": 0, "end_ms": 500, "text": "Hello"}]}}
    graph = make_plan(recipe).ffmpeg_args[1]
    spatial = "crop=32:16:0:0:exact=1,scale=20:10:flags=bicubic,transpose=1,hflip"
    assert graph.count(spatial) == 2
    assert graph.index(spatial) < graph.index("eq=brightness") < graph.index("overlay=0:0")
    assert "[subtitleout0]" in graph


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="system FFmpeg unavailable")
def test_system_ffmpeg_video_and_frame(tmp_path):
    source = tmp_path / "source.mkv"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=64x32:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "ffv1", "-c:a", "pcm_s16le", str(source)], check=True, capture_output=True)
    for recipe, suffix, dimensions in [({"transform": {"rotation": 90, "flip_horizontal": True}}, "mp4", (32, 64)), ({"transform": {"rotation": 90}, "crop": {"x": 0, "y": 0, "w": 32, "h": 16}, "scale": {"width": 20, "height": 10, "keep_aspect": False}}, "mp4", (10, 20)), ({"transform": {"rotation": 270, "flip_vertical": True}, "frame_capture": {"at_ms": 0}}, "png", (32, 64))]:
        result = make_plan(recipe)
        output = tmp_path / f"output-{dimensions[0]}x{dimensions[1]}.{suffix}"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), *result.ffmpeg_args, str(output)], check=True, capture_output=True)
        streams = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", str(output)], text=True))["streams"]
        assert (streams[0]["width"], streams[0]["height"]) == dimensions
        assert [stream["codec_type"] for stream in streams] == (["video", "audio"] if suffix == "mp4" else ["video"])
