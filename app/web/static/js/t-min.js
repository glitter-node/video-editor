import { FFmpeg } from "/static/ffmpeg/index.js";
import { deleteProject, downloadProject, fileDescriptor, fileFromMedia, fileMatches, getRecentProjectWithMedia, listProjects, mediaId, mediaRecord, readProjectFile, recentProjectId, saveProjectWithMedia, saveRecentProject, validateProject } from "/static/js/app/project-store.js";
import { createProjectMenu } from "/static/js/app/project-menu.js?v=3";
import { setLanguage, t } from "/static/js/app/i18n.js";

const fileInput = document.getElementById("file");
const runBtn = document.getElementById("run");
const clearBtn = document.getElementById("clear");
const logEl = document.getElementById("log");
const outVideo = document.getElementById("out");
setLanguage("en");
let restoredProject = null;
let activeFile = null;
let sourceMediaId = null;
let currentMeta = null;
let currentRecipe = null;
let currentProjectId = null;
let recentProjectCreatedAt = null;
fileInput.addEventListener("change", () => { activeFile = fileInput.files?.[0] || activeFile; if (!restoredProject) { recentProjectCreatedAt = null; sourceMediaId = null; } });

function currentMinimalProject() {
  const file = activeFile || fileInput.files?.[0];
  if (!file || !currentMeta || !currentRecipe) return null;
  sourceMediaId ||= mediaId();
  recentProjectCreatedAt ||= new Date().toISOString();
  return { schemaVersion: 1, id: currentProjectId || crypto.randomUUID(), page: "min", name: file.name, createdAt: recentProjectCreatedAt, updatedAt: new Date().toISOString(), state: { recipe: currentRecipe, meta: currentMeta }, media: [fileDescriptor(file, { role: "source", media_id: sourceMediaId })] };
}

function currentMediaRecords(projectId) { const file = activeFile || fileInput.files?.[0]; return file && sourceMediaId ? [mediaRecord(file, { id: sourceMediaId, projectId, role: "source" })] : []; }

async function saveRecentMinimalProject() {
  const project = currentMinimalProject();
  if (!project) return;
  project.id = recentProjectId("min");
  project.projectType = "recent";
  project.name = "Recent Work";
  try { await saveRecentProject(project, currentMediaRecords(project.id)); } catch (error) { log(error.message); }
}

function projectControls() {
  const host = document.querySelector(".hdr");
  const projectFile = document.createElement("input");
  projectFile.type = "file";
  projectFile.accept = "application/json,.json";
  projectFile.hidden = true;
  const menu = createProjectMenu({ host, statusHost: host, actions: [
    { labelKey: "project.recent", onSelect: async () => { try { const bundle = await getRecentProjectWithMedia("min"); if (!bundle) { log(t("project.recentNone")); return; } if (currentMeta && !window.confirm(t("project.recentConfirm"))) return; const project = validateProject(bundle.project); const source = project.media?.find((item) => item.role === "source"); const file = fileFromMedia(bundle.media.find((record) => record.id === source?.media_id)); if (!file) { restoredProject = project; log(t("project.mediaUnavailable")); fileInput.click(); return; } const meta = await loadVideoMeta(file); activeFile = file; sourceMediaId = source.media_id; restoredProject = project; recentProjectCreatedAt = project.createdAt; currentProjectId = null; currentMeta = meta; currentRecipe = project.state.recipe; log(t("project.restoreComplete")); } catch (error) { log(error.message); } } },
    { labelKey: "project.save", onSelect: async () => { const file = activeFile || fileInput.files?.[0]; if (!file || !currentMeta || !currentRecipe) return; sourceMediaId ||= mediaId(); const project = { schemaVersion: 1, id: currentProjectId || crypto.randomUUID(), page: "min", name: file.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state: { recipe: currentRecipe, meta: currentMeta }, media: [fileDescriptor(file, { role: "source", media_id: sourceMediaId })] }; currentProjectId = project.id; await saveProjectWithMedia(project, currentMediaRecords(project.id)); } },
    { labelKey: "project.load", onSelect: async () => { const projects = await listProjects("min"); const choice = window.prompt(projects.map((item, index) => `${index + 1}. ${item.name}`).join("\n") || "No saved projects.", "1"); if (projects[Number(choice) - 1]) { restoredProject = validateProject(projects[Number(choice) - 1]); currentProjectId = restoredProject.id; fileInput.click(); } } },
    { labelKey: "project.export", onSelect: async () => { const projects = await listProjects("min"); if (projects[0]) downloadProject(projects[0]); } },
    { labelKey: "project.import", onSelect: () => projectFile.click() },
    { labelKey: "project.delete", onSelect: async () => { if (currentProjectId) await deleteProject(currentProjectId); } },
  ] });
  host.append(projectFile);
  menu.status.hidden = true;
  projectFile.onchange = async () => { const file = projectFile.files?.[0]; projectFile.value = ""; if (!file) return; restoredProject = await readProjectFile(file); if (restoredProject.page !== "min") throw new Error("This project belongs to another editor screen."); log(t("project.importReady")); currentProjectId = restoredProject.id; fileInput.click(); };
}
projectControls();

