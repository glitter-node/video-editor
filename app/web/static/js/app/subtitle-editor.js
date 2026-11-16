export const defaultSubtitleStyle = { font_size: 36, color: "#FFFFFF", outline_color: "#000000", outline_width: 2, alignment: "center", bottom_margin: 8 };
export const maxSubtitleCues = 100;
export const maxSubtitleTextLength = 160;

export function sortedSubtitleCues(cues) {
  return [...cues].sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms || String(a.id).localeCompare(String(b.id)));
}

export function validateSubtitles(subtitles, duration) {
  const cues = subtitles?.cues || [];
  const style = { ...defaultSubtitleStyle, ...(subtitles?.style || {}) };
  if (!Array.isArray(cues) || cues.length > maxSubtitleCues) throw new Error("subtitle.invalidCues");
  if (!Number.isInteger(style.font_size) || style.font_size < 8 || style.font_size > 120 || !Number.isInteger(style.outline_width) || style.outline_width < 0 || style.outline_width > 10 || !Number.isInteger(style.bottom_margin) || style.bottom_margin < 0 || style.bottom_margin > 40 || !["left", "center", "right"].includes(style.alignment) || !/^#[0-9a-fA-F]{6}$/.test(style.color) || !/^#[0-9a-fA-F]{6}$/.test(style.outline_color)) throw new Error("subtitle.invalidStyle");
  const ids = new Set();
  const ordered = sortedSubtitleCues(cues);
  for (const [index, cue] of ordered.entries()) {
    if (typeof cue.id !== "string" || cue.id.length > 32 || !/^subtitle-[1-9][0-9]*$/.test(cue.id) || ids.has(cue.id)) throw new Error("subtitle.invalidCues");
    ids.add(cue.id);
    if (typeof cue.text !== "string" || !cue.text.trim() || Array.from(cue.text).length > maxSubtitleTextLength || /[\u0000-\u0008\u000B-\u000D\u000E-\u001F\u007F]/.test(cue.text)) throw new Error("subtitle.textRequired");
    if (cue.text.split("\n").length > 2) throw new Error("subtitle.twoLines");
    if (!Number.isInteger(cue.start_ms) || !Number.isInteger(cue.end_ms) || cue.start_ms < 0 || cue.end_ms <= cue.start_ms) throw new Error("subtitle.invalidTime");
    if (cue.end_ms > duration) throw new Error("subtitle.outOfRange");
    if (index && ordered[index - 1].end_ms > cue.start_ms) throw new Error("subtitle.overlap");
  }
  return { cues: ordered, style };
}

function timestamp(value, separator) {
  const pattern = separator === "," ? /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/ : /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/;
  const match = pattern.exec(value);
  if (!match) throw new Error("subtitle.invalidTime");
  const hours = Number(match[1] || 0), minutes = Number(match[2]), seconds = Number(match[3]), millis = Number(match[4]);
  if (minutes > 59 || seconds > 59) throw new Error("subtitle.invalidTime");
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

export function parseSubtitleFile(content, extension, duration, nextId) {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const vtt = extension === "vtt";
  if (!vtt && extension !== "srt") throw new Error("subtitle.unsupportedFormat");
  const lines = text.split("\n");
  if (vtt) {
    if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0])) throw new Error("subtitle.importFailed");
    lines.shift();
  }
  const blocks = lines.join("\n").trim().split(/\n[ \t]*\n+/).filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const rows = block.split("\n");
    if (vtt && /^NOTE(?:[ \t]|$)/.test(rows[0])) continue;
    if (vtt && /^(STYLE|REGION)(?:[ \t]|$)/.test(rows[0])) throw new Error("subtitle.importFailed");
    if (!rows[0].includes("-->")) {
      if (vtt && rows.length > 1) rows.shift();
      else if (!vtt && /^\d+$/.test(rows[0]) && rows.length > 1) rows.shift();
      else throw new Error("subtitle.importFailed");
    }
    const match = /^([^\s]+)\s+-->\s+([^\s]+)(?:\s+.*)?$/.exec(rows.shift());
    if (!match || !rows.length) throw new Error("subtitle.importFailed");
    const start_ms = timestamp(match[1], vtt ? "." : ",");
    const end_ms = timestamp(match[2], vtt ? "." : ",");
    const cueText = rows.join("\n");
    cues.push({ id: nextId(), start_ms, end_ms, text: cueText });
  }
  if (!cues.length) throw new Error("subtitle.importFailed");
  return validateSubtitles({ cues, style: defaultSubtitleStyle }, duration).cues;
}

export function paintSubtitle(context, cue, style, width, height) {
  const lines = cue.text.split("\n");
  const ratio = height / 1080;
  let size = Math.max(1, style.font_size * ratio);
  context.textAlign = style.alignment;
  context.textBaseline = "top";
  context.lineJoin = "round";
  context.font = `600 ${size}px sans-serif`;
  const widest = Math.max(...lines.map((line) => context.measureText(line).width));
  if (widest > width * 0.9) { size *= width * 0.9 / widest; context.font = `600 ${size}px sans-serif`; }
  const lineHeight = size * 1.2;
  const x = style.alignment === "left" ? width * 0.05 : style.alignment === "right" ? width * 0.95 : width / 2;
  const y = height * (1 - style.bottom_margin / 100) - lineHeight * lines.length;
  context.fillStyle = style.color;
  context.strokeStyle = style.outline_color;
  context.lineWidth = style.outline_width * ratio * 2;
  lines.forEach((line, index) => {
    if (style.outline_width) context.strokeText(line, x, y + index * lineHeight);
    context.fillText(line, x, y + index * lineHeight);
  });
}

export async function renderSubtitleAssets(subtitles, frame) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("subtitle.renderFailed");
  const assets = [];
  for (const cue of subtitles.cues) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    paintSubtitle(context, cue, subtitles.style, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("subtitle.renderFailed");
    assets.push(new Uint8Array(await blob.arrayBuffer()));
  }
  canvas.width = 0;
  canvas.height = 0;
  return assets;
}
