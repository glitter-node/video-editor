import { cancelFfmpeg, runMergePlan } from "./ffmpeg.js";
import { buildMergeRecipe, clipRange, moveClip, reorderClip, timelineClips, validateAddition } from "./merge-state.js";
import { normalizeSimpleExport, simpleDimensions, simpleResolutionOptions, simpleExportReady, simpleVideoBitrate } from "./simple-export.js";
import { initializeLanguage, t } from "./i18n.js";
import { initializeTheme } from "./theme.js";
import { analyzeStreams, applyStreamAnalysis, fpsChoice, setManualFps, STANDARD_FPS } from "./stream-meta.js";
import { applyMergeDownloadName, mergeFilenameForOrder } from "./merge-filename.js";
import { activeMergeTransitions, mergeBoundaries, mergeTransitionLayout } from "./merge-transitions.js";
import { createMergeTransitionPreview } from "./merge-transition-preview.js";
import { deleteProject, downloadProject, fileDescriptor, fileFromMedia, getProjectWithMedia, getRecentProjectWithMedia, listProjects, mediaId, mediaRecord, projectSourcesMatch, readProjectFile, recentProjectId, saveProjectWithMedia, saveRecentProject, validateProject } from "./project-store.js";
import { createProjectMenu, createProjectWarningDialog } from "./project-menu.js?v=3";
import { createTopButton } from "./top-button.js";

const el = Object.fromEntries(["languageSelect", "themeSelect", "files", "fileNameDisplay", "sourceList", "mergeTimelineCanvas", "mergeTimelineTransitions", "mergeTimelineDetails", "estimatedDuration", "mergeTransitionTitle", "mergeTransitionEmpty", "mergeTransitionList", "mergeTransitionType", "mergeTransitionRange", "mergeTransitionNumber", "mergeTransitionReset", "mergeTransitionError", "mergeTransitionSection", "mergePreviewCanvas", "mergePreviewPlay", "mergePreviewReplay", "mergePreviewSeek", "mergePreviewCurrent", "mergePreviewTotal", "mergePreviewStatus", "mergePreviewNote", "plannedFilename", "clear", "width", "height", "fps", "validate", "run", "cancel", "status", "progressBar", "progressText", "log", "preview", "resultName", "download"].map((id) => [id, document.getElementById(id)]));
function combineOutputNotes() {
  const formatNote = document.querySelector('.controls-card .field-help[data-i18n="merge.format"]');
  const filename = document.getElementById("plannedFilename");
  const filenameNote = filename?.closest(".field-help");
  if (!formatNote || !filenameNote || filenameNote === formatNote) return;
  const codecText = document.createElement("span");
  codecText.dataset.i18n = "merge.format";
  codecText.textContent = t("merge.format");
  const filenameLabel = filenameNote.querySelector('[data-i18n="merge.filename"]');
  formatNote.removeAttribute("data-i18n");
  formatNote.replaceChildren(codecText, document.createTextNode(" · "), filenameLabel, document.createTextNode(": "), filename);
  filenameNote.remove();
}
combineOutputNotes();
const topButton = createTopButton(t);
el.result = document.getElementById("merge-output-result");
const entries = [];
let order = [];
let nextId = 0;
let busy = false;
let pendingMetadata = 0;
let pendingAnalysis = 0;
let requestToken = 0;
let output = null;
let statusKey = "status.idle";
let draggingId = null;
const transitionSettings = new Map();
let selectedBoundaryKey = null;
let transitionInputInvalid = false;
let projectId = null;
let projectName = "";
let projectCreatedAt = null;
let pendingProject = null;
let pendingMedia = [];
let pendingProjectWarning = null;
let pendingProjectApplying = false;
function discardPendingProject() {
  pendingProject = null;
  pendingMedia = [];
  pendingProjectWarning = null;
}
function reselectPendingProject() {
  el.files.click();
}
function showMergeMismatchWarning() {
  projectEl?.warningDialog.open("project.mergeMismatchTitle", "project.mergeMismatchMessage", { onConfirm: discardPendingProject, onReselect: reselectPendingProject });
}
let recentSaveTimer = null;
let recentSaveToken = 0;
let recentCheckpointTimer = null;
let projectDirty = false;
let simpleExport = { resolution: null, quality: null, mode: "advanced" };
let advancedExport = null;
let outputTabs = null;
let outputSummary = null;
let recentProjectCreatedAt = null;
let projectEl = null;
function unavailableTransitionPreview() {
  return {
    update: async () => {},
    setBusy() {},
    pause() {},
    refreshLanguage() {},
    destroy() {},
  };
}
let transitionPreview;
try {
  transitionPreview = createMergeTransitionPreview({ canvas: el.mergePreviewCanvas, play: el.mergePreviewPlay, replay: el.mergePreviewReplay, seek: el.mergePreviewSeek, current: el.mergePreviewCurrent, total: el.mergePreviewTotal, status: el.mergePreviewStatus, note: el.mergePreviewNote }, t);
} catch {
  transitionPreview = unavailableTransitionPreview();
}

