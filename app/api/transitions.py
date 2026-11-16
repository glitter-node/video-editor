import math
from typing import Literal, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator


class VideoTransition(BaseModel):
    boundary_id: str = Field(pattern=r"^boundary-[0-9]+-[0-9]+$", max_length=64)
    type: Literal["none", "crossfade", "fadeblack", "wipeleft", "wiperight"] = "none"
    duration_ms: int = Field(default=500, strict=True, ge=100, le=3000)

    @model_validator(mode="after")
    def valid_step(self):
        if self.duration_ms % 100:
            raise ValueError("Transition duration must be between 0.1 and 3.0 seconds in 0.1-second steps.")
        return self


def retained_ranges(duration_ms: int, trim, segments) -> list[tuple[int, int]]:
    start = trim.start_ms if trim else 0
    end = trim.end_ms if trim and trim.end_ms is not None else duration_ms
    end = min(end, duration_ms)
    cuts = sorted((max(start, item.start_ms), min(end, item.end_ms)) for item in segments)
    ranges = []
    cursor = start
    for cut_start, cut_end in cuts:
        if cut_end <= cursor:
            continue
        if cut_start > cursor:
            ranges.append((cursor, min(cut_start, end)))
        cursor = min(end, max(cursor, cut_end))
        if cursor >= end:
            break
    if cursor < end:
        ranges.append((cursor, end))
    return [(a, b) for a, b in ranges if a < b]


def transition_layout(ranges: list[tuple[int, int]], speed: float, transitions: list[VideoTransition]) -> tuple[int, list[tuple[str, float, float, Optional[VideoTransition]]]]:
    if not ranges:
        raise HTTPException(status_code=422, detail="no remaining segments")
    boundary_ids = [f"boundary-{ranges[index][1]}-{ranges[index + 1][0]}" for index in range(len(ranges) - 1)]
    entries = {}
    for item in transitions:
        if item.boundary_id not in boundary_ids or item.boundary_id in entries:
            raise HTTPException(status_code=422, detail="Invalid transition boundary")
        entries[item.boundary_id] = item
    durations = [(end - start) / speed for start, end in ranges]
    overlaps = [entries[key].duration_ms if key in entries and entries[key].type != "none" else 0 for key in boundary_ids]
    for index, length in enumerate(durations):
        before = overlaps[index - 1] if index else 0
        after = overlaps[index] if index < len(overlaps) else 0
        if before + after > length + 0.000001:
            raise HTTPException(status_code=422, detail="Transition duration exceeds available segment length")
    total = math.floor(sum(end - start for start, end in ranges) / speed - sum(overlaps) + 0.5)
    if total < 1:
        raise HTTPException(status_code=422, detail="invalid output duration")
    boundaries = []
    elapsed = 0.0
    for index, key in enumerate(boundary_ids):
        elapsed += durations[index]
        duration = overlaps[index]
        boundaries.append((key, elapsed - duration, elapsed, entries.get(key)))
        elapsed -= duration
    return total, boundaries
