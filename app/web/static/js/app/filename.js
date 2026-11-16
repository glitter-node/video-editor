const fallbackStem = "video_edited";

function safeExtension(value, fallback = "mp4") {
  const extension = String(value ?? "").trim().replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : fallback;
}

function sourceStem(sourceName) {
  const name = String(sourceName ?? "").split(/[\\/]/).pop() || "";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : dot === 0 ? "" : name;
  const safe = stem
    .replace(/[\u0000-\u001f\u007f\\/]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return safe && safe !== "." && safe !== ".." ? safe : "video";
}

function normalizeEditedStem(stem) {
  const normalized = String(stem).replace(/(?:_edited)+$/i, "");
  return `${normalized || "video"}_edited`;
}

export function buildOutputFilename(sourceName, extension) {
  return `${normalizeEditedStem(sourceStem(sourceName))}.${safeExtension(extension)}`;
}

export function outputExtension(outputName, kind, container) {
  const name = String(outputName ?? "");
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  if (match) return safeExtension(match[1]);
  if (kind === "image") return "png";
  if (kind === "audio") return safeExtension(container, "mp3");
  return safeExtension(container);
}
