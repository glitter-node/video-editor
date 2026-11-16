import { sourceIntervalToOutput } from "./transitions.js";

async function request(path, init = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch (error) {
    const failure = new Error("stt.network");
    failure.cause = error;
    throw failure;
  }
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(response.status === 429 ? "stt.rateLimited" : response.status === 413 ? "stt.fileTooLarge" : response.status >= 500 ? "stt.serviceUnavailable" : "stt.requestFailed");
    error.status = response.status;
    error.detail = body?.detail;
    throw error;
  }
  return body;
}

export function submitStt(file, language) {
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("language", language);
  return request("/api/stt/transcriptions", { method: "POST", body });
}

export function sttJobStatus(jobId) {
  return request(`/api/stt/jobs/${encodeURIComponent(jobId)}`);
}

export function sttJobResult(jobId) {
  return request(`/api/stt/jobs/${encodeURIComponent(jobId)}/result`);
}

export function cancelStt(jobId) {
  return request(`/api/stt/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}

function textChunks(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  let remaining = normalized;
  while (remaining.length > 160) {
    let cut = remaining.lastIndexOf(" ", 160);
    if (cut < 1) cut = 160;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function convertSttSegments(segments, layout, speed, nextId, maxCues = 100) {
  const cues = [];
  let invalid = 0;
  let overflow = false;
  for (const segment of Array.isArray(segments) ? segments : []) {
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const chunks = textChunks(segment?.text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !chunks.length) { invalid += 1; continue; }
    const pieces = sourceIntervalToOutput(layout, start * 1000, end * 1000, speed);
    for (const piece of pieces) {
      const duration = piece.end_ms - piece.start_ms;
      chunks.forEach((text, index) => {
        if (cues.length >= maxCues) { overflow = true; return; }
        const cueStart = Math.round(piece.start_ms + duration * index / chunks.length);
        const cueEnd = Math.round(piece.start_ms + duration * (index + 1) / chunks.length);
        if (cueEnd <= cueStart) { invalid += 1; return; }
        cues.push({ id: nextId(), start_ms: cueStart, end_ms: cueEnd, text });
      });
      if (overflow) break;
    }
    if (overflow) break;
    if (!pieces.length) invalid += 1;
  }
  return { cues, invalid, overflow };
}
