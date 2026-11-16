from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

SafeFps = Annotated[float, Field(strict=True, allow_inf_nan=False, gt=0, le=120)]
OutputFps = Annotated[float, Field(strict=True, allow_inf_nan=False, gt=0, le=60)]


class MergeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    container: Literal["mp4", "mov", "mkv", "webm"] = "mp4"
    duration_ms: StrictInt = Field(ge=1, le=86_400_000)
    width: StrictInt = Field(ge=1, le=8192)
    height: StrictInt = Field(ge=1, le=8192)
    fps: SafeFps
    has_audio: StrictBool


class MergeClip(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_id: str
    start_ms: StrictInt = Field(ge=0)
    end_ms: StrictInt = Field(gt=0)


class MergeOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    container: Literal["mp4"] = "mp4"
    width: StrictInt = Field(ge=2, le=3840)
    height: StrictInt = Field(ge=2, le=2160)
    fps: OutputFps
    video_codec: Literal["libx264"] = "libx264"
    audio_codec: Literal["aac"] = "aac"
    video_bitrate: Optional[StrictInt] = Field(default=None, ge=100, le=200000)

    @model_validator(mode="after")
    def even_dimensions(self):
        if self.width % 2 or self.height % 2:
            raise ValueError("Output dimensions must be even")
        return self


class MergeTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    to_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    type: Literal["none", "crossfade", "fadeblack", "wipeleft", "wiperight"] = "none"
    duration_ms: StrictInt = Field(default=500, ge=100, le=3000)

    @model_validator(mode="after")
    def valid_duration(self):
        if self.from_id == self.to_id or self.duration_ms % 100:
            raise ValueError("Invalid transition boundary or duration")
        return self


class MergeRecipe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inputs: list[MergeInput] = Field(min_length=2, max_length=20)
    clips: list[MergeClip] = Field(min_length=2, max_length=100)
    output: MergeOutput
    transitions: list[MergeTransition] = Field(default_factory=list, max_length=99)

    @model_validator(mode="after")
    def valid_recipe(self):
        inputs = {item.id: item for item in self.inputs}
        if len(inputs) != len(self.inputs):
            raise ValueError("Duplicate input ID")
        used = set()
        duration = 0
        for clip in self.clips:
            item = inputs.get(clip.input_id)
            if item is None:
                raise ValueError("Unknown input ID")
            if clip.end_ms <= clip.start_ms or clip.end_ms > item.duration_ms:
                raise ValueError("Invalid clip range")
            used.add(clip.input_id)
            duration += clip.end_ms - clip.start_ms
        if len(used) < 2:
            raise ValueError("At least two distinct inputs are required")
        boundaries = [(self.clips[index].input_id, self.clips[index + 1].input_id) for index in range(len(self.clips) - 1)]
        if any(boundaries.count((item.from_id, item.to_id)) != 1 for item in self.transitions):
            raise ValueError("Transition boundary is ambiguous")
        seen = set()
        active = {}
        for transition in self.transitions:
            key = (transition.from_id, transition.to_id)
            if key not in boundaries or key in seen:
                raise ValueError("Transition boundary is no longer valid")
            seen.add(key)
            if transition.type != "none":
                active[key] = transition.duration_ms
        overlap = 0
        for index, clip in enumerate(self.clips):
            before = active.get(boundaries[index - 1], 0) if index else 0
            after = active.get(boundaries[index], 0) if index < len(boundaries) else 0
            if before + after > clip.end_ms - clip.start_ms:
                raise ValueError("Adjacent transitions exceed clip duration")
            overlap += after
        if duration - overlap < 1:
            raise ValueError("Invalid final merge duration")
        if duration - overlap > 86_400_000:
            raise ValueError("Estimated output duration exceeds 24 hours")
        return self
