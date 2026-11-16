"""
app.api.plan Docstring
"""
import math
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.video import CANVAS_DIMENSIONS, Recipe, ValidateRequest, normalize_recipe
from app.api.transitions import retained_ranges, transition_layout

router = APIRouter(prefix="/api", tags=["plan"])


class PlanResponse(BaseModel):
    mode: str
    container: str
    ffmpeg_args: list[str]
    outputs: list[dict]
    music_source_id: Optional[str] = None


def _sec(ms: int) -> str:
    return f"{ms/1000:.3f}"


def _atempo_chain(speed: float) -> str:
    factors = []
    remaining = speed
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    while remaining > 2:
        factors.append(2.0)
        remaining /= 2
    factors.append(remaining)
    return ",".join(f"atempo={factor:.2f}" for factor in factors)


def _canvas_filter(r: Recipe) -> Optional[str]:
    canvas = r.canvas
    if not canvas or not canvas.enabled:
        return None
    dimensions = CANVAS_DIMENSIONS[canvas.aspect_ratio]
    width, height = dimensions
    color = f"0x{canvas.background_color[1:]}"
    return f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={color},setsar=1"


def _automation_expression(track, shift_ms: int = 0) -> Optional[str]:
    if not track or not track.enabled or not track.keyframes:
        return None
    points = sorted(track.keyframes, key=lambda item: item.time_ms)
    clock = f"(t+{_sec(shift_ms)})" if shift_ms else "t"
    expression = f"{points[-1].volume_percent / 100:.6f}"
    for index in range(len(points) - 2, -1, -1):
        left = points[index]
        right = points[index + 1]
        start = left.volume_percent / 100
        difference = (right.volume_percent - left.volume_percent) / 100
        interval = (right.time_ms - left.time_ms) / 1000
        slope = f"({start:.6f}+{difference:.6f}*({clock}-{_sec(left.time_ms)})/{interval:.3f})"
        expression = f"if(lt({clock},{_sec(right.time_ms)}),{slope},{expression})"
    return f"if(lt({clock},{_sec(points[0].time_ms)}),{points[0].volume_percent / 100:.6f},{expression})"


def _keep_segments(r: Recipe, duration_ms: int) -> list[tuple[int, int]]:
    start = r.trim.start_ms if r.trim else 0
    end = (r.trim.end_ms if r.trim and r.trim.end_ms else duration_ms)
    if start < 0:
        start = 0
    if end > duration_ms:
        end = duration_ms
    if start >= end:
        raise HTTPException(status_code=422, detail="no remaining segments")

    if not r.remove_segments:
        return [(start, end)]

    cuts = []
    for s in r.remove_segments:
        a = max(0, min(s.start_ms, duration_ms))
        b = max(0, min(s.end_ms, duration_ms))
        if a < b:
            cuts.append((a, b))
    cuts.sort()

    merged = []
    for a, b in cuts:
        if not merged or a > merged[-1][1]:
            merged.append([a, b])
        else:
            merged[-1][1] = max(merged[-1][1], b)
    cuts = [(x[0], x[1]) for x in merged]

    keep = []
    cursor = start
    for a, b in cuts:
        if b <= cursor:
            continue
        if a > cursor:
            keep.append((cursor, min(a, end)))
        cursor = max(cursor, b)
        if cursor >= end:
            break
    if cursor < end:
        keep.append((cursor, end))

    keep = [(a, b) for a, b in keep if a < b]
    if not keep:
        raise HTTPException(status_code=422, detail="no remaining segments")
    return keep


