const MAX_MOOV_BYTES = 32 * 1024 * 1024;
const WEBM_SCAN_BYTES = 8 * 1024 * 1024;
export const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

export function fpsChoice(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 120) return null;
  const standard = STANDARD_FPS.find((fps) => Math.abs(fps - value) < 0.01);
  return String(standard ?? Number(value.toFixed(3)));
}

export function applyStreamAnalysis(entry, analysis) {
  if (Number.isFinite(analysis.fps) && analysis.fps > 0 && analysis.fps <= 120) {
    entry.detectedFps = analysis.fps;
    entry.fpsKind = analysis.fpsKind;
    if (entry.fpsSource !== "manual") {
      entry.fps = fpsChoice(analysis.fps);
      entry.fpsSource = "detected";
    }
  }
  if (typeof analysis.hasAudio === "boolean") {
    entry.detectedHasAudio = analysis.hasAudio;
    if (entry.audioSource !== "manual") {
      entry.hasAudio = analysis.hasAudio;
      entry.audioSource = "detected";
    }
  }
  return entry;
}

export function setManualFps(entry, value, custom = false) {
  entry.fpsSource = "manual";
  entry.fpsMode = custom ? "custom" : "choice";
  entry.fps = custom ? "" : value;
  return entry;
}

function uint64(view, offset) {
  return Number(view.getBigUint64(offset));
}

