import { cancelFfmpeg, runMergePlan } from "./ffmpeg.js";

const nodes = Object.fromEntries(["files", "inputs", "width", "height", "fps", "run", "cancel", "status", "progress", "log", "download"].map((id) => [id, document.getElementById(id)]));
let selected = [];
let output = null;
let running = false;

function log(message) {
  nodes.log.textContent += `${String(message).slice(0, 500)}\n`;
  nodes.log.scrollTop = nodes.log.scrollHeight;
}

function clearOutput() {
  output?.revoke();
  output = null;
  nodes.download.hidden = true;
  nodes.download.removeAttribute("href");
}

function videoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.onloadedmetadata = () => {
      const meta = { duration_ms: Math.floor(video.duration * 1000), width: video.videoWidth, height: video.videoHeight };
      finish();
      resolve(meta);
    };
    video.onerror = () => { finish(); reject(new Error(`Cannot read metadata for ${file.name}.`)); };
    video.src = url;
  });
}

nodes.files.onchange = async () => {
  clearOutput();
  selected = [];
  nodes.inputs.replaceChildren();
  nodes.status.textContent = "Reading metadata";
  try {
    const files = Array.from(nodes.files.files || []);
    for (const [index, file] of files.entries()) {
      const meta = await videoMetadata(file);
      selected.push({ file, meta });
      const row = document.createElement("div");
      row.className = "input-row";
      const title = document.createElement("strong");
      title.textContent = `${index}: ${file.name} — ${meta.width}×${meta.height}, ${meta.duration_ms} ms, ${file.size} bytes`;
      const fpsLabel = document.createElement("label");
      fpsLabel.textContent = "Verified source FPS";
      const fps = document.createElement("input");
      fps.type = "number";
      fps.min = "0.001";
      fps.max = "120";
      fps.step = "any";
      fps.required = true;
      fps.dataset.field = "fps";
      fpsLabel.append(fps);
      const audioLabel = document.createElement("label");
      audioLabel.textContent = "Audio presence (select verified value)";
      const audio = document.createElement("select");
      audio.dataset.field = "audio";
      for (const [value, label] of [["", "Choose"], ["yes", "Has audio"], ["no", "No audio"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        audio.append(option);
      }
      audioLabel.append(audio);
      row.append(title, fpsLabel, audioLabel);
      nodes.inputs.append(row);
    }
    nodes.status.textContent = `${selected.length} files ready for verification`;
  } catch (error) {
    selected = [];
    nodes.inputs.replaceChildren();
    nodes.status.textContent = "Failed";
    log(error.message);
  }
};

nodes.cancel.onclick = () => {
  if (!running) return;
  cancelFfmpeg();
  nodes.status.textContent = "Cancelled";
  nodes.cancel.disabled = true;
};

nodes.run.onclick = async () => {
  if (running) return;
  clearOutput();
  nodes.log.textContent = "";
  try {
    if (selected.length < 2) throw new Error("Select at least two videos.");
    const rows = Array.from(nodes.inputs.children);
    const inputs = selected.map(({ file, meta }, index) => {
      const fpsText = rows[index].querySelector('[data-field="fps"]').value;
      const audioText = rows[index].querySelector('[data-field="audio"]').value;
      if (!fpsText || !audioText) throw new Error(`Verify FPS and audio presence for input ${index}.`);
      const container = file.name.split(".").pop().toLowerCase();
      return { id: `video-${index}`, container, ...meta, fps: Number(fpsText), has_audio: audioText === "yes" };
    });
    const clips = inputs.map((input) => ({ input_id: input.id, start_ms: 0, end_ms: input.duration_ms }));
    const recipe = { inputs, clips, output: { container: "mp4", width: Number(nodes.width.value), height: Number(nodes.height.value), fps: Number(nodes.fps.value), video_codec: "libx264", audio_codec: "aac" } };
    nodes.status.textContent = "Preparing";
    const response = await fetch("/api/merge/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recipe) });
    if (!response.ok) throw new Error(`Merge plan failed: ${response.status} ${await response.text()}`);
    const planRes = await response.json();
    running = true;
    nodes.run.disabled = true;
    nodes.files.disabled = true;
    nodes.cancel.disabled = false;
    output = await runMergePlan({ files: selected.map(({ file }) => file), planRes, log, onStatus: (status) => { nodes.status.textContent = status; }, onProgress: (value) => { nodes.progress.textContent = `FFmpeg reported progress: ${Math.round(value)}% (approximate)`; } });
    nodes.download.href = output.url;
    nodes.download.download = output.outputName;
    nodes.download.hidden = false;
  } catch (error) {
    if (nodes.status.textContent !== "Cancelled") nodes.status.textContent = "Failed";
    log(error.message || error);
  } finally {
    running = false;
    nodes.run.disabled = false;
    nodes.files.disabled = false;
    nodes.cancel.disabled = true;
  }
};
