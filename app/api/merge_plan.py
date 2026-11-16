from pydantic import BaseModel

from app.api.merge_models import MergeRecipe


class MergePlan(BaseModel):
    mode: str
    inputs: list[str]
    input_count: int
    clip_count: int
    estimated_duration_ms: int
    active_transition_count: int = 0
    ffmpeg_args: list[str]
    output_filename: str


def _seconds(ms: int) -> str:
    return f"{ms / 1000:.3f}"


def build_merge_plan(recipe: MergeRecipe) -> MergePlan:
    indexes = {item.id: index for index, item in enumerate(recipe.inputs)}
    inputs = [f"input_{index}.{item.container}" for index, item in enumerate(recipe.inputs)]
    out = recipe.output
    parts = []
    labels = []
    duration = 0
    settings = {(item.from_id, item.to_id): item for item in recipe.transitions}
    active_count = sum(item.type != "none" for item in recipe.transitions)
    for index, clip in enumerate(recipe.clips):
        source = recipe.inputs[indexes[clip.input_id]]
        source_index = indexes[clip.input_id]
        start = _seconds(clip.start_ms)
        end = _seconds(clip.end_ms)
        length = _seconds(clip.end_ms - clip.start_ms)
        parts.append(
            f"[{source_index}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
            f"scale={out.width}:{out.height}:force_original_aspect_ratio=decrease:flags=bicubic,"
            f"pad={out.width}:{out.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,settb=AVTB,"
            f"fps={out.fps:g},format=yuv420p{',settb=AVTB' if active_count else ''}[v{index}]"
        )
        if source.has_audio:
            parts.append(
                f"[{source_index}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,"
                f"aresample=48000:async=1:first_pts=0,"
                f"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a{index}]"
            )
        else:
            parts.append(
                f"anullsrc=r=48000:cl=stereo,atrim=duration={length},"
                f"asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:"
                f"channel_layouts=stereo[a{index}]"
            )
        labels.append(f"[v{index}][a{index}]")
        duration += clip.end_ms - clip.start_ms
    if not active_count:
        parts.append("".join(labels) + f"concat=n={len(recipe.clips)}:v=1:a=1[vout][aout]")
    else:
        video_label = "[v0]"
        audio_label = "[a0]"
        elapsed = recipe.clips[0].end_ms - recipe.clips[0].start_ms
        effects = {"crossfade": "fade", "fadeblack": "fadeblack", "wipeleft": "wipeleft", "wiperight": "wiperight"}
        for index in range(len(recipe.clips) - 1):
            left = recipe.clips[index]
            right = recipe.clips[index + 1]
            transition = settings.get((left.input_id, right.input_id))
            next_length = right.end_ms - right.start_ms
            if transition and transition.type != "none":
                overlap = transition.duration_ms
                parts.append(f"{video_label}[v{index + 1}]xfade=transition={effects[transition.type]}:duration={_seconds(overlap)}:offset={_seconds(elapsed - overlap)}[vm{index}]")
                parts.append(f"{audio_label}[a{index + 1}]acrossfade=d={_seconds(overlap)}:c1=tri:c2=tri[am{index}]")
                elapsed += next_length - overlap
            else:
                parts.append(f"{video_label}[v{index + 1}]concat=n=2:v=1:a=0,fps={out.fps:g},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[vm{index}]")
                parts.append(f"{audio_label}[a{index + 1}]concat=n=2:v=0:a=1[am{index}]")
                elapsed += next_length
            video_label = f"[vm{index}]"
            audio_label = f"[am{index}]"
        parts.append(f"{video_label}setpts=PTS-STARTPTS[vout]")
        parts.append(f"{audio_label}asetpts=PTS-STARTPTS[aout]")
        duration = elapsed
    return MergePlan(
        mode="merge",
        inputs=inputs,
        input_count=len(inputs),
        clip_count=len(recipe.clips),
        estimated_duration_ms=duration,
        active_transition_count=active_count,
        ffmpeg_args=["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]", "-c:v", out.video_codec, *(["-b:v", f"{out.video_bitrate}k"] if out.video_bitrate else []), "-c:a", out.audio_codec, "-pix_fmt", "yuv420p"],
        output_filename="merged.mp4",
    )
