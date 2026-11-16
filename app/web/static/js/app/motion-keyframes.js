export const maxMotionFrames = 1200;
export const maxMotionBytes = 128 * 1024 * 1024;
export const maxMotionPixels = 4_000_000;

export function motionPoints(item) {
  return [...(item.motion?.keyframes || [])].sort((a, b) => a.time_ms - b.time_ms || String(a.id).localeCompare(String(b.id)));
}

export function motionAt(item, timeMs) {
  const fallback = { x: item.x_pct ?? item.x * 100, y: item.y_pct ?? item.y * 100, scale: 100, opacity: 100 };
  if (!item.motion?.enabled || !item.motion.keyframes?.length) return fallback;
  const points = motionPoints(item);
  if (timeMs <= points[0].time_ms) return points[0];
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1], right = points[index];
    if (timeMs <= right.time_ms) {
      const progress = (timeMs - left.time_ms) / (right.time_ms - left.time_ms);
      return { x: left.x + (right.x - left.x) * progress, y: left.y + (right.y - left.y) * progress, scale: left.scale + (right.scale - left.scale) * progress, opacity: left.opacity + (right.opacity - left.opacity) * progress };
    }
  }
  return points[points.length - 1];
}

export function motionFrameCount(item, fps) {
  return Math.max(1, Math.ceil((item.end_ms - item.start_ms) * fps / 1000 - 1e-9));
}

export function validateMotion(item, outputDuration, frame, kind) {
  const motion = item.motion;
  if (!motion) return;
  if (typeof motion.enabled !== "boolean" || !Array.isArray(motion.keyframes) || motion.keyframes.length > 100) throw new Error("motion.invalid");
  const ids = new Set(), times = new Set();
  for (const point of motion.keyframes) {
    if (typeof point.id !== "string" || !/^kf-[1-9][0-9]*$/.test(point.id) || point.id.length > 32 || ids.has(point.id)) throw new Error("motion.invalid");
    ids.add(point.id);
    if (!Number.isInteger(point.time_ms) || point.time_ms < item.start_ms || point.time_ms > item.end_ms || point.time_ms > outputDuration) throw new Error("motion.outOfRange");
    if (times.has(point.time_ms)) throw new Error("motion.duplicateTime");
    times.add(point.time_ms);
    if (![point.x, point.y, point.scale, point.opacity].every((value) => typeof value === "number" && Number.isFinite(value)) || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100 || point.scale < 10 || point.scale > 300 || point.opacity < 0 || point.opacity > 100) throw new Error("motion.invalid");
    if (kind === "image") {
      const width = Math.max(1, Math.round(frame.width * item.width_pct / 100 * point.scale / 100));
      const height = Math.max(1, Math.round(width * item.image_height / item.image_width));
      const x = Math.round(frame.width * point.x / 100), y = Math.round(frame.height * point.y / 100);
      if (x + width > frame.width || y + height > frame.height) throw new Error("motion.outsideFrame");
    }
  }
}

export function paintMotionText(context, item, values, width, height) {
  context.save();
  context.globalAlpha = values.opacity / 100;
  context.font = `${item.font_size * values.scale / 100}px sans-serif`;
  context.fillStyle = item.color;
  context.textAlign = item.align;
  context.textBaseline = "top";
  const lineHeight = item.font_size * values.scale / 100 * 1.2;
  item.text.split("\n").forEach((line, index) => context.fillText(line, values.x / 100 * width, values.y / 100 * height + index * lineHeight));
  context.restore();
}

export function paintMotionImage(context, item, image, values, width, height) {
  const imageWidth = Math.max(1, Math.round(width * item.width_pct / 100 * values.scale / 100));
  const imageHeight = Math.max(1, Math.round(imageWidth * item.image_height / item.image_width));
  context.save();
  context.globalAlpha = item.opacity * values.opacity / 100;
  context.drawImage(image, Math.round(width * values.x / 100), Math.round(height * values.y / 100), imageWidth, imageHeight);
  context.restore();
}

export async function renderMotionFrames(item, kind, frame, fps, image, checkCancelled) {
  if (frame.width * frame.height > maxMotionPixels) throw new Error("motion.frameTooLarge");
  const count = motionFrameCount(item, fps);
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("motion.renderFailed");
  const frames = [];
  let bytes = 0;
  try {
    for (let index = 0; index < count; index += 1) {
      checkCancelled?.();
      const time = Math.min(item.end_ms, item.start_ms + index * 1000 / fps);
      const values = motionAt(item, time);
      context.clearRect(0, 0, frame.width, frame.height);
      if (kind === "text") paintMotionText(context, { ...item, font_size: item.font_size * frame.height / (frame.sourceHeight || frame.height) }, values, frame.width, frame.height);
      else paintMotionImage(context, item, image, values, frame.width, frame.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("motion.renderFailed");
      bytes += blob.size;
      if (bytes > maxMotionBytes) throw new Error("motion.memoryLimit");
      frames.push(new Uint8Array(await blob.arrayBuffer()));
    }
    return { frames, fps, start_ms: item.start_ms };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