function log(msg) {
  logEl.textContent += `${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
  logEl.textContent = "";
}

function setRunning(on) {
  runBtn.disabled = on;
  fileInput.disabled = on;
}

function getExt(name) {
  const p = (name || "").split(".");
  if (p.length < 2) return "mp4";
  const ext = p[p.length - 1].toLowerCase();
  return ext || "mp4";
}

async function fileToU8(file) {
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

function detectHasAudio(v) {
  const a1 = typeof v.mozHasAudio === "boolean" ? v.mozHasAudio : false;
  const a2 =
    typeof v.webkitAudioDecodedByteCount === "number"
      ? v.webkitAudioDecodedByteCount > 0
      : false;
  const a3 =
    v.audioTracks && typeof v.audioTracks.length === "number"
      ? v.audioTracks.length > 0
      : false;
  return Boolean(a1 || a2 || a3);
}

function loadVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const meta = {
        duration_ms: Math.max(1, Math.floor(v.duration * 1000)),
        width: v.videoWidth || 1920,
        height: v.videoHeight || 1080,
        fps: 30,
        has_audio: detectHasAudio(v),
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video metadata"));
    };
    v.src = url;
  });
}

function msToTs(ms) {
  const s = ms / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
}

const ffmpeg = new FFmpeg();
let loaded = false;
let hooksBound = false;

async function ensureLoaded() {
  if (!hooksBound) {
    ffmpeg.on("log", ({ message }) => {
      if (message) log(message);
    });
    ffmpeg.on("progress", ({ progress, time }) => {
      const pct = Math.max(0, Math.min(100, Math.floor((progress || 0) * 100)));
      log(`Progress: ${pct}% time_ms=${time ?? 0}`);
    });
    hooksBound = true;
  }

  if (loaded) return;
  log("Loading ffmpeg.wasm...");
  await ffmpeg.load({
    coreURL: "/static/ffmpeg/ffmpeg-core.js",
    wasmURL: "/static/ffmpeg/ffmpeg-core.wasm",
    workerURL: "/static/ffmpeg/worker.js",
  });
  loaded = true;
  log("ffmpeg.wasm loaded");
}

async function safeDelete(name) {
  try {
    await ffmpeg.deleteFile(name);
  } catch (_) {}
}

async function listRoot() {
  try {
    const items = await ffmpeg.listDir("/");
    const names = items.map((x) => x.name).join(", ");
    log(`FS /: ${names}`);
  } catch (_) {
    log("FS listDir failed");
  }
}

async function callPlan(meta, recipe) {
  log("Requesting /api/plan...");
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meta, recipe }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  return await res.json();
}

async function runSingle(inName, outName, ffmpegArgs) {
  const args = ["-y", "-i", inName, ...ffmpegArgs, outName];
  log(`Exec: ffmpeg ${args.join(" ")}`);
  await ffmpeg.exec(args);
}

async function runSegments(inName, outName, baseArgs, segments) {
  const segFiles = [];

  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const segOut = `seg_${i}.mp4`;
    await safeDelete(segOut);

    const ss = msToTs(s.start_ms);
    const to = msToTs(s.end_ms);
    const args = [
      "-y",
      "-ss",
      ss,
      "-to",
      to,
      "-i",
      inName,
      ...baseArgs,
      segOut,
    ];
    log(`Exec: ffmpeg ${args.join(" ")}`);
    await ffmpeg.exec(args);
    segFiles.push(segOut);
  }

  const list = segFiles.map((f) => `file ${f}`).join("\n") + "\n";
  await safeDelete("concat.txt");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(list));

  await safeDelete(outName);
  const concatArgs = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "concat.txt",
    "-c",
    "copy",
    outName,
  ];
  log(`Exec: ffmpeg ${concatArgs.join(" ")}`);
  await ffmpeg.exec(concatArgs);

  for (const f of segFiles) {
    await safeDelete(f);
  }
  await safeDelete("concat.txt");
}

clearBtn.onclick = () => {
  clearLog();
  outVideo.removeAttribute("src");
  outVideo.load();
};

runBtn.onclick = async () => {
  try {
    clearLog();
    const file = activeFile || (fileInput.files && fileInput.files[0]);
    if (!file) return;

    setRunning(true);

    await ensureLoaded();

    const meta = await loadVideoMeta(file);
    log(`Meta: ${JSON.stringify(meta)}`);

    const recipe = restoredProject?.state?.recipe || {
      trim: { start_ms: 0, end_ms: Math.min(meta.duration_ms, 60000) },
      remove_segments: [
        { start_ms: 5000, end_ms: 8000 },
        { start_ms: 20000, end_ms: 25000 },
      ],
      container: "mp4",
    };
    if (restoredProject && !fileMatches(file, restoredProject.media?.find((item) => item.role === "source"))) log("Warning: selected media does not match the saved project.");
    const source = restoredProject?.media?.find((item) => item.role === "source");
    sourceMediaId = source?.media_id || sourceMediaId || mediaId();
    currentMeta = meta;
    currentRecipe = recipe;
    if (restoredProject) log(t("project.restoreComplete"));
    await saveRecentMinimalProject();

    const plan = await callPlan(meta, recipe);
    log(`Plan: mode=${plan.mode} container=${plan.container}`);

    const ext = getExt(file.name);
    const inName = `input.${ext}`;
    const outName = "output.mp4";

    await safeDelete(inName);
    await safeDelete(outName);

    log(`Write file: ${inName}`);
    await ffmpeg.writeFile(inName, await fileToU8(file));

    if (
      plan.mode === "video_segments" &&
      plan.outputs &&
      plan.outputs[0] &&
      plan.outputs[0].segments
    ) {
      await runSegments(
        inName,
        outName,
        plan.ffmpeg_args || [],
        plan.outputs[0].segments,
      );
    } else {
      await runSingle(inName, outName, plan.ffmpeg_args || []);
    }

    let data;
    try {
      data = await ffmpeg.readFile(outName);
    } catch (e) {
      log("Output file not found or unreadable");
      await listRoot();
      throw e;
    }

    const url = URL.createObjectURL(
      new Blob([data.buffer], { type: "video/mp4" }),
    );
    outVideo.src = url;
    await outVideo.play().catch(() => {});
    log("Done");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log(`Error: ${msg}`);
    throw e;
  } finally {
    setRunning(false);
  }
};