function createProjectControls() {
  const brand = document.querySelector(".brand");
  const statusHost = document.querySelector(".work-status");
  if (!brand || !statusHost) return;
  const projectHeaderGroup = document.createElement("span");
  projectHeaderGroup.className = "project-header-group";
  brand.append(projectHeaderGroup);
  const importFile = document.createElement("input");
  importFile.type = "file";
  importFile.accept = "application/json,.json";
  importFile.hidden = true;
  const menu = createProjectMenu({ host: projectHeaderGroup, statusHost: projectHeaderGroup, actions: [
    { labelKey: "project.recent", onSelect: () => void chooseRecentProject() },
    { labelKey: "project.save", onSelect: () => void saveCurrentProject(true) },
    { labelKey: "project.load", onSelect: () => void chooseSavedProject() },
    { labelKey: "project.export", onSelect: () => void exportCurrentProject() },
    { labelKey: "project.import", onSelect: () => importFile.click() },
    { labelKey: "project.delete", onSelect: () => void removeCurrentProject() },
  ] });
  projectHeaderGroup.append(menu.root, menu.status);
  statusHost.append(importFile);
  const warningDialog = createProjectWarningDialog();
  projectEl = { projectStatus: menu.status, setStatus: menu.setStatus, refresh: menu.refresh, projectImportFile: importFile, warningDialog };
  menu.status.title = t("project.storageNotice");
  importFile.onchange = async () => { const file = importFile.files?.[0]; importFile.value = ""; if (!file) return; try { const project = await readProjectFile(file); if (project.page !== "merge") throw new Error("This project belongs to another editor screen."); cancelRecentSave(); pendingMedia = []; pendingProject = project; menu.setStatus("project.importReady"); el.files.click(); } catch (error) { updateProjectStatus("project.importFailed"); log(`${t("project.importFailed")} ${error.message}`); } };
}
function updateProjectStatus(key) { if (projectEl?.setStatus) projectEl.setStatus(key); else if (projectEl?.projectStatus) projectEl.projectStatus.textContent = t(key); }
function refreshOutputTabsLanguage() {
  if (!outputTabs) return;
  outputTabs.standardTab.textContent = t("merge.standardPresets");
  outputTabs.customTab.textContent = t("merge.customSettings");
  outputTabs.tabs.setAttribute("aria-label", t("merge.outputTabsAria"));
  outputTabs.resolutionLabel.textContent = t("merge.resolutionPreset");
  outputTabs.resolution.options[0].textContent = t("simple.selectResolution");
  outputTabs.qualityLabel.textContent = t("simple.quality");
  outputTabs.quality.options[0].textContent = t("simple.selectQuality");
  outputTabs.customQualityLabel.textContent = t("simple.quality");
  outputTabs.customQuality.options[0].textContent = t("simple.selectQuality");
  outputTabs.fpsLabel.textContent = t("merge.fpsPreset");
  outputTabs.fps.options[0].textContent = t("merge.selectFps");
  outputTabs.customFpsLabel.textContent = t("merge.fpsPreset");
  outputTabs.customFps.options[0].textContent = t("merge.selectFps");
}
function syncOutputTabs() {
  if (!outputTabs) return;
  const width = Number(el.width.value);
  const height = Number(el.height.value);
  const meta = mergeSourceMeta();
  const resolution = ["original", "1080", "720", "480"].find((value) => { const dimensions = simpleDimensions(meta, value); return dimensions?.width === width && dimensions?.height === height; }) || "";
  const fps = ["24", "30", "60"].includes(String(el.fps.value)) ? String(el.fps.value) : "";
  const available = simpleResolutionOptions(meta);
  [...outputTabs.resolution.options].forEach((option) => { option.disabled = option.value !== "" && !available.includes(option.value); });
  if (meta) simpleExport.resolution = resolution || null;
  outputTabs.resolution.value = resolution;
  outputTabs.quality.value = simpleExport.quality || "";
  outputTabs.customQuality.value = simpleExport.quality || "";
  outputTabs.fps.value = fps;
  outputTabs.customFps.value = fps;
  refreshOutputSummary();
}
function refreshOutputSummary() {
  if (!outputSummary) return;
  const width = Number(el.width.value);
  const height = Number(el.height.value);
  const fps = Number(el.fps.value);
  const hasDimensions = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const hasFps = Number.isFinite(fps) && fps > 0;
  const quality = simpleExport.quality;
  const qualityText = quality ? t(`simple.${quality === "balanced" ? "standard" : quality}`) : t("values.none");
  outputSummary.firstElementChild.textContent = hasDimensions ? `${width} × ${height}${hasFps ? ` · ${fps} ${t("merge.fpsPreset")}` : ""} · ${qualityText}` : t("values.none");
}
function setOutputTab(tab) {
  if (!outputTabs) return;
  const standard = tab === "standard";
  outputTabs.standardTab.setAttribute("aria-selected", String(standard));
  outputTabs.customTab.setAttribute("aria-selected", String(!standard));
  outputTabs.standardPanel.hidden = !standard;
  outputTabs.customPanel.hidden = standard;
}
function createOutputTabs() {
  if (outputTabs) return;
  const grid = document.querySelector(".controls-card .merge-output-grid");
  if (!grid) return;
  const card = grid.closest(".controls-card");
  outputSummary = document.createElement("span");
  outputSummary.className = "output-settings-summary";
  outputSummary.setAttribute("aria-live", "polite");
  outputSummary.append(document.createElement("span"));
  const widthControl = grid.children[0];
  const heightControl = grid.children[1];
  const customFpsWrap = grid.children[2];
  const customFps = el.fps;
  const customFpsLabel = customFpsWrap?.querySelector("span") || document.createElement("span");
  const tabs = document.createElement("div");
  tabs.className = "merge-output-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t("merge.outputTabsAria"));
  const standardTab = document.createElement("button");
  standardTab.type = "button";
  standardTab.className = "secondary";
  standardTab.setAttribute("role", "tab");
  standardTab.setAttribute("aria-selected", "false");
  standardTab.setAttribute("aria-controls", "merge-standard-panel");
  const customTab = document.createElement("button");
  customTab.type = "button";
  customTab.className = "secondary";
  customTab.setAttribute("role", "tab");
  customTab.setAttribute("aria-selected", "true");
  customTab.setAttribute("aria-controls", "merge-custom-panel");
  tabs.append(standardTab, customTab, outputSummary);
  const standardPanel = document.createElement("div");
  standardPanel.id = "merge-standard-panel";
  standardPanel.className = "merge-output-panel";
  standardPanel.setAttribute("role", "tabpanel");
  standardPanel.setAttribute("aria-labelledby", "merge-standard-tab");
  standardPanel.hidden = true;
  const standardGrid = document.createElement("div");
  standardGrid.className = "merge-output-grid merge-output-standard-grid";
  const resolutionLabel = document.createElement("span");
  const resolutionWrap = document.createElement("label");
  const resolution = document.createElement("select");
  resolution.id = "merge-preset-resolution";
  resolution.innerHTML = `<option value="">${t("simple.selectResolution")}</option><option value="original">${t("simple.original")}</option><option value="1080">1080p — 1920 × 1080</option><option value="720">720p — 1280 × 720</option><option value="480">480p — 854 × 480</option>`;
  resolutionWrap.append(resolutionLabel, resolution);
  const fpsLabel = document.createElement("span");
  const fpsWrap = document.createElement("label");
  const fps = document.createElement("select");
  fps.id = "merge-preset-fps";
  fps.innerHTML = `<option value="">${t("merge.selectFps")}</option><option value="24">24</option><option value="30">30</option><option value="60">60</option>`;
  fpsWrap.append(fpsLabel, fps);
  const qualityLabel = document.createElement("span");
  const qualityWrap = document.createElement("label");
  const quality = document.createElement("select");
  quality.id = "merge-preset-quality";
  quality.innerHTML = `<option value="">${t("simple.selectQuality")}</option><option value="smaller">${t("simple.smaller")}</option><option value="balanced">${t("simple.standard")}</option><option value="high">${t("simple.high")}</option>`;
  qualityWrap.append(qualityLabel, quality);
  standardGrid.append(resolutionWrap, qualityWrap, fpsWrap);
  standardPanel.append(standardGrid);
  const customPanel = document.createElement("div");
  customPanel.id = "merge-custom-panel";
  customPanel.className = "merge-output-panel";
  customPanel.setAttribute("role", "tabpanel");
  customPanel.setAttribute("aria-labelledby", "merge-custom-tab");
  const customQualityLabel = document.createElement("span");
  const customQualityWrap = document.createElement("label");
  const customQuality = document.createElement("select");
  customQuality.id = "merge-custom-quality";
  customQuality.innerHTML = `<option value="">${t("simple.selectQuality")}</option><option value="smaller">${t("simple.smaller")}</option><option value="balanced">${t("simple.standard")}</option><option value="high">${t("simple.high")}</option>`;
  customQualityWrap.append(customQualityLabel, customQuality);
  const customGrid = document.createElement("div");
  customGrid.className = "merge-output-grid merge-output-custom-grid";
  customGrid.append(widthControl, heightControl, customQualityWrap, customFpsWrap);
  card.insertBefore(tabs, grid);
  card.insertBefore(standardPanel, grid);
  card.insertBefore(customPanel, grid);
  customPanel.append(customGrid);
  grid.remove();
  outputTabs = { tabs, standardTab, customTab, standardPanel, customPanel, resolution, quality, customQuality, fps, customFps, resolutionLabel, qualityLabel, customQualityLabel, fpsLabel, customFpsLabel };
  standardTab.id = "merge-standard-tab";
  customTab.id = "merge-custom-tab";
  standardTab.addEventListener("click", () => setOutputTab("standard"));
  customTab.addEventListener("click", () => setOutputTab("custom"));
  resolution.addEventListener("change", () => { const value = resolution.value; const dimensions = simpleDimensions(mergeSourceMeta(), value); if (!dimensions) return; simpleExport.resolution = value || null; el.width.value = String(dimensions.width); el.height.value = String(dimensions.height); syncOutputTabs(); scheduleProjectSave(); });
  quality.addEventListener("change", () => { simpleExport.quality = quality.value || null; syncOutputTabs(); scheduleProjectSave(); });
  customQuality.addEventListener("change", () => { quality.value = customQuality.value; quality.dispatchEvent(new Event("change")); });
  fps.addEventListener("change", () => { if (!fps.value) return; el.fps.value = fps.value; syncOutputTabs(); scheduleProjectSave(); });
  customFps.addEventListener("change", () => { fps.value = customFps.value; fps.dispatchEvent(new Event("change")); });
  [el.width, el.height, el.fps].forEach((node) => { node.addEventListener("input", syncOutputTabs); node.addEventListener("change", syncOutputTabs); });
  refreshOutputTabsLanguage();
  syncOutputTabs();
}
function mergeSourceMeta() {
  if (!entries.length || entries.some((entry) => !entry.meta?.width || !entry.meta?.height)) return null;
  return { width: Math.max(...entries.map((entry) => Number(entry.meta?.width) || 0)), height: Math.max(...entries.map((entry) => Number(entry.meta?.height) || 0)) };
}
setTimeout(createOutputTabs, 0);
function applySimpleExport() {
  const meta = mergeSourceMeta();
  const dimensions = simpleDimensions(meta, simpleExport.resolution);
  if (!dimensions) return;
  if (simpleExport.mode !== "simple" || !simpleExportReady(meta, simpleExport)) return;
  el.width.value = dimensions.width;
  el.height.value = dimensions.height;
}
[el.width, el.height].forEach((node) => node?.addEventListener("change", () => { if (!advancedExport) advancedExport = {}; advancedExport[node === el.width ? "width" : "height"] = node.value; simpleExport.mode = "advanced"; syncOutputTabs(); scheduleProjectSave(); }));
function cancelRecentSave() { clearTimeout(recentSaveTimer); recentSaveTimer = null; recentSaveToken += 1; }
function projectSaveStatus(error) { return error?.name === "QuotaExceededError" ? "project.storageFull" : "project.failed"; }
function beginProjectRestore(bundle) {
  const project = validateProject(bundle.project);
  cancelRecentSave();
  pendingProject = project;
  simpleExport = normalizeSimpleExport(project.state?.simple_export);
  advancedExport = project.state?.advanced_export && typeof project.state.advanced_export === "object" ? { ...project.state.advanced_export } : null;
  pendingMedia = Array.isArray(bundle.media) ? bundle.media : [];
  const records = new Map(pendingMedia.map((record) => [record.id, record]));
  const files = project.state.entries.map((entry) => fileFromMedia(records.get(entry.file?.media_id)));
  const mediaAvailable = project.media?.every((item) => item.media_id && pendingMedia.some((record) => record.id === item.media_id));
  projectEl.setStatus(mediaAvailable ? "project.saving" : "project.mediaUnavailable");
  if (files.length && files.every(Boolean)) el.files.onchange({ filesOverride: files });
  else el.files.click();
}
el.clear.addEventListener("click", () => { projectDirty = false; });
el.files.addEventListener("change", () => { if (!pendingProject) recentProjectCreatedAt = null; });
function mergeProjectState() { return { entries: entries.map((entry) => ({ id: entry.id, file: fileDescriptor(entry.file, { media_id: entry.media_id }), meta: entry.meta, fps: entry.fps, fpsSource: entry.fpsSource, fpsMode: entry.fpsMode, detectedFps: entry.detectedFps, fpsKind: entry.fpsKind, hasAudio: entry.hasAudio, audioSource: entry.audioSource, detectedHasAudio: entry.detectedHasAudio, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds })), order: order.slice(), output: { width: el.width.value, height: el.height.value, fps: el.fps.value }, simple_export: { ...simpleExport }, advanced_export: advancedExport ? { ...advancedExport } : null, transitions: Array.from(transitionSettings.entries()), selectedBoundaryKey, media: entries.map((entry) => fileDescriptor(entry.file, { role: "source", clip_id: entry.id, media_id: entry.media_id })) }; }
function currentProject() { if (entries.length < 1) return null; return { schemaVersion: 1, id: projectId || crypto.randomUUID(), page: "merge", name: projectName || "Merged Project", createdAt: projectCreatedAt || new Date().toISOString(), updatedAt: new Date().toISOString(), state: mergeProjectState(), media: mergeProjectState().media }; }
function currentMediaRecords(projectId) { return entries.map((entry) => mediaRecord(entry.file, { id: entry.media_id, projectId, role: "source", clip_id: entry.id })); }
async function saveCurrentProject(manual = false) { const draft = currentProject(); if (!draft) return; if (manual && !projectName) projectName = window.prompt(t("project.name"), draft.name) || draft.name; projectId ||= draft.id; projectCreatedAt ||= draft.createdAt; draft.id = projectId; draft.name = projectName || draft.name; draft.createdAt = projectCreatedAt; const saveToken = recentSaveToken; updateProjectStatus("project.saving"); try { await saveProjectWithMedia(draft, currentMediaRecords(draft.id)); if (saveToken === recentSaveToken) { projectDirty = false; updateProjectStatus("project.saved"); } } catch (error) { if (saveToken === recentSaveToken) updateProjectStatus(projectSaveStatus(error)); log(error.message); } }
function recentProject() { const project = currentProject(); if (!project) return null; recentProjectCreatedAt ||= project.createdAt; project.id = recentProjectId("merge"); project.projectType = "recent"; project.name = "Recent Work"; project.createdAt = recentProjectCreatedAt; return project; }
async function saveRecentWork(token) { const project = recentProject(); if (!project) return false; updateProjectStatus("project.saving"); try { await saveRecentProject(project, currentMediaRecords(project.id)); if (token === recentSaveToken) { projectDirty = false; updateProjectStatus("project.saved"); } return true; } catch (error) { if (token === recentSaveToken) updateProjectStatus(projectSaveStatus(error)); log(error.message); return false; } }
function scheduleProjectSave() { if (!entries.length || pendingProject) return; projectDirty = true; updateProjectStatus("project.unsaved"); const token = ++recentSaveToken; clearTimeout(recentSaveTimer); recentSaveTimer = setTimeout(() => void saveRecentWork(token), 2000); }
function checkpointRecentWork() { if (!projectDirty) return; clearTimeout(recentSaveTimer); void saveRecentWork(++recentSaveToken); }
recentCheckpointTimer = setInterval(checkpointRecentWork, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") checkpointRecentWork(); });
async function reconcilePendingProject() {
  if (!pendingProject || pendingProjectWarning === pendingProject || pendingProjectApplying || !entries.length) return;
  const files = order.map((id) => entries.find((entry) => entry.id === id)?.file).filter(Boolean);
  if (!projectSourcesMatch(pendingProject, files)) {
    pendingProjectWarning = pendingProject;
    showMergeMismatchWarning();
    return;
  }
  pendingProjectApplying = true;
  pendingProjectWarning = null;
  try { await el.files.onchange({ filesOverride: files }); } finally { pendingProjectApplying = false; }
}
setInterval(() => { void reconcilePendingProject(); }, 250);
async function chooseRecentProject() { try { const bundle = await getRecentProjectWithMedia("merge"); if (!bundle) { log(t("project.recentNone")); return; } if (projectDirty && !window.confirm(t("project.recentConfirm"))) return; beginProjectRestore(bundle); } catch (error) { log(error.message); } }
async function chooseSavedProject() { try { const projects = await listProjects("merge"); if (!projects.length) { log(t("project.none")); return; } const choice = window.prompt(`${projects.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}\n${t("project.choose")}`, "1"); const project = projects[Number(choice) - 1]; if (!project) return; const bundle = await getProjectWithMedia(project.id); if (bundle) beginProjectRestore(bundle); } catch (error) { log(error.message); } }
async function removeCurrentProject() { if (!projectId || !window.confirm(t("project.delete"))) return; try { await deleteProject(projectId); projectId = null; projectName = ""; updateProjectStatus("project.unsaved"); log(t("project.deleted")); } catch (error) { log(error.message); } }
async function exportCurrentProject() { const project = currentProject(); if (project) downloadProject(project); }

function currentBoundaries() { return mergeBoundaries(order); }

function selectedBoundary() { return currentBoundaries().find((boundary) => boundary.key === selectedBoundaryKey); }

function reconcileTransitions() {
  const loaded = new Set(order);
  for (const key of transitionSettings.keys()) {
    const [fromId, toId] = key.split("|");
    if (!loaded.has(fromId) || !loaded.has(toId)) transitionSettings.delete(key);
  }
  if (!currentBoundaries().some((boundary) => boundary.key === selectedBoundaryKey)) { selectedBoundaryKey = currentBoundaries()[0]?.key || null; transitionInputInvalid = false; }
}

function renderTransitions() {
  const boundaries = currentBoundaries();
  el.mergeTransitionTitle.textContent = t("transition.titleCount", { count: boundaries.length });
  el.mergeTransitionEmpty.hidden = boundaries.length > 0;
  el.mergeTransitionList.replaceChildren();
  boundaries.forEach((boundary) => {
    const from = entries.find((entry) => entry.id === boundary.fromId);
    const to = entries.find((entry) => entry.id === boundary.toId);
    const setting = transitionSettings.get(boundary.key) || { type: "none", duration_ms: 500 };
    const button = document.createElement("button");
    button.type = "button";
    button.className = boundary.key === selectedBoundaryKey ? "is-selected" : "";
    button.setAttribute("aria-pressed", String(boundary.key === selectedBoundaryKey));
    button.textContent = `${t("transition.boundary", { index: boundary.index + 1 })}: ${from.file.name} → ${to.file.name} · ${t(`transition.${setting.type}`)} · ${(setting.duration_ms / 1000).toFixed(1)} s`;
    button.disabled = busy;
    button.onclick = () => { selectedBoundaryKey = boundary.key; transitionInputInvalid = false; renderTransitions(); renderTimeline(); };
    el.mergeTransitionList.append(button);
  });
  const selected = selectedBoundary();
  const setting = selected ? transitionSettings.get(selected.key) || { type: "none", duration_ms: 500 } : null;
  el.mergeTransitionType.disabled = busy || !selected;
  el.mergeTransitionRange.disabled = busy || !selected;
  el.mergeTransitionNumber.disabled = busy || !selected;
  el.mergeTransitionReset.disabled = busy || !selected;
  if (setting) {
    el.mergeTransitionType.value = setting.type;
    el.mergeTransitionRange.value = String(setting.duration_ms / 1000);
    if (!transitionInputInvalid) el.mergeTransitionNumber.value = (setting.duration_ms / 1000).toFixed(1);
  }
}

function updateTransitionError(key = "") {
  el.mergeTransitionError.textContent = key ? t(key) : "";
}

function status(key, fallback) {
  statusKey = key;
  el.status.textContent = key ? t(key) : fallback;
}

function log(message) {
  const lines = el.log.textContent ? el.log.textContent.split("\n") : [];
  lines.push(String(message).slice(0, 500));
  el.log.textContent = lines.slice(-30).join("\n");
  el.log.scrollTop = el.log.scrollHeight;
}

function clearOutput() {
  el.preview.pause();
  el.preview.removeAttribute("src");
  el.preview.load();
  output?.revoke();
  output = null;
  el.download.removeAttribute("href");
  el.result.hidden = true;
}

function invalidate() {
  requestToken += 1;
  clearOutput();
  status("merge.ready");
  scheduleProjectSave();
}

function renderTimeline() {
  const canvas = el.mergeTimelineCanvas;
  const context = canvas.getContext("2d");
  const width = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
  const height = Math.max(1, Math.round(84 * (window.devicePixelRatio || 1)));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.clearRect(0, 0, width, height);
  el.mergeTimelineDetails.replaceChildren();
  el.mergeTimelineTransitions.replaceChildren();
  let clips;
  try { clips = timelineClips(entries, order); }
  catch (error) { el.estimatedDuration.textContent = t("merge.timelineInvalid"); canvas.setAttribute("aria-label", t("merge.timelineInvalid")); void transitionPreview.update(null, error.message === "merge.metadataMissing" ? (entries.some((entry) => entry.error) ? "merge.previewUnavailable" : "merge.previewLoading") : "merge.previewInvalidDuration"); return; }
  let layout;
  try { layout = mergeTransitionLayout(clips, transitionSettings); updateTransitionError(transitionInputInvalid ? "merge.transitionInvalidDuration" : ""); }
  catch (error) { updateTransitionError(error.message); el.estimatedDuration.textContent = t(error.message); canvas.setAttribute("aria-label", t(error.message)); void transitionPreview.update(null, "merge.previewInvalidDuration"); return; }
  const selected = selectedBoundary();
  const boundary = layout.boundaries.find((item) => item.key === selected?.key);
  const from = boundary && entries.find((entry) => entry.id === boundary.fromId);
  const to = boundary && entries.find((entry) => entry.id === boundary.toId);
  if (el.mergeTransitionSection.open && boundary && from && to && !transitionInputInvalid) {
    const left = clips[boundary.index], right = clips[boundary.index + 1];
    void transitionPreview.update({ key: boundary.key, fromFile: from.file, toFile: to.file, fromStartMs: left.start_ms, fromEndMs: left.end_ms, toStartMs: right.start_ms, toEndMs: right.end_ms, type: boundary.type, durationMs: boundary.duration, outputWidth: Number(el.width.value), outputHeight: Number(el.height.value) });
  } else void transitionPreview.update(null, transitionInputInvalid ? "merge.previewInvalidDuration" : "merge.previewSelect");
  const total = layout.duration;
  el.estimatedDuration.textContent = t("merge.estimatedDuration", { duration: (total / 1000).toFixed(3) });
  canvas.setAttribute("aria-label", t("merge.estimatedDuration", { duration: (total / 1000).toFixed(3) }));
  if (!total) return;
  const styles = getComputedStyle(document.documentElement);
  const colors = [styles.getPropertyValue("--color-primary").trim(), styles.getPropertyValue("--color-trim-range").trim()];
  clips.forEach((clip, index) => {
    const left = width * layout.clips[index].start / total;
    const segmentWidth = width * clip.duration_ms / total;
    context.fillStyle = colors[index % 2];
    context.fillRect(left, 8, Math.max(1, segmentWidth), height - 16);
    if (segmentWidth > 22) {
      context.fillStyle = styles.getPropertyValue("--color-on-primary").trim();
      context.font = `${13 * (window.devicePixelRatio || 1)}px system-ui`;
      context.fillText(String(index + 1), left + 7, height / 2 + 5);
    }
    const detail = document.createElement("li");
    detail.textContent = `${index + 1}. ${clip.name}: ${(clip.start_ms / 1000).toFixed(3)}–${(clip.end_ms / 1000).toFixed(3)} s · ${(clip.duration_ms / 1000).toFixed(3)} s`;
    el.mergeTimelineDetails.append(detail);
  });
  layout.boundaries.forEach((boundary) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `merge-timeline-boundary${boundary.duration ? "" : " is-direct"}${boundary.key === selectedBoundaryKey ? " is-selected" : ""}`;
    marker.style.left = `${100 * boundary.start / total}%`;
    marker.style.width = boundary.duration ? `${100 * boundary.duration / total}%` : "6px";
    marker.setAttribute("aria-label", `${t("transition.boundary", { index: boundary.index + 1 })}: ${t(`transition.${boundary.type}`)} · ${(boundary.duration / 1000).toFixed(1)} s`);
    marker.disabled = busy;
    marker.onclick = () => { selectedBoundaryKey = boundary.key; transitionInputInvalid = false; renderTransitions(); renderTimeline(); };
    el.mergeTimelineTransitions.append(marker);
  });
}

