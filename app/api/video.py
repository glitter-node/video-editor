"""
app.api.video Docstring
"""
import logging
import math
import re
from dataclasses import dataclass
from typing import Iterable, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.models import VeditPreset
from app.core.security import require_preset_write
from app.api.transitions import VideoTransition, retained_ranges, transition_layout

router = APIRouter(prefix="/api", tags=["video"])

_KEY_RE = re.compile(r"^[a-z0-9_]{1,64}$")
_LOG = logging.getLogger("vedit")
CANVAS_DIMENSIONS = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}

class VideoMeta(BaseModel):
    duration_ms: int = Field(ge=1, le=86400000)
    width: int = Field(ge=1, le=16384)
    height: int = Field(ge=1, le=16384)
    fps: float = Field(gt=0, le=240)
    has_audio: bool = True


class Trim(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def valid_order(self):
        if self.end_ms is not None and self.start_ms >= self.end_ms:
            raise ValueError("Trim end must be after start")
        return self


class Segment(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=1)

    @model_validator(mode="after")
    def valid_order(self):
        if self.start_ms >= self.end_ms:
            raise ValueError("Segment end must be after start")
        return self


class Crop(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class Scale(BaseModel):
    width: Optional[int] = Field(default=None, ge=1, le=16384)
    height: Optional[int] = Field(default=None, ge=1, le=16384)
    keep_aspect: bool = True


class Transform(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rotation: int = Field(default=0, strict=True)
    flip_horizontal: bool = Field(default=False, strict=True)
    flip_vertical: bool = Field(default=False, strict=True)

    @field_validator("rotation")
    @classmethod
    def valid_rotation(cls, value):
        if value not in (0, 90, 180, 270):
            raise ValueError("Rotation must be 0, 90, 180, or 270 degrees")
        return value


class Canvas(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(default=False, strict=True)
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = "16:9"
    fit: Literal["contain"] = "contain"
    background_color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="before")
    @classmethod
    def strict_values(cls, value):
        if not isinstance(value, dict):
            raise ValueError("Canvas settings must be an object")
        if "enabled" in value and type(value["enabled"]) is not bool:
            raise ValueError("Canvas enabled must be a boolean")
        for key in ("aspect_ratio", "fit", "background_color"):
            if key in value and type(value[key]) is not str:
                raise ValueError(f"Canvas {key} must be a string")
        return value


class Bitrate(BaseModel):
    video_kbps: Optional[int] = Field(default=None, ge=100, le=200000)
    audio_kbps: Optional[int] = Field(default=None, ge=32, le=512)


class Audio(BaseModel):
    mode: Literal["keep", "mute", "extract"] = "keep"
    extract_format: Optional[Literal["aac", "mp3", "wav", "flac", "ogg"]] = None


class FrameCapture(BaseModel):
    at_ms: int = Field(ge=0)
    format: Literal["png"] = "png"


class MotionKeyframe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^kf-[1-9][0-9]*$", max_length=32)
    time_ms: int = Field(strict=True, ge=0)
    x: float = Field(ge=0, le=100, allow_inf_nan=False)
    y: float = Field(ge=0, le=100, allow_inf_nan=False)
    scale: float = Field(ge=10, le=300, allow_inf_nan=False)
    opacity: float = Field(ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def strict_values(cls, value):
        if not isinstance(value, dict) or any(key not in value or type(value[key]) not in (int, float) or not math.isfinite(value[key]) for key in ("x", "y", "scale", "opacity")):
            raise ValueError("Invalid motion keyframe values")
        return value


class Motion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(default=False, strict=True)
    keyframes: list[MotionKeyframe] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_keyframes(self):
        if len({item.id for item in self.keyframes}) != len(self.keyframes) or len({item.time_ms for item in self.keyframes}) != len(self.keyframes):
            raise ValueError("Duplicate motion keyframe ID or time")
        self.keyframes = sorted(self.keyframes, key=lambda item: (item.time_ms, item.id))
        return self


class TextOverlay(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    font_size: int = Field(ge=8, le=300)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    align: Literal["left", "center", "right"] = "center"
    motion: Optional[Motion] = None

    @model_validator(mode="after")
    def valid_order(self):
        text: str = self.__dict__["text"]

        if self.start_ms >= self.end_ms or not text.strip():
            raise ValueError("Invalid text overlay")
        return self


class MusicTrack(BaseModel):
    source_id: str = Field(pattern=r"^music_[1-9][0-9]*$", max_length=32)
    duration_ms: int = Field(gt=0, le=86400000)
    start_ms: int = Field(ge=0)
    trim_start_ms: int = Field(ge=0)
    trim_end_ms: int = Field(gt=0)
    volume: float = Field(ge=0, le=2, allow_inf_nan=False)
    fade_in_ms: int = Field(ge=0)
    fade_out_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def valid_range(self):
        if self.trim_start_ms >= self.trim_end_ms or self.trim_end_ms > self.duration_ms:
            raise ValueError("Invalid music trim")
        return self


class AudioMix(BaseModel):
    enabled: bool = True
    source_volume: float = Field(default=1, ge=0, le=2, allow_inf_nan=False)
    tracks: list[MusicTrack] = Field(default_factory=list, max_length=1)


class FadeEffect(BaseModel):
    enabled: bool = Field(default=False, strict=True)
    duration_ms: int = Field(default=1000, strict=True, ge=0, le=10000)


class VideoFade(BaseModel):
    fade_in: FadeEffect = Field(default_factory=FadeEffect)
    fade_out: FadeEffect = Field(default_factory=FadeEffect)


class ColorAdjustment(BaseModel):
    brightness: float = Field(default=0.0, ge=-1, le=1, allow_inf_nan=False)
    contrast: float = Field(default=1.0, ge=0, le=2, allow_inf_nan=False)
    saturation: float = Field(default=1.0, ge=0, le=3, allow_inf_nan=False)
    gamma: float = Field(default=1.0, ge=0.1, le=3, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def check_values(cls, value):
        if isinstance(value, cls):
            return value
        if not isinstance(value, dict):
            raise ValueError("Color adjustment values must be within the supported range.")
        limits = {"brightness": (-1, 1), "contrast": (0, 2), "saturation": (0, 3), "gamma": (0.1, 3)}
        for key, (minimum, maximum) in limits.items():
            if key in value and (type(value[key]) not in (int, float) or not minimum <= value[key] <= maximum or not math.isfinite(value[key]) or abs(value[key] * 100 - round(value[key] * 100)) > 0.000001):
                raise ValueError("Color adjustment values must be within the supported range.")
        return value


class ImageOverlay(BaseModel):
    id: str = Field(pattern=r"^image-[1-9][0-9]*$", max_length=32)
    file_ref: str = Field(pattern=r"^overlay-image-[1-9][0-9]*$", max_length=40)
    filename: str = Field(min_length=1, max_length=200)
    mime_type: Literal["image/png", "image/jpeg", "image/webp"]
    file_size: int = Field(ge=1, le=20 * 1024 * 1024)
    image_width: int = Field(ge=1, le=10000)
    image_height: int = Field(ge=1, le=10000)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    x_pct: float = Field(ge=0, le=100, allow_inf_nan=False)
    y_pct: float = Field(ge=0, le=100, allow_inf_nan=False)
    width_pct: float = Field(ge=1, le=100, allow_inf_nan=False)
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    motion: Optional[Motion] = None

    @model_validator(mode="before")
    @classmethod
    def strict_image_values(cls, value):
        if isinstance(value, cls):
            return value
        if not isinstance(value, dict):
            raise ValueError("Invalid image overlay")
        for key in ("file_size", "image_width", "image_height", "start_ms", "end_ms"):
            if key in value and (not isinstance(value[key], int) or isinstance(value[key], bool)):
                raise ValueError("Invalid image overlay")
        for key in ("x_pct", "y_pct", "width_pct", "opacity"):
            if key in value and (type(value[key]) not in (int, float) or not math.isfinite(value[key])):
                raise ValueError("Invalid image overlay")
        return value

    @model_validator(mode="after")
    def valid_image(self):
        if self.image_width * self.image_height > 40000000 or self.start_ms >= self.end_ms:
            raise ValueError("Invalid image overlay")
        return self


class SubtitleCue(BaseModel):
    id: str = Field(pattern=r"^subtitle-[1-9][0-9]*$", max_length=32)
    start_ms: int = Field(strict=True, ge=0)
    end_ms: int = Field(strict=True, gt=0)
    text: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def valid_cue(self):
        text: str = self.__dict__["text"]

        if (
            self.end_ms <= self.start_ms
            or not text.strip()
            or len(text.split("\n")) > 2
            or re.search(r"[\x00-\x08\x0b-\x1f\x7f]", text)
        ):
            raise ValueError("Invalid subtitle cue")
        return self


class SubtitleStyle(BaseModel):
    font_size: int = Field(default=36, strict=True, ge=8, le=120)
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9a-fA-F]{6}$")
    outline_color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    outline_width: int = Field(default=2, strict=True, ge=0, le=10)
    alignment: Literal["left", "center", "right"] = "center"
    bottom_margin: int = Field(default=8, strict=True, ge=0, le=40)


class Subtitles(BaseModel):
    cues: list[SubtitleCue] = Field(default_factory=list, max_length=100)
    style: SubtitleStyle = Field(default_factory=SubtitleStyle)

    @model_validator(mode="after")
    def valid_cues(self):
        ordered = sorted(self.cues, key=lambda cue: (cue.start_ms, cue.end_ms, cue.id))
        if len({cue.id for cue in ordered}) != len(ordered) or any(ordered[index - 1].end_ms > ordered[index].start_ms for index in range(1, len(ordered))):
            raise ValueError("Subtitle cues must not overlap and IDs must be unique")
        return self


class AudioKeyframe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^(original|background-music)-kf-[1-9][0-9]*$", max_length=48)
    time_ms: int = Field(strict=True, ge=0)
    volume_percent: float = Field(ge=0, le=200, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def strict_volume(cls, value):
        if not isinstance(value, dict) or "volume_percent" not in value or type(value["volume_percent"]) not in (int, float) or not math.isfinite(value["volume_percent"]):
            raise ValueError("Invalid audio keyframe volume")
        return value


class AudioKeyframeTrack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(default=False, strict=True)
    keyframes: list[AudioKeyframe] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_points(self):
        if len({item.id for item in self.keyframes}) != len(self.keyframes) or len({item.time_ms for item in self.keyframes}) != len(self.keyframes):
            raise ValueError("Duplicate audio keyframe ID or time")
        self.keyframes = sorted(self.keyframes, key=lambda item: (item.time_ms, item.id))
        return self


class AudioKeyframes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    original: AudioKeyframeTrack = Field(default_factory=AudioKeyframeTrack)
    background_music: AudioKeyframeTrack = Field(default_factory=AudioKeyframeTrack)

    @model_validator(mode="after")
    def track_ids(self):
        original: AudioKeyframeTrack = self.__dict__["original"]
        background_music: AudioKeyframeTrack = self.__dict__["background_music"]

        if any(not item.id.startswith("original-kf-") for item in original.__dict__["keyframes"]) or any(not item.id.startswith("background-music-kf-") for item in background_music.__dict__["keyframes"]):
            raise ValueError("Invalid audio keyframe track reference")
        return self


class Recipe(BaseModel):
    playback_speed: float = Field(default=1.0, ge=0.25, le=4.0, allow_inf_nan=False)
    output_fps: Optional[float] = Field(default=None, gt=0, le=240, allow_inf_nan=False)
    trim: Optional[Trim] = None
    remove_segments: list[Segment] = Field(default_factory=list, max_length=200)
    crop: Optional[Crop] = None
    scale: Optional[Scale] = None
    transform: Transform = Field(default_factory=Transform)
    canvas: Optional[Canvas] = None
    bitrate: Optional[Bitrate] = None
    audio: Optional[Audio] = None
    frame_capture: Optional[FrameCapture] = None
    text_overlays: list[TextOverlay] = Field(default_factory=list, max_length=20)
    audio_mix: Optional[AudioMix] = None
    video_fade: Optional[VideoFade] = None
    color_adjustment: Optional[ColorAdjustment] = None
    image_overlays: list[ImageOverlay] = Field(default_factory=list, max_length=10)
    subtitles: Optional[Subtitles] = None
    audio_keyframes: Optional[AudioKeyframes] = None
    selected_image_id: Optional[str] = Field(default=None, pattern=r"^image-[1-9][0-9]*$")
    video_transitions: list[VideoTransition] = Field(default_factory=list, max_length=200)
    selected_transition_id: Optional[str] = Field(default=None, pattern=r"^boundary-[0-9]+-[0-9]+$")
    container: Literal["mp4", "webm", "mkv"] = "mp4"

    @model_validator(mode="before")
    @classmethod
    def reject_null_canvas(cls, value):
        if isinstance(value, dict) and "canvas" in value and value["canvas"] is None:
            raise ValueError("Canvas settings cannot be null")
        return value

    @field_validator("playback_speed")
    @classmethod
    def normalize_speed(cls, value):
        return round(value, 2)


class ValidateRequest(BaseModel):
    meta: VideoMeta
    recipe: Recipe


class ValidateResponse(BaseModel):
    ok: bool
    normalized: Recipe


@dataclass(frozen=True)
class Preset:
    key: str
    label: str
    recipe_patch: dict

class PresetUpsertRequest(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    recipe_patch: dict = Field(max_length=8)


class PresetUpsertResponse(BaseModel):
    ok: bool
    key: str


PRESETS = [
    Preset(
        key="web_1080p",
        label="Web 1080p",
        recipe_patch={"scale": {"width": 1920, "height": 1080, "keep_aspect": True}, "bitrate": {"video_kbps": 6000}},
    ),
    Preset(
        key="web_720p",
        label="Web 720p",
        recipe_patch={"scale": {"width": 1280, "height": 720, "keep_aspect": True}, "bitrate": {"video_kbps": 2500}},
    ),
    Preset(
        key="mute",
        label="Mute Audio",
        recipe_patch={"audio": {"mode": "mute"}},
    ),
    Preset(
        key="audio_mp3",
        label="Extract MP3",
        recipe_patch={"audio": {"mode": "extract", "extract_format": "mp3"}},
    ),
]


def _clamp_end(meta: VideoMeta, trim: Trim) -> Trim:
    end = trim.end_ms or meta.duration_ms
    if end > meta.duration_ms:
        end = meta.duration_ms
    if trim.start_ms >= end:
        raise HTTPException(status_code=422, detail="invalid trim")
    return Trim(start_ms=trim.start_ms, end_ms=end)


def _merge_segments(meta: VideoMeta, segs: Iterable[Segment]) -> list[Segment]:
    valid = []
    for s in segs:
        a = max(0, min(s.start_ms, meta.duration_ms))
        b = max(0, min(s.end_ms, meta.duration_ms))
        if a < b:
            valid.append(Segment(start_ms=a, end_ms=b))
    valid.sort(key=lambda x: x.start_ms)
    merged: list[Segment] = []
    for s in valid:
        if not merged or s.start_ms > merged[-1].end_ms:
            merged.append(s)
        else:
            merged[-1] = Segment(start_ms=merged[-1].start_ms, end_ms=max(merged[-1].end_ms, s.end_ms))
    return merged


def _clamp_crop(meta: VideoMeta, crop: Crop) -> Crop:
    x = max(0, min(crop.x, max(0, meta.width - 2)))
    y = max(0, min(crop.y, max(0, meta.height - 2)))
    w = max(2, min(crop.w, meta.width - x))
    h = max(2, min(crop.h, meta.height - y))
    w -= w % 2
    h -= h % 2
    return Crop(x=x, y=y, w=w, h=h)


def _normalize_scale(scale: Scale) -> Scale:
    w = scale.width
    h = scale.height
    if w is not None:
        w = max(1, min(w, 16384))
        w = max(2, w - w % 2)
    if h is not None:
        h = max(1, min(h, 16384))
        h = max(2, h - h % 2)
    return Scale(width=w, height=h, keep_aspect=scale.keep_aspect)


def _output_dimensions(meta: VideoMeta, crop: Optional[Crop], scale: Optional[Scale], transform: Optional[Transform] = None, canvas: Optional[Canvas] = None) -> tuple[int, int]:
    def even_size(value: int) -> int:
        return max(2, value - value % 2)

    if canvas and canvas.enabled:
        return CANVAS_DIMENSIONS[canvas.aspect_ratio]

    width = crop.w if crop else meta.width
    height = crop.h if crop else meta.height
    if not scale or (scale.width is None and scale.height is None):
        result = even_size(width), even_size(height)
    elif scale.keep_aspect and scale.width and scale.height:
        scaled_width = min(scale.width, 2 * math.floor(scale.height * width / height / 2 + 0.5))
        scaled_height = min(scale.height, 2 * math.floor(scale.width * height / width / 2 + 0.5))
        result = even_size(scaled_width), even_size(scaled_height)
    elif scale.width and scale.height:
        result = even_size(scale.width), even_size(scale.height)
    elif scale.width is not None:
        result = even_size(scale.width), even_size(2 * math.floor(height * scale.width / width / 2 + 0.5))
    elif scale.height is not None:
        result = even_size(2 * math.floor(width * scale.height / height / 2 + 0.5)), even_size(scale.height)
    else:
        result = even_size(width), even_size(height)
    if transform is not None and transform.rotation in (90, 270):
        return result[1], result[0]
    return result

def _db_presets(db: Session) -> list[dict]:
    rows = db.execute(select(VeditPreset)).scalars().all()
    return [{"key": r.preset_key, "label": r.label, "recipe_patch": r.recipe_patch} for r in rows]


@router.get("/presets")
def presets(db: Session = Depends(get_session)):
    base = {p.key: {"key": p.key, "label": p.label, "recipe_patch": p.recipe_patch} for p in PRESETS}
    try:
        for p in _db_presets(db):
            base[p["key"]] = p
    except SQLAlchemyError as exc:
        _LOG.exception("Preset database read failed")
        raise HTTPException(status_code=503, detail="Preset database unavailable") from exc
    return list(base.values())

@router.post("/presets/custom", response_model=PresetUpsertResponse)
def upsert_preset(req: PresetUpsertRequest, db: Session = Depends(get_session), _auth: None = Depends(require_preset_write)):
    key = req.key.strip()
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=422, detail="invalid preset key")
    label = req.label.strip()
    if not label:
        raise HTTPException(status_code=422, detail="invalid label")
    if not set(req.recipe_patch).issubset(Recipe.model_fields):
        raise HTTPException(status_code=422, detail="invalid recipe patch field")
    try:
        Recipe.model_validate(req.recipe_patch)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="invalid recipe patch") from exc
    try:
        row = db.execute(select(VeditPreset).where(VeditPreset.preset_key == key)).scalar_one_or_none()
    except SQLAlchemyError as exc:
        _LOG.exception("Preset database read failed")
        raise HTTPException(status_code=503, detail="Preset database unavailable") from exc
    if row is None:
        row = VeditPreset(preset_key=key, label=label, recipe_patch=req.recipe_patch)
        db.add(row)
        _LOG.warning("preset_custom_upsert action=create key=%s", key)
    else:
        row.label = label
        row.recipe_patch = req.recipe_patch
        _LOG.warning("preset_custom_upsert action=update key=%s", key)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        _LOG.exception("Preset database write failed")
        raise HTTPException(status_code=503, detail="Preset database unavailable") from exc
    return PresetUpsertResponse(ok=True, key=key)

@router.delete("/presets/custom/{key}")
def delete_preset(key: str, db: Session = Depends(get_session), _auth: None = Depends(require_preset_write)):
    k = (key or "").strip()
    if not _KEY_RE.match(k):
        raise HTTPException(status_code=422, detail="invalid preset key")
    try:
        row = db.execute(select(VeditPreset).where(VeditPreset.preset_key == k)).scalar_one_or_none()
    except SQLAlchemyError as exc:
        _LOG.exception("Preset database read failed")
        raise HTTPException(status_code=503, detail="Preset database unavailable") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(row)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        _LOG.exception("Preset database delete failed")
        raise HTTPException(status_code=503, detail="Preset database unavailable") from exc
    _LOG.warning("preset_custom_delete key=%s", k)
    return {"ok": True}


@router.post("/recipe/validate", response_model=ValidateResponse)
def validate(req: ValidateRequest) -> ValidateResponse:
    r = req.recipe
    meta = req.meta

    trim = _clamp_end(meta, r.trim) if r.trim else None
    segs = _merge_segments(meta, r.remove_segments)
    keep_start = trim.start_ms if trim else 0
    keep_end = (
        trim.end_ms
        if trim is not None and trim.end_ms is not None
        else meta.duration_ms
    )
    cursor = keep_start
    for segment in segs:
        if segment.end_ms <= cursor:
            continue
        if segment.start_ms > cursor:
            break
        cursor = max(cursor, segment.end_ms)
    if cursor >= keep_end:
        raise HTTPException(status_code=422, detail="no remaining segments")
    crop = _clamp_crop(meta, r.crop) if r.crop else None
    scale = _normalize_scale(r.scale) if r.scale else None

    if r.audio and r.audio.mode == "extract" and not r.audio.extract_format:
        raise HTTPException(status_code=422, detail="extract_format required")
    if r.audio and r.audio.mode == "extract" and not meta.has_audio:
        raise HTTPException(status_code=422, detail="Input video has no audio")
    if r.audio and r.audio.mode == "extract" and r.frame_capture:
        raise HTTPException(status_code=422, detail="Audio extraction and frame capture cannot be combined")
    if scale and scale.width is None and scale.height is None:
        raise HTTPException(status_code=422, detail="Scale requires width or height")
    if scale and not scale.keep_aspect and (scale.width is None or scale.height is None):
        raise HTTPException(status_code=422, detail="Width and height are required when keep_aspect is false")

    if r.frame_capture and r.frame_capture.at_ms > meta.duration_ms:
        raise HTTPException(status_code=422, detail="frame_capture out of range")
    ranges = retained_ranges(meta.duration_ms, trim, segs)
    output_ms, boundaries = transition_layout(ranges, r.playback_speed, [] if r.frame_capture or (r.audio and r.audio.mode == "extract") else r.video_transitions)
    if not r.frame_capture and not (r.audio and r.audio.mode == "extract") and r.selected_transition_id is not None and r.selected_transition_id not in {item[0] for item in boundaries}:
        raise HTTPException(status_code=422, detail="Invalid transition boundary")
    if r.video_fade and not r.frame_capture and not (r.audio and r.audio.mode == "extract"):
        fade_in_ms = r.video_fade.fade_in.duration_ms if r.video_fade.fade_in.enabled else 0
        fade_out_ms = r.video_fade.fade_out.duration_ms if r.video_fade.fade_out.enabled else 0
        if fade_in_ms + fade_out_ms > output_ms:
            raise HTTPException(status_code=422, detail="The combined Fade In and Fade Out duration cannot exceed the final video duration.")
    if any(item.end_ms > output_ms for item in r.text_overlays):
        raise HTTPException(status_code=422, detail="text overlay out of range")
    if r.subtitles and not r.frame_capture and not (r.audio and r.audio.mode == "extract") and any(item.end_ms > output_ms for item in r.subtitles.cues):
        raise HTTPException(status_code=422, detail="Subtitle time exceeds output duration")
    if r.audio_keyframes and not r.frame_capture and not (r.audio and r.audio.mode == "extract"):
        for track in (r.audio_keyframes.original, r.audio_keyframes.background_music):
            if any(item.time_ms > output_ms for item in track.keyframes):
                raise HTTPException(status_code=422, detail="Audio keyframe time exceeds output duration")
    frame_width, frame_height = _output_dimensions(meta, crop, scale, r.transform, r.canvas)
    motion_frames = 0

    for overlay in (*r.text_overlays, *r.image_overlays):
        motion = overlay.motion
        if motion is None:
            continue

        for point in motion.keyframes:
            if point.time_ms < overlay.start_ms or point.time_ms > overlay.end_ms or point.time_ms > output_ms:
                raise HTTPException(status_code=422, detail="Motion keyframe is outside the overlay range")

            if isinstance(overlay, ImageOverlay):
                image_width = max(1, math.floor(frame_width * overlay.width_pct / 100 * point.scale / 100 + 0.5))
                image_height = max(1, math.floor(image_width * overlay.image_height / overlay.image_width + 0.5))
                image_x = math.floor(frame_width * point.x / 100 + 0.5)
                image_y = math.floor(frame_height * point.y / 100 + 0.5)

                if image_x + image_width > frame_width or image_y + image_height > frame_height:
                    raise HTTPException(status_code=422, detail="Motion image is outside output frame")

        if motion.enabled and motion.keyframes and not r.frame_capture and not (r.audio and r.audio.mode == "extract"):
            if frame_width * frame_height > 4_000_000:
                raise HTTPException(status_code=422, detail="Motion output frame exceeds supported size")

            motion_frames += max(1, math.ceil((overlay.end_ms - overlay.start_ms) * meta.fps / 1000 - 1e-9))

    if motion_frames > 1200:
        raise HTTPException(status_code=422, detail="Motion animation exceeds frame preparation limit")
    image_ids = set()
    image_refs = set()
    for item in r.image_overlays:
        if item.id in image_ids or item.file_ref in image_refs:
            raise HTTPException(status_code=422, detail="invalid image overlay timing or reference")
        image_ids.add(item.id)
        image_refs.add(item.file_ref)
        if r.frame_capture or (r.audio and r.audio.mode == "extract"):
            continue
        if item.end_ms > output_ms:
            raise HTTPException(status_code=422, detail="invalid image overlay timing or reference")
        image_width = max(1, math.floor(frame_width * item.width_pct / 100 + 0.5))
        image_height = max(1, math.floor(image_width * item.image_height / item.image_width + 0.5))
        image_x = math.floor(frame_width * item.x_pct / 100 + 0.5)
        image_y = math.floor(frame_height * item.y_pct / 100 + 0.5)
        if image_x + image_width > frame_width or image_y + image_height > frame_height:
            raise HTTPException(status_code=422, detail="invalid image overlay position")
    if r.selected_image_id is not None and r.selected_image_id not in image_ids:
        raise HTTPException(status_code=422, detail="invalid selected image")
    if r.audio_mix and r.audio_mix.enabled and not (r.audio and r.audio.mode == "extract") and not r.frame_capture:
        if r.container != "mp4" and r.audio_mix.tracks:
            raise HTTPException(status_code=422, detail="Audio mix requires MP4 output")
        for track in r.audio_mix.tracks:
            if track.start_ms >= output_ms:
                raise HTTPException(status_code=422, detail="Music start is outside output video")
            effective_ms = min(track.trim_end_ms - track.trim_start_ms, output_ms - track.start_ms)
            if effective_ms <= 0 or track.fade_in_ms > effective_ms or track.fade_out_ms > effective_ms or track.fade_in_ms + track.fade_out_ms > effective_ms:
                raise HTTPException(status_code=422, detail="Invalid music fade or duration")

    normalized_fields = {
        "trim": trim,
        "remove_segments": segs,
        "crop": crop,
        "scale": scale,
        "transform": r.transform,
        "bitrate": r.bitrate,
        "audio": r.audio,
        "frame_capture": r.frame_capture,
        "text_overlays": r.text_overlays,
        "audio_mix": r.audio_mix,
        "playback_speed": r.playback_speed,
        "video_fade": r.video_fade,
        "color_adjustment": r.color_adjustment,
        "image_overlays": r.image_overlays,
        "subtitles": r.subtitles,
        "audio_keyframes": r.audio_keyframes,
        "selected_image_id": r.selected_image_id,
        "video_transitions": r.video_transitions,
        "selected_transition_id": r.selected_transition_id,
        "container": r.container,
        "output_fps": r.output_fps,
    }
    if r.canvas is not None:
        normalized_fields["canvas"] = r.canvas
    normalized = Recipe(**normalized_fields)

    return ValidateResponse(ok=True, normalized=normalized)


def normalize_recipe(req: ValidateRequest) -> Recipe:
    return validate(req).normalized
