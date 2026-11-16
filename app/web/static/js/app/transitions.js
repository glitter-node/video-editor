export function boundaryId(left, right) {
  return `boundary-${left[1]}-${right[0]}`;
}

export function transitionLayout(ranges, speed, settings) {
  const entries = new Map((settings || []).map((item) => [item.boundary_id, item]));
  const segments = [];
  const boundaries = [];
  let elapsed = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const length = (range[1] - range[0]) / speed;
    segments.push({ sourceStart: range[0], sourceEnd: range[1], start: elapsed, end: elapsed + length, length });
    if (index < ranges.length - 1) {
      const id = boundaryId(range, ranges[index + 1]);
      const setting = entries.get(id);
      const duration = setting && setting.type !== "none" ? setting.duration_ms : 0;
      boundaries.push({ id, index, sourceLeft: range, sourceRight: ranges[index + 1], type: setting?.type || "none", duration, start: elapsed + length - duration, end: elapsed + length });
      elapsed += length - duration;
    } else elapsed += length;
  }
  return { segments, boundaries, duration: Math.round(ranges.reduce((total, [start, end]) => total + end - start, 0) / speed - boundaries.reduce((total, item) => total + item.duration, 0)) };
}

export function sourceAtOutput(layout, time, speed) {
  if (!layout.segments.length) return 0;
  const position = Math.max(0, Math.min(layout.duration, time));
  for (const segment of layout.segments) {
    if (position < segment.end) return Math.min(segment.sourceEnd, segment.sourceStart + (position - segment.start) * speed);
  }
  return layout.segments.at(-1).sourceEnd;
}

export function outputAtSource(layout, time, speed) {
  for (const segment of layout.segments) {
    if (time < segment.sourceStart) return null;
    if (time < segment.sourceEnd) return segment.start + (time - segment.sourceStart) / speed;
  }
  return layout.segments.length && time >= layout.segments.at(-1).sourceEnd ? layout.duration : null;
}

export function sourceIntervalToOutput(layout, startMs, endMs, speed) {
  const pieces = [];
  for (const [index, segment] of layout.segments.entries()) {
    const start = Math.max(startMs, segment.sourceStart);
    const end = Math.min(endMs, segment.sourceEnd);
    if (start >= end) continue;
    const boundary = layout.boundaries[index];
    const outputStart = segment.start + (start - segment.sourceStart) / speed;
    const outputEnd = Math.min(segment.start + (end - segment.sourceStart) / speed, boundary?.start ?? segment.end);
    if (outputStart < outputEnd) pieces.push({ start_ms: outputStart, end_ms: outputEnd });
  }
  return pieces;
}

export function transitionAtOutput(layout, time) {
  return layout.boundaries.find((item) => item.duration > 0 && time >= item.start && time < item.end) || null;
}
