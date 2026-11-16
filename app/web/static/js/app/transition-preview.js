import { outputAtSource, transitionAtOutput } from "./transitions.js";

export function createTransitionPreview(canvas, main, onFrame) {
  const other = document.createElement("video");
  other.preload = "auto";
  other.playsInline = true;
  other.muted = true;
  let sourceUrl = null;
  let lastState = { active: false, ready: false, mainGain: 1, otherGain: 0 };

  function setSource(url) {
    other.pause();
    other.removeAttribute("src");
    other.load();
    sourceUrl = url;
    canvas.hidden = true;
  }

  function frameRect() {
    const video = { width: main.clientWidth, height: main.clientHeight };
    const stretched = main.closest(".preview-stage.canvas-enabled");
    const width = stretched ? video.width : Math.min(video.width, video.height * main.videoWidth / main.videoHeight);
    const height = stretched ? video.height : Math.min(video.height, video.width * main.videoHeight / main.videoWidth);
    return { left: (video.width - width) / 2, top: (video.height - height) / 2, width, height };
  }

  function render(layout, speed) {
    const sourceMs = main.currentTime * 1000;
    const outputMs = outputAtSource(layout, sourceMs, speed);
    const boundary = outputMs === null ? null : transitionAtOutput(layout, outputMs);
    if (sourceUrl && layout.boundaries.some((item) => item.duration > 0) && !other.hasAttribute("src")) { other.src = sourceUrl; other.load(); }
    if (other.hasAttribute("src") && !layout.boundaries.some((item) => item.duration > 0)) { other.pause(); other.removeAttribute("src"); other.load(); }
    if (!boundary || !sourceUrl || main.readyState < 2 || !main.videoWidth || !main.videoHeight) {
      const upcoming = outputMs === null ? null : layout.boundaries.find((item) => item.duration > 0 && outputMs >= item.start - 400 && outputMs < item.start);
      if (upcoming && sourceUrl && other.readyState >= 1 && !other.seeking && Math.abs(other.currentTime * 1000 - upcoming.sourceRight[0]) > 150) {
        try { other.currentTime = upcoming.sourceRight[0] / 1000; } catch {}
      }
      other.pause();
      canvas.hidden = true;
      lastState = { active: false, ready: false, mainGain: 1, otherGain: 0 };
      return lastState;
    }
    const progress = Math.max(0, Math.min(1, (outputMs - boundary.start) / boundary.duration));
    const outgoing = boundary.sourceLeft[1] - (boundary.duration - (outputMs - boundary.start)) * speed;
    const incoming = boundary.sourceRight[0] + (outputMs - boundary.start) * speed;
    const mainIsOutgoing = Math.abs(sourceMs - outgoing) <= Math.abs(sourceMs - incoming);
    const target = (mainIsOutgoing ? incoming : outgoing) / 1000;
    try {
      if (other.readyState >= 1 && Math.abs(other.currentTime - target) > 0.08 && !other.seeking) other.currentTime = target;
      other.playbackRate = speed;
    } catch {
      canvas.hidden = true;
      lastState = { active: true, ready: false, mainGain: 1, otherGain: 0 };
      return lastState;
    }
    if (main.paused) other.pause();
    else if (other.paused && other.readyState >= 2) void other.play().catch(() => { other.pause(); });
    const ready = other.readyState >= 2 && !other.seeking && (main.paused || !other.paused) && Math.abs(other.currentTime - target) < 0.2;
    lastState = { active: true, ready, mainGain: mainIsOutgoing ? 1 - progress : progress, otherGain: mainIsOutgoing ? progress : 1 - progress };
    if (!ready) { canvas.hidden = true; return lastState; }
    const rect = frameRect();
    if (!rect.width || !rect.height) { canvas.hidden = true; lastState.ready = false; return lastState; }
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext("2d");
    if (!context) { canvas.hidden = true; lastState.ready = false; return lastState; }
    const left = mainIsOutgoing ? main : other;
    const right = mainIsOutgoing ? other : main;
    try {
    context.clearRect(0, 0, width, height);
    if (boundary.type === "fadeblack") {
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);
      context.globalAlpha = progress < 0.5 ? 1 - 2 * progress : 2 * progress - 1;
      context.drawImage(progress < 0.5 ? left : right, 0, 0, width, height);
    } else {
      context.drawImage(left, 0, 0, width, height);
      if (boundary.type === "crossfade") {
        context.globalAlpha = progress;
        context.drawImage(right, 0, 0, width, height);
      } else {
        context.save();
        const start = boundary.type === "wipeleft" ? width * (1 - progress) : 0;
        context.beginPath();
        context.rect(start, 0, width * progress, height);
        context.clip();
        context.drawImage(right, 0, 0, width, height);
        context.restore();
      }
    }
    context.globalAlpha = 1;
    canvas.hidden = false;
    } catch {
      canvas.hidden = true;
      lastState.ready = false;
    }
    return lastState;
  }

  function destroy() {
    setSource(null);
    lastState = { active: false, ready: false, mainGain: 1, otherGain: 0 };
  }

  other.addEventListener("seeked", onFrame);
  other.addEventListener("loadeddata", onFrame);
  other.addEventListener("playing", onFrame);
  return { other, render, setSource, destroy, getState: () => lastState };
}
