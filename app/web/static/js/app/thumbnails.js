const thumbnailCount = 12;
const frameTimeoutMs = 8000;

function waitFor(video, eventName, signal, ready, checkInitial = true) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Thumbnail generation cancelled", "AbortError")); return; }
    if (checkInitial && ready()) { resolve(); return; }
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, complete);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", cancel);
    };
    const complete = () => { if (!ready()) return; cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Video decode failed: ${video.error?.message || video.error?.code || "unknown media error"}`)); };
    const cancel = () => { cleanup(); reject(new DOMException("Thumbnail generation cancelled", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${eventName}`)); }, frameTimeoutMs);
    video.addEventListener(eventName, complete);
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function decodeFrame(video, seconds, signal) {
  if (signal.aborted) throw new DOMException("Thumbnail generation cancelled", "AbortError");
  if (Math.abs(video.currentTime - seconds) > 0.00001) {
    const seek = waitFor(video, "seeked", signal, () => !video.seeking, false);
    video.currentTime = seconds;
    await seek;
  }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitFor(video, "loadeddata", signal, () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
  }
  if (signal.aborted) throw new DOMException("Thumbnail generation cancelled", "AbortError");
}

export function createThumbnailRenderer(target, onStateChange) {
  let generation = 0;
  let controller = null;
  let activeVideo = null;
  let objectUrl = null;

  function clear() {
    generation += 1;
    controller?.abort();
    controller = null;
    if (activeVideo) {
      activeVideo.removeAttribute("src");
      activeVideo.load();
      activeVideo = null;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    target.replaceChildren();
    target.classList.remove("is-loading", "has-thumbnails");
  }

  async function render(file, durationMs) {
    clear();
    const currentGeneration = generation;
    const localController = new AbortController();
    controller = localController;
    const video = document.createElement("video");
    activeVideo = video;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    objectUrl = url;
    target.classList.add("is-loading");
    onStateChange?.("loading");
    try {
      video.src = url;
      await waitFor(video, "loadedmetadata", localController.signal, () => video.readyState >= HTMLMediaElement.HAVE_METADATA);
      const duration = Math.min(durationMs / 1000, video.duration);
      if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error("Video metadata is incomplete");
      const aspect = video.videoWidth / video.videoHeight;
      const width = Math.max(1, Math.min(160, Math.floor(96 * aspect)));
      const height = Math.max(1, Math.min(96, Math.floor(width / aspect)));
      for (let index = 0; index < thumbnailCount; index += 1) {
        if (currentGeneration !== generation || localController.signal.aborted) return;
        const seconds = Math.min(duration - 0.001, duration * (index + 0.5) / thumbnailCount);
        await decodeFrame(video, seconds, localController.signal);
        if (currentGeneration !== generation || localController.signal.aborted) return;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.className = "timeline-thumbnail";
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas 2D context is unavailable");
        context.drawImage(video, 0, 0, width, height);
        target.appendChild(canvas);
        if (index === 0) onStateChange?.("decoded");
        onStateChange?.("progress", (index + 1) / thumbnailCount);
      }
      target.classList.remove("is-loading");
      target.classList.add("has-thumbnails");
      onStateChange?.("complete");
    } catch (error) {
      if (currentGeneration !== generation || localController.signal.aborted) return;
      target.replaceChildren();
      target.classList.remove("is-loading", "has-thumbnails");
      onStateChange?.("error", error);
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (currentGeneration === generation) {
        controller = null;
        activeVideo = null;
        objectUrl = null;
      }
    }
  }

  return { render, clear };
}