function controls() {
  transitionPreview.setBusy(busy);
  for (const node of [el.files, el.clear, el.width, el.height, el.fps, el.validate, el.run]) node.disabled = busy;
  el.cancel.disabled = !busy;
  el.sourceList.querySelectorAll("button,input,select").forEach((node) => { node.disabled = busy || node.dataset.loading === "true"; });
  el.mergeTransitionList.querySelectorAll("button").forEach((node) => { node.disabled = busy; });
  for (const node of [el.mergeTransitionType, el.mergeTransitionRange, el.mergeTransitionNumber, el.mergeTransitionReset]) node.disabled = busy || !selectedBoundary();
  el.mergeTimelineTransitions.querySelectorAll("button").forEach((node) => { node.disabled = busy; });
}

function fieldLabel(key, control) {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = t(key);
  label.append(span, control);
  return label;
}

function action(labelKey, ariaKey, onClick, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = t(labelKey);
  button.setAttribute("aria-label", t(ariaKey));
  button.disabled = disabled || busy;
  button.onclick = onClick;
  return button;
}

function updateFilePickerDisplay() { const files = entries.map((entry) => entry.file).filter(Boolean); el.fileNameDisplay.textContent = files.length === 1 ? files[0].name : files.length ? t("merge.filesSelected", { count: files.length }) : t("source.noFile"); }
function render() {
  updateFilePickerDisplay();
  syncOutputTabs();
  el.plannedFilename.textContent = mergeFilenameForOrder(entries, order);
  el.sourceList.replaceChildren();
  order.forEach((id, index) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    const item = document.createElement("article");
    item.className = "merge-item";
    const detail = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${index + 1}. ${entry.file.name}`;
    const summary = document.createElement("p");
    summary.className = "merge-summary";
    summary.textContent = `${(entry.file.size / 1024 ** 2).toFixed(1)} MB · ${entry.meta ? `${entry.meta.width} × ${entry.meta.height} · ${(entry.meta.duration_ms / 1000).toFixed(1)} s` : t("merge.loadingMeta")}`;
    detail.append(title, summary);
    let used = null;
    const updateUsed = () => {
      if (!used) return;
      used.className = "merge-summary";
      try { const range = clipRange(entry); used.textContent = t("merge.usedDuration", { duration: ((range.end_ms - range.start_ms) / 1000).toFixed(3) }); }
      catch { used.textContent = t("merge.invalidRange"); used.className = "merge-error"; }
    };
    if (entry.meta) {
      used = document.createElement("p");
      updateUsed();
      detail.append(used);
    }
    if (entry.error) {
      const error = document.createElement("p");
      error.className = "merge-error";
      error.textContent = entry.error;
      detail.append(error);
    }
    const detection = document.createElement("p");
    detection.className = "merge-summary";
    if (entry.analyzing) detection.textContent = t("merge.analyzingStreams");
    else if (entry.detectedFps) detection.textContent = t("merge.detectedFps", { fps: entry.detectedFps.toFixed(3), kind: t(`merge.fpsKind.${entry.fpsKind}`) });
    else detection.textContent = t("merge.fpsNotDetected");
    detail.append(detection);
    if (entry.analysisError) {
      const warning = document.createElement("p");
      warning.className = "merge-summary";
      warning.textContent = t("merge.analysisUnavailable");
      detail.append(warning);
    }
    const fields = document.createElement("div");
    fields.className = "merge-fields";
    const fps = document.createElement("select");
    const choices = [["", t("merge.choose")], ...STANDARD_FPS.map((value) => [String(value), `${value} FPS`])];
    const detectedChoice = fpsChoice(entry.detectedFps);
    if (detectedChoice && !choices.some(([value]) => value === detectedChoice)) choices.push([detectedChoice, `${detectedChoice} FPS`]);
    choices.push(["custom", t("merge.customFps")]);
    for (const [value, label] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      fps.append(option);
    }
    fps.value = entry.fpsMode === "custom" ? "custom" : entry.fps ?? "";
    fps.disabled = busy;
    const customFps = document.createElement("input");
    customFps.type = "number";
    customFps.min = "0.001";
    customFps.max = "120";
    customFps.step = "any";
    customFps.placeholder = "FPS";
    customFps.value = entry.fpsMode === "custom" ? entry.fps : "";
    customFps.hidden = entry.fpsMode !== "custom";
    customFps.disabled = busy;
    fps.onchange = () => {
      setManualFps(entry, fps.value, fps.value === "custom");
      customFps.hidden = entry.fpsMode !== "custom";
      if (entry.fpsMode === "custom") customFps.value = "";
      selection.textContent = t("merge.fpsManualSelected");
      invalidate();
    };
    customFps.oninput = () => { entry.fps = customFps.value; entry.fpsSource = "manual"; invalidate(); };
    const fpsControl = document.createElement("div");
    fpsControl.className = "merge-fps-control";
    fpsControl.append(fps, customFps);
    const audio = document.createElement("select");
    for (const [value, key] of [["", "merge.choose"], ["yes", "merge.audioYes"], ["no", "merge.audioNo"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(key);
      audio.append(option);
    }
    audio.value = entry.hasAudio === null ? "" : entry.hasAudio ? "yes" : "no";
    audio.disabled = busy;
    audio.onchange = () => { entry.hasAudio = audio.value === "" ? null : audio.value === "yes"; entry.audioSource = "manual"; invalidate(); };
    fields.append(fieldLabel("merge.verifiedFps", fpsControl), fieldLabel("merge.audioPresence", audio));
    const selection = document.createElement("p");
    selection.className = "merge-summary";
    selection.textContent = t(entry.fpsSource === "detected" ? "merge.fpsAutoSelected" : entry.fpsSource === "manual" ? "merge.fpsManualSelected" : "merge.fpsNotSelected");
    detail.append(selection);
    const start = document.createElement("input");
    start.type = "number";
    start.min = "0";
    start.step = "0.001";
    start.value = entry.startSeconds ?? "0";
    start.disabled = busy;
    start.oninput = () => { entry.startSeconds = start.value; invalidate(); updateUsed(); renderTimeline(); };
    const end = document.createElement("input");
    end.type = "number";
    end.min = "0.001";
    end.step = "0.001";
    end.value = entry.endSeconds ?? "";
    end.disabled = busy;
    end.oninput = () => { entry.endSeconds = end.value; invalidate(); updateUsed(); renderTimeline(); };
    fields.append(fieldLabel("merge.startSeconds", start), fieldLabel("merge.endSeconds", end));
    detail.append(fields);
    const actions = document.createElement("div");
    actions.className = "merge-actions";
    actions.append(
      action("merge.moveUp", "merge.moveUp", () => { order = moveClip(order, id, -1); invalidate(); render(); }, index === 0),
      action("merge.moveDown", "merge.moveDown", () => { order = moveClip(order, id, 1); invalidate(); render(); }, index === order.length - 1),
      action("merge.remove", "merge.remove", () => { const at = entries.findIndex((value) => value.id === id); if (entry.loading) { entry.loading = false; pendingMetadata -= 1; } if (entry.analyzing) { entry.analyzing = false; pendingAnalysis -= 1; } entries.splice(at, 1); order = order.filter((value) => value !== id); reconcileTransitions(); invalidate(); render(); }, false),
    );
    const handle = action("merge.drag", "merge.drag", () => {}, busy);
    handle.classList.add("merge-drag-handle");
    handle.draggable = !busy;
    handle.ondragstart = (event) => {
      if (busy) { event.preventDefault(); return; }
      draggingId = id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-video-editor-clip", id);
      item.classList.add("is-dragging");
    };
    handle.ondragend = () => { draggingId = null; el.sourceList.querySelectorAll(".is-dragging,.drop-before,.drop-after").forEach((node) => node.classList.remove("is-dragging", "drop-before", "drop-after")); };
    actions.prepend(handle);
    item.ondragover = (event) => {
      if (busy || !draggingId || !event.dataTransfer.types.includes("application/x-video-editor-clip")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      item.classList.toggle("drop-after", event.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
      item.classList.toggle("drop-before", !item.classList.contains("drop-after"));
    };
    item.ondragleave = () => item.classList.remove("drop-before", "drop-after");
    item.ondrop = (event) => {
      if (busy || !draggingId || event.dataTransfer.getData("application/x-video-editor-clip") !== draggingId) return;
      event.preventDefault();
      order = reorderClip(order, draggingId, id, item.classList.contains("drop-after"));
      draggingId = null;
      invalidate();
      render();
    };
    item.append(detail, actions);
    el.sourceList.append(item);
  });
  reconcileTransitions();
  renderTransitions();
  renderTimeline();
  controls();
}

function readMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); };
    video.onloadedmetadata = () => {
      const meta = { duration_ms: Math.floor(video.duration * 1000), width: video.videoWidth, height: video.videoHeight };
      cleanup();
      if (!Number.isSafeInteger(meta.duration_ms) || meta.duration_ms < 1 || !meta.width || !meta.height) reject(new Error("Invalid video metadata."));
      else resolve(meta);
    };
    video.onerror = () => { cleanup(); reject(new Error("Could not read video metadata.")); };
    video.src = url;
  });
}

async function addFiles(files) {
  const restoring = Boolean(pendingProject);
  if (pendingProject && !projectSourcesMatch(pendingProject, files)) { const error = new Error(t("project.mergeMismatch")); error.projectWarningKey = "project.mergeMismatch"; throw error; }
  validateAddition(pendingProject ? [] : entries, files);
  if (pendingProject) { entries.length = 0; order = []; transitionSettings.clear(); selectedBoundaryKey = null; }
  invalidate();
  const savedEntries = pendingProject?.state?.entries || [];
  const tasks = [];
  for (const file of files) {
    const saved = pendingProject ? savedEntries[entries.length] : null;
    const entry = { id: saved?.id || `video-${++nextId}`, media_id: saved?.file?.media_id || mediaId(), file, meta: saved?.meta || null, fps: saved?.fps ?? "", fpsSource: saved?.fpsSource || null, fpsMode: saved?.fpsMode || "choice", detectedFps: saved?.detectedFps || null, fpsKind: saved?.fpsKind || null, hasAudio: saved?.hasAudio ?? null, audioSource: saved?.audioSource || null, detectedHasAudio: saved?.detectedHasAudio || null, startSeconds: saved?.startSeconds ?? "0", endSeconds: saved?.endSeconds ?? "", error: null, analysisError: null, loading: true, analyzing: true };
    entries.push(entry);
    order.push(entry.id);
    pendingMetadata += 1;
    pendingAnalysis += 1;
    render();
    const metadataTask = readMetadata(file).then((meta) => {
      if (entries.includes(entry)) { entry.meta = meta; if (!saved?.endSeconds) entry.endSeconds = (meta.duration_ms / 1000).toFixed(3); entry.error = null; render(); }
    }).catch((error) => {
      if (entries.includes(entry)) { entry.error = error.message; render(); }
    }).finally(() => { if (entry.loading) { entry.loading = false; pendingMetadata -= 1; } });
    const analysisTask = analyzeStreams(file).then((analysis) => {
      if (entries.includes(entry)) { applyStreamAnalysis(entry, analysis); entry.analysisError = null; render(); }
    }).catch(() => {
      if (entries.includes(entry)) { entry.analysisError = true; render(); }
    }).finally(() => { if (entry.analyzing) { entry.analyzing = false; pendingAnalysis -= 1; if (entries.includes(entry)) render(); } });
    tasks.push(Promise.all([metadataTask, analysisTask]));
  }
  await Promise.all(tasks);
  if (!restoring && !simpleExport.quality) simpleExport.quality = "balanced";
  if (!Number.isFinite(Number(el.fps.value)) || Number(el.fps.value) <= 0) el.fps.value = "30";
  if (pendingProject?.state?.order) order = pendingProject.state.order.filter((id) => entries.some((entry) => entry.id === id));
  if (pendingProject?.state?.output) { el.width.value = pendingProject.state.output.width; el.height.value = pendingProject.state.output.height; el.fps.value = pendingProject.state.output.fps; }
  if (pendingProject?.state?.transitions) { transitionSettings.clear(); pendingProject.state.transitions.forEach(([key, value]) => transitionSettings.set(key, value)); }
  selectedBoundaryKey = pendingProject?.state?.selectedBoundaryKey || null;
  if (pendingProject) { const restoredProject = pendingProject; const recent = restoredProject.projectType === "recent"; simpleExport = normalizeSimpleExport(restoredProject.state?.simple_export); if (!simpleExport.quality) simpleExport.quality = "balanced"; if (!Number.isFinite(Number(el.fps.value)) || Number(el.fps.value) <= 0) el.fps.value = "30"; advancedExport = restoredProject.state?.advanced_export && typeof restoredProject.state.advanced_export === "object" ? { ...restoredProject.state.advanced_export } : advancedExport; projectId = recent ? null : restoredProject.id; projectName = recent ? "" : restoredProject.name; projectCreatedAt = recent ? null : restoredProject.createdAt; recentProjectCreatedAt = recent ? restoredProject.createdAt : null; pendingProject = null; }
  reconcileTransitions();
  render();
  if (restoring && entries.every((entry) => !entry.error)) { projectDirty = true; clearTimeout(recentSaveTimer); recentSaveTimer = null; return await saveRecentWork(++recentSaveToken); }
  return true;
}

async function plan() {
  if (pendingMetadata || pendingAnalysis) { const error = new Error("Wait for video metadata to finish loading."); error.stage = "Validation"; throw error; }
  if (transitionInputInvalid) { const error = new Error("merge.transitionInvalidDuration"); error.stage = "Validation"; throw error; }
  let recipe;
  try {
    const clips = timelineClips(entries, order);
    mergeTransitionLayout(clips, transitionSettings);
    applySimpleExport();
    const meta = mergeSourceMeta();
    const bitrate = simpleExport.quality ? simpleVideoBitrate(meta, simpleExport.resolution || "original", simpleExport.quality) : null;
    recipe = buildMergeRecipe(entries, order, { width: el.width.value, height: el.height.value, fps: el.fps.value, video_bitrate: bitrate }, activeMergeTransitions(order, transitionSettings));
  } catch (error) {
    error.stage = "Validation";
    throw error;
  }
  let response;
  try {
    response = await fetch("/api/merge/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recipe) });
  } catch (error) {
    const failure = new Error(`API request failed: ${error.message}`);
    failure.stage = "API";
    throw failure;
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    const error = new Error(`API request failed (${response.status}): ${detail || "No response details."}`);
    error.stage = "API";
    throw error;
  }
  try {
    return await response.json();
  } catch (error) {
    const failure = new Error(`API response is invalid: ${error.message}`);
    failure.stage = "API";
    throw failure;
  }
}

el.files.onchange = async (event = null) => {
  const files = event?.filesOverride || Array.from(el.files.files || []);
  el.files.value = "";
  if (!files.length) return;
  try { const saved = await addFiles(files); if (saved === false) return false; status("merge.ready"); return true; }
  catch (error) { if (error.projectWarningKey === "project.mergeMismatch") showMergeMismatchWarning(); else { status("status.failed"); log(error.message); } }
};

el.sourceList.ondragover = (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); };
el.sourceList.ondrop = (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); };

el.clear.onclick = () => { for (const entry of entries) { entry.loading = false; entry.analyzing = false; } pendingMetadata = 0; pendingAnalysis = 0; entries.length = 0; order = []; transitionSettings.clear(); selectedBoundaryKey = null; transitionInputInvalid = false; requestToken += 1; resetSimpleExportState(); clearOutput(); render(); status("status.idle"); };
for (const node of [el.width, el.height, el.fps]) node.oninput = () => { invalidate(); renderTimeline(); };
el.mergeTransitionSection.addEventListener("toggle", () => { if (!el.mergeTransitionSection.open) transitionPreview.pause(); renderTimeline(); });

function setTransition(patch, keepNumber = false) {
  const selected = selectedBoundary();
  if (!selected || busy) return;
  const typedNumber = keepNumber ? el.mergeTransitionNumber.value : null;
  const current = transitionSettings.get(selected.key) || { type: "none", duration_ms: 500 };
  transitionSettings.set(selected.key, { ...current, ...patch });
  transitionInputInvalid = false;
  invalidate();
  renderTransitions();
  if (keepNumber) el.mergeTransitionNumber.value = typedNumber;
  renderTimeline();
}

el.mergeTransitionType.onchange = () => setTransition({ type: el.mergeTransitionType.value });
el.mergeTransitionRange.oninput = () => setTransition({ duration_ms: Math.round(Number(el.mergeTransitionRange.value) * 1000) });
el.mergeTransitionNumber.oninput = () => {
  const value = el.mergeTransitionNumber.value.trim();
  transitionInputInvalid = !/^(?:0\.[1-9]|[1-2](?:\.[0-9])?|3(?:\.0)?)$/.test(value);
  if (!transitionInputInvalid) setTransition({ duration_ms: Math.round(Number(value) * 1000) }, true);
  else { invalidate(); updateTransitionError("merge.transitionInvalidDuration"); renderTimeline(); }
};
el.mergeTransitionNumber.onchange = () => {
  if (transitionInputInvalid) { updateTransitionError("merge.transitionInvalidDuration"); return; }
  renderTransitions();
};
el.mergeTransitionReset.onclick = () => setTransition({ type: "none" });

el.validate.onclick = async () => {
  if (busy) return;
  const token = ++requestToken;
  busy = true;
  controls();
  status("status.validating");
  try { await plan(); if (token === requestToken) status("merge.valid"); }
  catch (error) { if (token === requestToken) { status("status.failed"); log(`${error.stage || "Validation"}: ${t(error.message)}`); } }
  finally { busy = false; controls(); }
};

el.run.onclick = async () => {
  if (busy) return;
  const token = ++requestToken;
  busy = true;
  controls();
  clearOutput();
  el.log.textContent = "";
  el.progressBar.removeAttribute("value");
  status("status.validating");
  try {
    const downloadName = mergeFilenameForOrder(entries, order);
    const planRes = await plan();
    if (token !== requestToken) return;
    const phases = { Preparing: "merge.phasePreparing", Loading: "merge.phaseLoading", "Writing inputs": "merge.phaseWriting", Processing: "merge.phaseProcessing", "Reading output": "merge.phaseReading", Completed: "status.completed", Cancelled: "status.cancelled", Failed: "status.failed" };
    const result = await runMergePlan({ files: entries.map((entry) => entry.file), planRes, log, onProgress: (value) => { el.progressBar.value = value; el.progressText.textContent = `${Math.round(value)}% — ${t("merge.progressUnknown")}`; }, onStatus: (phase) => { status(phases[phase] || null, phase); } });
    if (token !== requestToken) { result.revoke(); return; }
    output = result;
    el.preview.src = result.url;
    el.download.href = result.url;
    applyMergeDownloadName(el.download, el.resultName, downloadName);
    el.result.hidden = false;
    status("status.completed");
    try {
      requestAnimationFrame(() => {
        if (token !== requestToken || el.result.hidden) return;
        try {
          el.result.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            block: "start",
          });
        } catch {}
      });
    } catch {}
  } catch (error) {
    if (token === requestToken) { status("status.failed"); log(`${error.stage || "FFmpeg"}: ${t(error.message)}`); }
  } finally { busy = false; controls(); }
};

el.cancel.onclick = () => {
  if (!busy) return;
  requestToken += 1;
  cancelFfmpeg();
  status("status.cancelled");
  el.cancel.disabled = true;
};

window.addEventListener("pagehide", () => { transitionPreview.destroy(); clearOutput(); });
window.addEventListener("resize", renderTimeline);
function resetSimpleExportState() { simpleExport = { resolution: null, quality: null, mode: "advanced" }; advancedExport = null; }
setTimeout(async () => { createProjectControls(); const handler = el.files.onchange; el.files.onchange = async (event) => { const restoring = Boolean(pendingProject); if (!restoring) { projectId = null; projectName = ""; projectCreatedAt = null; resetSimpleExportState(); } const restored = await handler(event); if (!restoring) scheduleProjectSave(); }; document.addEventListener("input", (event) => { if (event.target.closest(".source-card,.controls-card")) scheduleProjectSave(); }); document.addEventListener("change", (event) => { if (event.target.closest(".source-card,.controls-card")) scheduleProjectSave(); }); try { const recent = await getRecentProjectWithMedia("merge"); if (recent && !entries.length && window.confirm(t("project.restorePrompt"))) beginProjectRestore(recent); else { const projects = await listProjects("merge"); if (projects.length && window.confirm(t("project.restorePrompt"))) { pendingProject = validateProject(projects[0]); projectEl.projectStatus.textContent = t("project.restoreFiles"); el.files.click(); } } } catch (error) { log(error.message); } }, 0);
initializeLanguage(el.languageSelect, undefined, () => { projectEl?.refresh(); topButton.refresh(); refreshOutputTabsLanguage(); refreshOutputSummary(); render(); transitionPreview.refreshLanguage(); if (statusKey) status(statusKey); });
initializeTheme(el.themeSelect);
render();
