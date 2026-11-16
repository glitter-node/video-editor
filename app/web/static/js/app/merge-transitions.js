const types = new Set(["none", "crossfade", "fadeblack", "wipeleft", "wiperight"]);

export function mergeBoundaryKey(fromId, toId) {
  return `${fromId}|${toId}`;
}

export function mergeBoundaries(order) {
  return order.slice(0, -1).map((fromId, index) => ({ fromId, toId: order[index + 1], key: mergeBoundaryKey(fromId, order[index + 1]), index }));
}

export function mergeTransitionLayout(clips, settings) {
  const boundaries = [];
  const positions = [];
  let elapsed = 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const length = clip.duration_ms;
    positions.push({ id: clip.id, start: elapsed, end: elapsed + length, duration: length });
    if (index < clips.length - 1) {
      const next = clips[index + 1];
      const key = mergeBoundaryKey(clip.id, next.id);
      const item = settings.get(key);
      if (item && (!types.has(item.type) || !Number.isInteger(item.duration_ms) || item.duration_ms < 100 || item.duration_ms > 3000 || item.duration_ms % 100)) throw new Error("merge.transitionInvalidDuration");
      const duration = item && item.type !== "none" ? item.duration_ms : 0;
      boundaries.push({ key, fromId: clip.id, toId: next.id, index, type: item?.type || "none", duration, start: elapsed + length - duration, end: elapsed + length });
      elapsed += length - duration;
    } else elapsed += length;
  }
  positions.forEach((clip, index) => {
    const before = index ? boundaries[index - 1].duration : 0;
    const after = index < boundaries.length ? boundaries[index].duration : 0;
    if (before + after > clip.duration) throw new Error("merge.transitionOverlap");
  });
  if (clips.length && elapsed < 1) throw new Error("merge.transitionOverlap");
  return { clips: positions, boundaries, duration: elapsed };
}

export function activeMergeTransitions(order, settings) {
  return mergeBoundaries(order).flatMap(({ fromId, toId, key }) => {
    const item = settings.get(key);
    return item ? [{ from_id: fromId, to_id: toId, type: item.type, duration_ms: item.duration_ms }] : [];
  });
}
