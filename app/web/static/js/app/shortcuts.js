function clamp(value, durationMs) {
  return Math.max(0, Math.min(Math.max(0, durationMs), Math.round(value)));
}

export function getShortcutAction(event) {
  if (event.altKey) return null;
  const key = String(event.key || "");
  const lowerKey = key.toLowerCase();
  const modifier = Boolean(event.ctrlKey || event.metaKey);
  if (modifier) {
    if (lowerKey === "z") return event.shiftKey ? "redo" : "undo";
    if (lowerKey === "y" && !event.shiftKey) return "redo";
    return null;
  }
  if (event.shiftKey && !["ArrowLeft", "ArrowRight"].includes(key)) return null;
  if (key === " " || event.code === "Space") return "toggle-playback";
  if (key === "ArrowLeft") return event.shiftKey ? "seek-fine-backward" : "seek-backward";
  if (key === "ArrowRight") return event.shiftKey ? "seek-fine-forward" : "seek-forward";
  if (key === "Home" && !event.shiftKey) return "seek-start";
  if (key === "End" && !event.shiftKey) return "seek-end";
  if (lowerKey === "i" && !event.shiftKey) return "trim-start";
  if (lowerKey === "o" && !event.shiftKey) return "trim-end";
  return null;
}

export function calculateSeekMs(currentMs, durationMs, action) {
  const duration = Math.max(0, Math.round(Number(durationMs) || 0));
  const current = clamp(Number(currentMs) || 0, duration);
  if (action === "seek-start") return 0;
  if (action === "seek-end") return duration;
  if (action === "seek-backward") return clamp(current - 1000, duration);
  if (action === "seek-forward") return clamp(current + 1000, duration);
  if (action === "seek-fine-backward") return clamp(current - 100, duration);
  if (action === "seek-fine-forward") return clamp(current + 100, duration);
  return null;
}

export function calculateTrimMs(currentMs, trim, boundary, durationMs) {
  const duration = Math.max(0, Math.round(Number(durationMs) || 0));
  const current = clamp(Number(currentMs) || 0, duration);
  const start = clamp(trim?.startMs ?? 0, duration);
  const end = clamp(trim?.endMs ?? duration, duration);
  if (boundary === "start" && current < end) return { startMs: current, endMs: end };
  if (boundary === "end" && current > start) return { startMs: start, endMs: current };
  return null;
}

function isProtectedNode(node) {
  if (!node || typeof node !== "object" || !node.tagName) return false;
  const tag = String(node.tagName).toUpperCase();
  return ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "A"].includes(tag)
    || Boolean(node.isContentEditable)
    || node.getAttribute?.("role") === "textbox"
    || node.getAttribute?.("role") === "button";
}

function isProtectedTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  const active = typeof document !== "undefined" ? document.activeElement : null;
  return [...path, active].some(isProtectedNode);
}

export function bindKeyboardShortcuts({ isActive, getCurrentMs, getDurationMs, getTrim, onTogglePlayback, onSeek, onTrim, onUndo, onRedo }) {
  const handleKeydown = (event) => {
    const action = getShortcutAction(event);
    if (!action || event.repeat || !isActive() || isProtectedTarget(event)) return;
    let handled = false;
    if (action === "toggle-playback") handled = onTogglePlayback() !== false;
    else if (action.startsWith("seek-")) handled = onSeek(calculateSeekMs(getCurrentMs(), getDurationMs(), action)) !== false;
    else if (action === "trim-start") handled = onTrim("start", calculateTrimMs(getCurrentMs(), getTrim(), "start", getDurationMs())) !== false;
    else if (action === "trim-end") handled = onTrim("end", calculateTrimMs(getCurrentMs(), getTrim(), "end", getDurationMs())) !== false;
    else if (action === "undo") handled = onUndo() !== false;
    else if (action === "redo") handled = onRedo() !== false;
    if (!handled) return;
    event.preventDefault();
  };
  document.addEventListener("keydown", handleKeydown);
  return () => document.removeEventListener("keydown", handleKeydown);
}