def _vf_chain(r: Recipe) -> Optional[str]:
    chain = []
    if r.crop:
        c = r.crop
        chain.append(f"crop={c.w}:{c.h}:{c.x}:{c.y}:exact=1")
    if r.scale and (r.scale.width or r.scale.height):
        sc = r.scale
        if sc.keep_aspect and sc.width and sc.height:
            chain.append(f"scale={sc.width}:{sc.height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic")
        else:
            w = sc.width if sc.width else -2
            h = sc.height if sc.height else -2
            chain.append(f"scale={w}:{h}:flags=bicubic")
    rotation = r.transform.rotation
    if rotation == 90:
        chain.append("transpose=1")
    elif rotation == 180:
        chain.extend(("hflip", "vflip"))
    elif rotation == 270:
        chain.append("transpose=2")
    if r.transform.flip_horizontal:
        chain.append("hflip")
    if r.transform.flip_vertical:
        chain.append("vflip")
    canvas = _canvas_filter(r)
    if canvas:
        chain.append(canvas)
    return ",".join(chain) if chain else None


def _build_concat_filter(r: Recipe, duration_ms: int, has_audio: bool) -> tuple[str, list[str]]:
    keep = _keep_segments(r, duration_ms)
    vf = None if r.text_overlays else _vf_chain(r)

    parts = []
    vlabels = []
    alabels = []

    for i, (a, b) in enumerate(keep):
        vlab = f"v{i}"
        alab = f"a{i}"
        vexpr = f"[0:v]trim=start={_sec(a)}:end={_sec(b)},setpts=PTS-STARTPTS"
        if vf:
            vexpr += f",{vf}"
        vexpr += f"[{vlab}]"
        parts.append(vexpr)
        vlabels.append(f"[{vlab}]")

        if has_audio and not (r.audio and r.audio.mode == "mute"):
            aexpr = f"[0:a]atrim=start={_sec(a)}:end={_sec(b)},asetpts=PTS-STARTPTS[{alab}]"
            parts.append(aexpr)
            alabels.append(f"[{alab}]")

    n = len(keep)

    if has_audio and not (r.audio and r.audio.mode == "mute"):
        parts.append("".join(v + a for v, a in zip(vlabels, alabels)) + f"concat=n={n}:v=1:a=1[v][a]")
        return ";".join(parts), ["-map", "[v]", "-map", "[a]"]

    parts.append("".join(vlabels) + f"concat=n={n}:v=1:a=0[v]")
    return ";".join(parts), ["-map", "[v]"]


def _build_transition_filter(r: Recipe, meta) -> tuple[str, list[str]]:
    keep = retained_ranges(meta.duration_ms, r.trim, r.remove_segments)
    _, boundaries = transition_layout(keep, r.playback_speed, r.video_transitions)
    fps = f"{(r.output_fps or meta.fps):.3f}"
    spatial = _vf_chain(r)
    has_audio = meta.has_audio and not (r.audio and r.audio.mode == "mute")
    parts = []
    for index, (start, end) in enumerate(keep):
        video = f"[0:v]trim=start={_sec(start)}:end={_sec(end)},setpts=(PTS-STARTPTS)/{r.playback_speed:.2f}"
        if spatial:
            video += f",{spatial}"
        if meta.width % 2 or meta.height % 2:
            video += ",scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic"
        video += f",fps={fps},settb=AVTB,setsar=1,format=yuv420p[vt{index}]"
        parts.append(video)
        if has_audio:
            audio = f"[0:a]atrim=start={_sec(start)}:end={_sec(end)},asetpts=PTS-STARTPTS"
            if r.playback_speed != 1:
                audio += f",{_atempo_chain(r.playback_speed)}"
            parts.append(audio + f"[at{index}]")
    video_label = "[vt0]"
    audio_label = "[at0]" if has_audio else None
    elapsed = (keep[0][1] - keep[0][0]) / r.playback_speed
    for index, (_, _, _, transition) in enumerate(boundaries):
        next_length = (keep[index + 1][1] - keep[index + 1][0]) / r.playback_speed
        if transition is not None and transition.type != "none":
            duration = transition.duration_ms / 1000
            offset = elapsed / 1000 - duration
            effect = {"crossfade": "fade", "fadeblack": "fadeblack", "wipeleft": "wipeleft", "wiperight": "wiperight"}[transition.type]
            parts.append(f"{video_label}[vt{index + 1}]xfade=transition={effect}:duration={duration:.3f}:offset={offset:.3f}[vjoin{index}]")
            if has_audio:
                parts.append(f"{audio_label}[at{index + 1}]acrossfade=d={duration:.3f}:c1=tri:c2=tri[ajoin{index}]")
            elapsed += next_length - transition.duration_ms
        else:
            parts.append(f"{video_label}[vt{index + 1}]concat=n=2:v=1:a=0,fps={fps},settb=AVTB,setpts=PTS-STARTPTS[vjoin{index}]")
            if has_audio:
                parts.append(f"{audio_label}[at{index + 1}]concat=n=2:v=0:a=1[ajoin{index}]")
            elapsed += next_length
        video_label = f"[vjoin{index}]"
        if has_audio:
            audio_label = f"[ajoin{index}]"
    parts.append(f"{video_label}setpts=PTS-STARTPTS[v]")
    if has_audio:
        parts.append(f"{audio_label}asetpts=PTS-STARTPTS[a]")
    return ";".join(parts), ["-map", "[v]"] + (["-map", "[a]"] if has_audio else [])


