import { chooseTickStep, clampMs, formatTime } from "./time.js";

const zoomLevels = [1, 2, 4, 8, 16];
const minimumSegmentMs = 1;

function percent(value, durationMs) {
  if (!durationMs) return 0;
  return Math.max(0, Math.min(100, (value / durationMs) * 100));
}

function clampScroll(viewport, value) {
  return Math.max(0, Math.min(Math.max(0, viewport.scrollWidth - viewport.clientWidth), value));
}

export function createTimeline({ root, viewport, canvas, track, ruler, thumbnails, segmentsLayer, trimRange, playhead, startHandle, endHandle, current, total, empty, zoomIn, zoomOut, zoomFit, zoomValue, translate = (key, values) => key, getDuration, getCurrent, getTrim, onSeek, onTrimPreview, onTrimChange, onSegmentSelect, onSegmentPreview, onSegmentChange, onSegmentDelete, onZoomChange }) {
  let durationMs = 0;
  let trimStartMs = 0;
  let trimEndMs = 0;
  let currentMs = 0;
  let zoom = 1;
  let playing = false;
  let interactive = true;
  let manualScroll = false;
  let selectedIndex = -1;
  let segments = [];
  let dragging = null;

  function position(node, value) {
    node.style.left = `${percent(value, durationMs)}%`;
  }

  function updateAria(node, value, label) {
    node.setAttribute("aria-valuemin", "0");
    node.setAttribute("aria-valuemax", String(durationMs));
    node.setAttribute("aria-valuenow", String(value));
    node.setAttribute("aria-valuetext", formatTime(value));
    node.dataset.timeLabel = label || formatTime(value);
  }

  function applyCanvasWidth() {
    canvas.style.width = `${zoom * 100}%`;
    zoomValue.textContent = `${zoom}x`;
    zoomIn.disabled = !durationMs || zoom >= zoomLevels[zoomLevels.length - 1] || !interactive;
    zoomOut.disabled = !durationMs || zoom <= zoomLevels[0] || !interactive;
    zoomFit.disabled = !durationMs || zoom === 1 || !interactive;
  }

  function followPlayhead() {
    if (!playing || manualScroll || zoom <= 1 || !durationMs) return;
    const target = (currentMs / durationMs) * canvas.scrollWidth;
    const left = viewport.scrollLeft;
    const right = left + viewport.clientWidth;
    const margin = Math.min(80, viewport.clientWidth * 0.15);
    if (target < left + margin || target > right - margin) viewport.scrollLeft = clampScroll(viewport, target - viewport.clientWidth / 2);
  }

  function centerOnCurrent() {
    if (!durationMs) return;
    const target = (currentMs / durationMs) * canvas.scrollWidth;
    viewport.scrollLeft = clampScroll(viewport, target - viewport.clientWidth / 2);
  }

  function renderRuler() {
    ruler.replaceChildren();
    if (!durationMs) return;
    const step = chooseTickStep(durationMs / zoom);
    const start = Math.max(0, Math.floor((viewport.scrollLeft / Math.max(1, canvas.scrollWidth)) * durationMs / step) * step - step);
    const end = Math.min(durationMs, Math.ceil(((viewport.scrollLeft + viewport.clientWidth) / Math.max(1, canvas.scrollWidth)) * durationMs / step) * step + step);
    for (let value = start; value <= end; value += step) {
      const tick = document.createElement("span");
      tick.className = "timeline-tick";
      tick.style.left = `${percent(value, durationMs)}%`;
      tick.textContent = formatTime(value);
      ruler.appendChild(tick);
    }
  }

  function setSegmentLabel(item, index, start, end) {
    item.setAttribute("aria-label", translate("timeline.removedSegmentAria", { index: index + 1, start: formatTime(start), end: formatTime(end) }));
    item.title = translate("timeline.removedTitle", { start: formatTime(start), end: formatTime(end) });
    const label = item.querySelector(".timeline-segment-label");
    if (label) label.textContent = translate("timeline.removedLabel", { start: formatTime(start), end: formatTime(end) });
  }

  function renderSegments() {
    if (dragging?.type.startsWith("segment")) return;
    segmentsLayer.replaceChildren();
    segments.forEach((segment, index) => {
      const start = clampMs(segment.start_ms, durationMs);
      const end = clampMs(segment.end_ms, durationMs);
      if (start >= end) return;
      const item = document.createElement("div");
      item.className = `timeline-segment${index === selectedIndex ? " is-selected" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.style.left = `${percent(start, durationMs)}%`;
      item.style.width = `${percent(end - start, durationMs)}%`;
      const label = document.createElement("span");
      label.className = "timeline-segment-label";
      item.appendChild(label);
      const leftHandle = document.createElement("button");
      leftHandle.type = "button";
      leftHandle.className = "timeline-segment-handle timeline-segment-handle-left";
      leftHandle.setAttribute("aria-label", translate("timeline.resizeStart", { index: index + 1 }));
      const rightHandle = document.createElement("button");
      rightHandle.type = "button";
      rightHandle.className = "timeline-segment-handle timeline-segment-handle-right";
      rightHandle.setAttribute("aria-label", translate("timeline.resizeEnd", { index: index + 1 }));
      item.append(leftHandle, rightHandle);
      setSegmentLabel(item, index, start, end);

      const select = () => { selectedIndex = index; item.classList.add("is-selected"); onSegmentSelect?.(index, start, end); };
      const begin = (event, type) => {
        if (!interactive) return;
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = index;
        dragging = { type: `segment-${type}`, index, node: type === "move" ? item : type === "start" ? leftHandle : rightHandle, initialX: event.clientX, initialStart: start, initialEnd: end, moved: false };
        dragging.node.setPointerCapture?.(event.pointerId);
        root.classList.add("is-dragging");
      };
      item.addEventListener("pointerdown", (event) => begin(event, "move"));
      leftHandle.addEventListener("pointerdown", (event) => begin(event, "start"));
      rightHandle.addEventListener("pointerdown", (event) => begin(event, "end"));
      item.addEventListener("click", (event) => { event.stopPropagation(); if (!dragging?.moved) select(); });
      item.addEventListener("keydown", (event) => { if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); select(); onSegmentDelete?.(index); } });
      segmentsLayer.appendChild(item);
    });
  }

  function setHandleValue(handle, value, label) {
    position(handle, value);
    updateAria(handle, value, label);
  }

  function update(data = {}) {
    durationMs = clampMs(data.durationMs ?? getDuration?.() ?? 0);
    const trim = data.trim || getTrim?.() || {};
    trimStartMs = clampMs(trim.startMs ?? 0, durationMs);
    trimEndMs = clampMs(trim.endMs ?? durationMs, durationMs);
    if (durationMs && trimEndMs <= trimStartMs) trimEndMs = Math.min(durationMs, trimStartMs + 1);
    currentMs = clampMs(data.currentMs ?? getCurrent?.() ?? 0, durationMs);
    if (!dragging?.type.startsWith("segment")) segments = (data.segments || []).map((segment) => ({ start_ms: clampMs(segment.start_ms, durationMs), end_ms: clampMs(segment.end_ms, durationMs) })).filter((segment) => segment.start_ms < segment.end_ms);
    root.hidden = !durationMs;
    empty.hidden = Boolean(durationMs);
    track.setAttribute("aria-valuemax", String(durationMs));
    applyCanvasWidth();
    position(playhead, currentMs);
    trimRange.style.left = `${percent(trimStartMs, durationMs)}%`;
    trimRange.style.width = `${percent(trimEndMs - trimStartMs, durationMs)}%`;
    setHandleValue(startHandle, trimStartMs, translate("timeline.trimStart"));
    setHandleValue(endHandle, trimEndMs, translate("timeline.trimEnd"));
    updateAria(playhead, currentMs, translate("timeline.playhead"));
    current.textContent = formatTime(currentMs);
    total.textContent = formatTime(durationMs);
    renderSegments();
    renderRuler();
    followPlayhead();
  }

  function valueFromPointer(event) {
    const rect = track.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    return clampMs(ratio * durationMs, durationMs);
  }

  function updateSegmentDrag(event) {
    if (!dragging || !dragging.type.startsWith("segment")) return;
    const delta = valueFromPointer(event) - valueFromPointer({ clientX: dragging.initialX, clientY: event.clientY });
    const segment = segments[dragging.index];
    if (!segment) return;
    const length = dragging.initialEnd - dragging.initialStart;
    let start = dragging.initialStart;
    let end = dragging.initialEnd;
    if (dragging.type === "segment-move") {
      start = Math.max(0, Math.min(durationMs - length, dragging.initialStart + delta));
      end = start + length;
    } else if (dragging.type === "segment-start") {
      start = Math.max(0, Math.min(dragging.initialEnd - minimumSegmentMs, dragging.initialStart + delta));
    } else if (dragging.type === "segment-end") {
      end = Math.min(durationMs, Math.max(dragging.initialStart + minimumSegmentMs, dragging.initialEnd + delta));
    }
    segment.start_ms = Math.round(start);
    segment.end_ms = Math.round(end);
    dragging.moved = true;
    const item = dragging.node.closest(".timeline-segment");
    if (item) {
      item.style.left = `${percent(segment.start_ms, durationMs)}%`;
      item.style.width = `${percent(segment.end_ms - segment.start_ms, durationMs)}%`;
      setSegmentLabel(item, dragging.index, segment.start_ms, segment.end_ms);
    }
    onSegmentPreview?.(dragging.index, segment.start_ms, segment.end_ms);
  }

  function finishDrag(event) {
    if (!dragging) return;
    const active = dragging;
    if (active.node.hasPointerCapture?.(event.pointerId)) active.node.releasePointerCapture(event.pointerId);
    dragging = null;
    root.classList.remove("is-dragging");
    if ((active.type === "start" || active.type === "end") && active.moved) onTrimChange?.(trimStartMs, trimEndMs);
    if (active.type.startsWith("segment") && active.moved) {
      const segment = segments[active.index];
      if (segment) onSegmentChange?.(active.index, segment.start_ms, segment.end_ms);
      renderSegments();
    }
  }

  function moveDrag(event) {
    if (!dragging) return;
    if (dragging.type.startsWith("segment")) { updateSegmentDrag(event); return; }
    const value = valueFromPointer(event);
    if (dragging.type === "playhead") {
      currentMs = value;
      position(playhead, currentMs);
      current.textContent = formatTime(currentMs);
      updateAria(playhead, currentMs, "Playhead");
      onSeek?.(currentMs);
      return;
    }
    if (dragging.type === "start") trimStartMs = Math.min(value, trimEndMs - 1);
    if (dragging.type === "end") trimEndMs = Math.max(value, trimStartMs + 1);
    dragging.moved = true;
    trimStartMs = clampMs(trimStartMs, durationMs);
    trimEndMs = clampMs(trimEndMs, durationMs);
    setHandleValue(startHandle, trimStartMs, "Trim start");
    setHandleValue(endHandle, trimEndMs, "Trim end");
    trimRange.style.left = `${percent(trimStartMs, durationMs)}%`;
    trimRange.style.width = `${percent(trimEndMs - trimStartMs, durationMs)}%`;
      onTrimPreview?.(trimStartMs, trimEndMs);
  }

  function startDrag(event, type, node) {
    if (!durationMs || !interactive) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = { type, node, moved: false };
    node.setPointerCapture?.(event.pointerId);
    root.classList.add("is-dragging");
    moveDrag(event);
  }

  function seekFromTrack(event) {
    if (!durationMs || !interactive || event.target.closest(".timeline-handle, .timeline-playhead, .timeline-segment")) return;
    const value = valueFromPointer(event);
    currentMs = value;
    position(playhead, currentMs);
    current.textContent = formatTime(currentMs);
    updateAria(playhead, currentMs, "Playhead");
    onSeek?.(currentMs);
  }

  function keyboardTrim(event, type) {
    if (!durationMs || !interactive) return;
    const step = event.shiftKey ? 1000 : 100;
    let value = type === "start" ? trimStartMs : trimEndMs;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") value -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") value += step;
    else if (event.key === "Home") value = type === "start" ? 0 : trimStartMs + 1;
    else if (event.key === "End") value = type === "end" ? durationMs : trimEndMs - 1;
    else return;
    event.preventDefault();
    if (type === "start") trimStartMs = clampMs(Math.min(value, trimEndMs - 1), durationMs);
    else trimEndMs = clampMs(Math.max(value, trimStartMs + 1), durationMs);
    setHandleValue(startHandle, trimStartMs, "Trim start");
    setHandleValue(endHandle, trimEndMs, "Trim end");
    onTrimChange?.(trimStartMs, trimEndMs);
  }

  function setZoom(nextZoom, center = true) {
    const index = zoomLevels.indexOf(nextZoom);
    if (index < 0) return;
    zoom = zoomLevels[index];
    applyCanvasWidth();
    if (zoom === 1) { manualScroll = false; viewport.scrollLeft = 0; }
    else if (center) { manualScroll = false; centerOnCurrent(); }
    renderRuler();
    onZoomChange?.(zoom);
  }

  startHandle.addEventListener("pointerdown", (event) => startDrag(event, "start", startHandle));
  endHandle.addEventListener("pointerdown", (event) => startDrag(event, "end", endHandle));
  playhead.addEventListener("pointerdown", (event) => startDrag(event, "playhead", playhead));
  startHandle.addEventListener("keydown", (event) => keyboardTrim(event, "start"));
  endHandle.addEventListener("keydown", (event) => keyboardTrim(event, "end"));
  track.addEventListener("pointerdown", seekFromTrack);
  track.addEventListener("pointermove", moveDrag);
  track.addEventListener("pointerup", finishDrag);
  track.addEventListener("pointercancel", finishDrag);
  track.addEventListener("keydown", (event) => { if ((event.key === "Delete" || event.key === "Backspace") && selectedIndex >= 0) { event.preventDefault(); onSegmentDelete?.(selectedIndex); selectedIndex = -1; } });
  viewport.addEventListener("scroll", () => { manualScroll = true; renderRuler(); });
  viewport.addEventListener("pointerdown", () => { manualScroll = true; });
  track.addEventListener("lostpointercapture", () => { if (dragging) { dragging = null; root.classList.remove("is-dragging"); } });
  zoomIn.addEventListener("click", () => setZoom(zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(zoom) + 1)]));
  zoomOut.addEventListener("click", () => setZoom(zoomLevels[Math.max(0, zoomLevels.indexOf(zoom) - 1)]));
  zoomFit.addEventListener("click", () => setZoom(1, false));

  if (typeof ResizeObserver === "function") new ResizeObserver(() => { applyCanvasWidth(); renderRuler(); }).observe(viewport);

  return {
    update,
    setPlayback(value) { playing = Boolean(value); followPlayhead(); },
    setInteractive(value) { interactive = Boolean(value); root.classList.toggle("is-disabled", !interactive); applyCanvasWidth(); },
    clearSelection() { selectedIndex = -1; renderSegments(); },
    setZoom,
    getZoom: () => zoom,
    resetScroll() { manualScroll = false; viewport.scrollLeft = 0; },
  };
}