function boxes(view, begin, end) {
  const found = [];
  for (let offset = begin; offset + 8 <= end;) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4));
    let header = 8;
    if (size === 1) { if (offset + 16 > end) break; size = uint64(view, offset + 8); header = 16; }
    else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) break;
    found.push({ type, begin: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

function child(view, parent, type) {
  return boxes(view, parent.begin, parent.end).find((box) => box.type === type);
}

function mp4Geometry(view, track, samples) {
  const trackHeader = child(view, track, "tkhd");
  const matrixOffset = trackHeader && trackHeader.begin < trackHeader.end ? trackHeader.begin + (view.getUint8(trackHeader.begin) === 1 ? 52 : 40) : null;
  let rotation = null;
  if (matrixOffset !== null && matrixOffset + 36 <= trackHeader.end) {
    const a = view.getInt32(matrixOffset) / 65536;
    const b = view.getInt32(matrixOffset + 4) / 65536;
    const c = view.getInt32(matrixOffset + 12) / 65536;
    const d = view.getInt32(matrixOffset + 16) / 65536;
    if (Math.abs(a * a + b * b - 1) < 0.02 && Math.abs(c * c + d * d - 1) < 0.02 && Math.abs(a * c + b * d) < 0.02 && Math.abs(a * d - b * c - 1) < 0.02) {
      const angle = ((Math.round(Math.atan2(b, a) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360;
      if (Math.abs(a - Math.cos(angle * Math.PI / 180)) < 0.02 && Math.abs(b - Math.sin(angle * Math.PI / 180)) < 0.02) rotation = angle;
    }
  }
  const descriptions = samples && child(view, samples, "stsd");
  const entry = descriptions && descriptions.begin + 8 <= descriptions.end ? boxes(view, descriptions.begin + 8, descriptions.end)[0] : null;
  const width = entry && entry.begin + 28 <= entry.end ? view.getUint16(entry.begin + 24) : null;
  const height = entry && entry.begin + 28 <= entry.end ? view.getUint16(entry.begin + 26) : null;
  const aspect = entry && entry.begin + 78 <= entry.end ? boxes(view, entry.begin + 78, entry.end).find((box) => box.type === "pasp") : null;
  const sarWidth = aspect && aspect.begin + 8 <= aspect.end ? view.getUint32(aspect.begin) : null;
  const sarHeight = aspect && aspect.begin + 8 <= aspect.end ? view.getUint32(aspect.begin + 4) : null;
  const sar = sarWidth > 0 && sarHeight > 0 && sarWidth / sarHeight >= 1 / 16 && sarWidth / sarHeight <= 16 ? sarWidth / sarHeight : null;
  const turned = rotation === 90 || rotation === 270;
  const dar = width && height && sar ? (turned ? height / (width * sar) : width * sar / height) : null;
  return { width: width || null, height: height || null, sar, dar, rotation };
}

function parseTrack(view, track) {
  const media = child(view, track, "mdia");
  if (!media) return null;
  const handler = child(view, media, "hdlr");
  if (!handler || handler.begin + 12 > handler.end) return null;
  const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + handler.begin + 8, 4));
  if (type !== "vide" && type !== "soun") return null;
  if (type === "soun") return { type };
  const header = child(view, media, "mdhd");
  const table = child(view, media, "minf");
  const samples = table && child(view, table, "stbl");
  const timing = samples && child(view, samples, "stts");
  let geometry = {};
  try { geometry = mp4Geometry(view, track, samples); } catch {}
  if (!header || !timing) return { type, ...geometry };
  const timescaleOffset = header.begin + (view.getUint8(header.begin) === 1 ? 20 : 12);
  if (timescaleOffset + 4 > header.end || timing.begin + 8 > timing.end) return { type, ...geometry };
  const timescale = view.getUint32(timescaleOffset);
  const count = view.getUint32(timing.begin + 4);
  if (!timescale || !count || count > 100000 || timing.begin + 8 + count * 8 > timing.end) return { type, ...geometry };
  let frames = 0;
  let ticks = 0;
  let fixedDelta = null;
  let variable = false;
  for (let index = 0; index < count; index += 1) {
    const offset = timing.begin + 8 + index * 8;
    const sampleCount = view.getUint32(offset);
    const delta = view.getUint32(offset + 4);
    if (!sampleCount || !delta) return { type, ...geometry };
    frames += sampleCount;
    ticks += sampleCount * delta;
    if (fixedDelta !== null && fixedDelta !== delta) variable = true;
    fixedDelta = delta;
  }
  const fps = frames * timescale / ticks;
  return { type, fps, fpsKind: variable ? "average-vfr" : "fixed", ...geometry };
}

export async function analyzeMp4(file) {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const headerBytes = await file.slice(offset, offset + 16).arrayBuffer();
    const header = new DataView(headerBytes);
    if (header.byteLength < 8) break;
    let size = header.getUint32(0);
    const type = String.fromCharCode(...new Uint8Array(headerBytes, 4, 4));
    if (size === 1) { if (header.byteLength < 16) break; size = uint64(header, 8); }
    else if (size === 0) size = file.size - offset;
    if (!Number.isSafeInteger(size) || size < 8 || offset + size > file.size) break;
    if (type === "moov") {
      if (size > MAX_MOOV_BYTES) throw new Error("MP4 metadata is too large.");
      const data = new DataView(await file.slice(offset, offset + size).arrayBuffer());
      const root = boxes(data, 0, data.byteLength)[0];
      const tracks = boxes(data, root.begin, root.end).filter((box) => box.type === "trak").map((box) => parseTrack(data, box)).filter(Boolean);
      if (!tracks.length) throw new Error("MP4 tracks are unavailable.");
      const video = tracks.find((track) => track.type === "vide");
      if (!video) throw new Error("MP4 video track is unavailable.");
      return { fps: video.fps ?? null, fpsKind: video.fpsKind ?? null, hasAudio: tracks.some((track) => track.type === "soun"), width: video.width, height: video.height, sar: video.sar, dar: video.dar, rotation: video.rotation };
    }
    offset += size;
  }
  throw new Error("MP4 metadata is unavailable.");
}

function vint(view, offset, id = false) {
  if (offset >= view.byteLength) return null;
  const first = view.getUint8(offset);
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > (id ? 4 : 8) || offset + length > view.byteLength) return null;
  let value = id ? first : first & ((1 << (8 - length)) - 1);
  let unknown = !id && value === (1 << (8 - length)) - 1;
  for (let index = 1; index < length; index += 1) value = value * 256 + view.getUint8(offset + index);
  if (!id) {
    for (let index = 1; index < length; index += 1) unknown = unknown && view.getUint8(offset + index) === 255;
    if (unknown) return { value: null, length };
  }
  if (!Number.isSafeInteger(value)) return null;
  return { value, length };
}

function elements(view, begin, end) {
  const found = [];
  for (let offset = begin; offset < end;) {
    const id = vint(view, offset, true);
    const size = id && vint(view, offset + id.length);
    if (!id || !size) break;
    const start = offset + id.length + size.length;
    const finish = size.value === null ? end : start + size.value;
    if (finish > end) break;
    found.push({ id: id.value, begin: start, end: finish });
    offset = finish;
  }
  return found;
}

function integer(view, element) {
  const length = element.end - element.begin;
  if (length < 1 || length > 8) return null;
  let value = 0;
  for (let index = element.begin; index < element.end; index += 1) value = value * 256 + view.getUint8(index);
  return Number.isSafeInteger(value) ? value : null;
}

export async function analyzeWebm(file) {
  const view = new DataView(await file.slice(0, Math.min(file.size, WEBM_SCAN_BYTES)).arrayBuffer());
  const top = elements(view, 0, view.byteLength);
  let segment = top.find((element) => element.id === 0x18538067);
  if (!segment) {
    const header = top.find((element) => element.id === 0x1a45dfa3);
    const offset = header?.end ?? 0;
    const id = vint(view, offset, true);
    const size = id && vint(view, offset + id.length);
    if (id?.value === 0x18538067 && size) segment = { begin: offset + id.length + size.length, end: view.byteLength };
  }
  if (!segment) throw new Error("WebM segment is unavailable.");
  const tracks = elements(view, segment.begin, segment.end).find((element) => element.id === 0x1654ae6b);
  if (!tracks) throw new Error("WebM tracks are unavailable.");
  const entries = elements(view, tracks.begin, tracks.end).filter((element) => element.id === 0xae).map((entry) => {
    const fields = elements(view, entry.begin, entry.end);
    const type = fields.find((field) => field.id === 0x83);
    const duration = fields.find((field) => field.id === 0x23e383);
    const video = fields.find((field) => field.id === 0xe0);
    const videoFields = video ? elements(view, video.begin, video.end) : [];
    const value = (id) => { const field = videoFields.find((item) => item.id === id); return field ? integer(view, field) : null; };
    const width = value(0xb0);
    const height = value(0xba);
    const displayWidth = value(0x54b0);
    const displayHeight = value(0x54ba);
    const displayUnit = value(0x54b2) ?? 0;
    const dar = displayUnit === 0 && displayWidth && displayHeight ? displayWidth / displayHeight : width && height ? width / height : null;
    return { type: type && integer(view, type), duration: duration && integer(view, duration), width, height, dar, sar: width && height && dar ? dar * height / width : null, rotation: null };
  });
  const video = entries.find((entry) => entry.type === 1);
  if (!video) throw new Error("WebM video track is unavailable.");
  return { fps: video.duration ? 1e9 / video.duration : null, fpsKind: video.duration ? "declared" : null, hasAudio: entries.some((entry) => entry.type === 2), width: video.width, height: video.height, sar: video.sar, dar: video.dar, rotation: video.rotation };
}

export async function analyzeStreams(file) {
  const ext = file.name?.split(".").pop()?.toLowerCase();
  const result = ext === "mp4" || ext === "mov"
    ? await analyzeMp4(file)
    : ext === "webm"
      ? await analyzeWebm(file)
      : null;
  if (!result) throw new Error("Stream analysis is unavailable for this format.");
  if (result.fpsKind === "average-vfr" || !Number.isFinite(result.fps) || result.fps <= 0 || result.fps > 240) return { ...result, fps: null, fpsKind: null };
  return result;
}
