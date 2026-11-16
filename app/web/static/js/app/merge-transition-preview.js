export function createMergeTransitionPreview(elements, translate) {
  const videos = [document.createElement("video"), document.createElement("video")];
  for (const video of videos) { video.muted = true; video.playsInline = true; video.preload = "auto"; }
  const buffers = [document.createElement("canvas"), document.createElement("canvas")];
  const context = elements.canvas.getContext("2d");
  let current = null;
  let signature = "";
  let generation = 0;
  let seekSerial = 0;
  let frameRequest = 0;
  let playing = false;
  let busy = false;
  let elapsed = 0;
  let startedAt = 0;
  let seeking = false;
  let resumeOnSeek = false;
  let statusKey = "merge.previewSelect";
  let urls = [];
  const pending = new Set();
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const duration = () => current?.durationMs || 0;
  const timeText = (value) => `${(value / 1000).toFixed(3)} s`;
  const setStatus = (key) => { statusKey = key; elements.status.textContent = translate(key); };
  const updateUi = () => {
    elements.seek.max = String(duration());
    elements.seek.value = String(Math.round(clamp(elapsed, 0, duration())));
    elements.current.textContent = timeText(elapsed);
    elements.total.textContent = timeText(duration());
    elements.play.textContent = translate(playing ? "merge.previewPause" : "merge.previewPlay");
    elements.play.disabled = busy || statusKey !== "merge.previewReady";
    elements.replay.disabled = busy || statusKey !== "merge.previewReady";
    elements.seek.disabled = busy || statusKey !== "merge.previewReady";
  };
  const stopClock = () => {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    playing = false;
    videos.forEach((video) => video.pause());
    updateUi();
  };
  const abortPending = () => { for (const cancel of pending) cancel(); pending.clear(); };
  const release = () => {
    stopClock();
    seeking = false;
    resumeOnSeek = false;
    abortPending();
    videos.forEach((video) => { video.removeAttribute("src"); video.load(); });
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
  };
  const waitFor = (video, eventName, token) => new Promise((resolve, reject) => {
    if (token !== generation) { reject(new Error("Preview changed.")); return; }
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      video.removeEventListener(eventName, ready);
      video.removeEventListener("error", failed);
      pending.delete(cancel);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("Unable to decode video."));
    const cancel = () => finish(new Error("Preview changed."));
    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    pending.add(cancel);
    timer = setTimeout(() => finish(new Error("Unable to decode video.")), 10000);
  });
  const sourceTimes = (time) => {
    const item = current;
    if (item.durationMs === 0) return [item.fromEndMs, item.toStartMs];
    if (item.type === "none") return [item.fromEndMs - item.leftMs + Math.min(time, item.leftMs), item.toStartMs + Math.max(0, time - item.leftMs)];
    return [item.fromEndMs - item.durationMs + time, item.toStartMs + time];
  };
  const seekVideo = async (video, targetMs, token) => {
    const seconds = clamp(targetMs / 1000, 0, Math.max(0, (video.duration || 0) - 0.001));
    if (Math.abs(video.currentTime - seconds) < 0.003 && video.readyState >= 2) return;
    const waited = waitFor(video, "seeked", token);
    try { video.currentTime = seconds; }
    catch { abortPending(); await waited.catch(() => {}); throw new Error("Unable to decode video."); }
    await waited;
    if (token !== generation || video.readyState < 2) throw new Error("Unable to decode video.");
  };
  const resize = (width, height) => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const factor = Math.min(1, 640 * ratio / width, 360 * ratio / height);
    const w = Math.max(1, Math.round(width * factor)), h = Math.max(1, Math.round(height * factor));
    elements.canvas.width = w;
    elements.canvas.height = h;
    for (const buffer of buffers) { buffer.width = w; buffer.height = h; }
  };
  const drawSource = (buffer, video) => {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error("Unable to decode video.");
    const ctx = buffer.getContext("2d"), w = buffer.width, h = buffer.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const factor = Math.min(w / video.videoWidth, h / video.videoHeight);
    const vw = video.videoWidth * factor, vh = video.videoHeight * factor;
    ctx.drawImage(video, (w - vw) / 2, (h - vh) / 2, vw, vh);
  };
  const draw = (time) => {
    if (!current || !context) return;
    const w = elements.canvas.width, h = elements.canvas.height;
    const direct = current.type === "none";
    const first = !direct || time < current.leftMs;
    const second = !direct || time >= current.leftMs;
    if (first) drawSource(buffers[0], videos[0]);
    if (second) drawSource(buffers[1], videos[1]);
    context.fillStyle = "#000";
    context.fillRect(0, 0, w, h);
    if (direct) { context.drawImage(buffers[first ? 0 : 1], 0, 0); return; }
    const progress = clamp(time / current.durationMs, 0, 1);
    if (current.type === "crossfade") {
      context.drawImage(buffers[0], 0, 0);
      context.globalAlpha = progress;
      context.drawImage(buffers[1], 0, 0);
      context.globalAlpha = 1;
    } else if (current.type === "fadeblack") {
      if (progress < 0.5) { context.globalAlpha = 1 - progress * 2; context.drawImage(buffers[0], 0, 0); }
      else { context.globalAlpha = (progress - 0.5) * 2; context.drawImage(buffers[1], 0, 0); }
      context.globalAlpha = 1;
    } else if (current.type === "wipeleft" || current.type === "wiperight") {
      context.drawImage(buffers[0], 0, 0);
      context.save();
      context.beginPath();
      if (current.type === "wipeleft") context.rect(w * (1 - progress), 0, w * progress, h);
      else context.rect(0, 0, w * progress, h);
      context.clip();
      context.drawImage(buffers[1], 0, 0);
      context.restore();
    } else throw new Error("Unsupported transition preview type.");
  };
  const fail = (error, token) => {
    if (token !== generation) return;
    release();
    setStatus(error?.message === "Unable to decode video." ? "merge.previewDecodeError" : "merge.previewUnavailable");
    updateUi();
  };
  const seek = async (value, resume = false) => {
    if (!current || statusKey !== "merge.previewReady") return;
    const token = generation, serial = ++seekSerial;
    seeking = true;
    videos.forEach((video) => video.pause());
    elapsed = clamp(Number(value) || 0, 0, duration());
    if (resume) startedAt = performance.now() - elapsed;
    updateUi();
    try {
      const times = sourceTimes(elapsed);
      const active = current.type === "none" ? [elapsed < current.leftMs ? 0 : 1] : [0, 1];
      await Promise.all(active.map((index) => seekVideo(videos[index], times[index], token)));
      if (token !== generation || serial !== seekSerial) return false;
      draw(elapsed);
      seeking = false;
      if (resume && playing) { startedAt = performance.now() - elapsed; await playMedia(token); }
      return true;
    } catch (error) { if (token === generation && serial === seekSerial) fail(error, token); return false; }
  };
  const playMedia = async (token) => {
    const active = current.type === "none" ? [elapsed < current.leftMs ? 0 : 1] : [0, 1];
    try {
      await Promise.all(active.map((index) => videos[index].play()));
      if (token !== generation || !playing) videos.forEach((video) => video.pause());
    } catch (error) { fail(error, token); }
  };
  const tick = () => {
    frameRequest = 0;
    if (!playing || !current || busy) return;
    const token = generation;
    if (!seeking) elapsed = clamp(performance.now() - startedAt, 0, duration());
    updateUi();
    if (!seeking) {
      const times = sourceTimes(elapsed);
      const active = current.type === "none" ? [elapsed < current.leftMs ? 0 : 1] : [0, 1];
      videos.forEach((video, index) => { if (!active.includes(index)) video.pause(); });
      const outOfSync = active.some((index) => Math.abs(videos[index].currentTime * 1000 - times[index]) > 100 || videos[index].seeking || videos[index].readyState < 2);
      if (outOfSync || active.some((index) => videos[index].paused)) {
        void seek(elapsed, true);
      } else {
        try { draw(elapsed); } catch (error) { fail(error, token); return; }
      }
    }
    if (elapsed >= duration()) { stopClock(); return; }
    frameRequest = requestAnimationFrame(tick);
  };
  const update = async (config, errorKey = "merge.previewSelect") => {
    const nextSignature = config ? JSON.stringify([config.key, config.fromFile, config.toFile, config.fromStartMs, config.fromEndMs, config.toStartMs, config.toEndMs, config.type, config.durationMs, config.outputWidth, config.outputHeight, window.devicePixelRatio || 1]) : errorKey;
    if (nextSignature === signature) return;
    signature = nextSignature;
    generation += 1;
    seekSerial += 1;
    release();
    current = null;
    elapsed = 0;
    context?.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    if (!config) { setStatus(errorKey); updateUi(); return; }
    const token = generation;
    if (!context || !Number.isFinite(config.outputWidth) || !Number.isFinite(config.outputHeight) || config.outputWidth <= 0 || config.outputHeight <= 0) { setStatus("merge.previewUnavailable"); updateUi(); return; }
    const leftMs = config.type === "none" ? Math.min(1000, config.fromEndMs - config.fromStartMs) : 0;
    const rightMs = config.type === "none" ? Math.min(1000, config.toEndMs - config.toStartMs) : 0;
    current = { ...config, leftMs, rightMs, durationMs: config.type === "none" ? leftMs + rightMs : config.durationMs };
    resize(config.outputWidth, config.outputHeight);
    setStatus("merge.previewLoading");
    updateUi();
    try {
      urls = [URL.createObjectURL(config.fromFile), URL.createObjectURL(config.toFile)];
      await Promise.all(videos.map(async (video, index) => {
        const wait = waitFor(video, "loadeddata", token);
        video.src = urls[index];
        video.load();
        await wait;
        if (token !== generation) return;
        if (!video.videoWidth || !video.videoHeight) throw new Error("Unable to decode video.");
      }));
      if (token !== generation) return;
      const times = sourceTimes(0);
      await Promise.all(videos.map((video, index) => seekVideo(video, times[index], token)));
      if (token !== generation) return;
      draw(0);
      setStatus("merge.previewReady");
      updateUi();
    } catch (error) { fail(error, token); }
  };
  elements.play.onclick = async () => {
    if (busy || statusKey !== "merge.previewReady") return;
    if (playing) { if (!seeking) elapsed = clamp(performance.now() - startedAt, 0, duration()); stopClock(); await seek(elapsed); return; }
    if (elapsed >= duration()) await seek(0);
    if (statusKey !== "merge.previewReady") return;
    playing = true;
    startedAt = performance.now() - elapsed;
    updateUi();
    await playMedia(generation);
    if (playing) frameRequest = requestAnimationFrame(tick);
  };
  elements.replay.onclick = async () => { if (busy || statusKey !== "merge.previewReady") return; stopClock(); await seek(0); elements.play.click(); };
  elements.seek.oninput = () => { if (busy || statusKey !== "merge.previewReady") return; resumeOnSeek ||= playing; stopClock(); void seek(elements.seek.value).then(async (ready) => { if (ready && resumeOnSeek && statusKey === "merge.previewReady") { resumeOnSeek = false; playing = true; startedAt = performance.now() - elapsed; updateUi(); await playMedia(generation); if (playing && !frameRequest) frameRequest = requestAnimationFrame(tick); } }); };
  setStatus(statusKey);
  updateUi();
  return {
    update,
    setBusy(value) { busy = value; if (busy) stopClock(); updateUi(); },
    pause() { if (playing) { if (!seeking) elapsed = clamp(performance.now() - startedAt, 0, duration()); stopClock(); } },
    refreshLanguage() { elements.note.textContent = translate("merge.previewVisualOnly"); setStatus(statusKey); updateUi(); },
    destroy() { generation += 1; release(); current = null; signature = ""; },
  };
}
