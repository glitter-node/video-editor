const extensions = new Set(["mp4", "mov", "mkv", "webm"]);
export const MAX_MERGE_BYTES = 2 * 1024 ** 3;

export function sourceExtension(file) {
  const ext = file?.name?.split(".").pop()?.toLowerCase();
  if (!extensions.has(ext)) throw new Error("Unsupported video file type.");
  return ext;
}

export function validateAddition(files, incoming) {
  if (files.length + incoming.length > 20) throw new Error("Select at most 20 videos.");
  let total = files.reduce((sum, entry) => sum + entry.file.size, 0);
  for (const file of incoming) {
    sourceExtension(file);
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_MERGE_BYTES) throw new Error("Invalid or oversized video file.");
    total += file.size;
    if (total > MAX_MERGE_BYTES) throw new Error("Total input size exceeds 2 GiB.");
  }
}

export function moveClip(order, id, direction) {
  const from = order.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order.slice();
  const next = order.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function reorderClip(order, draggedId, targetId, after = false) {
  if (draggedId === targetId || !order.includes(draggedId) || !order.includes(targetId)) return order.slice();
  const next = order.filter((id) => id !== draggedId);
  const index = next.indexOf(targetId) + (after ? 1 : 0);
  next.splice(index, 0, draggedId);
  return next;
}

export function parseSecondsMs(value) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) throw new Error("merge.invalidRange");
  const ms = Math.round(Number(text) * 1000);
  if (!Number.isSafeInteger(ms)) throw new Error("merge.invalidRange");
  return ms;
}

export function clipRange(entry) {
  if (!entry.meta) throw new Error("merge.metadataMissing");
  const start_ms = parseSecondsMs(entry.startSeconds ?? "0");
  const end_ms = parseSecondsMs(entry.endSeconds ?? String(entry.meta.duration_ms / 1000));
  if (end_ms <= start_ms || end_ms > entry.meta.duration_ms) throw new Error("merge.invalidRange");
  return { start_ms, end_ms };
}

export function timelineClips(entries, order) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return order.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error("merge.invalidRange");
    const range = clipRange(entry);
    return { id, name: entry.file.name, ...range, duration_ms: range.end_ms - range.start_ms };
  });
}

export function buildMergeRecipe(entries, order, output, transitions = []) {
  if (entries.length < 2 || order.length !== entries.length) throw new Error("Select at least two videos.");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length || new Set(order).size !== entries.length || order.some((id) => !byId.has(id))) throw new Error("Invalid video order.");
  const inputs = entries.map((entry) => {
    const { id, file, meta, fps, hasAudio } = entry;
    if (!meta || !Number.isInteger(meta.duration_ms) || meta.duration_ms < 1 || !Number.isInteger(meta.width) || meta.width < 1 || !Number.isInteger(meta.height) || meta.height < 1) throw new Error(`Metadata unavailable for ${file.name}.`);
    if (fps === "" || fps === null || fps === undefined || !Number.isFinite(Number(fps)) || Number(fps) <= 0 || Number(fps) > 120) throw new Error(`Verify FPS for ${file.name}.`);
    if (typeof hasAudio !== "boolean") throw new Error(`Verify audio presence for ${file.name}.`);
    return { id, container: sourceExtension(file), duration_ms: meta.duration_ms, width: meta.width, height: meta.height, fps: Number(fps), has_audio: hasAudio };
  });
  const width = Number(output.width);
  const height = Number(output.height);
  const fps = Number(output.fps);
  if (!Number.isInteger(width) || width < 2 || width > 3840 || width % 2 || !Number.isInteger(height) || height < 2 || height > 2160 || height % 2 || !Number.isFinite(fps) || fps <= 0 || fps > 60) throw new Error("Invalid output dimensions or FPS.");
  const clips = timelineClips(entries, order).map(({ id, start_ms, end_ms }) => ({ input_id: id, start_ms, end_ms }));
  return { inputs, clips, output: { container: "mp4", width: Number(width), height: Number(height), fps: Number(fps), video_codec: "libx264", audio_codec: "aac", ...(output.video_bitrate ? { video_bitrate: Number(output.video_bitrate) } : {}) }, transitions };
}