@router.post("/plan", response_model=PlanResponse)
def plan(req: ValidateRequest):
    r: Recipe = normalize_recipe(req)
    meta = req.meta

    if r.audio and r.audio.mode == "extract":
        fmt = r.audio.extract_format
        if not fmt:
            raise HTTPException(status_code=422, detail="extract_format required")
        keep = _keep_segments(r, meta.duration_ms)
        parts = [f"[0:a]atrim=start={_sec(a)}:end={_sec(b)},asetpts=PTS-STARTPTS[a{i}]" for i, (a, b) in enumerate(keep)]
        if len(keep) > 1:
            parts.append("".join(f"[a{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1[a]")
            label = "[a]"
        else:
            label = "[a0]"
        if r.playback_speed != 1:
            parts.append(f"{label}{_atempo_chain(r.playback_speed)}[aspeed]")
            label = "[aspeed]"
        args = ["-filter_complex", ";".join(parts), "-map", label, "-vn"]
        if fmt == "mp3":
            args += ["-c:a", "libmp3lame"]
        elif fmt == "aac":
            args += ["-c:a", "aac"]
        elif fmt == "wav":
            args += ["-c:a", "pcm_s16le"]
        elif fmt == "flac":
            args += ["-c:a", "flac"]
        elif fmt == "ogg":
            args += ["-c:a", "libvorbis"]
        if r.bitrate and r.bitrate.audio_kbps:
            args += ["-b:a", f"{r.bitrate.audio_kbps}k"]
        return PlanResponse(
            mode="audio",
            container=fmt,
            ffmpeg_args=args,
            outputs=[{"name": f"output.{fmt}", "kind": "audio"}],
        )

    if r.frame_capture:
        vf = _vf_chain(r)
        args = ["-ss", _sec(r.frame_capture.at_ms), "-frames:v", "1"]
        if vf:
            args += ["-vf", vf]
        return PlanResponse(
            mode="frame",
            container="png",
            ffmpeg_args=args,
            outputs=[{"name": "frame.png", "kind": "image"}],
        )

    active_transitions = any(item.type != "none" for item in r.video_transitions)
    filter_complex, maps = _build_transition_filter(r, meta) if active_transitions else _build_concat_filter(r, meta.duration_ms, meta.has_audio)
    video_label = "v"
    audio_label = "a" if meta.has_audio and not (r.audio and r.audio.mode == "mute") else None
    if r.playback_speed != 1 and not active_transitions:
        filter_complex += f";[v]setpts=(PTS-STARTPTS)/{r.playback_speed:.2f}[vspeed]"
        video_label = "vspeed"
        if audio_label:
            filter_complex += f";[a]{_atempo_chain(r.playback_speed)}[aspeed]"
            audio_label = "aspeed"
        maps = ["-map", f"[{video_label}]"] + (["-map", f"[{audio_label}]"] if audio_label else [])
    color = r.color_adjustment
    color_active = bool(color and (color.brightness != 0 or color.contrast != 1 or color.saturation != 1 or color.gamma != 1))
    motion_text_active = any(item.motion and item.motion.enabled and item.motion.keyframes for item in r.text_overlays)
    spatial = _vf_chain(r) if r.text_overlays and (color_active or motion_text_active) and not active_transitions else None
    if spatial:
        filter_complex += f";[{video_label}]{spatial}[vspatial]"
        video_label = "vspatial"
    if color_active and color is not None:
        filter_complex += f";[{video_label}]eq=brightness={color.brightness:.2f}:contrast={color.contrast:.2f}:saturation={color.saturation:.2f}:gamma={color.gamma:.2f}[vcolor]"
        video_label = "vcolor"
    if color_active:
        maps[1] = f"[{video_label}]"
    if r.text_overlays:
        parts = [filter_complex]
        current = video_label
        for index, item in enumerate(r.text_overlays):
            next_label = f"text{index}"
            asset = f"[{index + 1}:v]"
            animated = bool(item.motion and item.motion.enabled and item.motion.keyframes)
            if animated:
                parts.append(f"{asset}setpts=PTS-STARTPTS+{_sec(item.start_ms)}/TB[motiontextasset{index}]")
                asset = f"[motiontextasset{index}]"
            elif spatial:
                parts.append(f"{asset}{spatial}[asset{index}]")
                asset = f"[asset{index}]"
            enable = f"gte(t,{_sec(item.start_ms)})*lt(t,{_sec(item.end_ms)})" if animated else f"between(t,{_sec(item.start_ms)},{_sec(item.end_ms)})"
            parts.append(f"[{current}]{asset}overlay=0:0:enable='{enable}':eof_action=repeat:repeatlast=1[{next_label}]")
            current = next_label
        vf = None if spatial or active_transitions else _vf_chain(r)
        if vf:
            parts.append(f"[{current}]{vf}[textout]")
            current = "textout"
        filter_complex = ";".join(parts)
        maps = ["-map", f"[{current}]"] + (["-map", f"[{audio_label}]"] if audio_label else [])
    if r.image_overlays:
        current = maps[1]
        parts = [filter_complex]
        for index, item in enumerate(r.image_overlays):
            next_label = f"imageout{index}"
            input_index = len(r.text_overlays) + index + 1
            asset = f"[{input_index}:v]"
            animated = bool(item.motion and item.motion.enabled and item.motion.keyframes)
            if animated:
                parts.append(f"{asset}setpts=PTS-STARTPTS+{_sec(item.start_ms)}/TB[motionimageasset{index}]")
                asset = f"[motionimageasset{index}]"
            enable = f"gte(t,{_sec(item.start_ms)})*lt(t,{_sec(item.end_ms)})" if animated else f"between(t,{_sec(item.start_ms)},{_sec(item.end_ms)})"
            parts.append(f"{current}{asset}overlay=0:0:enable='{enable}':eof_action=repeat:repeatlast=1[{next_label}]")
            current = f"[{next_label}]"
        filter_complex = ";".join(parts)
        maps[1] = current
    if r.subtitles and r.subtitles.cues:
        current = maps[1]
        parts = [filter_complex]
        for index, cue in enumerate(r.subtitles.cues):
            next_label = f"subtitleout{index}"
            input_index = len(r.text_overlays) + len(r.image_overlays) + index + 1
            parts.append(f"{current}[{input_index}:v]overlay=0:0:enable='gte(t,{_sec(cue.start_ms)})*lt(t,{_sec(cue.end_ms)})':eof_action=repeat:repeatlast=1[{next_label}]")
            current = f"[{next_label}]"
        filter_complex = ";".join(parts)
        maps[1] = current
    if meta.width % 2 or meta.height % 2:
        filter_complex += f";{maps[1]}scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic[even]"
        maps[1] = "[even]"
    output_ms, _ = transition_layout(retained_ranges(meta.duration_ms, r.trim, r.remove_segments), r.playback_speed, r.video_transitions)
    original_automation = _automation_expression(r.audio_keyframes.original) if r.audio_keyframes else None
    if audio_label and original_automation:
        filter_complex += f";[{audio_label}]volume='{original_automation}':eval=frame[originalauto]"
        audio_label = "originalauto"
        maps = ["-map", maps[1], "-map", "[originalauto]"]
    music = r.audio_mix.tracks[0] if r.audio_mix and r.audio_mix.enabled and r.audio_mix.tracks and not (r.audio and r.audio.mode == "mute") else None
    if r.audio_mix and r.audio_mix.enabled and not (r.audio and r.audio.mode == "mute"):
        parts = [filter_complex]
        if audio_label:
            parts.append(f"[{audio_label}]volume={r.audio_mix.source_volume:.3f}[sourcevol]")
            audio_label = "sourcevol"
        if music:
            effective_ms = min(music.trim_end_ms - music.trim_start_ms, output_ms - music.start_ms)
            input_index = len(r.text_overlays) + len(r.image_overlays) + len(r.subtitles.cues if r.subtitles else []) + 1
            chain = f"[{input_index}:a]atrim=start={_sec(music.trim_start_ms)}:end={_sec(music.trim_start_ms + effective_ms)},asetpts=PTS-STARTPTS,aresample=async=1,volume={music.volume:.3f}"
            if music.fade_in_ms:
                chain += f",afade=t=in:st=0:d={_sec(music.fade_in_ms)}"
            if music.fade_out_ms:
                chain += f",afade=t=out:st={_sec(effective_ms - music.fade_out_ms)}:d={_sec(music.fade_out_ms)}"
            music_automation = _automation_expression(r.audio_keyframes.background_music, music.start_ms) if r.audio_keyframes else None
            if music_automation:
                chain += f",volume='{music_automation}':eval=frame"
            if music.start_ms:
                chain += f",adelay={music.start_ms}:all=1"
            parts.append(chain + "[music]")
            if audio_label:
                parts.append(f"[{audio_label}][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0[mixed]")
            else:
                parts.append("[music]alimiter=limit=0.95:level=0[mixed]")
            audio_label = "mixed"
        filter_complex = ";".join(parts)
        maps = ["-map", maps[1]] + (["-map", f"[{audio_label}]"] if audio_label else [])
    if r.output_fps:
        filter_complex += f";{maps[1]}fps={r.output_fps:.3f}[outputfps]"
        maps[1] = "[outputfps]"
    if r.video_fade:
        effects = []
        fade_in = r.video_fade.fade_in
        fade_out = r.video_fade.fade_out
        if fade_in.enabled and fade_in.duration_ms:
            effects.append(f"fade=t=in:st=0:d={_sec(fade_in.duration_ms)}:color=black")
        if fade_out.enabled and fade_out.duration_ms:
            effects.append(f"fade=t=out:st={_sec(output_ms - fade_out.duration_ms)}:d={_sec(fade_out.duration_ms)}:color=black")
        if effects:
            filter_complex += f";{maps[1]}{','.join(effects)}[vfaded]"
            maps[1] = "[vfaded]"
    args = ["-filter_complex", filter_complex] + maps + ["-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p"]
    if audio_label:
        args += ["-c:a", "aac"]
    if music or active_transitions:
        args += ["-t", _sec(output_ms)]

    if r.bitrate and r.bitrate.video_kbps:
        args += ["-b:v", f"{r.bitrate.video_kbps}k"]
    if r.bitrate and r.bitrate.audio_kbps and (meta.has_audio or music) and not (r.audio and r.audio.mode == "mute"):
        args += ["-b:a", f"{r.bitrate.audio_kbps}k"]

    return PlanResponse(
        mode="video",
        container=r.container,
        ffmpeg_args=args,
        outputs=[{"name": f"output.{r.container}", "kind": "video"}],
        music_source_id=music.source_id if music else None,
    )
