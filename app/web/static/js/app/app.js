import { plan, presets, validateRecipe } from "./api.js";
import { cancelFfmpeg, runPlan } from "./ffmpeg.js";
import { loadVideoMeta } from "./meta.js";
import { analyzeStreams } from "./stream-meta.js";
import { applyPatch, buildRecipeFromUi, serializeRecipe } from "./recipe.js";
import { buildOutputFilename } from "./filename.js";
import { renderTextAssets } from "./text-overlay.js";
import { maxMotionFrames, maxMotionBytes, motionAt, motionFrameCount, motionPoints, paintMotionText, renderMotionFrames, validateMotion } from "./motion-keyframes.js";
import { audioKeyframeTracks, defaultAudioKeyframes, keyframeVolume, sortedKeyframes, validateAudioKeyframes } from "./audio-keyframes.js";
import { defaultSubtitleStyle, maxSubtitleCues, paintSubtitle, parseSubtitleFile, renderSubtitleAssets, sortedSubtitleCues, validateSubtitles } from "./subtitle-editor.js";
import { transitionLayout, sourceAtOutput, outputAtSource } from "./transitions.js";
import { normalizeSimpleExport, simpleDimensions, simpleExportReady, simpleResolutionOptions, simpleVideoBitrate } from "./simple-export.js";
import { createTransitionPreview } from "./transition-preview.js";
import { decodeImage, releaseImageAsset, renderImageAssets, outputDimensions, imageGeometry, normalizedCrop, previewCanvasGeometry } from "./image-overlay.js";
import { createColorPreview } from "./color-preview.js";
import { createTimeline } from "./timeline.js";
import { formatTime } from "./time.js";
import { createThumbnailRenderer } from "./thumbnails.js";
import { bindKeyboardShortcuts } from "./shortcuts.js";
import { initializeTheme } from "./theme.js";
import { applyTranslations, initializeLanguage, t } from "./i18n.js";
import { deleteProject, downloadProject, fileDescriptor, fileFromMedia, getProjectWithMedia, getRecentProjectWithMedia, listProjects, mediaId, mediaRecord, projectSourcesMatch, readProjectFile, recentProjectId, saveProjectWithMedia, saveRecentProject, validateProject } from "./project-store.js";
import { createProjectMenu, createProjectWarningDialog } from "./project-menu.js?v=3";
import { createTopButton } from "./top-button.js";
import { cancelStt, convertSttSegments, sttJobResult, sttJobStatus, submitStt } from "./stt.js";

let lastBlobUrl = null;
let inputBlobUrl = null;
let runToken = 0;
const maxFileSize = 2 * 1024 ** 3;

const el = Object.fromEntries(["file","fileNameDisplay","inputPreview","previewStage","previewCrop","previewSource","previewControls","previewPlayPause","previewSeek","previewVolume","previewFullscreen","inputEmpty","fileStatus","sourceNote","languageSelect","themeSelect","fileMeta","metaName","metaType","metaSize","metaResolution","metaDuration","timelineEditor","timelineViewport","timelineCanvas","timelineTrack","timelineRuler","timelineThumbnails","timelineSegments","timelineTrimRange","timelinePlayhead","trimStartHandle","trimEndHandle","timelineCurrent","timelineTotal","timelineTrimState","timelineSegmentCount","timelineEmpty","timelineHint","timelineZoomOut","timelineZoomIn","timelineZoomFit","timelineZoomValue","loopTrim","preset","applyPreset","trimStart","trimEnd","audioMode","audioFormat","container","cropEnable","cropX","cropY","cropW","cropH","cropReset","cropSourceResolution","cropError","scaleEnable","scaleW","scaleH","scaleKeepAspect","transformRotation","transformFlipHorizontal","transformFlipVertical","transformReset","canvasEnable","canvasAspectRatio","canvasFit","canvasBackgroundColor","canvasBackgroundHex","canvasOutputResolution","canvasReset","videoKbps","audioKbps","frameEnable","frameAt","validate","run","cancel","clear","log","outVideo","outAudio","outImage","download","segStart","segEnd","addSeg","clearSegs","segList","segHint","segTitle","statusBadge","statusTitle","statusMessage","progressBar","progressText","outputSection","outputEmpty","outputVideoPanel","outputAudioPanel","outputImagePanel","downloadPanel","outputFileName","outputFileSize","undoBtn","redoBtn","textPreview","timelineTexts","subtitlePreview","timelineOriginalAutomation","timelineOriginalAutomationPoints","timelineMusicAutomation","timelineMusicAutomationPoints","originalKeyframeEnabled","originalKeyframeGraph","originalKeyframeAdd","originalKeyframeDelete","originalKeyframeReset","originalKeyframeEmpty","originalKeyframeList","originalKeyframeTime","originalKeyframeVolume","musicKeyframeEnabled","musicKeyframeGraph","musicKeyframeAdd","musicKeyframeDelete","musicKeyframeReset","musicKeyframeEmpty","musicKeyframeList","musicKeyframeTime","musicKeyframeVolume","audioKeyframeError","audioKeyframeWarning","timelineSubtitleTrack","timelineSubtitleCues","subtitleTitle","subtitleAdd","subtitleImportButton","subtitleImportFile","subtitleDelete","subtitleEmpty","subtitleList","subtitleText","subtitleStart","subtitleEnd","subtitleFontSize","subtitleColor","subtitleOutlineColor","subtitleOutlineWidth","subtitleAlignment","subtitleBottomMargin","subtitleStyleReset","subtitleError","textAdd","textDelete","textList","textContent","textAlign","textStart","textEnd","textSize","textColor","textX","textY","musicFile","musicReplace","musicRemove","musicFileStatus","musicSourceVolume","musicSourceVolumeValue","musicVolume","musicVolumeValue","musicStart","musicTrimStart","musicTrimEnd","musicFadeIn","musicFadeOut","musicPreview","timelineMusicTrack","timelineMusicClip","timelineMusicPlayhead","timelineOutputTrack","timelineOutputPlayhead","timelineOutputCurrent","timelineOutputTotal","timelineOutputMiddle","timelineOutputEnd","speedQuick","speedCustom","speedCurrent","speedReset","fadeInEnabled","fadeInRange","fadeInSeconds","fadeOutEnabled","fadeOutRange","fadeOutSeconds","fadeReset","fadeError","fadePreview","fadeInRegion","fadeOutRegion","colorPreview","colorBrightnessRange","colorBrightnessNumber","colorContrastRange","colorContrastNumber","colorSaturationRange","colorSaturationNumber","colorGammaRange","colorGammaNumber","colorReset","colorError","colorPreviewWarning","imagePreview","timelineImageTrack","timelineImageClips","imageTitle","imageAdd","imageSelect","imageReplace","imageRemove","imageMoveUp","imageMoveDown","imageFile","imageList","imageSelectedFile","imageStart","imageEnd","imageXRange","imageXNumber","imageYRange","imageYNumber","imageWidthRange","imageWidthNumber","imageOpacityRange","imageOpacityNumber","imageReset","imageError","transitionPreview","timelineTransitions","transitionTitle","transitionList","transitionEmpty","transitionType","transitionDurationRange","transitionDurationNumber","transitionReset","transitionError","transitionPreviewWarning","textMotionEnabled","textMotionAdd","textMotionDelete","textMotionReset","textMotionList","textMotionTime","textMotionX","textMotionY","textMotionScale","textMotionOpacity","textMotionError","timelineTextMotionTrack","timelineTextMotionPoints","imageMotionEnabled","imageMotionAdd","imageMotionDelete","imageMotionReset","imageMotionList","imageMotionTime","imageMotionX","imageMotionY","imageMotionScale","imageMotionOpacity","imageMotionError","timelineImageMotionTrack","timelineImageMotionPoints"].map((id) => [id, document.getElementById(id)]));
for (const [id, node] of Object.entries(el)) {
  if (!node) throw new Error(`Required editor element is missing: ${id}`);
}
for (const label of ["Brightness", "Contrast", "Saturation", "Gamma"]) {
  for (const suffix of ["Range", "Number"]) {
    const id = `color${label}${suffix}`;
    if (!Object.hasOwn(el, id)) throw new Error(`Required editor reference is missing: ${id}`);
  }
}
initializeTheme(el.themeSelect);
const fpsMetaCell = document.createElement("div");
fpsMetaCell.innerHTML = '<span class="meta-label">FPS</span><strong id="metaFps">—</strong>';
el.fileMeta.append(fpsMetaCell);
const metaFps = fpsMetaCell.querySelector("strong");
let displayedFps = "";
let sourceFpsKnown = false;
function formatSourceFps(value) {
  const fps = Number(value);
  return Number.isFinite(fps) && fps > 0 && fps <= 240 ? String(Number(fps.toFixed(2))) : "—";
}
function syncSourceFps() {
  const value = formatSourceFps(sourceFpsKnown ? state.meta?.fps : null);
  if (value !== displayedFps) { displayedFps = value; metaFps.textContent = value; }
}
new MutationObserver(syncSourceFps).observe(el.fileMeta, { childList: true, subtree: true, characterData: true });
let refreshLanguage = () => {};
initializeLanguage(el.languageSelect, undefined, () => refreshLanguage());
const topButton = createTopButton(t);

const state = { presets: [], file: null, sourceMediaId: null, projectMedia: [], meta: null, recipeDraft: null, recipeNormalized: null, lastPlan: null, outputFps: null, removeSegments: [], textOverlays: [], subtitles: { cues: [], style: { ...defaultSubtitleStyle } }, audioKeyframes: defaultAudioKeyframes(), selectedKeyframeIds: { original: null, background_music: null }, keyframeCounters: { original: 0, background_music: 0 }, selectedSubtitleId: null, subtitleCounter: 0, imageOverlays: [], selectedImageId: null, imageFiles: new Map(), imageCounter: 0, imageSelectionToken: 0, imageFileAction: null, videoTransitions: [], selectedTransitionId: null, transitionInputInvalid: false, audioMix: null, musicFiles: new Map(), musicCounter: 0, musicSelectionToken: 0, activeMusicId: null, activeMusicUrl: null, selectedText: -1, selectedMotionIds: { text: null, image: null }, motionCounter: 0, motionInputInvalid: { text: false, image: false }, selectedSegment: -1, undoStack: [], redoStack: [], isRestoring: false, running: false, cancelRequested: false, loopTrim: false, recipeEditToken: 0, projectId: null, projectName: "", projectCreatedAt: null, projectDirty: false, status: "Idle", statusMessageKey: "messages.chooseVideo", statusMessageValues: {}, statusProgress: null };
const sttState = { jobId: null, pollToken: 0, sourceFile: null, previewCues: [], invalidCount: 0, overflow: false, busy: false, messageKey: null, messageValues: {} };
let pendingProject = null;
let pendingMedia = [];
state.recentProjectCreatedAt = null;
let recentSaveTimer = null;
let recentSaveToken = 0;
let recentAutoSaveSuspended = false;
let recentCheckpointTimer = null;
let projectEl = null;
let simpleExport = { resolution: null, quality: null, mode: "advanced" };
let sourceGeometry = null;
let advancedExport = null;
let simpleEl = null;
function createSttUi() {
  const panel = document.createElement("div");
  panel.className = "stt-panel";
  const title = document.createElement("h3"); title.dataset.i18n = "stt.title";
  const controls = document.createElement("div"); controls.className = "stt-controls input-grid two-col";
  const languageLabel = document.createElement("label"); const languageText = document.createElement("span"); languageText.dataset.i18n = "stt.language";
  const language = document.createElement("select"); language.innerHTML = '<option value="auto" data-i18n="stt.auto">Auto Detect</option><option value="ko" data-i18n="stt.korean">Korean</option><option value="en" data-i18n="stt.english">English</option>'; languageLabel.append(languageText, language);
  const generate = document.createElement("button"); generate.type = "button"; generate.className = "secondary"; generate.dataset.i18n = "stt.generate";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "danger"; cancel.dataset.i18n = "stt.cancel";
  controls.append(languageLabel, generate, cancel);
  const message = document.createElement("p"); message.className = "stt-message"; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
  const review = document.createElement("div"); review.className = "stt-review"; review.hidden = true;
  const reviewTitle = document.createElement("h4"); reviewTitle.dataset.i18n = "stt.review";
  const reviewCount = document.createElement("p"); reviewCount.className = "field-help";
  const reviewList = document.createElement("div"); reviewList.className = "stt-review-list";
  const mode = document.createElement("select"); mode.innerHTML = '<option value="keep" data-i18n="stt.keep">Keep Existing Subtitles</option><option value="replace" data-i18n="stt.replace">Replace Existing Subtitles</option>';
  const apply = document.createElement("button"); apply.type = "button"; apply.className = "secondary"; apply.dataset.i18n = "stt.apply";
  const discard = document.createElement("button"); discard.type = "button"; discard.className = "secondary"; discard.dataset.i18n = "stt.discard";
  const reviewActions = document.createElement("div"); reviewActions.className = "history-actions"; reviewActions.append(mode, apply, discard);
  review.append(reviewTitle, reviewCount, reviewList, reviewActions);
  panel.append(title, controls, message, review);
  el.subtitleTitle.closest("details").querySelector(".history-actions").after(panel);
  return { panel, controls, language, generate, cancel, message, review, reviewCount, reviewList, mode, apply, discard };
}
const sttUi = createSttUi();
async function restorePendingProject() {
  if (!pendingProject || !state.file || !state.meta || !state.recipeNormalized) return;
  const project = pendingProject;
  state.isRestoring = true;
  state.recipeEditToken += 1;
  let mediaRestored = false;
  try {
    if (!projectSourcesMatch(project, [state.file])) { const error = new Error(t("project.sourceMismatch")); error.projectStatusKey = "project.sourceMismatch"; throw error; }
    const recipe = cloneRecipe(project.state.recipe);
    if (!Number.isFinite(Number(recipe.output_fps)) || Number(recipe.output_fps) <= 0) recipe.output_fps = defaultOutputFps(state.meta);
    if (!recipe.bitrate?.video_kbps) recipe.bitrate = { ...(recipe.bitrate || {}), video_kbps: simpleVideoBitrate(state.meta, "original", simpleExport.quality || "balanced") };
    recipe.image_overlays = (recipe.image_overlays || []).map(({ media_id, ...item }) => item);
    if (recipe.audio_mix?.tracks) recipe.audio_mix.tracks = recipe.audio_mix.tracks.map(({ media_id, ...track }) => track);
    const response = await validateRecipe({ meta: state.meta, recipe });
    if (pendingProject !== project) return false;
    state.projectId = project.projectType === "recent" ? null : project.id;
    state.projectName = project.projectType === "recent" ? "" : project.name;
    state.projectCreatedAt = project.projectType === "recent" ? null : project.createdAt;
    state.recentProjectCreatedAt = project.projectType === "recent" ? project.createdAt : null;
    state.projectMedia = cloneRecipe(project.media || []);
    simpleExport = normalizeSimpleExport(project.state.simple_export);
    advancedExport = project.state.advanced_export && typeof project.state.advanced_export === "object" ? { ...project.state.advanced_export } : null;
    commitNormalized(response.normalized, { pushHistory: false });
    mediaRestored = await restoreProjectMedia(project);
    if (pendingProject !== project) return false;
    state.recipeDraft = serializeRecipe(recipe);
    recentObservedRecipe = recipeKey(state.recipeNormalized);
    if (!mediaRestored) updateProjectStatus("project.mediaUnavailable");
    if (mediaRestored) projectEl?.importDialog.close();
  } catch (error) {
    log(error.message);
    if (error.projectStatusKey === "project.sourceMismatch") showSourceMismatchWarning();
    else updateProjectStatus(error.projectStatusKey || "project.failed");
    return false;
  } finally {
    state.isRestoring = false;
    if (pendingProject === project) pendingProject = null;
  }
  if (mediaRestored) {
    state.projectDirty = true;
    clearTimeout(recentSaveTimer);
    recentSaveTimer = null;
    await saveRecentWork(++recentSaveToken);
  }
  return mediaRestored;
}
async function restoreProjectMedia(project) {
  const records = pendingMedia;
  pendingMedia = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  let complete = true;
  for (const item of state.imageOverlays) {
    const saved = project.state.recipe.image_overlays?.find((entry) => entry.id === item.id);
    item.media_id ||= saved?.media_id || project.media.find((entry) => entry.role === "image" && entry.file_ref === item.file_ref)?.media_id;
    const record = byId.get(item.media_id);
    const file = fileFromMedia(record);
    if (!file) { complete = false; continue; }
    try { state.imageFiles.set(item.file_ref, await decodeImage(file)); } catch (error) { complete = false; log(error.message); }
  }
  for (const track of state.audioMix?.tracks || []) {
    const saved = project.state.recipe.audio_mix?.tracks?.find((entry) => entry.source_id === track.source_id);
    track.media_id ||= saved?.media_id || project.media.find((entry) => entry.role === "audio" && entry.source_id === track.source_id)?.media_id;
    const record = byId.get(track.media_id);
    const file = fileFromMedia(record);
    if (file) state.musicFiles.set(track.source_id, file);
    else complete = false;
  }
  renderImageUi(); renderImagePreview(); renderImageTimeline(); renderMusicUi(); syncMusicPreview();
  return complete;
}
setTimeout(async () => { createProjectControls(); const handler = el.file.onchange; el.file.onchange = async (event) => { const restoring = Boolean(pendingProject); const file = event?.fileOverride || el.file.files?.[0]; if (restoring && file && !projectSourcesMatch(pendingProject, [file])) { showSourceMismatchWarning(); el.file.value = ""; return; } if (!restoring) { state.projectId = null; state.projectName = ""; state.projectCreatedAt = null; recentAutoSaveSuspended = false; } await handler(event); if (restoring) await restorePendingProject(); else scheduleProjectSave(); }; document.addEventListener("input", (event) => { if (event.target.closest(".controls-card,.source-card")) scheduleProjectSave(); }); document.addEventListener("change", (event) => { if (event.target.closest(".controls-card,.source-card")) scheduleProjectSave(); }); try { const recent = await getRecentProjectWithMedia("app"); if (recent && !state.file) { const restore = await projectEl.recoveryDialog.open(); if (restore) beginProjectRestore(recent); else recentAutoSaveSuspended = true; } else { const projects = await listProjects("app"); if (projects.length && window.confirm(t("project.restorePrompt"))) { pendingProject = validateProject(projects[0]); projectEl.projectStatus.textContent = t("project.restoreFiles"); el.file.click(); } } } catch (error) { log(error.message); } }, 0);
const controlIds = ["trimStart","trimEnd","audioMode","audioFormat","container","cropEnable","cropX","cropY","cropW","cropH","cropReset","scaleEnable","scaleW","scaleH","scaleKeepAspect","transformRotation","transformFlipHorizontal","transformFlipVertical","transformReset","canvasEnable","canvasAspectRatio","canvasFit","canvasBackgroundColor","canvasBackgroundHex","canvasReset","videoKbps","audioKbps","frameEnable","frameAt","preset","applyPreset","validate","run","segStart","segEnd","addSeg","clearSegs","timelineZoomOut","timelineZoomIn","timelineZoomFit","loopTrim","textAdd","textDelete","textContent","textAlign","textStart","textEnd","textSize","textColor","textX","textY","subtitleAdd","subtitleImportButton","subtitleImportFile","subtitleDelete","subtitleText","subtitleStart","subtitleEnd","subtitleFontSize","subtitleColor","subtitleOutlineColor","subtitleOutlineWidth","subtitleAlignment","subtitleBottomMargin","subtitleStyleReset","originalKeyframeEnabled","originalKeyframeAdd","originalKeyframeDelete","originalKeyframeReset","originalKeyframeTime","originalKeyframeVolume","musicKeyframeEnabled","musicKeyframeAdd","musicKeyframeDelete","musicKeyframeReset","musicKeyframeTime","musicKeyframeVolume","musicSourceVolume","musicVolume","musicStart","musicTrimStart","musicTrimEnd","musicFadeIn","musicFadeOut","musicRemove","musicReplace","musicFile","speedQuick","speedCustom","speedReset","fadeInEnabled","fadeInRange","fadeInSeconds","fadeOutEnabled","fadeOutRange","fadeOutSeconds","fadeReset","colorBrightnessRange","colorBrightnessNumber","colorContrastRange","colorContrastNumber","colorSaturationRange","colorSaturationNumber","colorGammaRange","colorGammaNumber","colorReset","imageAdd","imageSelect","imageReplace","imageRemove","imageMoveUp","imageMoveDown","imageFile","imageStart","imageEnd","imageXRange","imageXNumber","imageYRange","imageYNumber","imageWidthRange","imageWidthNumber","imageOpacityRange","imageOpacityNumber","imageReset","transitionType","transitionDurationRange","transitionDurationNumber","transitionReset","textMotionEnabled","textMotionAdd","textMotionDelete","textMotionReset","textMotionList","textMotionTime","textMotionX","textMotionY","textMotionScale","textMotionOpacity","textMotionError","imageMotionEnabled","imageMotionAdd","imageMotionDelete","imageMotionReset","imageMotionList","imageMotionTime","imageMotionX","imageMotionY","imageMotionScale","imageMotionOpacity","imageMotionError"];
let thumbnailRenderer;
let audioGraph = null;
let transitionAudioUnavailable = false;
let colorPreviewFailure = null;
const colorRenderer = createColorPreview(el.colorPreview, el.inputPreview, (error) => { colorPreviewFailure = error; if (error) log(`${t("color.previewUnavailable")} ${error.message || error}`); else renderColorPreview(); });
const transitionRenderer = createTransitionPreview(el.transitionPreview, el.inputPreview, () => { renderTransitionPreview(); renderColorPreview(); syncMusicPreview(); });

function log(msg) { const line = String(msg ?? "").slice(0, 500); const lines = el.log.textContent ? el.log.textContent.split("\n") : []; lines.push(line); if (lines.length > 15) lines.splice(0, lines.length - 15); el.log.textContent = lines.join("\n"); el.log.scrollTop = el.log.scrollHeight; }
function clearLog() { el.log.textContent = ""; }
function createProjectImportDialog(selectFile) {
  const overlay = document.createElement("div");
  overlay.className = "project-import-modal";
  overlay.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "project-import-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "project-import-title");
  dialog.setAttribute("aria-describedby", "project-import-message");
  const title = document.createElement("h2");
  title.id = "project-import-title";
  const message = document.createElement("p");
  message.id = "project-import-message";
  const actions = document.createElement("div");
  actions.className = "project-import-actions";
  const select = document.createElement("button");
  select.type = "button";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "secondary";
  actions.append(select, closeButton);
  dialog.append(title, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  let previousFocus = null;
  const close = () => { if (overlay.hidden) return; overlay.hidden = true; if (previousFocus?.isConnected) previousFocus.focus(); };
  const open = () => { previousFocus = document.activeElement; overlay.hidden = false; select.focus(); };
  const refresh = () => { title.textContent = t("project.importTitle"); message.textContent = t("project.importReady"); select.textContent = t("project.selectOriginal"); closeButton.textContent = t("project.close"); };
  select.addEventListener("click", () => { close(); selectFile(); });
  closeButton.addEventListener("click", close);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [select, closeButton];
    const index = focusable.indexOf(document.activeElement);
    const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length;
    event.preventDefault();
    focusable[next].focus();
  });
  refresh();
  return { open, close, refresh };
}
function createProjectDeleteDialog() {
  const overlay = document.createElement("div");
  overlay.className = "project-import-modal";
  overlay.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "project-import-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const title = document.createElement("h2");
  const message = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "project-import-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "danger";
  actions.append(cancel, confirm);
  dialog.append(title, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  let previousFocus = null;
  let resolveChoice = null;
  const close = (choice = false) => { if (overlay.hidden) return; overlay.hidden = true; const resolve = resolveChoice; resolveChoice = null; if (previousFocus?.isConnected) previousFocus.focus(); resolve?.(choice); };
  const open = () => { previousFocus = document.activeElement; overlay.hidden = false; cancel.focus(); return new Promise((resolve) => { resolveChoice = resolve; }); };
  const refresh = () => { title.textContent = t("project.deleteTitle"); message.textContent = `${t("project.deleteMessage")}\n${t("project.deleteKeepMedia")}`; cancel.hidden = false; confirm.className = "danger"; cancel.textContent = t("project.deleteCancel"); cancel.setAttribute("aria-label", t("project.deleteCancel")); confirm.textContent = t("project.deleteConfirm"); confirm.title = t("project.delete"); confirm.setAttribute("aria-label", t("project.delete")); };
  const showResult = (messageKey) => { previousFocus = document.activeElement; title.textContent = t("project.deleteResultTitle"); message.textContent = t(messageKey); cancel.hidden = true; confirm.className = "secondary"; confirm.textContent = t("project.close"); confirm.title = t("project.close"); confirm.setAttribute("aria-label", t("project.close")); overlay.hidden = false; confirm.focus(); return new Promise((resolve) => { resolveChoice = resolve; }); };
  cancel.addEventListener("click", () => close(false));
  confirm.addEventListener("click", () => close(true));
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(false); return; } if (event.key !== "Tab") return; const focusable = [cancel, confirm]; const index = focusable.indexOf(document.activeElement); const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length; event.preventDefault(); focusable[next].focus(); });
  refresh();
  return { open, close, refresh, showResult };
}
function createProjectRecoveryDialog() {
  const overlay = document.createElement("div");
  overlay.className = "project-import-modal";
  overlay.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "project-import-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const title = document.createElement("h2");
  const message = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "project-import-actions";
  const later = document.createElement("button");
  later.type = "button";
  later.className = "secondary";
  const restore = document.createElement("button");
  restore.type = "button";
  actions.append(later, restore);
  dialog.append(title, message, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  let previousFocus = null;
  let resolveChoice = null;
  const close = (choice = false) => { if (overlay.hidden) return; overlay.hidden = true; const resolve = resolveChoice; resolveChoice = null; if (previousFocus?.isConnected) previousFocus.focus(); resolve?.(choice); };
  const open = () => { previousFocus = document.activeElement; overlay.hidden = false; restore.focus(); return new Promise((resolve) => { resolveChoice = resolve; }); };
  const refresh = () => { title.textContent = t("project.restoreSessionTitle"); message.textContent = `${t("project.restoreSessionMessage")}\n${t("project.restoreSessionHelp")}`; later.textContent = t("project.restoreLater"); restore.textContent = t("project.restoreNow"); };
  later.addEventListener("click", () => close(false));
  restore.addEventListener("click", () => close(true));
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(false); return; } if (event.key !== "Tab") return; const focusable = [later, restore]; const index = focusable.indexOf(document.activeElement); const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length; event.preventDefault(); focusable[next].focus(); });
  refresh();
  return { open, close, refresh };
}
function createProjectControls() {
  const brand = document.querySelector(".brand");
  const statusHost = document.querySelector(".work-status");
  if (!brand || !statusHost || !el.fileStatus) return;
  const projectHeaderGroup = document.createElement("span");
  projectHeaderGroup.className = "project-header-group";
  brand.append(projectHeaderGroup);
  const historyToolbar = document.createElement("span");
  historyToolbar.className = "history-header-actions";
  const createHistoryButton = (id, icon, key, target) => {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "history-header-button secondary";
    button.textContent = icon;
    button.disabled = true;
    button.addEventListener("click", () => target.click());
    historyToolbar.append(button);
    return button;
  };
  el.undoTopBtn = createHistoryButton("undoTopBtn", "↶", "controls.undo", el.undoBtn);
  el.redoTopBtn = createHistoryButton("redoTopBtn", "↷", "controls.redo", el.redoBtn);
  refreshHistoryToolbar();
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
  projectHeaderGroup.append(historyToolbar, menu.root, menu.status);
  projectHeaderGroup.insertBefore(el.fileStatus, menu.status);
  statusHost.append(importFile);
  const importDialog = createProjectImportDialog(() => el.file.click());
  const deleteDialog = createProjectDeleteDialog();
  const recoveryDialog = createProjectRecoveryDialog();
  const warningDialog = createProjectWarningDialog();
  projectEl = { projectStatus: menu.status, setStatus: menu.setStatus, refresh: () => { menu.refresh(); importDialog.refresh(); deleteDialog.refresh(); recoveryDialog.refresh(); }, projectImportFile: importFile, importDialog, deleteDialog, recoveryDialog, warningDialog };
  menu.status.title = t("project.storageNotice");
  importFile.onchange = async () => { const file = importFile.files?.[0]; importFile.value = ""; if (!file) return; try { const project = await readProjectFile(file); if (project.page !== "app") throw new Error("This project belongs to another editor screen."); pendingMedia = []; cancelRecentSave(); recentAutoSaveSuspended = false; pendingProject = project; importDialog.open(); } catch (error) { updateProjectStatus("project.importFailed"); log(`${t("project.importFailed")} ${error.message}`); } };
}
function refreshHistoryToolbar() {
  for (const [button, key] of [[el.undoTopBtn, "controls.undo"], [el.redoTopBtn, "controls.redo"]]) {
    if (!button) continue;
    const label = t(key);
    button.title = label;
    button.setAttribute("aria-label", label);
  }
}
function outputPresetDimensions(resolution) {
  return resolution === "original" ? { width: state.meta?.width, height: state.meta?.height } : simpleDimensions(recommendationMeta(), resolution);
}
function cropValidationKey() {
  if (!el.cropEnable.checked) return null;
  const values = [el.cropX.value.trim(), el.cropY.value.trim(), el.cropW.value.trim(), el.cropH.value.trim()];
  if (values.some((value) => !value || !/^\d+$/.test(value))) return "crop.invalid";
  const [x, y, width, height] = values.map(Number);
  if (![x, y, width, height].every(Number.isSafeInteger) || width < 1 || height < 1) return "crop.invalid";
  if (state.meta && (x + width > state.meta.width || y + height > state.meta.height)) return "crop.outOfBounds";
  return null;
}
function refreshCropSourceResolution() {
  el.cropSourceResolution.textContent = state.meta ? t("crop.sourceResolution", { width: state.meta.width, height: state.meta.height }) : "";
}
function refreshCropError() {
  el.cropError.textContent = cropValidationKey() ? t(cropValidationKey()) : "";
}
function assertCropValid() {
  const key = cropValidationKey();
  refreshCropError();
  if (key) throw new Error(t(key));
}
function resetCropUi() {
  el.cropEnable.checked = false;
  [el.cropX, el.cropY, el.cropW, el.cropH].forEach((node) => { node.value = ""; });
  refreshCropError();
  refreshOutputSettingsCard();
}
const canvasDimensions = { "16:9": { width: 1920, height: 1080 }, "9:16": { width: 1080, height: 1920 }, "1:1": { width: 1080, height: 1080 } };
function canvasEnabled() { return Boolean(el.canvasEnable?.checked); }
function selectedCanvasDimensions() { return canvasDimensions[el.canvasAspectRatio?.value || "16:9"] || canvasDimensions["16:9"]; }
function validCanvasColor(value) { return /^#[0-9a-fA-F]{6}$/.test(value || ""); }
function syncCanvasControls() {
  if (!el.canvasEnable) return;
  const available = Boolean(state.file && state.meta && !state.running);
  el.canvasEnable.disabled = !available;
  [el.canvasAspectRatio, el.canvasFit, el.canvasBackgroundColor, el.canvasBackgroundHex].forEach((node) => { node.disabled = !available || !el.canvasEnable.checked; });
  el.canvasReset.disabled = !available;
}
function renderCanvasResolution() {
  if (el.canvasOutputResolution) {
    const dimensions = selectedCanvasDimensions();
    el.canvasOutputResolution.textContent = `${dimensions.width} × ${dimensions.height}`;
  }
}
function recommendationMeta() {
  if (!state.meta) return null;
  const crop = normalizedCrop(state.meta, { cropEnable: el.cropEnable.checked, cropX: el.cropX.value, cropY: el.cropY.value, cropW: el.cropW.value, cropH: el.cropH.value });
  const width = crop?.width ?? state.meta.width;
  const height = crop?.height ?? state.meta.height;
  const sourceRatio = state.meta.width / state.meta.height;
  const turned = sourceGeometry?.rotation === 90 || sourceGeometry?.rotation === 270;
  const parsedWidth = turned ? sourceGeometry?.height : sourceGeometry?.width;
  const parsedHeight = turned ? sourceGeometry?.width : sourceGeometry?.height;
  const geometryMatches = parsedWidth === state.meta.width && parsedHeight === state.meta.height;
  const displayFactor = geometryMatches && Number.isFinite(sourceGeometry?.dar) && sourceGeometry.dar > 0 ? sourceGeometry.dar / sourceRatio : 1;
  return { width, height, displayAspectRatio: width / height * displayFactor };
}
function defaultOutputFps(meta) {
  return Number.isFinite(Number(meta?.fps)) && Number(meta.fps) > 0 && Number(meta.fps) <= 240 ? Number(meta.fps) : 30;
}
function applyDefaultOutputSettings(meta) {
  state.outputFps = defaultOutputFps(meta);
  if (!el.videoKbps.value) el.videoKbps.value = String(simpleVideoBitrate(meta, "original", "balanced"));
}
function refreshOutputSettingsCard() {
  if (!simpleEl) return;
  const defaultBitrate = state.meta ? simpleVideoBitrate(state.meta, "original", "balanced") : null;
  if (!el.videoKbps.value && Number.isFinite(defaultBitrate)) el.videoKbps.value = String(defaultBitrate);
  const recommendation = recommendationMeta();
  const options = simpleResolutionOptions(recommendation);
  [...simpleEl.resolution.options].forEach((option) => { option.disabled = option.value !== "" && !options.includes(option.value); if (["480", "720", "1080"].includes(option.value)) { const dimensions = simpleDimensions(recommendation, option.value); option.textContent = dimensions ? `${option.value}p · ${dimensions.width} × ${dimensions.height}` : `${option.value}p`; } });
  const width = el.scaleEnable.checked ? Number(el.scaleW.value) : Number(state.meta?.width);
  const height = el.scaleEnable.checked ? Number(el.scaleH.value) : Number(state.meta?.height);
  const matchedResolution = (el.scaleEnable.checked ? options.filter((value) => value !== "original") : ["original"]).find((value) => { const dimensions = outputPresetDimensions(value); return dimensions && dimensions.width === width && dimensions.height === height; }) || "";
  simpleEl.resolution.value = matchedResolution;
  simpleEl.customWidth.value = width || "";
  simpleEl.customHeight.value = height || "";
  const outputFps = state.outputFps ?? state.recipeNormalized?.output_fps;
  simpleEl.fps.value = outputFps ? String(outputFps) : "";
  simpleEl.customFps.value = outputFps ? String(outputFps) : "";
  const resolution = matchedResolution || "original";
  const bitrate = Number(el.videoKbps.value);
  const matchedQuality = ["smaller", "balanced", "high"].find((quality) => simpleVideoBitrate(recommendation, resolution, quality) === bitrate) || "";
  simpleExport.resolution = matchedResolution || null;
  simpleExport.quality = matchedQuality || null;
  simpleEl.quality.value = matchedQuality;
  simpleEl.customQuality.value = matchedQuality;
  const hasDimensions = state.meta && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const actualDimensions = hasDimensions ? outputDimensions(state.meta, { cropEnable: el.cropEnable.checked, cropX: el.cropX.value, cropY: el.cropY.value, cropW: el.cropW.value, cropH: el.cropH.value, scaleEnable: el.scaleEnable.checked, scaleW: el.scaleW.value, scaleH: el.scaleH.value, scaleKeepAspect: el.scaleKeepAspect.checked, transformRotation: el.transformRotation.value, canvasEnabled: canvasEnabled(), canvasAspectRatio: el.canvasAspectRatio?.value }) : null;
  const fpsText = Number.isFinite(Number(outputFps)) && Number(outputFps) > 0 ? `${Number(outputFps)} ${t("merge.fpsPreset")}` : t("values.none");
  const qualityText = matchedQuality ? t(`simple.${matchedQuality === "balanced" ? "standard" : matchedQuality}`) : t("values.none");
  simpleEl.summaryLine.textContent = actualDimensions ? `${t("simple.expectedSize")}: ${actualDimensions.width} × ${actualDimensions.height} · ${fpsText} · ${qualityText}` : t("simple.chooseSource");
  const preferred = options.find((value) => value !== "original");
  const preferredSize = preferred ? outputPresetDimensions(preferred) : null;
  simpleEl.recommendation.textContent = preferredSize ? t("simple.recommended", { tier: preferred, width: preferredSize.width, height: preferredSize.height }) : t("simple.noRecommendation");
  simpleEl.sizeNote.textContent = t(el.scaleKeepAspect.checked ? "simple.fitSize" : "simple.fixedSize");
  simpleEl.filename.textContent = state.file?.name ? buildOutputFilename(state.file.name, "mp4") : "edited.mp4";
  renderCanvasResolution();
  simpleEl.resolution.disabled = !state.meta;
  simpleEl.quality.disabled = !state.meta;
  simpleEl.customWidth.disabled = !state.meta;
  simpleEl.customHeight.disabled = !state.meta;
}
function createOutputSettingsCard() {
  if (simpleEl) return;
  const actionCard = document.querySelector(".action-card");
  if (!actionCard) return;
  const section = document.createElement("section");
  section.className = "card action-card output-settings-card";
  section.setAttribute("aria-labelledby", "output-settings-title");
  section.innerHTML = `<div class="section-heading compact-heading"><div><p class="section-kicker">02</p><h2 id="output-settings-title" data-i18n="controls.output"></h2></div></div><div class="output-settings-tabs" role="tablist" aria-label="Output settings"><button id="outputSettingsStandardTab" class="secondary" type="button" role="tab" aria-selected="true" aria-controls="outputSettingsStandardPanel" data-i18n="merge.standardPresets"></button><button id="outputSettingsCustomTab" class="secondary" type="button" role="tab" aria-selected="false" aria-controls="outputSettingsCustomPanel" data-i18n="merge.customSettings"></button><span class="output-settings-summary" aria-live="polite"><span id="outputSettingsSummaryLine"></span></span></div><div id="outputSettingsStandardPanel" class="output-settings-panel" role="tabpanel" aria-labelledby="outputSettingsStandardTab"><div class="input-grid output-settings-standard-grid"><label><span data-i18n="simple.resolution"></span><select id="outputSettingsResolution"><option value="" data-i18n="simple.selectResolution"></option><option value="original" data-i18n="simple.original"></option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></label><label><span data-i18n="simple.quality"></span><select id="outputSettingsQuality"><option value="" data-i18n="simple.selectQuality"></option><option value="smaller" data-i18n="simple.smaller"></option><option value="balanced" data-i18n="simple.standard"></option><option value="high" data-i18n="simple.high"></option></select></label><label><span data-i18n="merge.fpsPreset"></span><select id="outputSettingsFps"><option value="" data-i18n="merge.selectFps"></option><option value="24">24</option><option value="25">25</option><option value="30">30</option><option value="60">60</option></select></label></div></div><div id="outputSettingsCustomPanel" class="output-settings-panel" role="tabpanel" aria-labelledby="outputSettingsCustomTab" hidden><div class="input-grid output-settings-custom-grid"><label><span data-i18n="controls.width"></span><input id="outputSettingsWidth" type="number" min="1" step="1" data-i18n-placeholder="controls.width"></label><label><span data-i18n="controls.height"></span><input id="outputSettingsHeight" type="number" min="1" step="1" data-i18n-placeholder="controls.height"></label><label><span data-i18n="simple.quality"></span><select id="outputSettingsCustomQuality"><option value="" data-i18n="simple.selectQuality"></option><option value="smaller" data-i18n="simple.smaller"></option><option value="balanced" data-i18n="simple.standard"></option><option value="high" data-i18n="simple.high"></option></select></label><label><span data-i18n="merge.fpsPreset"></span><select id="outputSettingsCustomFps"><option value="" data-i18n="merge.selectFps"></option><option value="24">24</option><option value="25">25</option><option value="30">30</option><option value="60">60</option></select></label></div></div>`;
  const formatNote = document.createElement("p");
  formatNote.className = "field-help output-settings-format";
  const recommendation = document.createElement("p");
  recommendation.className = "field-help";
  const sizeNote = document.createElement("p");
  sizeNote.className = "field-help";
  const codec = document.createElement("span");
  codec.dataset.i18n = "merge.format";
  const filenameLabel = document.createElement("span");
  filenameLabel.dataset.i18n = "merge.filename";
  const filename = document.createElement("strong");
  formatNote.append(codec, document.createTextNode(" · "), filenameLabel, document.createTextNode(": "), filename);
  section.append(recommendation, sizeNote, formatNote);
  actionCard.parentElement.insertBefore(section, actionCard);
  applyTranslations(section);
  simpleEl = { resolution: section.querySelector("#outputSettingsResolution"), quality: section.querySelector("#outputSettingsQuality"), customQuality: section.querySelector("#outputSettingsCustomQuality"), fps: section.querySelector("#outputSettingsFps"), customFps: section.querySelector("#outputSettingsCustomFps"), customWidth: section.querySelector("#outputSettingsWidth"), customHeight: section.querySelector("#outputSettingsHeight"), standardTab: section.querySelector("#outputSettingsStandardTab"), customTab: section.querySelector("#outputSettingsCustomTab"), standardPanel: section.querySelector("#outputSettingsStandardPanel"), customPanel: section.querySelector("#outputSettingsCustomPanel"), summaryLine: section.querySelector("#outputSettingsSummaryLine"), recommendation, sizeNote, filename };
  const setTab = (tab) => { const standard = tab === "standard"; simpleEl.standardTab.setAttribute("aria-selected", String(standard)); simpleEl.customTab.setAttribute("aria-selected", String(!standard)); simpleEl.standardPanel.hidden = !standard; simpleEl.customPanel.hidden = standard; };
  simpleEl.standardTab.addEventListener("click", () => setTab("standard"));
  simpleEl.customTab.addEventListener("click", () => setTab("custom"));
  simpleEl.resolution.addEventListener("change", () => { const value = simpleEl.resolution.value; simpleExport.resolution = value || null; simpleExport.mode = "advanced"; const dimensions = outputPresetDimensions(value || "original"); if (dimensions) { el.scaleEnable.checked = value !== "original"; el.scaleW.value = value === "original" ? "" : String(dimensions.width); el.scaleH.value = value === "original" ? "" : String(dimensions.height); el.scaleKeepAspect.checked = true; } void recordRecipeEdit().then(scheduleProjectSave); refreshOutputSettingsCard(); });
  simpleEl.quality.addEventListener("change", () => { const value = simpleEl.quality.value; simpleExport.quality = value || null; simpleExport.mode = "advanced"; const resolution = simpleExport.resolution || "original"; const bitrate = value ? simpleVideoBitrate(recommendationMeta(), resolution, value) : null; el.videoKbps.value = bitrate ? String(bitrate) : ""; void recordRecipeEdit().then(scheduleProjectSave); refreshOutputSettingsCard(); });
  simpleEl.customQuality.addEventListener("change", () => { simpleEl.quality.value = simpleEl.customQuality.value; simpleEl.quality.dispatchEvent(new Event("change")); });
  simpleEl.fps.addEventListener("change", () => { state.outputFps = simpleEl.fps.value ? Number(simpleEl.fps.value) : null; simpleEl.customFps.value = simpleEl.fps.value; void recordRecipeEdit(); scheduleProjectSave(); refreshOutputSettingsCard(); });
  simpleEl.customFps.addEventListener("change", () => { simpleEl.fps.value = simpleEl.customFps.value; simpleEl.fps.dispatchEvent(new Event("change")); });
  [simpleEl.customWidth, simpleEl.customHeight].forEach((node) => node.addEventListener("change", () => { if (node.value === "") return; el.scaleEnable.checked = true; el.scaleKeepAspect.checked = true; el.scaleW.value = simpleEl.customWidth.value; el.scaleH.value = simpleEl.customHeight.value; captureAdvancedField(node === simpleEl.customWidth ? el.scaleW : el.scaleH); simpleExport.mode = "advanced"; void recordRecipeEdit().then(scheduleProjectSave); refreshOutputSettingsCard(); }));
  refreshOutputSettingsCard();
}
setTimeout(createOutputSettingsCard, 0);
function captureAdvancedExport() {
  advancedExport = { scaleEnable: el.scaleEnable.checked, scaleW: el.scaleW.value, scaleH: el.scaleH.value, scaleKeepAspect: el.scaleKeepAspect.checked, videoKbps: el.videoKbps.value };
}
function captureAdvancedField(node) {
  if (!advancedExport) captureAdvancedExport();
  if (node === el.scaleEnable) advancedExport.scaleEnable = el.scaleEnable.checked;
  if (node === el.scaleW) advancedExport.scaleW = el.scaleW.value;
  if (node === el.scaleH) advancedExport.scaleH = el.scaleH.value;
  if (node === el.videoKbps) advancedExport.videoKbps = el.videoKbps.value;
}
[el.scaleEnable, el.scaleW, el.scaleH, el.videoKbps].forEach((node) => node?.addEventListener("change", () => { captureAdvancedField(node); simpleExport.mode = "advanced"; fitSourcePreview(); syncTimeline(); void recordRecipeEdit().then(scheduleProjectSave); refreshOutputSettingsCard(); }));
[el.cropEnable, el.cropX, el.cropY, el.cropW, el.cropH].forEach((node) => {
  node.addEventListener("input", refreshCropError);
  node.addEventListener("change", () => { refreshCropError(); if (!el.cropError.textContent) { fitSourcePreview(); syncTimeline(); void recordRecipeEdit().then(scheduleProjectSave); } refreshOutputSettingsCard(); });
});
[el.scaleKeepAspect].forEach((node) => node.addEventListener("change", () => { fitSourcePreview(); syncTimeline(); void recordRecipeEdit().then(scheduleProjectSave); refreshOutputSettingsCard(); }));
function applySimpleExport() {
  if (!state.meta || simpleExport.mode !== "simple") return;
  if (!simpleExportReady(recommendationMeta(), simpleExport)) return;
  const dimensions = simpleDimensions(recommendationMeta(), simpleExport.resolution);
  const bitrate = simpleVideoBitrate(recommendationMeta(), simpleExport.resolution, simpleExport.quality);
  if (!dimensions || !bitrate) return;
  if (simpleExport.resolution === "original") {
    el.scaleEnable.checked = false;
    [el.scaleW, el.scaleH].forEach((node) => { node.value = ""; });
  } else {
    el.scaleEnable.checked = true;
    el.scaleW.value = String(dimensions.width);
    el.scaleH.value = String(dimensions.height);
    el.scaleKeepAspect.checked = true;
  }
  el.videoKbps.value = String(bitrate);
}
function updateProjectStatus(key) { if (projectEl?.setStatus) projectEl.setStatus(key); else if (projectEl?.projectStatus) projectEl.projectStatus.textContent = t(key); }
function cancelRecentSave() { clearTimeout(recentSaveTimer); recentSaveTimer = null; recentSaveToken += 1; }
function projectSaveStatus(error) { return error?.name === "QuotaExceededError" ? "project.storageFull" : "project.failed"; }
function beginProjectRestore(bundle) {
  const project = validateProject(bundle.project);
  cancelRecentSave();
  recentAutoSaveSuspended = false;
  pendingProject = project;
  pendingMedia = Array.isArray(bundle.media) ? bundle.media : [];
  const source = project.state?.media?.find((item) => item.role === "source") || project.media?.find((item) => item.role === "source");
  const file = fileFromMedia(pendingMedia.find((record) => record.id === source?.media_id));
  const mediaAvailable = project.media?.every((item) => item.media_id && pendingMedia.some((record) => record.id === item.media_id));
  projectEl.setStatus(mediaAvailable ? "project.saving" : "project.mediaUnavailable");
  if (file) el.file.onchange({ fileOverride: file });
  else el.file.click();
}
el.languageSelect.addEventListener("change", () => projectEl?.refresh());
el.clear.addEventListener("click", () => { state.projectDirty = false; });
el.file.addEventListener("change", () => { if (!pendingProject) state.recentProjectCreatedAt = null; });
function currentProject() {
  if (!state.recipeNormalized || !state.meta || !state.file) return null;
  state.sourceMediaId ||= mediaId();
  for (const item of state.imageOverlays) item.media_id ||= mediaId();
  for (const track of state.audioMix?.tracks || []) track.media_id ||= mediaId();
  const source = fileDescriptor(state.file, { role: "source", media_id: state.sourceMediaId, duration_ms: state.meta.duration_ms, width: state.meta.width, height: state.meta.height });
  const imageIds = new Set(state.imageOverlays.map((item) => item.media_id).filter(Boolean));
  const audioIds = new Set((state.audioMix?.tracks || []).map((track) => track.media_id).filter(Boolean));
  const mediaMap = new Map((state.projectMedia || []).filter((item) => item.media_id === state.sourceMediaId || imageIds.has(item.media_id) || audioIds.has(item.media_id)).map((item) => [item.media_id, item]));
  mediaMap.set(source.media_id, source);
  for (const item of state.imageOverlays) { const asset = state.imageFiles.get(item.file_ref); if (asset?.file) mediaMap.set(item.media_id, fileDescriptor(asset.file, { role: "image", media_id: item.media_id, file_ref: item.file_ref })); }
  for (const track of state.audioMix?.tracks || []) { const file = state.musicFiles.get(track.source_id); if (file) mediaMap.set(track.media_id, fileDescriptor(file, { role: "audio", media_id: track.media_id, source_id: track.source_id })); }
  const media = Array.from(mediaMap.values());
  const recipe = cloneRecipe(serializeRecipe(state.recipeNormalized));
  recipe.image_overlays = (recipe.image_overlays || []).map((item) => ({ ...item, media_id: state.imageOverlays.find((entry) => entry.id === item.id)?.media_id || item.media_id }));
  if (recipe.audio_mix?.tracks) recipe.audio_mix.tracks = recipe.audio_mix.tracks.map((track) => ({ ...track, media_id: state.audioMix?.tracks?.find((entry) => entry.source_id === track.source_id)?.media_id || track.media_id }));
  return { schemaVersion: 1, id: state.projectId || undefined, page: "app", name: state.projectName || state.file.name.replace(/\.[^.]+$/, ""), createdAt: state.projectCreatedAt || new Date().toISOString(), updatedAt: new Date().toISOString(), state: { recipe, meta: cloneRecipe(state.meta), media, simple_export: { ...simpleExport }, advanced_export: advancedExport ? { ...advancedExport } : null }, media };
}
function currentMediaRecords(projectId) {
  const records = [];
  if (state.file && state.sourceMediaId) records.push(mediaRecord(state.file, { id: state.sourceMediaId, projectId, role: "source", duration_ms: state.meta?.duration_ms, width: state.meta?.width, height: state.meta?.height }));
  for (const item of state.imageOverlays) { const asset = state.imageFiles.get(item.file_ref); if (asset?.file && item.media_id) records.push(mediaRecord(asset.file, { id: item.media_id, projectId, role: "image", file_ref: item.file_ref })); }
  for (const track of state.audioMix?.tracks || []) { const file = state.musicFiles.get(track.source_id); if (file && track.media_id) records.push(mediaRecord(file, { id: track.media_id, projectId, role: "audio", source_id: track.source_id })); }
  return records;
}
async function saveCurrentProject(manual = false) {
  const draft = currentProject();
  if (!draft) return;
  if (manual) recentAutoSaveSuspended = false;
  if (manual && !state.projectName) state.projectName = window.prompt(t("project.name"), draft.name) || draft.name;
  if (!state.projectId) state.projectId = crypto.randomUUID();
  draft.id = state.projectId;
  draft.name = state.projectName || draft.name;
  draft.createdAt = state.projectCreatedAt || draft.createdAt;
  state.projectCreatedAt = draft.createdAt;
  const saveToken = recentSaveToken;
  updateProjectStatus("project.saving");
  try { await saveProjectWithMedia(draft, currentMediaRecords(draft.id)); if (saveToken === recentSaveToken) { state.projectDirty = false; updateProjectStatus("project.saved"); } } catch (error) { if (saveToken === recentSaveToken) updateProjectStatus(projectSaveStatus(error)); log(error.message); }
}
function recentProject() { const project = currentProject(); if (!project) return null; state.recentProjectCreatedAt ||= project.createdAt; project.id = recentProjectId("app"); project.projectType = "recent"; project.name = "Recent Work"; project.createdAt = state.recentProjectCreatedAt; return project; }
async function saveRecentWork(token) { if (recentAutoSaveSuspended) return false; const project = recentProject(); if (!project) return false; updateProjectStatus("project.saving"); try { await saveRecentProject(project, currentMediaRecords(project.id)); if (token === recentSaveToken && !recentAutoSaveSuspended) { state.projectDirty = false; updateProjectStatus("project.saved"); } return true; } catch (error) { if (token === recentSaveToken && !recentAutoSaveSuspended) updateProjectStatus(projectSaveStatus(error)); log(error.message); return false; } }
function scheduleProjectSave() { if (recentAutoSaveSuspended || !state.file || !state.meta || !state.recipeNormalized) return; state.projectDirty = true; updateProjectStatus("project.unsaved"); const token = ++recentSaveToken; clearTimeout(recentSaveTimer); recentSaveTimer = setTimeout(() => void saveRecentWork(token), 2000); }
function checkpointRecentWork() { if (!state.projectDirty || recentAutoSaveSuspended) return; clearTimeout(recentSaveTimer); void saveRecentWork(++recentSaveToken); }
recentCheckpointTimer = setInterval(checkpointRecentWork, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") checkpointRecentWork(); });
async function chooseRecentProject() { try { const bundle = await getRecentProjectWithMedia("app"); if (!bundle) { log(t("project.recentNone")); return; } if (state.projectDirty && !window.confirm(t("project.recentConfirm"))) return; beginProjectRestore(bundle); } catch (error) { log(error.message); } }
async function chooseSavedProject() {
  try { const projects = await listProjects("app"); if (!projects.length) { log(t("project.none")); return; } const choice = window.prompt(`${projects.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}\n${t("project.choose")}`, "1"); const project = projects[Number(choice) - 1]; if (!project) return; const bundle = await getProjectWithMedia(project.id); if (bundle) beginProjectRestore(bundle); } catch (error) { log(error.message); }
}
async function removeCurrentProject() {
  const ids = [state.projectId].filter(Boolean);
  if (!ids.length || !projectEl?.deleteDialog || !await projectEl.deleteDialog.open()) return;
  cancelRecentSave();
  try {
    const deleted = (await Promise.all(ids.map((id) => deleteProject(id)))).some(Boolean);
    if (!deleted) { log(t("project.none")); return; }
    state.projectId = null;
    state.projectName = "";
    updateProjectStatus("project.unsaved");
    const recoveryToken = ++recentSaveToken;
    const recoverySaved = await saveRecentWork(recoveryToken);
    if (recoverySaved) await projectEl.deleteDialog.showResult("project.deleteSuccess");
    else log(t("project.deleteRecoveryFailed"));
  } catch (error) {
    log(error.message);
  }
}
async function exportCurrentProject() { const project = currentProject(); if (!project) return; try { project.id = state.projectId || crypto.randomUUID(); downloadProject(project); } catch (error) { log(error.message); } }
function cloneRecipe(value) { return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; }
function recipeKey(value) { return value && typeof value === "object" ? JSON.stringify(value) : ""; }
let recentObservedRecipe = "";
let pendingProjectWarning = null;
function discardPendingProject() {
  pendingProject = null;
  pendingMedia = [];
  pendingProjectWarning = null;
  recentAutoSaveSuspended = false;
  projectEl?.importDialog.close();
}
function reselectPendingProject() {
  projectEl?.importDialog.close();
  el.file.click();
}
function showSourceMismatchWarning() {
  projectEl?.warningDialog.open("project.sourceMismatchTitle", "project.sourceMismatchMessage", { onConfirm: discardPendingProject, onReselect: reselectPendingProject });
}
async function reconcilePendingProject() {
  if (!pendingProject || pendingProjectWarning === pendingProject || state.isRestoring || !state.file || !state.meta || !state.recipeNormalized) return;
  if (!projectSourcesMatch(pendingProject, [state.file])) {
    pendingProjectWarning = pendingProject;
    showSourceMismatchWarning();
    return;
  }
  pendingProjectWarning = null;
  await restorePendingProject();
}
setInterval(() => { const key = recipeKey(state.recipeNormalized); if (!state.isRestoring && !pendingProject && key && key !== recentObservedRecipe) { recentObservedRecipe = key; scheduleProjectSave(); } }, 250);
setInterval(() => { void reconcilePendingProject(); }, 250);
function setStatus(status, messageKey, values = {}, progress = null) { state.status = status; state.statusMessageKey = messageKey; state.statusMessageValues = values; state.statusProgress = progress; const label = t(`status.${status.toLowerCase()}`); const message = t(messageKey, values); el.statusBadge.textContent = label; el.statusBadge.className = `status-badge status-${status.toLowerCase()}`; el.statusTitle.textContent = label; el.statusMessage.textContent = message; if (progress === null) { el.progressBar.removeAttribute("value"); el.progressText.textContent = status === "Processing" ? t("messages.processing") : message; } else { el.progressBar.value = Math.max(0, Math.min(100, progress)); el.progressText.textContent = t("status.progress", { value: Math.round(progress) }); } }
function setControlsEnabled(enabled) { controlIds.forEach((id) => { if (el[id]) el[id].disabled = !enabled || state.running; }); el.file.disabled = state.running; el.cancel.disabled = !state.running; el.clear.disabled = false; timeline?.setInteractive(enabled && !state.running); renderTexts(); el.textAdd.disabled = !enabled || state.running || state.textOverlays.length >= 20; renderMusicUi(); renderImageUi(); renderMotionUi("text"); renderMotionUi("image"); renderTransitionUi(); renderSubtitles(); renderAudioKeyframes(); syncCanvasControls(); refreshCropSourceResolution(); refreshCropError(); updateUndoRedoUi(); }
function clearOutputs() { if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; } [el.outVideo, el.outAudio].forEach((node) => { node.removeAttribute("src"); node.load(); }); el.outImage.removeAttribute("src"); [el.outputVideoPanel, el.outputAudioPanel, el.outputImagePanel, el.downloadPanel, el.outputEmpty].forEach((node) => { node.hidden = true; }); el.outputSection.hidden = true; el.outputFileName.textContent = t("output.file"); el.outputFileSize.textContent = "—"; el.download.href = "#"; el.download.removeAttribute("download"); }
function formatBytes(value) { if (!Number.isFinite(value) || value < 1) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatDuration(ms) { const total = Math.floor(ms / 1000); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; }
function updateFileMeta() { el.fileNameDisplay.textContent = state.file?.name || t("source.noFile"); if (!state.file || !state.meta) { el.fileMeta.hidden = true; el.metaName.textContent = "—"; el.metaType.textContent = "—"; el.metaSize.textContent = "—"; el.metaResolution.textContent = "—"; el.metaDuration.textContent = "—"; el.fileStatus.textContent = t("source.noFile"); el.sourceNote.textContent = t("source.choose"); return; } el.fileMeta.hidden = false; el.metaName.textContent = state.file.name; el.metaType.textContent = state.file.type || t("values.unknown"); el.metaSize.textContent = formatBytes(state.file.size); const turned = sourceGeometry?.rotation === 90 || sourceGeometry?.rotation === 270; const width = turned && sourceGeometry.width && sourceGeometry.height ? sourceGeometry.height : state.meta.width; const height = turned && sourceGeometry.width && sourceGeometry.height ? sourceGeometry.width : state.meta.height; const ratio = Number.isFinite(sourceGeometry?.dar) && sourceGeometry.dar > 0 ? sourceGeometry.dar : width / height; const direction = ratio < 1 ? "source.portrait" : ratio > 1 ? "source.landscape" : "source.square"; el.metaResolution.textContent = `${width} × ${height} · ${t(direction)}`; el.metaDuration.textContent = formatDuration(state.meta.duration_ms); el.fileStatus.textContent = state.file.name; el.sourceNote.textContent = t("messages.loadedLocally"); }
function fitSourcePreview() {
  const host = el.previewStage.parentElement;
  const useCanvas = canvasEnabled() && Boolean(state.meta);
  el.previewControls.hidden = !useCanvas;
  el.inputPreview.controls = !useCanvas;
  host.classList.toggle("canvas-preview-active", useCanvas);
  const width = host.clientWidth;
  const controlsHeight = useCanvas ? el.previewControls.offsetHeight + 12 : 0;
  const height = host.clientHeight - controlsHeight;
  el.previewStage.style.setProperty("--preview-controls-height", `${controlsHeight}px`);
  if (useCanvas && width && height) {
    const geometry = previewCanvasGeometry(state.meta, {
      canvasEnabled: true,
      canvasAspectRatio: el.canvasAspectRatio.value,
      cropEnable: el.cropEnable.checked,
      cropX: el.cropX.value,
      cropY: el.cropY.value,
      cropW: el.cropW.value,
      cropH: el.cropH.value,
      scaleEnable: el.scaleEnable.checked,
      scaleW: el.scaleW.value,
      scaleH: el.scaleH.value,
      scaleKeepAspect: el.scaleKeepAspect.checked,
      transformRotation: el.transformRotation.value,
    }, width, height);
    const properties = {
      "--preview-width": geometry.stageWidth,
      "--preview-height": geometry.stageHeight,
      "--preview-content-width": geometry.viewportWidth,
      "--preview-content-height": geometry.viewportHeight,
      "--preview-source-width": geometry.sourceWidth,
      "--preview-source-height": geometry.sourceHeight,
      "--preview-source-left": geometry.sourceLeft,
      "--preview-source-top": geometry.sourceTop,
    };
    for (const [name, value] of Object.entries(properties)) el.previewStage.style.setProperty(name, `${value}px`);
    return;
  }
  const sourceWidth = el.inputPreview.videoWidth || state.meta?.width;
  const sourceHeight = el.inputPreview.videoHeight || state.meta?.height;
  if (!width || !height || !sourceWidth || !sourceHeight) return;
  const turned = el.transformRotation.value === "90" || el.transformRotation.value === "270";
  const aspect = sourceWidth / sourceHeight;
  const stageAspect = turned ? 1 / aspect : aspect;
  const fittedWidth = Math.min(width, height * stageAspect);
  const fittedHeight = Math.min(height, width / stageAspect);
  el.previewStage.style.setProperty("--preview-width", `${fittedWidth}px`);
  el.previewStage.style.setProperty("--preview-height", `${fittedHeight}px`);
}
function renderTransformPreview() {
  el.previewStage.className = `preview-stage rotation-${el.transformRotation.value}`;
  el.previewStage.classList.toggle("flip-horizontal", el.transformFlipHorizontal.checked);
  el.previewStage.classList.toggle("flip-vertical", el.transformFlipVertical.checked);
  el.previewStage.classList.toggle("canvas-enabled", canvasEnabled());
  el.previewStage.style.setProperty("--preview-canvas-bg", canvasEnabled() ? el.canvasBackgroundColor.value : "transparent");
  fitSourcePreview();
  renderCanvasResolution();
  refreshOutputSettingsCard();
}
function applyTransformToUi(value) {
  el.transformRotation.value = String(value?.rotation ?? 0);
  el.transformFlipHorizontal.checked = Boolean(value?.flip_horizontal);
  el.transformFlipVertical.checked = Boolean(value?.flip_vertical);
  renderTransformPreview();
}
function applyCanvasToUi(value) {
  const source = value || {};
  el.canvasEnable.checked = Boolean(source.enabled);
  el.canvasAspectRatio.value = source.aspect_ratio || "16:9";
  el.canvasFit.value = source.fit || "contain";
  const color = validCanvasColor(source.background_color) ? source.background_color.toUpperCase() : "#000000";
  el.canvasBackgroundColor.value = color;
  el.canvasBackgroundHex.value = color;
  syncCanvasControls();
  renderTransformPreview();
}
function setSourcePreview(showVideo) { el.inputEmpty.hidden = showVideo; el.previewStage.hidden = !showVideo; el.inputPreview.hidden = !showVideo; if (showVideo) fitSourcePreview(); else el.previewControls.hidden = true; }

function clearRecipeUi() { ["trimStart","trimEnd","segStart","segEnd","cropX","cropY","cropW","cropH","scaleW","scaleH","videoKbps","audioKbps","frameAt"].forEach((id) => { el[id].value = ""; }); el.cropEnable.checked = false; el.scaleEnable.checked = false; el.scaleKeepAspect.checked = true; el.frameEnable.checked = false; el.audioMode.value = "keep"; el.audioFormat.value = "mp3"; el.container.value = "mp4"; el.speedCustom.value = "1.00"; el.speedQuick.value = "1"; el.speedCurrent.textContent = "1.00x"; el.inputPreview.playbackRate = 1; applyTransformToUi(null); applyCanvasToUi(null); refreshCropSourceResolution(); refreshCropError(); resetFadeUi(); resetColorUi(); colorRenderer.destroy(); colorPreviewFailure = null; el.colorPreviewWarning.hidden = true; el.loopTrim.checked = false; state.loopTrim = false; state.removeSegments = []; state.textOverlays = []; state.subtitles = { cues: [], style: { ...defaultSubtitleStyle } }; state.selectedSubtitleId = null; subtitleInputInvalid = false; state.audioKeyframes = defaultAudioKeyframes(); state.selectedKeyframeIds = { original: null, background_music: null }; keyframeInputInvalid = false; renderAudioKeyframes(); renderSubtitles(); resetImageState(); resetTransitionUi(); resetMusic(); state.selectedText = -1; state.selectedMotionIds = { text: null, image: null }; state.motionInputInvalid = { text: false, image: false }; renderTexts(); renderMotionUi("image"); state.selectedSegment = -1; timeline.clearSelection(); renderSegments(); }
function clearSource() { runToken += 1; state.recipeEditToken += 1; if (state.running) { state.cancelRequested = true; cancelFfmpeg(); state.running = false; } thumbnailRenderer?.clear(); transitionRenderer.destroy(); if (inputBlobUrl) { URL.revokeObjectURL(inputBlobUrl); inputBlobUrl = null; } el.inputPreview.pause(); el.inputPreview.removeAttribute("src"); el.inputPreview.load(); setSourcePreview(false); el.file.value = ""; state.file = null; state.meta = null; sourceFpsKnown = false; sourceGeometry = null; state.selectedSegment = -1; timeline.setZoom(1, false); timeline.resetScroll(); updateFileMeta(); renderSegments(); setControlsEnabled(false); refreshOutputSettingsCard(); }
function resetSimpleExportState() { simpleExport = { resolution: null, quality: null, mode: "advanced" }; advancedExport = null; state.outputFps = null; }
el.file.addEventListener("change", () => { if (!pendingProject) resetSimpleExportState(); });
function applyRecipeToUi(recipe) { if (!recipe) return; if (recipe.trim) { el.trimStart.value = recipe.trim.start_ms ?? ""; el.trimEnd.value = recipe.trim.end_ms ?? ""; } if (Array.isArray(recipe.remove_segments)) { state.removeSegments = recipe.remove_segments.slice(); renderSegments(); } state.videoTransitions = Array.isArray(recipe.video_transitions) ? recipe.video_transitions.map((item) => ({ ...item })) : []; state.selectedTransitionId = recipe.selected_transition_id || null; state.transitionInputInvalid = false; transitionInputEditing = false; transitionUiSignature = ""; transitionTimelineSignature = ""; if (Array.isArray(recipe.text_overlays)) { state.textOverlays = recipe.text_overlays.map((item) => cloneRecipe(item)); for (const item of state.textOverlays) for (const point of item.motion?.keyframes || []) state.motionCounter = Math.max(state.motionCounter, Number(point.id.slice(3)) || 0); state.selectedText = Math.min(state.selectedText, state.textOverlays.length - 1); renderTexts(); } state.subtitles = { cues: (recipe.subtitles?.cues || []).map((cue) => ({ ...cue })), style: { ...defaultSubtitleStyle, ...(recipe.subtitles?.style || {}) } }; state.selectedSubtitleId = state.subtitles.cues.some((cue) => cue.id === state.selectedSubtitleId) ? state.selectedSubtitleId : state.subtitles.cues[0]?.id || null; for (const cue of state.subtitles.cues) state.subtitleCounter = Math.max(state.subtitleCounter, Number(cue.id.slice(9)) || 0); subtitleInputInvalid = false; renderSubtitles(); state.audioKeyframes = recipe.audio_keyframes ? cloneRecipe(recipe.audio_keyframes) : defaultAudioKeyframes(); for (const name of audioKeyframeTracks) { state.audioKeyframes[name] = { enabled: false, keyframes: [], ...(state.audioKeyframes[name] || {}) }; for (const point of state.audioKeyframes[name].keyframes) state.keyframeCounters[name] = Math.max(state.keyframeCounters[name], Number(point.id.split("-").pop()) || 0); if (!state.audioKeyframes[name].keyframes.some((point) => point.id === state.selectedKeyframeIds[name])) state.selectedKeyframeIds[name] = state.audioKeyframes[name].keyframes[0]?.id || null; } keyframeInputInvalid = false; renderAudioKeyframes(); state.audioMix = recipe.audio_mix ? cloneRecipe(recipe.audio_mix) : null; renderMusicUi(); if (recipe.container) el.container.value = recipe.container; setSpeedUi(recipe.playback_speed ?? 1); applyTransformToUi(recipe.transform); applyCanvasToUi(recipe.canvas); applyFadeToUi(recipe.video_fade); applyColorToUi(recipe.color_adjustment); if (recipe.audio) { el.audioMode.value = recipe.audio.mode || "keep"; if (recipe.audio.extract_format) el.audioFormat.value = recipe.audio.extract_format; } syncMusicPreview(); if (recipe.crop !== undefined) { el.cropEnable.checked = Boolean(recipe.crop); if (recipe.crop) { el.cropX.value = recipe.crop.x ?? ""; el.cropY.value = recipe.crop.y ?? ""; el.cropW.value = recipe.crop.w ?? ""; el.cropH.value = recipe.crop.h ?? ""; } else [el.cropX,el.cropY,el.cropW,el.cropH].forEach((node) => { node.value = ""; }); } if (recipe.scale !== undefined) { el.scaleEnable.checked = Boolean(recipe.scale); if (recipe.scale) { el.scaleW.value = recipe.scale.width ?? ""; el.scaleH.value = recipe.scale.height ?? ""; el.scaleKeepAspect.checked = recipe.scale.keep_aspect ?? true; } } if (recipe.bitrate !== undefined) { el.videoKbps.value = recipe.bitrate?.video_kbps ?? ""; el.audioKbps.value = recipe.bitrate?.audio_kbps ?? ""; } if (recipe.frame_capture !== undefined) { el.frameEnable.checked = Boolean(recipe.frame_capture); el.frameAt.value = recipe.frame_capture?.at_ms ?? ""; } state.imageOverlays = Array.isArray(recipe.image_overlays) ? recipe.image_overlays.map((item) => cloneRecipe(item)) : []; for (const item of state.imageOverlays) for (const point of item.motion?.keyframes || []) state.motionCounter = Math.max(state.motionCounter, Number(point.id.slice(3)) || 0); state.selectedImageId = state.imageOverlays.some((item) => item.id === recipe.selected_image_id) ? recipe.selected_image_id : (state.imageOverlays[0]?.id || null); for (const item of state.imageOverlays) state.imageCounter = Math.max(state.imageCounter, Number(item.id.slice(6)) || 0, Number(item.file_ref.slice(14)) || 0); renderImageUi(); renderImageTimeline(); renderImagePreview(); renderMotionUi("text"); renderMotionUi("image"); renderTransitionUi(); renderTransitionTimeline(); refreshCropSourceResolution(); refreshCropError(); fitSourcePreview(); syncTimeline(); }
function uiValues() { return { trimStart: el.trimStart.value, trimEnd: el.trimEnd.value, audioMode: el.audioMode.value, audioFormat: el.audioFormat.value, container: el.container.value, playbackSpeed: el.speedCustom.value, transformRotation: el.transformRotation.value, transformFlipHorizontal: el.transformFlipHorizontal.checked, transformFlipVertical: el.transformFlipVertical.checked, canvasEnabled: el.canvasEnable.checked, canvasAspectRatio: el.canvasAspectRatio.value, canvasFit: el.canvasFit.value, canvasBackgroundHex: el.canvasBackgroundHex.value, videoFade: fadeFromUi(), colorAdjustment: colorFromUi(), removeSegments: state.removeSegments.slice(), textOverlays: state.textOverlays.map((item) => cloneRecipe(item)), subtitles: cloneRecipe(state.subtitles), audioKeyframes: cloneRecipe(state.audioKeyframes), imageOverlays: state.imageOverlays.map((item) => cloneRecipe(item)), selectedImageId: state.selectedImageId, videoTransitions: state.videoTransitions.map((item) => ({ ...item })), selectedTransitionId: state.selectedTransitionId, audioMix: state.audioMix ? cloneRecipe(state.audioMix) : null, cropEnable: el.cropEnable.checked, cropX: el.cropX.value, cropY: el.cropY.value, cropW: el.cropW.value, cropH: el.cropH.value, scaleEnable: el.scaleEnable.checked, scaleW: el.scaleW.value, scaleH: el.scaleH.value, scaleKeepAspect: el.scaleKeepAspect.checked, videoKbps: el.videoKbps.value, audioKbps: el.audioKbps.value, frameEnable: el.frameEnable.checked, frameAt: el.frameAt.value }; }
function toMs(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null; }
function mergeSegments(segments) { const sorted = (Array.isArray(segments) ? segments : []).map((segment) => ({ start_ms: toMs(segment.start_ms), end_ms: toMs(segment.end_ms) })).filter((segment) => segment.start_ms !== null && segment.end_ms !== null && segment.start_ms < segment.end_ms).sort((a, b) => a.start_ms - b.start_ms); return sorted.reduce((result, segment) => { const previous = result[result.length - 1]; if (!previous || segment.start_ms > previous.end_ms) result.push(segment); else previous.end_ms = Math.max(previous.end_ms, segment.end_ms); return result; }, []); }
function renderSegments() { el.segList.replaceChildren(); el.segTitle.textContent = t("segment.title", { count: state.removeSegments.length }); el.segHint.textContent = state.meta ? t("segment.duration", { duration: state.meta.duration_ms }) : t("segment.selectFile"); if (!state.removeSegments.length) { const empty = document.createElement("div"); empty.className = "segitem"; empty.textContent = t("segment.none"); el.segList.appendChild(empty); syncTimeline(); return; } state.removeSegments.forEach((segment, index) => { const row = document.createElement("div"); row.className = "segitem"; const chip = document.createElement("span"); chip.className = "segchip"; chip.textContent = `${segment.start_ms}–${segment.end_ms} ms (${segment.end_ms - segment.start_ms} ms)`; const button = document.createElement("button"); button.type = "button"; button.className = "segbtn secondary"; button.textContent = t("segment.remove"); button.setAttribute("aria-label", t("segment.removeAria", { index: index + 1 })); button.onclick = () => { state.removeSegments = state.removeSegments.filter((_, itemIndex) => itemIndex !== index); state.selectedSegment = -1; timeline.clearSelection(); renderSegments(); void recordRecipeEdit(); }; row.append(chip, button); el.segList.appendChild(row); }); syncTimeline(); }
function timelineTrim() { const duration = state.meta?.duration_ms || 0; const start = toMs(el.trimStart.value) ?? 0; const end = toMs(el.trimEnd.value) ?? duration; return { startMs: Math.min(start, Math.max(0, end - 1)), endMs: Math.max(start + 1, Math.min(duration, end)) }; }
function syncTimeline() { const trim = timelineTrim(); el.timelineTrimState.textContent = `${formatTime(trim.startMs)}–${formatTime(trim.endMs)}`; el.timelineSegmentCount.textContent = String(state.removeSegments.length); renderTransitionUi(); renderTextPreview(); renderTextTimeline(); renderSubtitlePreview(); renderSubtitleTimeline(); refreshSubtitleError(); renderAudioKeyframeTimeline(); renderAudioKeyframeGraphs(); refreshAudioKeyframeError(); renderImagePreview(); renderImageTimeline(); renderMotionTimeline(); renderTransitionTimeline(); renderTransitionPreview(); renderMusicTimeline(); renderFade(); renderColorPreview(); syncMusicPreview(); timeline.update({ durationMs: state.meta?.duration_ms || 0, currentMs: Math.round((el.inputPreview.currentTime || 0) * 1000), trim, segments: state.removeSegments }); }
thumbnailRenderer = createThumbnailRenderer(el.timelineThumbnails, (status, detail) => { if (status === "loading") { el.timelineHint.textContent = t("messages.thumbnailLoading"); log(t("messages.thumbnailStarted")); } if (status === "progress") el.timelineHint.textContent = `${t("messages.thumbnailLoading")} ${Math.round(detail * 100)}%`; if (status === "decoded") log(t("messages.thumbnailDecoded")); if (status === "complete") { el.timelineHint.textContent = t("messages.thumbnailComplete"); log(t("messages.thumbnailCompleted")); } if (status === "error") { el.timelineHint.textContent = t("messages.thumbnailError"); log(t("messages.thumbnailFailed", { error: detail?.message || detail })); } });
const timeline = createTimeline({ root: el.timelineEditor, viewport: el.timelineViewport, canvas: el.timelineCanvas, track: el.timelineTrack, ruler: el.timelineRuler, thumbnails: el.timelineThumbnails, segmentsLayer: el.timelineSegments, trimRange: el.timelineTrimRange, playhead: el.timelinePlayhead, startHandle: el.trimStartHandle, endHandle: el.trimEndHandle, current: el.timelineCurrent, total: el.timelineTotal, empty: el.timelineEmpty, zoomIn: el.timelineZoomIn, zoomOut: el.timelineZoomOut, zoomFit: el.timelineZoomFit, zoomValue: el.timelineZoomValue, translate: t, getDuration: () => state.meta?.duration_ms || 0, getCurrent: () => Math.round((el.inputPreview.currentTime || 0) * 1000), getTrim: timelineTrim, onSeek: (value) => { if (!state.meta) return; el.inputPreview.currentTime = value / 1000; syncTimeline(); }, onTrimPreview: (start, end) => { el.trimStart.value = String(start); el.trimEnd.value = String(end); syncTimeline(); }, onTrimChange: (start, end) => { el.trimStart.value = String(start); el.trimEnd.value = String(end); syncTimeline(); void recordRecipeEdit(); }, onSegmentSelect: (index, start, end) => { state.selectedSegment = index; if (!state.meta) return; el.timelineHint.textContent = `${t("timeline.removed")}: ${formatTime(start)} – ${formatTime(end)}`; el.inputPreview.currentTime = start / 1000; syncTimeline(); }, onSegmentPreview: (index, start, end) => { state.selectedSegment = index; el.timelineHint.textContent = `${t("timeline.removed")}: ${formatTime(start)} – ${formatTime(end)}`; }, onSegmentChange: (index, start, end) => { const next = state.removeSegments.slice(); next[index] = { start_ms: start, end_ms: end }; setSegments(next); el.timelineHint.textContent = t("messages.segmentUpdated"); void recordRecipeEdit(); }, onSegmentDelete: (index) => { state.selectedSegment = -1; setSegments(state.removeSegments.filter((_, itemIndex) => itemIndex !== index)); el.timelineHint.textContent = t("messages.segmentDeleted"); void recordRecipeEdit(); }, onZoomChange: (value) => { el.timelineHint.textContent = value > 1 ? `${t("timeline.title")} ${value}x` : t("messages.useHandles"); } });
bindKeyboardShortcuts({
  isActive: () => Boolean(state.file && state.meta && !state.running),
  getCurrentMs: () => Math.round((el.inputPreview.currentTime || 0) * 1000),
  getDurationMs: () => state.meta?.duration_ms || 0,
  getTrim: timelineTrim,
  onTogglePlayback: () => { if (el.inputPreview.paused) void el.inputPreview.play().catch(() => {}); else el.inputPreview.pause(); },
  onSeek: (value) => { if (value === null) return false; el.inputPreview.currentTime = value / 1000; syncTimeline(); return true; },
  onTrim: (boundary, next) => { if (!next) return false; el.trimStart.value = String(next.startMs); el.trimEnd.value = String(next.endMs); syncTimeline(); void recordRecipeEdit(); return true; },
  onUndo: () => { if (el.undoBtn.disabled) return false; el.undoBtn.click(); return true; },
  onRedo: () => { if (el.redoBtn.disabled) return false; el.redoBtn.click(); return true; },
});
function setSegments(segments) { state.removeSegments = mergeSegments(segments); renderSegments(); }
function addSegmentFromInputs() { const start = toMs(el.segStart.value); const end = toMs(el.segEnd.value); if (start === null || end === null) throw new Error(t("messages.segmentRequired")); if (start >= end) throw new Error(t("messages.segmentOrder")); if (state.meta && end > state.meta.duration_ms) throw new Error(t("messages.segmentDuration")); setSegments([...state.removeSegments, { start_ms: start, end_ms: end }]); el.segStart.value = ""; el.segEnd.value = ""; }
function updateUndoRedoUi() { const undoDisabled = state.running || !state.undoStack.length || !state.file || !state.meta; const redoDisabled = state.running || !state.redoStack.length || !state.file || !state.meta; el.undoBtn.disabled = undoDisabled; el.redoBtn.disabled = redoDisabled; if (el.undoTopBtn) el.undoTopBtn.disabled = undoDisabled; if (el.redoTopBtn) el.redoTopBtn.disabled = redoDisabled; }
function commitNormalized(next, options = {}) { const previous = state.recipeNormalized; if (!state.isRestoring && options.pushHistory !== false && previous && recipeKey(previous) !== recipeKey(next)) { state.undoStack.push(cloneRecipe(previous)); if (state.undoStack.length > 50) state.undoStack.shift(); state.redoStack = []; } state.recipeNormalized = next; state.outputFps = next.output_fps ?? defaultOutputFps(state.meta); applyRecipeToUi(next); refreshOutputSettingsCard(); if (!state.isRestoring) pruneImageAssets(); updateUndoRedoUi(); }
async function refreshDraftAndValidate() { if (!state.file || !state.meta) throw new Error(t("messages.chooseSource")); if (simpleExport.mode === "simple" && !simpleExportReady(recommendationMeta(), simpleExport)) throw new Error(t("simple.incomplete")); applySimpleExport(); assertCropValid(); assertTransitionsValid(); assertFadeValid(); assertColorValid(); assertImagesValid(); assertMotionValid(); if (!el.frameEnable.checked && el.audioMode.value !== "extract") { assertSubtitlesValid(); assertAudioKeyframesValid(); } const draft = buildRecipeFromUi(uiValues()); state.recipeDraft = draft; const response = await validateRecipe({ meta: state.meta, recipe: draft }); commitNormalized(response.normalized); return response.normalized; }
async function recordRecipeEdit(draftOverride = null) { if (!state.file || !state.meta || state.isRestoring) return false; const token = ++state.recipeEditToken; try { reconcileTransitions(); assertCropValid(); assertTransitionsValid(); assertFadeValid(); assertColorValid(); assertImagesValid(); assertMotionValid(); if (!el.frameEnable.checked && el.audioMode.value !== "extract") { assertSubtitlesValid(); assertAudioKeyframesValid(); } const draft = draftOverride || buildRecipeFromUi(uiValues()); const response = await validateRecipe({ meta: state.meta, recipe: draft }); if (token !== state.recipeEditToken) return false; state.recipeDraft = draft; commitNormalized(response.normalized); return true; } catch (error) { log(error.message || t("messages.recipeUpdateFailed")); return false; } }
async function restoreFromSnapshot(snapshot, direction) { state.isRestoring = true; try { const response = await validateRecipe({ meta: state.meta, recipe: snapshot }); commitNormalized(response.normalized, { pushHistory: false }); if (direction === "undo") state.redoStack.push(cloneRecipe(snapshot)); else state.undoStack.push(cloneRecipe(snapshot)); } finally { state.isRestoring = false; updateUndoRedoUi(); } }
function initUndoRedo() { el.undoBtn.onclick = async () => { if (!state.undoStack.length) return; const current = cloneRecipe(state.recipeNormalized); const previous = state.undoStack.pop(); await restoreFromSnapshot(previous, "undo"); if (current) state.redoStack[state.redoStack.length - 1] = current; pruneImageAssets(); log(t("messages.undoApplied")); }; el.redoBtn.onclick = async () => { if (!state.redoStack.length) return; const current = cloneRecipe(state.recipeNormalized); const next = state.redoStack.pop(); await restoreFromSnapshot(next, "redo"); if (current) state.undoStack[state.undoStack.length - 1] = current; pruneImageAssets(); log(t("messages.redoApplied")); }; }
async function loadPresets() { const list = await presets(); state.presets = Array.isArray(list) ? list : []; el.preset.replaceChildren(new Option(t("values.none"), "")); state.presets.forEach((preset) => el.preset.add(new Option(`${preset.label} (${preset.key})`, preset.key))); }
function mimeByKind(out, name, container) { const kind = out?.kind || "video"; const extension = (name || "").split(".").pop()?.toLowerCase() || container || "mp4"; if (kind === "image") return "image/png"; if (kind === "audio") return ({ mp3: "audio/mpeg", m4a: "audio/mp4", opus: "audio/opus", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg" })[extension] || "application/octet-stream"; return ({ webm: "video/webm", mkv: "video/x-matroska" })[extension] || "video/mp4"; }
function showOutput({ out, outName, data, container }) { clearOutputs(); const bytes = data instanceof Uint8Array ? data : new Uint8Array(data); const blob = new Blob([bytes], { type: mimeByKind(out, outName, container) }); const url = URL.createObjectURL(blob); lastBlobUrl = url; const kind = out?.kind || "video"; if (kind === "audio") { el.outAudio.src = url; el.outAudio.load(); el.outputAudioPanel.hidden = false; } else if (kind === "image") { el.outImage.src = url; el.outputImagePanel.hidden = false; } else { el.outVideo.src = url; el.outVideo.load(); el.outputVideoPanel.hidden = false; } el.outputFileName.textContent = outName || "output"; el.outputFileSize.textContent = formatBytes(bytes.byteLength); el.download.href = url; el.download.download = outName || "output"; el.downloadPanel.hidden = false; el.outputSection.hidden = false; }
function startLoopPlayback() { if (!state.loopTrim || !state.meta) return; const trim = timelineTrim(); const start = trim.startMs / 1000; const end = trim.endMs / 1000; if (end <= start) return; if (el.inputPreview.currentTime < start || el.inputPreview.currentTime >= end) el.inputPreview.currentTime = start; const promise = el.inputPreview.play(); promise?.catch(() => { el.timelineHint.textContent = t("messages.playbackBlocked"); }); }
function handleLoopPlayback() { if (!state.loopTrim || !state.meta || el.inputPreview.paused) return; const trim = timelineTrim(); const end = trim.endMs / 1000; if (el.inputPreview.currentTime >= end - 0.02) { el.inputPreview.currentTime = trim.startMs / 1000; void el.inputPreview.play().catch(() => {}); } }

for (const id of ["transformRotation", "transformFlipHorizontal", "transformFlipVertical"]) {
  el[id].addEventListener("change", () => { renderTransformPreview(); syncTimeline(); void recordRecipeEdit(); });
}
el.transformReset.addEventListener("click", () => {
  applyTransformToUi(null);
  syncTimeline();
  void recordRecipeEdit();
});
el.cropReset.addEventListener("click", () => {
  resetCropUi();
  syncTimeline();
  void recordRecipeEdit().then(scheduleProjectSave);
});
el.canvasEnable.addEventListener("change", () => { syncCanvasControls(); renderTransformPreview(); syncTimeline(); void recordRecipeEdit(); });
el.canvasAspectRatio.addEventListener("change", () => { renderTransformPreview(); syncTimeline(); void recordRecipeEdit(); });
el.canvasFit.addEventListener("change", () => { void recordRecipeEdit(); });
el.canvasBackgroundColor.addEventListener("input", () => { el.canvasBackgroundHex.value = el.canvasBackgroundColor.value.toUpperCase(); renderTransformPreview(); });
el.canvasBackgroundColor.addEventListener("change", () => { void recordRecipeEdit(); });
el.canvasBackgroundHex.addEventListener("input", () => { if (validCanvasColor(el.canvasBackgroundHex.value)) { el.canvasBackgroundColor.value = el.canvasBackgroundHex.value.toUpperCase(); renderTransformPreview(); } });
el.canvasBackgroundHex.addEventListener("change", () => { if (!validCanvasColor(el.canvasBackgroundHex.value)) el.canvasBackgroundHex.value = el.canvasBackgroundColor.value; else el.canvasBackgroundHex.value = el.canvasBackgroundHex.value.toUpperCase(); renderTransformPreview(); void recordRecipeEdit(); });
el.canvasReset.addEventListener("click", () => { applyCanvasToUi(null); syncTimeline(); void recordRecipeEdit(); });
function syncPreviewControls() {
  const duration = el.inputPreview.duration;
  el.previewPlayPause.textContent = el.inputPreview.paused ? "▶" : "❚❚";
  el.previewSeek.disabled = !Number.isFinite(duration) || duration <= 0;
  if (!el.previewSeek.disabled) el.previewSeek.value = String(Math.round(el.inputPreview.currentTime / duration * 1000));
}
el.previewPlayPause.addEventListener("click", () => { if (el.inputPreview.paused) void el.inputPreview.play().catch(() => {}); else el.inputPreview.pause(); });
el.previewSeek.addEventListener("input", () => { if (!el.previewSeek.disabled) el.inputPreview.currentTime = el.inputPreview.duration * Number(el.previewSeek.value) / 1000; });
el.previewVolume.addEventListener("input", syncMusicPreview);
el.previewFullscreen.addEventListener("click", () => { const host = el.previewStage.parentElement; if (document.fullscreenElement) void document.exitFullscreen(); else if (host.requestFullscreen) void host.requestFullscreen(); else el.inputPreview.webkitEnterFullscreen?.(); });
el.inputPreview.addEventListener("play", syncPreviewControls);
el.inputPreview.addEventListener("pause", syncPreviewControls);
el.inputPreview.addEventListener("timeupdate", syncPreviewControls);
el.inputPreview.addEventListener("loadedmetadata", syncPreviewControls);
document.addEventListener("fullscreenchange", fitSourcePreview);
if (window.ResizeObserver) new ResizeObserver(() => { fitSourcePreview(); syncTimeline(); }).observe(el.previewStage.parentElement);
el.clear.onclick = () => { clearLog(); clearOutputs(); clearRecipeUi(); clearSource(); resetSimpleExportState(); state.recipeDraft = null; state.recipeNormalized = null; state.lastPlan = null; state.undoStack = []; state.redoStack = []; state.recipeEditToken += 1; setStatus("Idle", "messages.chooseVideo"); updateUndoRedoUi(); };
el.cancel.onclick = () => { if (!state.running) return; state.cancelRequested = true; cancelFfmpeg(); state.running = false; setControlsEnabled(true); setStatus("Cancelled", "messages.cancelled"); log(t("messages.cancelled")); };
el.addSeg.onclick = () => { try { addSegmentFromInputs(); void recordRecipeEdit(); } catch (error) { log(error.message || error); } };
el.clearSegs.onclick = () => { setSegments([]); state.selectedSegment = -1; timeline.clearSelection(); void recordRecipeEdit(); };
el.inputPreview.addEventListener("error", () => { if (state.file) log(t("messages.previewUnavailable")); });
el.outVideo.addEventListener("error", () => log(t("messages.outputPreviewUnavailable")));
el.outAudio.addEventListener("error", () => log(t("messages.outputAudioUnavailable")));
el.trimStart.addEventListener("input", syncTimeline);
el.trimEnd.addEventListener("input", syncTimeline);
el.trimStart.addEventListener("change", () => { void recordRecipeEdit(); });
el.trimEnd.addEventListener("change", () => { void recordRecipeEdit(); });
["loadedmetadata", "loadeddata", "durationchange", "timeupdate", "seeking", "seeked", "ended"].forEach((eventName) => el.inputPreview.addEventListener(eventName, () => { if (eventName === "loadedmetadata") fitSourcePreview(); syncTimeline(); }));
el.loopTrim.addEventListener("change", () => { state.loopTrim = el.loopTrim.checked; el.timelineHint.textContent = state.loopTrim ? t("messages.loopEnabled") : t("messages.loopDisabled"); if (state.loopTrim && !el.inputPreview.paused) startLoopPlayback(); });
el.inputPreview.addEventListener("play", () => { timeline.setPlayback(true); syncTimeline(); if (state.loopTrim) startLoopPlayback(); });
el.inputPreview.addEventListener("pause", () => { timeline.setPlayback(false); syncTimeline(); });
el.inputPreview.addEventListener("timeupdate", handleLoopPlayback);
el.inputPreview.addEventListener("ended", () => { syncTimeline(); if (state.loopTrim) startLoopPlayback(); });
  el.file.onchange = async (event = null) => { const file = event?.fileOverride || el.file.files?.[0]; if (!file) return; const source = pendingProject?.state?.media?.find((item) => item.role === "source") || pendingProject?.media?.find((item) => item.role === "source"); state.sourceMediaId = source?.media_id || mediaId(); const token = ++runToken; state.recipeEditToken += 1; clearLog(); clearOutputs(); thumbnailRenderer.clear(); clearRecipeUi(); state.file = file; el.fileNameDisplay.textContent = file.name; state.meta = null; sourceFpsKnown = false; sourceGeometry = null; state.recipeDraft = null; state.recipeNormalized = null; state.loopTrim = false; state.undoStack = []; state.redoStack = []; el.loopTrim.checked = false; setSourcePreview(true); if (inputBlobUrl) URL.revokeObjectURL(inputBlobUrl); inputBlobUrl = URL.createObjectURL(file); transitionRenderer.setSource(inputBlobUrl); el.inputPreview.src = inputBlobUrl; el.inputPreview.load(); setControlsEnabled(false); setStatus("Validating", "messages.metadata"); log(t("messages.metadata")); try { if (file.size > maxFileSize) throw new Error(t("messages.fileTooLarge")); const meta = await loadVideoMeta(file); if (token !== runToken) return; try { const streamMeta = await analyzeStreams(file); if (token !== runToken) return; sourceGeometry = streamMeta; if (Number.isFinite(streamMeta?.fps) && streamMeta.fps > 0 && streamMeta.fps <= 240) { meta.fps = streamMeta.fps; sourceFpsKnown = true; } } catch {} if (token !== runToken) return; state.meta = meta; if (!pendingProject) applyDefaultOutputSettings(meta); updateFileMeta(); clearRecipeUi(); const baseline = buildRecipeFromUi(uiValues()); try { const response = await validateRecipe({ meta, recipe: baseline }); if (token !== runToken) return; state.recipeNormalized = response.normalized; } catch (error) { if (token !== runToken) return; state.recipeNormalized = baseline; log(t("messages.recipeBaseline", { error: error.message || error })); } setSourcePreview(true); setControlsEnabled(true); refreshOutputSettingsCard(); renderSegments(); void thumbnailRenderer.render(file, meta.duration_ms); setStatus("Idle", "messages.ready"); log(t("messages.metadataLoaded", { width: meta.width, height: meta.height, duration: formatDuration(meta.duration_ms) })); } catch (error) { if (token !== runToken) return; state.file = null; state.meta = null; state.recipeNormalized = null; thumbnailRenderer.clear(); el.inputPreview.pause(); el.inputPreview.removeAttribute("src"); el.inputPreview.load(); setSourcePreview(false); updateFileMeta(); setControlsEnabled(false); setStatus("Failed", "messages.metadataFailed"); log(error.message || t("messages.metadataFailed")); } };
el.applyPreset.onclick = async () => { try { if (!state.file || !state.meta) throw new Error(t("messages.chooseSource")); const selected = state.presets.find((preset) => preset.key === el.preset.value); const base = state.recipeNormalized || buildRecipeFromUi(uiValues()); const next = selected ? applyPatch(base, selected.recipe_patch || {}) : { ...base, remove_segments: [], crop: null, scale: null, bitrate: null, frame_capture: null }; if (!selected?.recipe_patch || !("video_fade" in selected.recipe_patch)) next.video_fade = null; if (selected?.recipe_patch && "color_adjustment" in selected.recipe_patch) next.color_adjustment = selected.recipe_patch.color_adjustment ? { brightness: 0, contrast: 1, saturation: 1, gamma: 1, ...selected.recipe_patch.color_adjustment } : null; else next.color_adjustment = null; if (!selected?.recipe_patch || !("video_transitions" in selected.recipe_patch)) { next.video_transitions = []; next.selected_transition_id = null; } if (!selected?.recipe_patch || !("subtitles" in selected.recipe_patch)) next.subtitles = { cues: [], style: { ...defaultSubtitleStyle } }; next.audio_keyframes = selected?.recipe_patch?.audio_keyframes ? { ...defaultAudioKeyframes(), ...cloneRecipe(selected.recipe_patch.audio_keyframes) } : defaultAudioKeyframes(); if (!selected?.recipe_patch || !("image_overlays" in selected.recipe_patch)) { next.image_overlays = []; next.selected_image_id = null; } else { next.image_overlays = next.image_overlays.map((item) => ({ ...item, file_ref: `overlay-image-${nextImageIndex()}` })); if (!next.image_overlays.some((item) => item.id === next.selected_image_id)) next.selected_image_id = next.image_overlays[0]?.id || null; } applyRecipeToUi(next); next.selected_transition_id = state.selectedTransitionId; assertTransitionsValid(); const response = await validateRecipe({ meta: state.meta, recipe: next }); commitNormalized(response.normalized); if (state.imageOverlays.some((item) => !imageAssetMatches(item))) { el.imageError.textContent = t("image.missing"); log(t("image.missing")); } log(selected ? t("messages.presetApplied", { label: selected.label }) : t("messages.presetCleared")); } catch (error) { setStatus("Failed", "messages.failed"); if (String(error.message || error).includes("transition boundary")) el.transitionError.textContent = t("transition.invalidBoundary"); log(error.message || error); } };
el.validate.onclick = async () => { try { setStatus("Validating", "messages.validating"); clearLog(); log(t("messages.validating")); await refreshDraftAndValidate(); setStatus("Idle", "messages.valid"); log(t("messages.valid")); } catch (error) { setStatus("Failed", "messages.fixRecipe"); log(error.message || error); } };
el.run.onclick = async () => { if (state.running) return; const token = ++runToken; state.running = true; state.cancelRequested = false; el.inputPreview.pause(); clearOutputs(); setControlsEnabled(true); try { setStatus("Validating", "messages.validating"); clearLog(); const normalized = await refreshDraftAndValidate(); if (token !== runToken || state.cancelRequested) return; const planResponse = await plan({ meta: state.meta, recipe: normalized }); state.lastPlan = planResponse; setStatus("Processing", "messages.processing"); log(t("messages.runningPlan", { mode: planResponse.mode })); const textFrame = normalized.video_transitions?.some((item) => item.type !== "none") ? { ...state.meta, ...imageFrame() } : state.meta; const textAssets = []; let motionBytes = 0; if (planResponse.mode === "video") for (const item of normalized.text_overlays || []) { const asset = item.motion?.enabled && item.motion.keyframes?.length ? await renderMotionFrames(item, "text", { ...imageFrame(), sourceHeight: state.meta.height }, state.meta.fps || 30, null, () => { if (token !== runToken || state.cancelRequested) throw new Error("Cancelled"); }).catch((error) => { throw new Error(error.message === "Cancelled" ? "Cancelled" : motionMessage(error)); }) : (await renderTextAssets([item], textFrame))[0]; textAssets.push(asset); if (asset.frames) motionBytes += asset.frames.reduce((sum, frame) => sum + frame.byteLength, 0); if (motionBytes > maxMotionBytes) throw new Error(t("motion.memoryLimit")); } if (token !== runToken || state.cancelRequested) return; const imageAssets = []; if (planResponse.mode === "video") for (const item of normalized.image_overlays || []) { const asset = item.motion?.enabled && item.motion.keyframes?.length ? await renderMotionFrames(item, "image", imageFrame(), state.meta.fps || 30, state.imageFiles.get(item.file_ref)?.image, () => { if (token !== runToken || state.cancelRequested) throw new Error("Cancelled"); }).catch((error) => { throw new Error(error.message === "Cancelled" ? "Cancelled" : motionMessage(error)); }) : (await renderImageAssets([item], state.imageFiles, outputDimensions(state.meta, uiValues())).catch((error) => { throw new Error(imageErrorMessage(error)); }))[0]; imageAssets.push(asset); if (asset.frames) motionBytes += asset.frames.reduce((sum, frame) => sum + frame.byteLength, 0); if (motionBytes > maxMotionBytes) throw new Error(t("motion.memoryLimit")); } if (token !== runToken || state.cancelRequested) return; const subtitleAssets = planResponse.mode === "video" && normalized.subtitles?.cues?.length ? await renderSubtitleAssets(normalized.subtitles, imageFrame()) : []; if (token !== runToken || state.cancelRequested) return; const musicFile = planResponse.music_source_id ? state.musicFiles.get(planResponse.music_source_id) : null; if (planResponse.music_source_id && !musicFile) throw new Error(t("music.unavailable")); const output = await runPlan({ file: state.file, planRes: planResponse, textAssets, imageAssets, subtitleAssets, musicFile, log, onProgress: (progress) => setStatus("Processing", "messages.processing", {}, progress) }); if (token !== runToken || state.cancelRequested) return; showOutput({ ...output, container: planResponse.container }); setStatus("Completed", "messages.completed", {}, 100); log(t("messages.outputReady")); } catch (error) { if (!state.cancelRequested) { setStatus("Failed", "messages.failed"); log(error.message || t("messages.failed")); } } finally { if (token === runToken && !state.cancelRequested) { state.running = false; setControlsEnabled(true); } } };


let transitionUiSignature = "";
let transitionTimelineSignature = "";
let transitionInputEditing = false;
function selectedTransitionBoundary() { return currentTransitionLayout().boundaries.find((item) => item.id === state.selectedTransitionId) || null; }
function selectedTransitionSetting() { return state.videoTransitions.find((item) => item.boundary_id === state.selectedTransitionId) || null; }
function reconcileTransitions() {
  const valid = new Set(currentTransitionLayout().boundaries.map((item) => item.id));
  const oldLength = state.videoTransitions.length;
  state.videoTransitions = state.videoTransitions.filter((item) => valid.has(item.boundary_id));
  if (oldLength !== state.videoTransitions.length) { transitionUiSignature = ""; log(t("transition.removedBoundary")); renderTransitionUi(); renderTransitionTimeline(); }
}
function resetTransitionUi() {
  state.videoTransitions = [];
  state.selectedTransitionId = null;
  state.transitionInputInvalid = false;
  transitionInputEditing = false;
  transitionUiSignature = "";
  transitionTimelineSignature = "";
  el.transitionError.textContent = "";
  el.transitionDurationRange.value = "0.5";
  el.transitionDurationNumber.value = "0.5";
  el.transitionType.value = "none";
  el.transitionPreview.hidden = true;
  el.transitionPreviewWarning.hidden = true;
  renderTransitionUi();
  renderTransitionTimeline();
}
function transitionError() {
  if (state.transitionInputInvalid) return t("transition.invalidDuration");
  const layout = currentTransitionLayout();
  const ids = new Set(layout.boundaries.map((item) => item.id));
  const seen = new Set();
  for (const item of state.videoTransitions) {
    if (!ids.has(item.boundary_id) || seen.has(item.boundary_id) || !["none","crossfade","fadeblack","wipeleft","wiperight"].includes(item.type)) return t("transition.invalidBoundary");
    seen.add(item.boundary_id);
    if (!Number.isInteger(item.duration_ms) || item.duration_ms < 100 || item.duration_ms > 3000 || item.duration_ms % 100) return t("transition.invalidDuration");
  }
  for (const [index, segment] of layout.segments.entries()) {
    const before = index ? layout.boundaries[index - 1].duration : 0;
    const after = index < layout.boundaries.length ? layout.boundaries[index].duration : 0;
    if (before + after > segment.length + 0.000001) return t("transition.overlap");
  }
  if (layout.segments.length && layout.duration < 1) return t("transition.overlap");
  return "";
}
function assertTransitionsValid() {
  const message = transitionError();
  el.transitionError.textContent = message;
  if (message) throw new Error(message);
}
function renderTransitionUi() {
  if (!el.transitionList) return;
  const layout = currentTransitionLayout();
  if (!layout.boundaries.some((item) => item.id === state.selectedTransitionId)) state.selectedTransitionId = layout.boundaries[0]?.id || null;
  const signature = JSON.stringify([layout.boundaries.map((item) => [item.id, item.sourceLeft, item.sourceRight]), state.videoTransitions, state.selectedTransitionId, Boolean(state.meta), state.running]);
  if (signature === transitionUiSignature) return;
  transitionUiSignature = signature;
  el.transitionTitle.textContent = t("transition.titleCount", { count: layout.boundaries.length });
  el.transitionEmpty.hidden = layout.boundaries.length > 0;
  el.transitionList.replaceChildren();
  layout.boundaries.forEach((boundary, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary${boundary.id === state.selectedTransitionId ? " is-selected" : ""}`;
    button.textContent = `${t("transition.boundary", { index: index + 1 })} · ${t("transition.segments", { left: index + 1, right: index + 2 })} (${formatTime(boundary.sourceLeft[0])}–${formatTime(boundary.sourceLeft[1])} → ${formatTime(boundary.sourceRight[0])}–${formatTime(boundary.sourceRight[1])}) · ${t(`transition.${boundary.type}`)}${boundary.duration ? ` · ${(boundary.duration / 1000).toFixed(1)} s` : ""}`;
    button.setAttribute("aria-pressed", String(boundary.id === state.selectedTransitionId));
    button.onclick = () => { state.selectedTransitionId = boundary.id; state.transitionInputInvalid = false; transitionInputEditing = false; transitionUiSignature = ""; renderTransitionUi(); renderTransitionTimeline(); void recordRecipeEdit(); };
    el.transitionList.appendChild(button);
  });
  const selected = selectedTransitionBoundary();
  const setting = selectedTransitionSetting();
  const available = Boolean(state.meta && selected && !state.running);
  el.transitionType.disabled = !available;
  el.transitionDurationRange.disabled = !available;
  el.transitionDurationNumber.disabled = !available;
  el.transitionReset.disabled = !available || !setting || setting.type === "none";
  if (!transitionInputEditing) {
    el.transitionType.value = setting?.type || "none";
    const seconds = ((setting?.duration_ms ?? 500) / 1000).toFixed(1);
    el.transitionDurationRange.value = seconds;
    el.transitionDurationNumber.value = seconds;
  }
  el.transitionError.textContent = transitionError();
}
function renderTransitionTimeline() {
  const layout = currentTransitionLayout();
  const signature = JSON.stringify([layout.duration, layout.boundaries.map((item) => [item.id, item.type, item.duration, item.start]), state.selectedTransitionId]);
  if (signature === transitionTimelineSignature) return;
  transitionTimelineSignature = signature;
  el.timelineTransitions.replaceChildren();
  if (!layout.duration) return;
  layout.boundaries.forEach((boundary, index) => {
    if (!boundary.duration) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-transition-range${boundary.id === state.selectedTransitionId ? " is-selected" : ""}`;
    button.style.left = `${Math.max(0, boundary.start / layout.duration * 100)}%`;
    button.style.width = `${Math.max(0, boundary.duration / layout.duration * 100)}%`;
    button.setAttribute("aria-label", `${t("transition.boundary", { index: index + 1 })}: ${t(`transition.${boundary.type}`)}`);
    button.onclick = (event) => { event.stopPropagation(); state.selectedTransitionId = boundary.id; transitionUiSignature = ""; renderTransitionUi(); renderTransitionTimeline(); el.inputPreview.currentTime = sourceForOutput(boundary.start + boundary.duration / 2) / 1000; syncTimeline(); void recordRecipeEdit(); };
    el.timelineTransitions.appendChild(button);
  });
}
function renderTransitionPreview() {
  const result = transitionRenderer.render(currentTransitionLayout(), currentSpeed());
  if (result.active && audioGraph && !audioGraph.transition) ensureTransitionAudioNode();
  const visualMissing = result.active && !result.ready;
  const audioMissing = result.active && result.ready && state.meta?.has_audio && !audioGraph?.transition;
  el.transitionPreviewWarning.hidden = !visualMissing && !audioMissing;
  el.transitionPreviewWarning.textContent = visualMissing ? t("transition.previewUnavailable") : audioMissing ? t("transition.audioPreviewUnavailable") : "";
}
function ensureTransitionAudioNode() {
  if (!audioGraph || audioGraph.transition || transitionAudioUnavailable) return;
  try {
    const gain = audioGraph.context.createGain();
    audioGraph.context.createMediaElementSource(transitionRenderer.other).connect(gain).connect(audioGraph.context.destination);
    gain.gain.value = 0;
    audioGraph.transition = gain;
    transitionRenderer.other.muted = false;
  } catch (error) { transitionAudioUnavailable = true; log(`${t("transition.previewUnavailable")} ${error.message || error}`); }
}
el.transitionType.addEventListener("change", () => {
  const boundary = selectedTransitionBoundary(); if (!boundary) return;
  const duration_ms = selectedTransitionSetting()?.duration_ms ?? 500;
  state.videoTransitions = state.videoTransitions.filter((item) => item.boundary_id !== boundary.id);
  state.videoTransitions.push({ boundary_id: boundary.id, type: el.transitionType.value, duration_ms });
  state.videoTransitions.sort((left, right) => currentTransitionLayout().boundaries.findIndex((item) => item.id === left.boundary_id) - currentTransitionLayout().boundaries.findIndex((item) => item.id === right.boundary_id));
  transitionUiSignature = ""; renderTransitionUi(); syncTimeline(); void recordRecipeEdit();
});
el.transitionDurationRange.addEventListener("input", () => { el.transitionDurationNumber.value = Number(el.transitionDurationRange.value).toFixed(1); el.transitionDurationNumber.dispatchEvent(new Event("input")); });
el.transitionDurationRange.addEventListener("change", () => { transitionInputEditing = false; void recordRecipeEdit(); });
el.transitionDurationNumber.addEventListener("input", () => {
  const raw = el.transitionDurationNumber.value;
  const value = Number(raw);
  state.transitionInputInvalid = raw === "" || !Number.isFinite(value) || value < 0.1 || value > 3 || Math.abs(value * 10 - Math.round(value * 10)) > 0.000001;
  transitionInputEditing = true;
  if (!state.transitionInputInvalid) {
    el.transitionDurationRange.value = raw;
    let item = selectedTransitionSetting();
    if (!item && state.selectedTransitionId) { item = { boundary_id: state.selectedTransitionId, type: "none", duration_ms: 500 }; state.videoTransitions.push(item); }
    if (item) item.duration_ms = Math.round(value * 1000);
  }
  el.transitionError.textContent = transitionError();
  syncTimeline();
});
el.transitionDurationNumber.addEventListener("change", () => { if (!state.transitionInputInvalid) { transitionInputEditing = false; void recordRecipeEdit(); } });
el.transitionReset.onclick = () => {
  const boundary = selectedTransitionBoundary(); if (!boundary) return;
  state.videoTransitions = state.videoTransitions.filter((item) => item.boundary_id !== boundary.id);
  state.transitionInputInvalid = false; transitionInputEditing = false; transitionUiSignature = ""; renderTransitionUi(); syncTimeline(); void recordRecipeEdit();
};
const imageFields = ["imageStart","imageEnd","imageXRange","imageXNumber","imageYRange","imageYNumber","imageWidthRange","imageWidthNumber","imageOpacityRange","imageOpacityNumber"];
const imageNodes = new Map();
let imageFieldError = false;
function selectedImage() { return state.imageOverlays.find((item) => item.id === state.selectedImageId); }
function imageFrame() { return state.meta ? outputDimensions(state.meta, { cropEnable: el.cropEnable.checked, cropX: el.cropX.value, cropY: el.cropY.value, cropW: el.cropW.value, cropH: el.cropH.value, scaleEnable: el.scaleEnable.checked, scaleW: el.scaleW.value, scaleH: el.scaleH.value, scaleKeepAspect: el.scaleKeepAspect.checked, transformRotation: el.transformRotation.value, canvasEnabled: canvasEnabled(), canvasAspectRatio: el.canvasAspectRatio?.value }) : null; }
function imageRect() {
  if (!state.meta || el.inputPreview.hidden) return null;
  if (canvasEnabled() || el.transformRotation.value !== "0" || el.transformFlipHorizontal.checked || el.transformFlipVertical.checked) {
    const stage = el.previewStage.getBoundingClientRect();
    const host = el.imagePreview.getBoundingClientRect();
    const frame = imageFrame();
    if (!frame || !stage.width || !stage.height) return null;
    const width = Math.min(stage.width, stage.height * frame.width / frame.height);
    const height = Math.min(stage.height, stage.width * frame.height / frame.width);
    return { left: stage.left - host.left + (stage.width - width) / 2, top: stage.top - host.top + (stage.height - height) / 2, width, height };
  }
  const video = el.inputPreview.getBoundingClientRect();
  const host = el.imagePreview.getBoundingClientRect();
  const sourceWidth = Math.min(video.width, video.height * state.meta.width / state.meta.height);
  const sourceHeight = Math.min(video.height, video.width * state.meta.height / state.meta.width);
  let left = video.left - host.left + (video.width - sourceWidth) / 2;
  let top = video.top - host.top + (video.height - sourceHeight) / 2;
  let width = sourceWidth;
  let height = sourceHeight;
  const crop = normalizedCrop(state.meta, { cropEnable: el.cropEnable.checked, cropX: el.cropX.value, cropY: el.cropY.value, cropW: el.cropW.value, cropH: el.cropH.value });
  if (crop) {
    left += crop.x / state.meta.width * sourceWidth;
    top += crop.y / state.meta.height * sourceHeight;
    width = crop.width / state.meta.width * sourceWidth;
    height = crop.height / state.meta.height * sourceHeight;
  }
  const frame = imageFrame();
  if (frame && frame.width > 0 && frame.height > 0) {
    const fittedWidth = Math.min(width, height * frame.width / frame.height);
    const fittedHeight = Math.min(height, width * frame.height / frame.width);
    left += (width - fittedWidth) / 2;
    top += (height - fittedHeight) / 2;
    width = fittedWidth;
    height = fittedHeight;
  }
  return { left, top, width, height };
}
function releaseAllImageAssets() {
  for (const asset of state.imageFiles.values()) releaseImageAsset(asset);
  state.imageFiles.clear();
}
function imageAssetMatches(item) {
  const asset = state.imageFiles.get(item.file_ref);
  return Boolean(asset && asset.file.name === item.filename && asset.file.type === item.mime_type && asset.file.size === item.file_size && asset.width === item.image_width && asset.height === item.image_height);
}
function nextImageIndex() {
  const usedIds = new Set(state.imageOverlays.map((item) => item.id));
  const usedRefs = new Set(state.imageFiles.keys());
  for (const snapshot of [state.recipeNormalized, ...state.undoStack, ...state.redoStack]) for (const item of snapshot?.image_overlays || []) { usedIds.add(item.id); usedRefs.add(item.file_ref); }
  do { state.imageCounter += 1; } while (usedIds.has(`image-${state.imageCounter}`) || usedRefs.has(`overlay-image-${state.imageCounter}`));
  return state.imageCounter;
}
function resetImageState() {
  state.imageSelectionToken += 1;
  releaseAllImageAssets();
  state.imageOverlays = [];
  state.selectedImageId = null;
  state.imageCounter = 0;
  state.imageFileAction = null;
  imageFieldError = false;
  el.imageFile.value = "";
  el.imageError.textContent = "";
  el.imagePreview.replaceChildren();
  imageNodes.clear();
  renderImageUi();
  renderImageTimeline();
}
function pruneImageAssets() {
  const live = new Set(state.imageOverlays.map((item) => item.file_ref));
  for (const snapshot of [state.recipeNormalized, ...state.undoStack, ...state.redoStack]) for (const item of snapshot?.image_overlays || []) live.add(item.file_ref);
  for (const [ref, asset] of state.imageFiles) if (!live.has(ref)) { releaseImageAsset(asset); state.imageFiles.delete(ref); }
}
function renderImageUi() {
  if (!el.imageList) return;
  const item = selectedImage();
  const available = Boolean(state.meta && !state.running);
  el.imageTitle.textContent = t("image.titleCount", { count: state.imageOverlays.length });
  el.imageAdd.disabled = !available || state.imageOverlays.length >= 10;
  el.imageSelect.disabled = !available || !item;
  el.imageReplace.disabled = !available || !item;
  el.imageRemove.disabled = !available || !item;
  const index = state.imageOverlays.findIndex((entry) => entry.id === state.selectedImageId);
  el.imageMoveUp.disabled = !available || index <= 0;
  el.imageMoveDown.disabled = !available || index < 0 || index >= state.imageOverlays.length - 1;
  el.imageReset.disabled = !available || !item;
  el.imageFile.disabled = !available;
  for (const id of imageFields) el[id].disabled = !available || !item;
  el.imageList.replaceChildren();
  state.imageOverlays.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary${entry.id === state.selectedImageId ? " is-selected" : ""}`;
    button.textContent = `${index + 1}. ${entry.filename}${imageAssetMatches(entry) ? "" : " ⚠"}`;
    button.setAttribute("aria-pressed", String(entry.id === state.selectedImageId));
    button.onclick = () => { state.selectedImageId = entry.id; imageFieldError = false; el.imageError.textContent = ""; renderImageUi(); renderImagePreview(); renderImageTimeline(); void recordRecipeEdit(); };
    el.imageList.appendChild(button);
  });
  el.imageSelectedFile.textContent = item ? (imageAssetMatches(item) ? item.filename : `${item.filename} — ${t("image.missing")}`) : t("image.none");
  if (!item) { for (const id of imageFields) el[id].value = ""; renderMotionUi("image"); return; }
  if (imageFieldError) { renderMotionUi("image"); return; }
  el.imageStart.value = item.start_ms;
  el.imageEnd.value = item.end_ms;
  for (const [name, value] of [["X",item.x_pct],["Y",item.y_pct],["Width",item.width_pct],["Opacity",item.opacity * 100]]) {
    el[`image${name}Range`].value = value;
    el[`image${name}Number`].value = Number(value.toFixed(2));
  }
  renderMotionUi("image");
}
function renderImageTimeline() {
  el.timelineImageClips.replaceChildren();
  const duration = editedDuration();
  el.timelineImageTrack.hidden = !state.meta || !state.imageOverlays.length || duration <= 0;
  if (el.timelineImageTrack.hidden) return;
  state.imageOverlays.forEach((item) => {
    const clip = document.createElement("span");
    clip.className = `timeline-image-clip${item.id === state.selectedImageId ? " is-selected" : ""}`;
    clip.style.left = `${Math.max(0, item.start_ms / duration * 100)}%`;
    clip.style.width = `${Math.max(0, (item.end_ms - item.start_ms) / duration * 100)}%`;
    clip.textContent = item.filename;
    el.timelineImageClips.appendChild(clip);
  });
}
function renderImagePreview() {
  const rect = imageRect();
  const frame = imageFrame();
  const now = outputPosition((el.inputPreview.currentTime || 0) * 1000);
  const visible = new Set();
  if (rect && frame && now !== null) for (const [layerIndex, item] of state.imageOverlays.entries()) {
    const asset = imageAssetMatches(item) ? state.imageFiles.get(item.file_ref) : null;
    if (!asset || now < item.start_ms || now >= item.end_ms) continue;
    const values = motionAt(item, now);
    const geometry = item.motion?.enabled && item.motion.keyframes?.length ? imageGeometry({ ...item, x_pct: values.x, y_pct: values.y, width_pct: item.width_pct * values.scale / 100 }, frame.width, frame.height) : imageGeometry(item, frame.width, frame.height);
    if (!geometry.valid) continue;
    visible.add(item.id);
    let node = imageNodes.get(item.id);
    if (!node) {
      node = document.createElement("div");
      node.className = "image-preview-item";
      const image = document.createElement("img");
      image.alt = "";
      node.appendChild(image);
      const handle = document.createElement("span");
      handle.className = "image-resize-handle";
      node.appendChild(handle);
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.addEventListener("pointerdown", (event) => startImagePointer(event, item.id, event.target === handle));
      node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); state.selectedImageId = item.id; renderImageUi(); renderImagePreview(); renderImageTimeline(); void recordRecipeEdit(); } });
      imageNodes.set(item.id, node);
    }
    node.classList.toggle("is-selected", item.id === state.selectedImageId);
    node.setAttribute("aria-label", `${t("image.select")}: ${item.filename}`);
    if (node.firstChild.src !== asset.url) node.firstChild.src = asset.url;
    node.style.left = `${rect.left + geometry.x / frame.width * rect.width}px`;
    node.style.top = `${rect.top + geometry.y / frame.height * rect.height}px`;
    node.style.width = `${geometry.width / frame.width * rect.width}px`;
    node.style.height = `${geometry.height / frame.height * rect.height}px`;
    node.style.opacity = String(item.opacity * values.opacity / 100);
    node.style.zIndex = String(layerIndex + 1);
    if (node.parentElement !== el.imagePreview) el.imagePreview.appendChild(node);
  }
  for (const [id, node] of imageNodes) if (!visible.has(id) && node.parentElement) node.remove();
  for (const [id, node] of imageNodes) if (!state.imageOverlays.some((item) => item.id === id)) { node.remove(); node.firstChild.removeAttribute("src"); imageNodes.delete(id); }
}
function startImagePointer(event, id, resize) {
  if (state.running || !state.meta || event.button !== 0) return;
  const item = state.imageOverlays.find((entry) => entry.id === id);
  const rect = imageRect();
  const frame = imageFrame();
  if (!item || !rect || !frame) return;
  event.preventDefault();
  state.selectedImageId = id;
  renderImageUi();
  renderImageTimeline();
  const node = imageNodes.get(id);
  node.setPointerCapture(event.pointerId);
  const start = { clientX: event.clientX, clientY: event.clientY, x: item.x_pct, y: item.y_pct, width: item.width_pct };
  const move = (next) => {
    const dx = (next.clientX - start.clientX) / rect.width * 100;
    const dy = (next.clientY - start.clientY) / rect.height * 100;
    if (resize) {
      const maxHorizontal = 100 - item.x_pct;
      const maxVertical = (100 - item.y_pct) * frame.height / frame.width * item.image_width / item.image_height;
      item.width_pct = Math.round(Math.max(1, Math.min(maxHorizontal, maxVertical, start.width + dx)) * 100) / 100;
    } else {
      item.x_pct = Math.round(Math.max(0, Math.min(100 - item.width_pct, start.x + dx)) * 100) / 100;
      const heightPct = (frame.width * item.width_pct / 100 * item.image_height / item.image_width) / frame.height * 100;
      item.y_pct = Math.round(Math.max(0, Math.min(100 - heightPct, start.y + dy)) * 100) / 100;
    }
    for (let attempt = 0; attempt < 100 && !imageGeometry(item, frame.width, frame.height).valid; attempt += 1) {
      if (resize) item.width_pct = Math.max(1, Math.round((item.width_pct - 0.01) * 100) / 100);
      else { item.x_pct = Math.max(0, Math.round((item.x_pct - 0.01) * 100) / 100); item.y_pct = Math.max(0, Math.round((item.y_pct - 0.01) * 100) / 100); }
    }
    renderImageUi();
    renderImagePreview();
    renderImageTimeline();
  };
  const finish = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", finish); node.removeEventListener("pointercancel", finish); void recordRecipeEdit(); };
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", finish);
  node.addEventListener("pointercancel", finish);
}
function assertImagesValid() {
  el.imageError.textContent = "";
  if (el.audioMode.value === "extract" || el.frameEnable.checked) return;
  if (imageFieldError || (selectedImage() && imageFields.some((id) => el[id].value === ""))) { el.imageError.textContent = t("image.invalidPosition"); throw new Error(el.imageError.textContent); }
  const frame = imageFrame();
  const duration = editedDuration();
  if (state.imageOverlays.length > 10) throw new Error(t("image.max"));
  for (const item of state.imageOverlays) {
    if (!imageAssetMatches(item)) { el.imageError.textContent = t("image.missing"); throw new Error(el.imageError.textContent); }
    if (!Number.isInteger(item.start_ms) || !Number.isInteger(item.end_ms) || item.start_ms < 0 || item.end_ms <= item.start_ms || item.end_ms > duration) { el.imageError.textContent = t("image.invalidDuration"); throw new Error(el.imageError.textContent); }
    if (![item.x_pct,item.y_pct,item.width_pct,item.opacity].every(Number.isFinite) || item.x_pct < 0 || item.x_pct > 100 || item.y_pct < 0 || item.y_pct > 100 || item.width_pct < 1 || item.width_pct > 100 || item.opacity < 0 || item.opacity > 1 || !frame || !imageGeometry(item, frame.width, frame.height).valid) { el.imageError.textContent = t("image.invalidPosition"); throw new Error(el.imageError.textContent); }
  }
}
function imageErrorMessage(error) {
  const message = String(error?.message || error);
  if (message.includes("Unsupported")) return t("image.unsupported");
  if (message.includes("Maximum")) return t("image.max");
  if (message.includes("does not match") || message.includes("unavailable")) return t("image.missing");
  if (message.includes("position") || message.includes("size")) return t("image.invalidPosition");
  if (message.includes("too large or empty")) return t("image.tooLarge");
  if (message.includes("dimensions are too large")) return t("image.pixels");
  if (message.includes("decoded")) return t("image.decodeFailed");
  return t("image.error");
}
function defaultImageGeometry(width, height) {
  const frame = imageFrame();
  if (!frame) throw new Error(t("image.invalidPosition"));
  const fitHeight = 95 * frame.height / frame.width * width / height;
  for (let units = Math.floor(Math.min(25, fitHeight, 95) * 100); units >= 100; units -= 1) {
    const width_pct = units / 100;
    const x_pct = Math.min(70, Math.floor((100 - width_pct) * 100) / 100);
    for (const y_pct of [5, 0]) {
      const candidate = { image_width: width, image_height: height, x_pct, y_pct, width_pct };
      if (imageGeometry(candidate, frame.width, frame.height).valid) return { x_pct, y_pct, width_pct };
    }
  }
  throw new Error(t("image.invalidPosition"));
}
function openImagePicker(action) { state.imageFileAction = action; el.imageFile.value = ""; el.imageFile.click(); }
el.imageAdd.onclick = () => { if (state.imageOverlays.length >= 10) { el.imageError.textContent = t("image.max"); return; } openImagePicker("add"); };
el.imageSelect.onclick = () => openImagePicker("select");
el.imageReplace.onclick = () => openImagePicker("replace");
el.imageRemove.onclick = () => {
  if (!selectedImage()) return;
  state.imageOverlays = state.imageOverlays.filter((item) => item.id !== state.selectedImageId);
  state.selectedImageId = state.imageOverlays[0]?.id || null;
  imageFieldError = false;
  el.imageError.textContent = "";
  renderImageUi(); renderImageTimeline(); renderImagePreview(); void recordRecipeEdit();
};
for (const [id, direction] of [["imageMoveUp", -1], ["imageMoveDown", 1]]) el[id].onclick = () => { const index = state.imageOverlays.findIndex((item) => item.id === state.selectedImageId); const target = index + direction; if (index < 0 || target < 0 || target >= state.imageOverlays.length) return; [state.imageOverlays[index], state.imageOverlays[target]] = [state.imageOverlays[target], state.imageOverlays[index]]; renderImageUi(); renderImagePreview(); renderImageTimeline(); void recordRecipeEdit(); };
el.imageFile.onchange = async () => {
  const file = el.imageFile.files?.[0];
  if (!file) return;
  const action = state.imageFileAction;
  const target = selectedImage();
  const token = ++state.imageSelectionToken;
  let asset;
  try {
    asset = await decodeImage(file);
    if (token !== state.imageSelectionToken || (action !== "add" && !state.imageOverlays.includes(target))) { releaseImageAsset(asset); return; }
    if (action === "add") {
      if (state.imageOverlays.length >= 10) throw new Error("Maximum image overlays reached.");
      const geometry = defaultImageGeometry(asset.width, asset.height);
      const index = nextImageIndex();
      const item = { id: `image-${index}`, media_id: mediaId(), file_ref: `overlay-image-${index}`, filename: file.name, mime_type: file.type, file_size: file.size, image_width: asset.width, image_height: asset.height, start_ms: 0, end_ms: editedDuration(), ...geometry, opacity: 1 };
      state.imageOverlays.push(item);
      state.selectedImageId = item.id;
      state.imageFiles.set(item.file_ref, asset);
    } else if (target && action === "select") {
      if (file.name !== target.filename || file.type !== target.mime_type || file.size !== target.file_size || asset.width !== target.image_width || asset.height !== target.image_height) throw new Error("Image file does not match the saved image.");
      const old = state.imageFiles.get(target.file_ref);
      if (old) releaseImageAsset(old);
      state.imageFiles.set(target.file_ref, asset);
    } else if (target && action === "replace") {
      const index = nextImageIndex();
      target.file_ref = `overlay-image-${index}`;
      target.filename = file.name;
      target.mime_type = file.type;
      target.file_size = file.size;
      target.image_width = asset.width;
      target.image_height = asset.height;
      const frame = imageFrame();
      if (frame && !imageGeometry(target, frame.width, frame.height).valid) Object.assign(target, defaultImageGeometry(asset.width, asset.height));
      state.imageFiles.set(target.file_ref, asset);
    } else throw new Error("No image selected.");
    asset = null;
    imageFieldError = false;
    el.imageError.textContent = "";
    renderImageUi(); renderImagePreview(); renderImageTimeline(); void recordRecipeEdit();
  } catch (error) {
    if (asset) releaseImageAsset(asset);
    el.imageError.textContent = imageErrorMessage(error);
    log(el.imageError.textContent);
  } finally { el.imageFile.value = ""; }
};
for (const [name, property] of [["X","x_pct"],["Y","y_pct"],["Width","width_pct"],["Opacity","opacity"]]) {
  const range = el[`image${name}Range`], number = el[`image${name}Number`];
  range.addEventListener("input", () => { number.value = range.value; number.dispatchEvent(new Event("input")); });
  range.addEventListener("change", () => { void recordRecipeEdit(); });
  number.addEventListener("input", () => {
    const item = selectedImage(); if (!item) return;
    const value = Number(number.value);
    if (number.value === "" || !Number.isFinite(value)) { imageFieldError = true; el.imageError.textContent = t("image.invalidPosition"); return; }
    item[property] = property === "opacity" ? value / 100 : value;
    imageFieldError = imageFields.some((field) => el[field].value === "");
    if (value >= Number(range.min) && value <= Number(range.max)) range.value = String(value);
    renderImagePreview(); renderImageTimeline();
    try { assertImagesValid(); } catch {}
  });
  number.addEventListener("change", () => { if (!imageFieldError) void recordRecipeEdit(); });
}
for (const [id, property] of [["imageStart","start_ms"],["imageEnd","end_ms"]]) {
  el[id].addEventListener("input", () => {
    const item = selectedImage(); if (!item) return;
    const value = Number(el[id].value);
    if (el[id].value === "" || !Number.isInteger(value)) { imageFieldError = true; el.imageError.textContent = t("image.invalidDuration"); return; }
    item[property] = value;
    imageFieldError = imageFields.some((field) => el[field].value === "");
    renderImagePreview(); renderImageTimeline();
    try { assertImagesValid(); } catch {}
  });
  el[id].addEventListener("change", () => { if (!imageFieldError) void recordRecipeEdit(); });
}
el.imageReset.onclick = () => {
  const item = selectedImage(); if (!item) return;
  try {
    Object.assign(item, { ...defaultImageGeometry(item.image_width, item.image_height), opacity: 1, start_ms: 0, end_ms: editedDuration() });
    imageFieldError = false; el.imageError.textContent = "";
    renderImageUi(); renderImagePreview(); renderImageTimeline(); void recordRecipeEdit();
  } catch (error) { el.imageError.textContent = error.message || t("image.invalidPosition"); }
};
let subtitleInputInvalid = false;
const subtitleCueFields = ["subtitleText", "subtitleStart", "subtitleEnd"];
const subtitleStyleFields = ["subtitleFontSize", "subtitleColor", "subtitleOutlineColor", "subtitleOutlineWidth", "subtitleAlignment", "subtitleBottomMargin"];
function selectedSubtitle() { return state.subtitles.cues.find((cue) => cue.id === state.selectedSubtitleId); }
function nextSubtitleId() { return `subtitle-${++state.subtitleCounter}`; }
function subtitleMessage(error) { return t(error?.message || "subtitle.invalidCues"); }
function assertSubtitlesValid() {
  if (subtitleInputInvalid) throw new Error(t("subtitle.invalidTime"));
  try { validateSubtitles(state.subtitles, editedDuration()); el.subtitleError.textContent = ""; }
  catch (error) { el.subtitleError.textContent = subtitleMessage(error); throw new Error(subtitleMessage(error)); }
}
function refreshSubtitleError() { try { assertSubtitlesValid(); } catch {} }
function renderSubtitles() {
  const ordered = sortedSubtitleCues(state.subtitles.cues);
  el.subtitleTitle.textContent = t("subtitle.titleCount", { count: ordered.length });
  el.subtitleEmpty.hidden = ordered.length > 0;
  el.subtitleList.replaceChildren();
  ordered.forEach((cue, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary${cue.id === state.selectedSubtitleId ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", String(cue.id === state.selectedSubtitleId));
    button.textContent = `${index + 1}. ${formatTime(cue.start_ms)} → ${formatTime(cue.end_ms)}\n${cue.text.slice(0, 70)}`;
    button.disabled = state.running;
    button.onclick = () => { state.selectedSubtitleId = cue.id; subtitleInputInvalid = false; el.subtitleError.textContent = ""; renderSubtitles(); renderSubtitleTimeline(); renderSubtitlePreview(); };
    el.subtitleList.append(button);
  });
  const cue = selectedSubtitle();
  el.subtitleAdd.disabled = !state.meta || state.running || ordered.length >= maxSubtitleCues;
  el.subtitleImportButton.disabled = !state.meta || state.running;
  el.subtitleImportFile.disabled = !state.meta || state.running;
  el.subtitleDelete.disabled = !cue || state.running;
  el.subtitleStyleReset.disabled = !state.meta || state.running;
  subtitleCueFields.forEach((id) => { el[id].disabled = !cue || state.running; });
  subtitleStyleFields.forEach((id) => { el[id].disabled = !state.meta || state.running; });
  if (!subtitleInputInvalid) {
    el.subtitleText.value = cue?.text || "";
    el.subtitleStart.value = cue?.start_ms ?? "";
    el.subtitleEnd.value = cue?.end_ms ?? "";
  }
  const style = state.subtitles.style;
  el.subtitleFontSize.value = style.font_size;
  el.subtitleColor.value = style.color;
  el.subtitleOutlineColor.value = style.outline_color;
  el.subtitleOutlineWidth.value = style.outline_width;
  el.subtitleAlignment.value = style.alignment;
  el.subtitleBottomMargin.value = style.bottom_margin;
  sttRefreshUi();
}
function renderSubtitleTimeline() {
  const duration = editedDuration();
  el.timelineSubtitleTrack.hidden = !state.meta || !state.subtitles.cues.length || duration <= 0;
  el.timelineSubtitleCues.replaceChildren();
  if (el.timelineSubtitleTrack.hidden) return;
  sortedSubtitleCues(state.subtitles.cues).forEach((cue, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-subtitle-cue${cue.id === state.selectedSubtitleId ? " is-selected" : ""}`;
    button.style.left = `${Math.max(0, cue.start_ms / duration * 100)}%`;
    button.style.width = `${Math.max(0, (cue.end_ms - cue.start_ms) / duration * 100)}%`;
    button.textContent = String(index + 1);
    button.setAttribute("aria-label", `${t("subtitle.timeline")} ${index + 1}: ${formatTime(cue.start_ms)} – ${formatTime(cue.end_ms)}`);
    button.onclick = () => { state.selectedSubtitleId = cue.id; subtitleInputInvalid = false; renderSubtitles(); renderSubtitleTimeline(); renderSubtitlePreview(); };
    el.timelineSubtitleCues.append(button);
  });
}
function renderSubtitlePreview() {
  const canvas = el.subtitlePreview;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context || !state.meta || el.inputPreview.hidden) return;
  const now = outputPosition((el.inputPreview.currentTime || 0) * 1000);
  const cue = state.subtitles.cues.find((item) => now !== null && now >= item.start_ms && now < item.end_ms);
  const rect = imageRect();
  const frame = imageFrame();
  if (!cue || !rect || !frame) return;
  context.save();
  context.translate(rect.left * ratio, rect.top * ratio);
  context.scale(rect.width * ratio / frame.width, rect.height * ratio / frame.height);
  paintSubtitle(context, cue, state.subtitles.style, frame.width, frame.height);
  context.restore();
}
function subtitleChanged() { renderSubtitleTimeline(); renderSubtitlePreview(); try { assertSubtitlesValid(); void recordRecipeEdit(); } catch {} }
el.subtitleAdd.onclick = () => {
  if (!state.meta || state.subtitles.cues.length >= maxSubtitleCues) return;
  const duration = editedDuration();
  const start_ms = Math.max(0, Math.min(Math.floor(outputPosition(el.inputPreview.currentTime * 1000) ?? 0), duration - 1));
  const cue = { id: nextSubtitleId(), start_ms, end_ms: Math.min(duration, start_ms + 2000), text: "Subtitle" };
  state.subtitles.cues.push(cue);
  state.selectedSubtitleId = cue.id;
  subtitleInputInvalid = false;
  renderSubtitles(); subtitleChanged();
};
el.subtitleDelete.onclick = () => {
  state.subtitles.cues = state.subtitles.cues.filter((cue) => cue.id !== state.selectedSubtitleId);
  state.selectedSubtitleId = sortedSubtitleCues(state.subtitles.cues)[0]?.id || null;
  subtitleInputInvalid = false;
  renderSubtitles(); subtitleChanged();
};
el.subtitleText.oninput = () => { const cue = selectedSubtitle(); if (!cue) return; cue.text = el.subtitleText.value; subtitleChanged(); };
for (const [id, key] of [["subtitleStart", "start_ms"], ["subtitleEnd", "end_ms"]]) {
  el[id].oninput = () => { subtitleInputInvalid = [el.subtitleStart.value, el.subtitleEnd.value].some((value) => !/^(0|[1-9][0-9]*)$/.test(value.trim())); if (subtitleInputInvalid) el.subtitleError.textContent = t("subtitle.invalidTime"); else refreshSubtitleError(); };
  el[id].onchange = () => { const cue = selectedSubtitle(); if (!cue) return; const value = el[id].value.trim(); if (/^(0|[1-9][0-9]*)$/.test(value)) cue[key] = Number(value); subtitleInputInvalid = [el.subtitleStart.value, el.subtitleEnd.value].some((item) => !/^(0|[1-9][0-9]*)$/.test(item.trim())); if (!subtitleInputInvalid) subtitleChanged(); };
}
for (const [id, key] of [["subtitleFontSize", "font_size"], ["subtitleColor", "color"], ["subtitleOutlineColor", "outline_color"], ["subtitleOutlineWidth", "outline_width"], ["subtitleAlignment", "alignment"], ["subtitleBottomMargin", "bottom_margin"]]) {
  el[id].onchange = () => { const value = el[id].value; state.subtitles.style[key] = el[id].type === "number" ? (/^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : value) : value; subtitleChanged(); };
  if (el[id].type === "color" || el[id].tagName === "SELECT") el[id].oninput = el[id].onchange;
}
el.subtitleStyleReset.onclick = () => { state.subtitles.style = { ...defaultSubtitleStyle }; renderSubtitles(); subtitleChanged(); };
el.subtitleImportButton.onclick = () => el.subtitleImportFile.click();
el.subtitleImportFile.onchange = async () => {
  const file = el.subtitleImportFile.files?.[0]; el.subtitleImportFile.value = "";
  if (!file) return;
  const sourceFile = state.file;
  if (state.subtitles.cues.length && !window.confirm(t("subtitle.importConfirm"))) return;
  try {
    if (!/\.(srt|vtt)$/i.test(file.name) || file.size > 1024 * 1024) throw new Error("subtitle.unsupportedFormat");
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (state.file !== sourceFile || state.running) throw new Error("subtitle.importFailed");
    const cues = parseSubtitleFile(contents, file.name.split(".").pop().toLowerCase(), editedDuration(), nextSubtitleId);
    state.subtitles.cues = cues;
    state.selectedSubtitleId = cues[0]?.id || null;
    subtitleInputInvalid = false;
    renderSubtitles(); subtitleChanged();
  } catch (error) { el.subtitleError.textContent = subtitleMessage(error); log(`${t("subtitle.importFailed")} ${subtitleMessage(error)}`); }
};

function sttErrorKey(error) { return error?.message && /^stt\./.test(error.message) ? error.message : "stt.requestFailed"; }
function sttRefreshUi() {
  sttUi.generate.disabled = !state.file || !state.meta || state.running || sttState.busy;
  sttUi.cancel.disabled = !sttState.jobId;
  sttUi.apply.disabled = !sttState.previewCues.length || sttState.busy || sttState.overflow;
  sttUi.discard.disabled = !sttState.previewCues.length;
  if (!sttState.busy && !sttState.jobId && !sttState.previewCues.length && ["stt.ready", "stt.sourceReady"].includes(sttState.messageKey)) {
    const key = state.file && state.meta ? "stt.sourceReady" : "stt.ready";
    if (key !== sttState.messageKey) sttSetMessage(key);
  }
}
function sttSetMessage(key, values = {}) { sttState.messageKey = key; sttState.messageValues = values; sttUi.message.textContent = t(key, values); }
function sttRefreshLanguage() {
  applyTranslations(sttUi.panel);
  if (sttState.messageKey) sttUi.message.textContent = t(sttState.messageKey, sttState.messageValues);
  sttUi.reviewCount.textContent = sttState.previewCues.length ? t("stt.reviewCount", { count: sttState.previewCues.length }) : t("stt.noCues");
  sttRefreshUi();
}
function sttRenderReview() {
  sttUi.reviewList.replaceChildren();
  sttState.previewCues.forEach((cue, index) => {
    const item = document.createElement("div");
    item.className = "stt-review-item";
    item.textContent = `${index + 1}. ${formatTime(cue.start_ms)} → ${formatTime(cue.end_ms)} · ${cue.text}`;
    sttUi.reviewList.append(item);
  });
  sttUi.reviewCount.textContent = sttState.previewCues.length ? t("stt.reviewCount", { count: sttState.previewCues.length }) : t("stt.noCues");
  sttUi.review.hidden = !sttState.previewCues.length;
  sttRefreshUi();
}
async function invalidateStt(cancel = true) {
  const token = ++sttState.pollToken;
  const jobId = sttState.jobId;
  sttState.jobId = null;
  sttState.busy = false;
  sttState.sourceFile = null;
  sttState.previewCues = [];
  sttState.invalidCount = 0;
  sttState.overflow = false;
  sttRenderReview();
  if (cancel && jobId) { try { await cancelStt(jobId); } catch {} }
  return token;
}
async function pollStt(jobId, sourceFile, token) {
  while (token === sttState.pollToken && sttState.jobId === jobId) {
    const status = await sttJobStatus(jobId);
    if (token !== sttState.pollToken || state.file !== sourceFile) return;
    if (status.status === "queued") sttSetMessage("stt.queued");
    else if (status.status === "running") sttSetMessage("stt.running");
    else if (status.status === "failed") throw new Error("stt.failed");
    else if (status.status === "cancelled") throw new Error("stt.cancelled");
    else if (status.status === "completed") {
      const result = await sttJobResult(jobId);
      if (token !== sttState.pollToken || state.file !== sourceFile) return;
      const converted = convertSttSegments(result.segments, currentTransitionLayout(), currentSpeed(), nextSubtitleId, maxSubtitleCues);
      sttState.previewCues = converted.cues;
      sttState.invalidCount = converted.invalid;
      sttState.overflow = converted.overflow;
      sttState.jobId = null;
      sttState.busy = false;
      sttState.sourceFile = sourceFile;
      sttRenderReview();
      sttSetMessage(converted.cues.length ? "stt.completed" : "stt.noCues");
      if (converted.invalid || converted.overflow) el.subtitleError.textContent = t("stt.invalidCues");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function generateStt() {
  if (!state.file || !state.meta || sttState.busy) return;
  await invalidateStt();
  const sourceFile = state.file;
  const token = sttState.pollToken;
  sttState.busy = true;
  sttState.sourceFile = sourceFile;
  sttRefreshUi();
  sttSetMessage("stt.queued");
  try {
    const submission = await submitStt(sourceFile, sttUi.language.value);
    if (token !== sttState.pollToken || state.file !== sourceFile) return;
    sttState.jobId = submission.job_id;
    await pollStt(submission.job_id, sourceFile, token);
  } catch (error) {
    if (token !== sttState.pollToken) return;
    sttState.jobId = null;
    sttState.busy = false;
    sttSetMessage(sttErrorKey(error));
    sttRefreshUi();
  }
}
async function applySttReview() {
  if (!sttState.previewCues.length || !state.file || !state.meta || state.running || sttState.overflow) return;
  const cues = sttUi.mode.value === "replace" ? sttState.previewCues.map((cue) => ({ ...cue })) : sortedSubtitleCues([...state.subtitles.cues, ...sttState.previewCues.map((cue) => ({ ...cue }))]);
  const subtitles = { cues, style: cloneRecipe(state.subtitles.style) };
  try {
    validateSubtitles(subtitles, editedDuration());
    const draft = buildRecipeFromUi({ ...uiValues(), subtitles });
    const applied = await recordRecipeEdit(draft);
    if (!applied) throw new Error("stt.applyFailed");
    sttState.previewCues = [];
    sttState.sourceFile = null;
    sttRenderReview();
    sttSetMessage("stt.completed");
  } catch (error) {
    sttSetMessage(error.message === "stt.applyFailed" ? "stt.applyFailed" : "stt.invalidCues");
  }
}
sttUi.generate.onclick = () => { void generateStt(); };
sttUi.cancel.onclick = async () => { const jobId = sttState.jobId; await invalidateStt(false); try { if (jobId) await cancelStt(jobId); } catch {} sttSetMessage("stt.cancelled"); sttRefreshUi(); };
sttUi.apply.onclick = () => { void applySttReview(); };
sttUi.discard.onclick = () => { sttState.previewCues = []; sttState.sourceFile = null; sttState.invalidCount = 0; sttState.overflow = false; sttRenderReview(); sttSetMessage("stt.ready"); };
el.file.addEventListener("change", () => { void invalidateStt(); });
el.clear.addEventListener("click", () => { void invalidateStt(); });
el.languageSelect.addEventListener("change", () => { sttRefreshLanguage(); });
applyTranslations(sttUi.panel);
sttRefreshUi();
sttSetMessage(state.file && state.meta ? "stt.sourceReady" : "stt.ready");

const motionKinds = ["text", "image"];
const motionFields = ["Time", "X", "Y", "Scale", "Opacity"];
function motionItem(kind) { return kind === "text" ? state.textOverlays[state.selectedText] : selectedImage(); }
function motionMessage(error) { return t(error?.message && error.message.startsWith("motion.") ? error.message : "motion.invalid"); }
function ensureMotion(item) { if (!item.motion) item.motion = { enabled: false, keyframes: [] }; return item.motion; }
function renderMotionUi(kind) {
  const item = motionItem(kind), prefix = `${kind}Motion`, available = Boolean(item && state.meta && !state.running);
  const motion = item?.motion || { enabled: false, keyframes: [] };
  const points = motionPoints(item || {});
  if (!points.some((point) => point.id === state.selectedMotionIds[kind])) state.selectedMotionIds[kind] = points[0]?.id || null;
  const selected = points.find((point) => point.id === state.selectedMotionIds[kind]);
  el[`${prefix}Enabled`].disabled = !available;
  el[`${prefix}Enabled`].checked = Boolean(motion.enabled);
  el[`${prefix}Add`].disabled = !available || points.length >= 100;
  el[`${prefix}Delete`].disabled = !available || !selected;
  el[`${prefix}Reset`].disabled = !available;
  el[`${prefix}List`].replaceChildren();
  if (!points.length) { const empty = document.createElement("span"); empty.className = "group-help"; empty.textContent = t("motion.empty"); el[`${prefix}List`].appendChild(empty); }
  for (const point of points) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary${point.id === selected?.id ? " is-selected" : ""}`;
    button.textContent = `${formatTime(point.time_ms)} · X ${point.x}% · Y ${point.y}% · ${point.scale}% · ${point.opacity}%`;
    button.setAttribute("aria-pressed", String(point.id === selected?.id));
    button.onclick = () => { state.selectedMotionIds[kind] = point.id; state.motionInputInvalid[kind] = false; el[`${prefix}Error`].textContent = ""; renderMotionUi(kind); renderMotionTimeline(); };
    el[`${prefix}List`].appendChild(button);
  }
  for (const field of motionFields) {
    const input = el[`${prefix}${field}`];
    input.disabled = !available || !selected;
    if (!state.motionInputInvalid[kind] && document.activeElement !== input) input.value = selected ? selected[field === "Time" ? "time_ms" : field.toLowerCase()] : "";
  }
  if (!state.motionInputInvalid[kind]) el[`${prefix}Error`].textContent = "";
}
function assertMotionValid() {
  const frame = imageFrame();
  if (!frame) return;
  let count = 0;
  const fps = state.meta?.fps || 30;
  for (const kind of motionKinds) for (const item of kind === "text" ? state.textOverlays : state.imageOverlays) {
    try {
      validateMotion(item, editedDuration(), frame, kind);
      if (item.motion?.enabled && item.motion.keyframes?.length && !el.frameEnable.checked && el.audioMode.value !== "extract") {
        count += motionFrameCount(item, fps);
        if (count > maxMotionFrames || frame.width * frame.height > 4_000_000) throw new Error("motion.memoryLimit");
      }
    } catch (error) { el[`${kind}MotionError`].textContent = motionMessage(error); throw new Error(motionMessage(error)); }
  }
  if (motionKinds.some((kind) => state.motionInputInvalid[kind])) throw new Error(t("motion.invalid"));
  for (const kind of motionKinds) el[`${kind}MotionError`].textContent = "";
}
function renderMotionTimeline() {
  const duration = editedDuration();
  for (const kind of motionKinds) {
    const track = el[`timeline${kind[0].toUpperCase()}${kind.slice(1)}MotionTrack`];
    const layer = el[`timeline${kind[0].toUpperCase()}${kind.slice(1)}MotionPoints`];
    const item = motionItem(kind), points = item ? motionPoints(item) : [];
    layer.replaceChildren();
    track.hidden = !state.meta || !item || !points.length || duration <= 0;
    if (track.hidden) continue;
    const range = document.createElement("span");
    range.className = "timeline-image-clip motion-timeline-range";
    range.style.left = `${Math.max(0, item.start_ms / duration * 100)}%`;
    range.style.width = `${Math.max(0, (item.end_ms - item.start_ms) / duration * 100)}%`;
    layer.appendChild(range);
    for (const point of points) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `motion-timeline-point${point.id === state.selectedMotionIds[kind] ? " is-selected" : ""}`;
      marker.style.left = `${Math.max(0, Math.min(100, point.time_ms / duration * 100))}%`;
      marker.title = `${t("motion.time")}: ${point.time_ms} ms`;
      marker.setAttribute("aria-label", marker.title);
      marker.onclick = () => { state.selectedMotionIds[kind] = point.id; renderMotionUi(kind); renderMotionTimeline(); };
      layer.appendChild(marker);
    }
  }
}
for (const kind of motionKinds) {
  const prefix = `${kind}Motion`;
  el[`${prefix}Enabled`].onchange = () => { const item = motionItem(kind); if (!item) return; ensureMotion(item).enabled = el[`${prefix}Enabled`].checked; syncTimeline(); void recordRecipeEdit(); };
  el[`${prefix}Add`].onclick = () => {
    const item = motionItem(kind); if (!item) return;
    const motion = ensureMotion(item);
    if (motion.keyframes.length >= 100) { el[`${prefix}Error`].textContent = t("motion.max"); return; }
    const time = Math.max(item.start_ms, Math.min(item.end_ms, Math.round(outputPosition(el.inputPreview.currentTime * 1000) ?? item.start_ms)));
    if (motion.keyframes.some((point) => point.time_ms === time)) { el[`${prefix}Error`].textContent = t("motion.duplicateTime"); return; }
    const values = motionAt(item, time);
    const id = `kf-${++state.motionCounter}`;
    motion.keyframes.push({ id, time_ms: time, x: values.x, y: values.y, scale: values.scale, opacity: values.opacity });
    state.selectedMotionIds[kind] = id;
    renderMotionUi(kind); syncTimeline(); void recordRecipeEdit();
  };
  el[`${prefix}Delete`].onclick = () => { const item = motionItem(kind); if (!item) return; ensureMotion(item).keyframes = item.motion.keyframes.filter((point) => point.id !== state.selectedMotionIds[kind]); state.selectedMotionIds[kind] = null; renderMotionUi(kind); syncTimeline(); void recordRecipeEdit(); };
  el[`${prefix}Reset`].onclick = () => { const item = motionItem(kind); if (!item) return; item.motion = { enabled: false, keyframes: [] }; state.selectedMotionIds[kind] = null; state.motionInputInvalid[kind] = false; renderMotionUi(kind); syncTimeline(); void recordRecipeEdit(); };
  for (const field of motionFields) el[`${prefix}${field}`].addEventListener("change", () => {
    const item = motionItem(kind), point = item?.motion?.keyframes?.find((entry) => entry.id === state.selectedMotionIds[kind]);
    if (!point) return;
    const input = el[`${prefix}${field}`], value = Number(input.value), key = field === "Time" ? "time_ms" : field.toLowerCase();
    if (!input.value.trim() || !Number.isFinite(value) || (field === "Time" && !Number.isInteger(value))) { state.motionInputInvalid[kind] = true; el[`${prefix}Error`].textContent = t("motion.invalid"); return; }
    const previous = point[key]; point[key] = value;
    try { validateMotion(item, editedDuration(), imageFrame(), kind); state.motionInputInvalid[kind] = false; renderMotionUi(kind); syncTimeline(); void recordRecipeEdit(); }
    catch (error) { point[key] = previous; state.motionInputInvalid[kind] = true; el[`${prefix}Error`].textContent = motionMessage(error); }
  });
}

const textFields = ["textContent","textAlign","textStart","textEnd","textSize","textColor","textX","textY"];
function renderTexts() {
  el.textList.replaceChildren();
  state.textOverlays.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary${index === state.selectedText ? " is-selected" : ""}`;
    button.textContent = item.text.replace(/\s+/g, " ").slice(0, 30) || t("text.untitled");
    button.onclick = () => { state.selectedText = index; renderTexts(); syncTimeline(); };
    el.textList.appendChild(button);
  });
  const item = state.textOverlays[state.selectedText];
  el.textDelete.disabled = !item || state.running;
  textFields.forEach((id) => { el[id].disabled = !item || state.running; });
  if (!item) { textFields.forEach((id) => { if (id !== "textColor") el[id].value = ""; }); renderMotionUi("text"); return; }
  el.textContent.value = item.text; el.textAlign.value = item.align; el.textStart.value = item.start_ms; el.textEnd.value = item.end_ms; el.textSize.value = item.font_size; el.textColor.value = item.color; el.textX.value = Math.round(item.x * 100); el.textY.value = Math.round(item.y * 100);
  renderMotionUi("text");
}
function renderTextTimeline() {
  el.timelineTexts.replaceChildren();
  const duration = editedDuration();
  if (!duration) return;
  state.textOverlays.forEach((item, index) => {
    const range = document.createElement("span");
    range.className = `timeline-text-range${index === state.selectedText ? " is-selected" : ""}`;
    range.style.left = `${item.start_ms / duration * 100}%`;
    range.style.width = `${(item.end_ms - item.start_ms) / duration * 100}%`;
    el.timelineTexts.appendChild(range);
  });
}
function renderTextPreview() {
  const canvas = el.textPreview;
  const rect = { width: canvasEnabled() ? el.previewStage.clientWidth : el.inputPreview.clientWidth, height: canvasEnabled() ? el.previewStage.clientHeight : el.inputPreview.clientHeight };
  const host = { width: canvas.parentElement.clientWidth, height: canvas.parentElement.clientHeight };
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(host.width * scale));
  canvas.height = Math.max(1, Math.round(host.height * scale));
  const context = canvas.getContext("2d");
  if (!state.meta || el.inputPreview.hidden) return;
  const videoWidth = canvasEnabled() ? rect.width : Math.min(rect.width, rect.height * state.meta.width / state.meta.height);
  const videoHeight = canvasEnabled() ? rect.height : Math.min(rect.height, rect.width * state.meta.height / state.meta.width);
  const left = (rect.width - videoWidth) / 2;
  const top = (rect.height - videoHeight) / 2;
  const now = outputPosition(el.inputPreview.currentTime * 1000);
  state.textOverlays.forEach((item) => {
    if (now === null || now < item.start_ms || now >= item.end_ms) return;
    if (item.motion?.enabled && item.motion.keyframes?.length) {
      const values = motionAt(item, now);
      const frame = imageFrame(), target = imageRect();
      if (!frame || !target) return;
      context.save();
      context.translate(target.left * scale, target.top * scale);
      context.scale(target.width * scale / frame.width, target.height * scale / frame.height);
      paintMotionText(context, { ...item, font_size: item.font_size * frame.height / state.meta.height }, values, frame.width, frame.height);
      context.restore();
      return;
    }
    const fontSize = item.font_size * videoHeight / state.meta.height;
    context.font = `${fontSize * scale}px sans-serif`;
    context.fillStyle = item.color;
    context.textAlign = item.align;
    context.textBaseline = "top";
    item.text.split("\n").forEach((line, index) => context.fillText(line, (left + item.x * videoWidth) * scale, (top + item.y * videoHeight + index * fontSize * 1.2) * scale));
  });
}
el.textAdd.onclick = () => {
  if (!state.meta || state.textOverlays.length >= 20) return;
  const duration = editedDuration(); const start = Math.min(Math.floor(outputPosition(el.inputPreview.currentTime * 1000) ?? 0), duration - 1);
  state.textOverlays.push({ text: t("text.default"), start_ms: start, end_ms: Math.min(duration, start + 3000), x: 0.5, y: 0.8, font_size: 48, color: "#ffffff", align: "center" });
  state.selectedText = state.textOverlays.length - 1; renderTexts(); el.textAdd.disabled = state.textOverlays.length >= 20; syncTimeline(); void recordRecipeEdit();
};
el.textDelete.onclick = () => { if (state.selectedText < 0) return; state.textOverlays.splice(state.selectedText, 1); state.selectedText = Math.min(state.selectedText, state.textOverlays.length - 1); renderTexts(); syncTimeline(); void recordRecipeEdit(); };
textFields.forEach((id) => el[id].addEventListener("change", () => {
  const item = state.textOverlays[state.selectedText]; if (!item) return;
  const next = { ...item, text: el.textContent.value, align: el.textAlign.value, start_ms: Number(el.textStart.value), end_ms: Number(el.textEnd.value), font_size: Number(el.textSize.value), color: el.textColor.value, x: Number(el.textX.value) / 100, y: Number(el.textY.value) / 100 };
  if (!next.text.trim() || next.text.length > 500 || next.start_ms < 0 || next.end_ms > editedDuration() || next.start_ms >= next.end_ms || next.font_size < 8 || next.font_size > 300 || next.x < 0 || next.x > 1 || next.y < 0 || next.y > 1) { log(t("text.invalid")); applyRecipeToUi(state.recipeNormalized); syncTimeline(); return; }
  state.textOverlays[state.selectedText] = next; renderTexts(); syncTimeline(); void recordRecipeEdit();
}));
textFields.forEach((id) => el[id].addEventListener("input", () => {
  const item = state.textOverlays[state.selectedText]; if (!item) return;
  item.text = el.textContent.value;
  item.align = el.textAlign.value;
  item.font_size = Number(el.textSize.value) || item.font_size;
  item.color = el.textColor.value;
  item.x = Number(el.textX.value) / 100;
  item.y = Number(el.textY.value) / 100;
  item.start_ms = Number(el.textStart.value);
  item.end_ms = Number(el.textEnd.value);
  renderTextPreview(); renderTextTimeline();
}));
window.addEventListener("resize", () => { fitSourcePreview(); renderTextPreview(); renderImagePreview(); renderSubtitlePreview(); renderAudioKeyframeGraphs(); });
let previewFrameToken = 0;
function previewFrame(token) {
  if (token !== previewFrameToken || el.inputPreview.paused) return;
  renderTextPreview(); renderImagePreview(); renderSubtitlePreview(); renderTransitionPreview(); renderMusicTimeline(); renderFadePreview(); renderColorPreview(); syncMusicPreview();
  if (el.inputPreview.requestVideoFrameCallback) el.inputPreview.requestVideoFrameCallback(() => previewFrame(token));
  else requestAnimationFrame(() => previewFrame(token));
}
el.inputPreview.addEventListener("play", () => { const token = ++previewFrameToken; requestAnimationFrame(() => previewFrame(token)); });
el.inputPreview.addEventListener("pause", () => { previewFrameToken += 1; });

function ensureAudioGraph() {
  if (audioGraph) return audioGraph.context.resume().catch((error) => { el.audioKeyframeWarning.hidden = false; log(`${t("keyframe.previewUnavailable")}: ${error.message || error}`); });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) { el.audioKeyframeWarning.hidden = false; log(t("keyframe.previewUnavailable")); return Promise.resolve(); }
  try {
    const context = new AudioContextClass();
    const source = context.createGain();
    const music = context.createGain();
    context.createMediaElementSource(el.inputPreview).connect(source).connect(context.destination);
    context.createMediaElementSource(el.musicPreview).connect(music).connect(context.destination);
    audioGraph = { context, source, music, transition: null };
    el.audioKeyframeWarning.hidden = true;
    if (state.videoTransitions.some((item) => item.type !== "none")) ensureTransitionAudioNode();
    syncMusicPreview();
    return context.resume().catch((error) => { el.audioKeyframeWarning.hidden = false; log(`${t("keyframe.previewUnavailable")}: ${error.message || error}`); });
  } catch (error) { el.audioKeyframeWarning.hidden = false; log(`${t("keyframe.previewUnavailable")}: ${error.message || error}`); return Promise.resolve(); }
}
function releaseMusicUrl() {
  el.musicPreview.pause();
  el.musicPreview.removeAttribute("src");
  el.musicPreview.load();
  if (state.activeMusicUrl) URL.revokeObjectURL(state.activeMusicUrl);
  state.activeMusicUrl = null;
  state.activeMusicId = null;
}
function resetMusic() {
  releaseMusicUrl();
  state.musicFiles.clear();
  state.audioMix = null;
  state.musicCounter = 0;
  state.musicSelectionToken += 1;
  el.musicFile.value = "";
  renderMusicUi();
}
function musicTrack() { return state.audioMix?.enabled ? state.audioMix.tracks?.[0] : null; }
function keptVideoRanges() {
  if (!state.meta) return [];
  const trim = timelineTrim();
  const cuts = mergeSegments(state.removeSegments);
  const ranges = [];
  let cursor = trim.startMs;
  for (const cut of cuts) {
    if (cut.end_ms <= cursor) continue;
    if (cut.start_ms > cursor) ranges.push([cursor, Math.min(cut.start_ms, trim.endMs)]);
    cursor = Math.max(cursor, cut.end_ms);
    if (cursor >= trim.endMs) break;
  }
  if (cursor < trim.endMs) ranges.push([cursor, trim.endMs]);
  return ranges.filter(([start, end]) => start < end);
}
function currentTransitionLayout() { return transitionLayout(keptVideoRanges(), currentSpeed(), state.videoTransitions); }
function editedDuration() { return currentTransitionLayout().duration; }
function outputPosition(sourceMs) { return outputAtSource(currentTransitionLayout(), sourceMs, currentSpeed()); }
function renderMusicUi() {
  const track = musicTrack();
  const file = track && state.musicFiles.get(track.source_id);
  const available = Boolean(state.meta && !state.running);
  el.musicFile.disabled = !available;
  el.musicReplace.disabled = !available;
  el.musicRemove.disabled = !available || !track;
  el.musicSourceVolume.disabled = !available || !state.meta?.has_audio;
  for (const id of ["musicVolume","musicStart","musicTrimStart","musicTrimEnd","musicFadeIn","musicFadeOut"]) el[id].disabled = !available || !track;
  el.musicSourceVolume.value = Math.round((state.audioMix?.source_volume ?? 1) * 100);
  el.musicSourceVolumeValue.textContent = `${el.musicSourceVolume.value}%`;
  if (track) {
    el.musicVolume.value = Math.round(track.volume * 100);
    el.musicStart.value = track.start_ms;
    el.musicTrimStart.value = track.trim_start_ms;
    el.musicTrimEnd.value = track.trim_end_ms;
    el.musicFadeIn.value = track.fade_in_ms;
    el.musicFadeOut.value = track.fade_out_ms;
  } else {
    el.musicVolume.value = 35;
    el.musicStart.value = 0;
    el.musicTrimStart.value = 0;
    el.musicTrimEnd.value = "";
    el.musicFadeIn.value = 0;
    el.musicFadeOut.value = 0;
  }
  el.musicVolumeValue.textContent = `${el.musicVolume.value}%`;
  el.musicFileStatus.textContent = track ? file ? t("music.fileStatus", { name: file.name, duration: formatDuration(track.duration_ms) }) : t("music.unavailable") : state.meta && !state.meta.has_audio ? t("music.noSource") : t("music.none");
  if (track?.source_id !== state.activeMusicId) {
    releaseMusicUrl();
    if (file) {
      state.activeMusicId = track.source_id;
      state.activeMusicUrl = URL.createObjectURL(file);
      el.musicPreview.src = state.activeMusicUrl;
      el.musicPreview.load();
    }
  }
  syncMusicPreview();
  renderMusicTimeline();
}
function sourceForOutput(outputMs) { return sourceAtOutput(currentTransitionLayout(), outputMs, currentSpeed()); }
function positionForOutputClock() { return outputPosition(Math.round((el.inputPreview.currentTime || 0) * 1000)) ?? 0; }
function renderMusicTimeline() {
  const track = musicTrack();
  const duration = editedDuration();
  el.timelineMusicTrack.hidden = !state.meta;
  const outputCurrent = Math.max(0, Math.min(duration, positionForOutputClock()));
  el.timelineOutputCurrent.textContent = formatTime(outputCurrent);
  el.timelineOutputTotal.textContent = formatTime(duration);
  el.timelineOutputMiddle.textContent = formatTime(Math.round(duration / 2));
  el.timelineOutputEnd.textContent = formatTime(duration);
  el.timelineOutputPlayhead.style.left = `${duration ? outputCurrent / duration * 100 : 0}%`;
  el.timelineOutputTrack.setAttribute("aria-valuemax", String(duration));
  el.timelineOutputTrack.setAttribute("aria-valuenow", String(Math.round(outputCurrent)));
  el.timelineOutputTrack.setAttribute("aria-valuetext", `${formatTime(outputCurrent)} / ${formatTime(duration)}`);
  el.timelineOutputTrack.classList.toggle("is-disabled", !state.meta || state.running);
  el.timelineMusicClip.hidden = !track || !duration;
  if (!duration) return;
  const position = outputPosition(Math.round((el.inputPreview.currentTime || 0) * 1000));
  el.timelineMusicPlayhead.style.left = `${Math.max(0, Math.min(100, (position ?? 0) / duration * 100))}%`;
  if (!track) return;
  const length = Math.max(0, Math.min(track.trim_end_ms - track.trim_start_ms, duration - track.start_ms));
  el.timelineMusicClip.style.left = `${track.start_ms / duration * 100}%`;
  el.timelineMusicClip.style.width = `${length / duration * 100}%`;
  el.timelineMusicClip.classList.toggle("is-selected", Boolean(state.musicFiles.get(track.source_id)));
  el.timelineMusicClip.textContent = state.musicFiles.get(track.source_id)?.name || t("music.unavailable");
}
function syncMusicPreview() {
  if (!state.meta) return;
  const muted = el.audioMode.value === "mute";
  const outputMs = positionForOutputClock();
  const originalAutomation = keyframeVolume(state.audioKeyframes.original, outputMs) / 100 * (canvasEnabled() ? Number(el.previewVolume.value) : 1);
  const musicAutomation = keyframeVolume(state.audioKeyframes.background_music, outputMs) / 100;
  if (audioGraph) {
    const transitionState = transitionRenderer.getState(); const sourceGain = (state.audioMix?.source_volume ?? 1) * originalAutomation; audioGraph.source.gain.setTargetAtTime(muted || !state.meta.has_audio ? 0 : sourceGain * (transitionState.active && transitionState.ready ? transitionState.mainGain : 1), audioGraph.context.currentTime, 0.005); if (audioGraph.transition) audioGraph.transition.gain.setTargetAtTime(muted || !state.meta.has_audio || !transitionState.ready ? 0 : sourceGain * transitionState.otherGain, audioGraph.context.currentTime, 0.005);
    el.inputPreview.muted = false;
    el.inputPreview.volume = 1;
  } else {
    el.inputPreview.muted = muted;
    el.inputPreview.volume = Math.min(1, (state.audioMix?.source_volume ?? 1) * originalAutomation);
  }
  const track = musicTrack();
  const music = el.musicPreview;
  const position = outputPosition(Math.round(el.inputPreview.currentTime * 1000));
  const length = track ? Math.max(0, Math.min(track.trim_end_ms - track.trim_start_ms, editedDuration() - track.start_ms)) : 0;
  const relative = position === null || !track ? -1 : position - track.start_ms;
  if (!track || !state.musicFiles.has(track.source_id) || muted || el.audioMode.value === "extract" || el.inputPreview.paused || relative < 0 || relative >= length) { music.pause(); return; }
  const fadeIn = track.fade_in_ms ? Math.min(1, relative / track.fade_in_ms) : 1;
  const fadeOut = track.fade_out_ms ? Math.min(1, (length - relative) / track.fade_out_ms) : 1;
  const gain = track.volume * musicAutomation * Math.max(0, Math.min(fadeIn, fadeOut));
  if (audioGraph) { audioGraph.music.gain.setTargetAtTime(gain, audioGraph.context.currentTime, 0.005); music.volume = 1; }
  else music.volume = Math.min(1, gain);
  const target = (track.trim_start_ms + relative) / 1000;
  if (music.readyState < 1) return;
  if (music.readyState >= 1 && Math.abs(music.currentTime - target) > 0.15) music.currentTime = target;
  if (music.paused) void music.play().catch((error) => { music.pause(); log(`${t("music.error")}: ${error.message || error}`); });
}
function skipRemovedDuringPlayback() {
  if (el.inputPreview.paused || !state.meta) return;
  const now = el.inputPreview.currentTime * 1000;
  const ranges = keptVideoRanges();
  const next = ranges.find(([start, end]) => now < end && now >= start - 30);
  if (next) return;
  const future = ranges.find(([start]) => start > now);
  if (future) { const index = ranges.indexOf(future); const previous = currentTransitionLayout().boundaries[index - 1]; el.inputPreview.currentTime = (future[0] + (previous?.duration || 0) * currentSpeed()) / 1000; }
  else el.inputPreview.pause();
}
async function readAudioDuration(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!file.size || !["mp3","m4a","aac","wav","ogg","oga","webm"].includes(extension)) throw new Error(t("music.unsupported"));
  const url = URL.createObjectURL(file);
  const probe = document.createElement("audio");
  probe.preload = "metadata";
  try {
    const duration = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(t("music.unsupported"))), 15000);
      probe.onloadedmetadata = () => { clearTimeout(timer); resolve(probe.duration); };
      probe.onerror = () => { clearTimeout(timer); reject(new Error(t("music.unsupported"))); };
      probe.src = url;
    });
    const ms = Math.floor(duration * 1000);
    if (!Number.isFinite(ms) || ms <= 0 || ms > 86400000) throw new Error(t("music.invalidDuration"));
    return ms;
  } finally { probe.removeAttribute("src"); probe.load(); URL.revokeObjectURL(url); }
}
el.musicReplace.onclick = () => el.musicFile.click();
el.musicRemove.onclick = () => {
  if (!musicTrack()) return;
  state.audioMix = state.audioMix?.source_volume !== 1 ? { enabled: true, source_volume: state.audioMix.source_volume, tracks: [] } : null;
  renderMusicUi(); void recordRecipeEdit();
};
el.musicFile.onchange = async () => {
  const file = el.musicFile.files?.[0]; if (!file || !state.meta) return;
  const selectionToken = ++state.musicSelectionToken;
  try {
    const duration = await readAudioDuration(file);
    if (selectionToken !== state.musicSelectionToken || !state.meta) return;
    const source_id = `music_${++state.musicCounter}`;
    state.musicFiles.set(source_id, file);
    state.audioMix = { enabled: true, source_volume: state.audioMix?.source_volume ?? 1, tracks: [{ source_id, media_id: mediaId(), duration_ms: duration, start_ms: 0, trim_start_ms: 0, trim_end_ms: duration, volume: 0.35, fade_in_ms: 0, fade_out_ms: 0 }] };
    renderMusicUi(); await ensureAudioGraph(); await recordRecipeEdit();
  } catch (error) { log(error.message || t("music.error")); }
  finally { el.musicFile.value = ""; }
};
for (const id of ["musicSourceVolume","musicVolume","musicStart","musicTrimStart","musicTrimEnd","musicFadeIn","musicFadeOut"]) {
  el[id].addEventListener("input", () => {
    if (id === "musicSourceVolume") {
      state.audioMix = state.audioMix || { enabled: true, source_volume: 1, tracks: [] };
      state.audioMix.source_volume = Number(el[id].value) / 100;
      el.musicSourceVolumeValue.textContent = `${el[id].value}%`;
    } else {
      const track = musicTrack(); if (!track) return;
      const key = { musicVolume: "volume", musicStart: "start_ms", musicTrimStart: "trim_start_ms", musicTrimEnd: "trim_end_ms", musicFadeIn: "fade_in_ms", musicFadeOut: "fade_out_ms" }[id];
      track[key] = id === "musicVolume" ? Number(el[id].value) / 100 : Number(el[id].value);
      if (id === "musicVolume") el.musicVolumeValue.textContent = `${el[id].value}%`;
    }
    syncMusicPreview(); renderMusicTimeline();
  });
  el[id].addEventListener("change", () => { void recordRecipeEdit(); });
}
el.audioMode.addEventListener("change", () => { syncMusicPreview(); void recordRecipeEdit(); });
el.inputPreview.addEventListener("play", () => { void ensureAudioGraph(); });
el.inputPreview.addEventListener("timeupdate", skipRemovedDuringPlayback);
el.inputPreview.addEventListener("seeked", syncMusicPreview);
el.musicPreview.addEventListener("loadedmetadata", syncMusicPreview);
el.inputPreview.addEventListener("pause", () => el.musicPreview.pause());

let keyframeInputInvalid = false;
let keyframeInputErrorKey = "keyframe.invalidTime";
const keyframePrefix = { original: "originalKeyframe", background_music: "musicKeyframe" };
el.originalKeyframeGraph.closest("details").addEventListener("toggle", renderAudioKeyframeGraphs);
function keyframeFieldError() {
  for (const name of audioKeyframeTracks) {
    if (!selectedKeyframe(name)) continue;
    const prefix = keyframePrefix[name], time = el[`${prefix}Time`].value.trim(), volume = el[`${prefix}Volume`].value.trim();
    if (!/^(0|[1-9][0-9]*)$/.test(time)) return "keyframe.invalidTime";
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(volume)) return "keyframe.invalidVolume";
  }
  return "";
}
function selectedKeyframe(name) { return state.audioKeyframes[name].keyframes.find((point) => point.id === state.selectedKeyframeIds[name]); }
function nextKeyframeId(name) { return `${name.replace("_", "-")}-kf-${++state.keyframeCounters[name]}`; }
function assertAudioKeyframesValid() {
  if (keyframeInputInvalid) { el.audioKeyframeError.textContent = t(keyframeInputErrorKey); throw new Error(el.audioKeyframeError.textContent); }
  try { validateAudioKeyframes(state.audioKeyframes, editedDuration()); el.audioKeyframeError.textContent = ""; }
  catch (error) { el.audioKeyframeError.textContent = t(error.message); throw new Error(el.audioKeyframeError.textContent); }
}
function refreshAudioKeyframeError() { try { assertAudioKeyframesValid(); } catch {} }
function renderAudioKeyframes() {
  for (const name of audioKeyframeTracks) {
    const prefix = keyframePrefix[name], track = state.audioKeyframes[name], selected = selectedKeyframe(name);
    el[`${prefix}Enabled`].checked = track.enabled;
    el[`${prefix}Enabled`].disabled = !state.meta || state.running;
    el[`${prefix}Add`].disabled = !state.meta || state.running || track.keyframes.length >= 100;
    el[`${prefix}Delete`].disabled = !selected || state.running;
    el[`${prefix}Reset`].disabled = !state.meta || state.running;
    el[`${prefix}Time`].disabled = !selected || state.running;
    el[`${prefix}Volume`].disabled = !selected || state.running;
    el[`${prefix}Empty`].hidden = Boolean(track.keyframes.length);
    el[`${prefix}List`].replaceChildren();
    sortedKeyframes(track).forEach((point) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `secondary${point.id === state.selectedKeyframeIds[name] ? " is-selected" : ""}`;
      button.textContent = `${formatTime(point.time_ms)} · ${point.volume_percent}%`;
      button.setAttribute("aria-pressed", String(point.id === state.selectedKeyframeIds[name]));
      button.disabled = state.running;
      button.onclick = () => { if (keyframeInputInvalid) return; state.selectedKeyframeIds[name] = point.id; renderAudioKeyframes(); renderAudioKeyframeTimeline(); };
      el[`${prefix}List`].append(button);
    });
    if (!keyframeInputInvalid) {
      el[`${prefix}Time`].value = selected?.time_ms ?? "";
      el[`${prefix}Volume`].value = selected?.volume_percent ?? "";
    }
  }
  renderAudioKeyframeGraphs();
}
function renderAudioKeyframeTimeline() {
  const duration = editedDuration();
  for (const name of audioKeyframeTracks) {
    const track = state.audioKeyframes[name];
    const root = name === "original" ? el.timelineOriginalAutomation : el.timelineMusicAutomation;
    const layer = name === "original" ? el.timelineOriginalAutomationPoints : el.timelineMusicAutomationPoints;
    root.hidden = !state.meta || (!track.enabled && !track.keyframes.length) || duration <= 0;
    layer.replaceChildren();
    if (root.hidden) continue;
    sortedKeyframes(track).forEach((point) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `timeline-automation-point${point.id === state.selectedKeyframeIds[name] ? " is-selected" : ""}`;
      marker.style.left = `${Math.max(0, Math.min(100, point.time_ms / duration * 100))}%`;
      marker.disabled = state.running;
      marker.setAttribute("aria-label", `${t(name === "original" ? "keyframe.original" : "keyframe.music")}: ${formatTime(point.time_ms)} · ${point.volume_percent}%`);
      marker.onclick = () => { if (keyframeInputInvalid) return; state.selectedKeyframeIds[name] = point.id; renderAudioKeyframes(); renderAudioKeyframeTimeline(); };
      layer.append(marker);
    });
  }
}
function renderAudioKeyframeGraphs() {
  if (!el.originalKeyframeGraph.closest("details").open) return;
  for (const name of audioKeyframeTracks) {
    const canvas = el[`${keyframePrefix[name]}Graph`];
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(160 * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext("2d");
    if (!context) continue;
    const styles = getComputedStyle(document.documentElement);
    const duration = Math.max(1, editedDuration());
    const margin = 16 * ratio;
    const x = (time) => margin + Math.max(0, Math.min(duration, time)) / duration * (width - margin * 2);
    const y = (volume) => height - margin - volume / 200 * (height - margin * 2);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = styles.getPropertyValue("--color-border-strong").trim();
    context.beginPath();
    for (const level of [0, 100, 200]) { context.moveTo(margin, y(level)); context.lineTo(width - margin, y(level)); }
    context.stroke();
    context.strokeStyle = styles.getPropertyValue("--color-playhead").trim();
    context.beginPath(); context.moveTo(x(positionForOutputClock()), margin); context.lineTo(x(positionForOutputClock()), height - margin); context.stroke();
    const points = sortedKeyframes(state.audioKeyframes[name]);
    context.strokeStyle = styles.getPropertyValue("--color-primary").trim();
    context.lineWidth = 2 * ratio;
    context.beginPath();
    if (points.length) { context.moveTo(x(0), y(points[0].volume_percent)); for (const point of points) context.lineTo(x(point.time_ms), y(point.volume_percent)); context.lineTo(x(duration), y(points[points.length - 1].volume_percent)); }
    else { context.moveTo(x(0), y(100)); context.lineTo(x(duration), y(100)); }
    context.stroke();
    for (const point of points) { context.fillStyle = styles.getPropertyValue(point.id === state.selectedKeyframeIds[name] ? "--color-warning" : "--color-primary").trim(); context.beginPath(); context.arc(x(point.time_ms), y(point.volume_percent), 5 * ratio, 0, Math.PI * 2); context.fill(); }
  }
}
function audioKeyframeChanged() { for (const name of audioKeyframeTracks) state.audioKeyframes[name].keyframes = sortedKeyframes(state.audioKeyframes[name]); renderAudioKeyframes(); renderAudioKeyframeTimeline(); syncMusicPreview(); refreshAudioKeyframeError(); }
for (const name of audioKeyframeTracks) {
  const prefix = keyframePrefix[name], track = () => state.audioKeyframes[name];
  el[`${prefix}Enabled`].onchange = () => { track().enabled = el[`${prefix}Enabled`].checked; audioKeyframeChanged(); void recordRecipeEdit(); };
  el[`${prefix}Add`].onclick = () => {
    if (!state.meta || track().keyframes.length >= 100) return;
    const time_ms = Math.round(positionForOutputClock());
    if (track().keyframes.some((point) => point.time_ms === time_ms)) { el.audioKeyframeError.textContent = t("keyframe.duplicateTime"); return; }
    const point = { id: nextKeyframeId(name), time_ms, volume_percent: 100 };
    track().keyframes.push(point); state.selectedKeyframeIds[name] = point.id; track().enabled = true;
    audioKeyframeChanged(); void recordRecipeEdit();
  };
  el[`${prefix}Delete`].onclick = () => { track().keyframes = track().keyframes.filter((point) => point.id !== state.selectedKeyframeIds[name]); state.selectedKeyframeIds[name] = sortedKeyframes(track())[0]?.id || null; keyframeInputInvalid = false; audioKeyframeChanged(); void recordRecipeEdit(); };
  el[`${prefix}Reset`].onclick = () => { track().enabled = false; track().keyframes = []; state.selectedKeyframeIds[name] = null; keyframeInputInvalid = false; audioKeyframeChanged(); void recordRecipeEdit(); };
  for (const [field, property] of [["Time", "time_ms"], ["Volume", "volume_percent"]]) {
    const input = el[`${prefix}${field}`];
    input.oninput = () => { keyframeInputErrorKey = keyframeFieldError(); keyframeInputInvalid = Boolean(keyframeInputErrorKey); if (keyframeInputInvalid) el.audioKeyframeError.textContent = t(keyframeInputErrorKey); else refreshAudioKeyframeError(); };
    input.onchange = () => { const point = selectedKeyframe(name); if (!point) return; const value = input.value.trim(); if (field === "Time" ? /^(0|[1-9][0-9]*)$/.test(value) : /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) point[property] = Number(value); keyframeInputErrorKey = keyframeFieldError(); keyframeInputInvalid = Boolean(keyframeInputErrorKey); if (!keyframeInputInvalid) { audioKeyframeChanged(); if (!el.audioKeyframeError.textContent) void recordRecipeEdit(); } };
  }
  const canvas = el[`${prefix}Graph`];
  let dragging = null;
  const coordinates = (event) => { const rect = canvas.getBoundingClientRect(); const duration = editedDuration(); return { time_ms: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - 16) / Math.max(1, rect.width - 32))) * duration), volume_percent: Math.round((1 - Math.max(0, Math.min(1, (event.clientY - rect.top - 16) / Math.max(1, rect.height - 32)))) * 200) }; };
  canvas.onpointerdown = (event) => {
    if (!state.meta || state.running || keyframeInputInvalid || editedDuration() <= 0) return;
    const rect = canvas.getBoundingClientRect(), duration = editedDuration();
    let point = track().keyframes.find((item) => Math.hypot((item.time_ms / duration * (rect.width - 32) + rect.left + 16) - event.clientX, (rect.bottom - 16 - item.volume_percent / 200 * (rect.height - 32)) - event.clientY) < 12);
    let created = false;
    if (!point) {
      if (track().keyframes.length >= 100) { el.audioKeyframeError.textContent = t("keyframe.maximum"); return; }
      const values = coordinates(event);
      if (track().keyframes.some((item) => item.time_ms === values.time_ms)) { el.audioKeyframeError.textContent = t("keyframe.duplicateTime"); return; }
      point = { id: nextKeyframeId(name), ...values }; track().keyframes.push(point); track().enabled = true; created = true;
    }
    state.selectedKeyframeIds[name] = point.id;
    dragging = { id: point.id, moved: false, created };
    canvas.setPointerCapture(event.pointerId);
    audioKeyframeChanged();
  };
  canvas.onpointermove = (event) => {
    if (!dragging) return;
    const point = track().keyframes.find((item) => item.id === dragging.id);
    if (!point) return;
    const values = coordinates(event);
    if (track().keyframes.some((item) => item.id !== point.id && item.time_ms === values.time_ms)) { el.audioKeyframeError.textContent = t("keyframe.duplicateTime"); return; }
    Object.assign(point, values); dragging.moved = true;
    audioKeyframeChanged();
  };
  canvas.onpointerup = (event) => { if (!dragging) return; canvas.releasePointerCapture(event.pointerId); const changed = dragging.moved || dragging.created; dragging = null; if (changed) { refreshAudioKeyframeError(); if (!el.audioKeyframeError.textContent) void recordRecipeEdit(); } };
  canvas.onpointercancel = () => { dragging = null; };
}

function currentSpeed() {
  const value = Number(el.speedCustom.value);
  return Number.isFinite(value) && value >= 0.25 && value <= 4 ? value : (state.recipeNormalized?.playback_speed ?? 1);
}
function setSpeedUi(value) {
  const speed = Number(value);
  el.speedCustom.value = speed.toFixed(2);
  el.speedQuick.value = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(speed) ? String(speed) : "";
  el.speedCurrent.textContent = `${speed.toFixed(2)}x`;
  try { el.inputPreview.playbackRate = speed; } catch (error) { log(`${t("speed.previewUnsupported")}: ${error.message || error}`); }
  el.musicPreview.playbackRate = 1;
  if ("preservesPitch" in el.inputPreview) el.inputPreview.preservesPitch = true;
  syncTimeline();
}
async function changeSpeed(value) {
  const requested = Number(value);
  const previous = state.recipeNormalized?.playback_speed ?? 1;
  if (!Number.isFinite(requested) || requested < 0.25 || requested > 4) {
    setSpeedUi(previous);
    log(t("speed.invalid"));
    return;
  }
  setSpeedUi(Math.round(requested * 100) / 100);
  if (!state.meta || !state.file) return;
  const token = ++state.recipeEditToken;
  try {
    assertTransitionsValid();
    assertFadeValid();
    assertColorValid();
    assertAudioKeyframesValid();
    const draft = buildRecipeFromUi(uiValues());
    const response = await validateRecipe({ meta: state.meta, recipe: draft });
    if (token !== state.recipeEditToken) return;
    state.recipeDraft = draft;
    commitNormalized(response.normalized);
  } catch (error) {
    if (token !== state.recipeEditToken) return;
    if (!fadeValidationMessage() && !transitionError() && !el.audioKeyframeError.textContent) setSpeedUi(previous);
    setStatus("Failed", "messages.fixRecipe");
    log(error.message || t("speed.invalid"));
  }
}
el.timelineOutputTrack.addEventListener("pointerdown", (event) => {
  if (!state.meta || state.running) return;
  const rect = el.timelineOutputTrack.getBoundingClientRect();
  const value = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * editedDuration();
  el.inputPreview.currentTime = sourceForOutput(value) / 1000;
  syncTimeline();
});
el.timelineOutputTrack.addEventListener("keydown", (event) => {
  if (!state.meta || state.running) return;
  const step = event.shiftKey ? 100 : 1000;
  let value = positionForOutputClock();
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") value -= step;
  else if (event.key === "ArrowRight" || event.key === "ArrowUp") value += step;
  else if (event.key === "Home") value = 0;
  else if (event.key === "End") value = editedDuration();
  else return;
  event.preventDefault();
  event.stopPropagation();
  el.inputPreview.currentTime = sourceForOutput(Math.max(0, Math.min(editedDuration(), value))) / 1000;
  syncTimeline();
});
el.speedQuick.addEventListener("change", () => { if (el.speedQuick.value) void changeSpeed(el.speedQuick.value); });
el.speedCustom.addEventListener("change", () => { void changeSpeed(el.speedCustom.value); });
el.speedReset.addEventListener("click", () => { void changeSpeed(1); });

function fadeFromUi() {
  const read = (enabled, input) => {
    const raw = input.value;
    const seconds = Number(raw);
    if (raw === "" || !Number.isFinite(seconds) || seconds < 0 || seconds > 10 || Math.abs(seconds * 10 - Math.round(seconds * 10)) > 0.000001) return null;
    return { enabled: enabled.checked, duration_ms: Math.round(seconds * 1000) };
  };
  const fade_in = read(el.fadeInEnabled, el.fadeInSeconds);
  const fade_out = read(el.fadeOutEnabled, el.fadeOutSeconds);
  return fade_in && fade_out ? { fade_in, fade_out } : null;
}
function fadeValidationMessage() {
  const value = fadeFromUi();
  if (!value) return t("fade.invalidDuration");
  const activeIn = value.fade_in.enabled ? value.fade_in.duration_ms : 0;
  const activeOut = value.fade_out.enabled ? value.fade_out.duration_ms : 0;
  if (state.meta && !el.frameEnable.checked && el.audioMode.value !== "extract" && activeIn + activeOut > editedDuration()) return t("fade.overlap");
  return "";
}
function assertFadeValid() {
  const message = fadeValidationMessage();
  if (message) throw new Error(message);
}
function applyFadeToUi(value) {
  const fade = value || { fade_in: { enabled: false, duration_ms: 1000 }, fade_out: { enabled: false, duration_ms: 1000 } };
  for (const [part, enabledId, rangeId, secondsId] of [["fade_in","fadeInEnabled","fadeInRange","fadeInSeconds"],["fade_out","fadeOutEnabled","fadeOutRange","fadeOutSeconds"]]) {
    const effect = fade[part] || { enabled: false, duration_ms: 1000 };
    const seconds = ((effect.duration_ms ?? 1000) / 1000).toFixed(1);
    el[enabledId].checked = Boolean(effect.enabled);
    el[rangeId].value = seconds;
    el[secondsId].value = seconds;
  }
  renderFade();
}
function resetFadeUi() { applyFadeToUi(null); }
function renderFadePreview() {
  const node = el.fadePreview;
  if (!state.meta || el.inputPreview.hidden) { node.style.opacity = "0"; return; }
  const rect = imageRect();
  if (!rect) { node.style.opacity = "0"; return; }
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  const fade = fadeFromUi();
  const position = outputPosition(el.inputPreview.currentTime * 1000);
  const duration = editedDuration();
  if (!fade || position === null || !duration) { node.style.opacity = "0"; return; }
  const fadeIn = fade.fade_in.enabled && fade.fade_in.duration_ms ? Math.max(0, Math.min(1, 1 - position / fade.fade_in.duration_ms)) : 0;
  const fadeOut = fade.fade_out.enabled && fade.fade_out.duration_ms ? Math.max(0, Math.min(1, (position - (duration - fade.fade_out.duration_ms)) / fade.fade_out.duration_ms)) : 0;
  node.style.opacity = String(Math.max(fadeIn, fadeOut));
}
function renderFade() {
  el.fadeError.textContent = fadeValidationMessage();
  const fade = fadeFromUi();
  const duration = editedDuration();
  for (const [node, effect] of [[el.fadeInRegion, fade?.fade_in], [el.fadeOutRegion, fade?.fade_out]]) {
    const width = duration && effect?.enabled && effect.duration_ms ? Math.min(100, effect.duration_ms / duration * 100) : 0;
    node.style.width = `${width}%`;
    node.hidden = width === 0;
  }
  renderFadePreview();
}
for (const [rangeId, secondsId] of [["fadeInRange","fadeInSeconds"],["fadeOutRange","fadeOutSeconds"]]) {
  el[rangeId].addEventListener("input", () => { el[secondsId].value = Number(el[rangeId].value).toFixed(1); renderFade(); });
  el[secondsId].addEventListener("input", () => { if (el[secondsId].value !== "") el[rangeId].value = el[secondsId].value; renderFade(); });
  el[rangeId].addEventListener("change", () => { void recordRecipeEdit(); });
  el[secondsId].addEventListener("change", () => { void recordRecipeEdit(); });
}
for (const id of ["fadeInEnabled","fadeOutEnabled"]) el[id].addEventListener("change", () => { renderFade(); void recordRecipeEdit(); });
el.fadeReset.addEventListener("click", () => { resetFadeUi(); void recordRecipeEdit(); });
window.addEventListener("resize", renderFadePreview);

const colorFields = [
  ["Brightness", "brightness", -1, 1, 0],
  ["Contrast", "contrast", 0, 2, 1],
  ["Saturation", "saturation", 0, 3, 1],
  ["Gamma", "gamma", 0.1, 3, 1],
];
function colorFromUi() {
  const result = {};
  for (const [label, key, minimum, maximum] of colorFields) {
    const raw = el[`color${label}Number`].value;
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value) || value < minimum || value > maximum || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return null;
    result[key] = value;
  }
  return result;
}
function assertColorValid() {
  if (!colorFromUi()) throw new Error(t("color.invalid"));
}
function renderColorPreview() {
  const values = colorFromUi();
  el.colorError.textContent = values ? "" : t("color.invalid");
  colorRenderer.render(values, el.transitionPreview.hidden ? el.inputPreview : el.transitionPreview);
  const active = values && (values.brightness !== 0 || values.contrast !== 1 || values.saturation !== 1 || values.gamma !== 1);
  el.colorPreviewWarning.hidden = !active || !colorPreviewFailure;
  el.colorPreviewWarning.textContent = active && colorPreviewFailure ? t("color.previewUnavailable") : "";
}
function applyColorToUi(value) {
  const source = value || {};
  for (const [label, key, , , fallback] of colorFields) {
    const number = Number(source[key] ?? fallback).toFixed(2);
    el[`color${label}Range`].value = number;
    el[`color${label}Number`].value = number;
  }
  renderColorPreview();
}
function resetColorUi() { applyColorToUi(null); }
for (const [label, , minimum, maximum] of colorFields) {
  const range = el[`color${label}Range`];
  const number = el[`color${label}Number`];
  range.addEventListener("input", () => { number.value = Number(range.value).toFixed(2); renderColorPreview(); });
  range.addEventListener("change", () => { void recordRecipeEdit(); });
  number.addEventListener("input", () => {
    const value = Number(number.value);
    if (number.value !== "" && Number.isFinite(value) && value >= minimum && value <= maximum) range.value = number.value;
    renderColorPreview();
  });
  number.addEventListener("change", () => {
    const values = colorFromUi();
    if (values) number.value = Number(number.value).toFixed(2);
    renderColorPreview();
    void recordRecipeEdit();
  });
}
el.colorReset.addEventListener("click", () => { resetColorUi(); void recordRecipeEdit(); });
window.addEventListener("resize", () => { renderTransitionPreview(); renderColorPreview(); });

const baseUiValues = uiValues;
uiValues = () => ({ ...baseUiValues(), outputFps: state.outputFps ?? state.recipeNormalized?.output_fps ?? null });
window.addEventListener("beforeunload", () => { transitionRenderer.destroy(); releaseAllImageAssets(); colorRenderer.destroy(); releaseMusicUrl(); if (audioGraph) void audioGraph.context.close(); if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl); if (inputBlobUrl) URL.revokeObjectURL(inputBlobUrl); });
refreshLanguage = () => { applyTranslations(); topButton.refresh(); refreshHistoryToolbar(); refreshOutputSettingsCard(); transitionUiSignature = ""; transitionTimelineSignature = ""; if (el.preset.options[0]?.value === "") el.preset.options[0].textContent = t("values.none"); updateFileMeta(); renderSegments(); renderTexts(); renderSubtitles(); renderAudioKeyframes(); renderImageUi(); renderTransitionUi(); renderMusicUi(); syncTimeline(); setStatus(state.status, state.statusMessageKey, state.statusMessageValues, state.statusProgress); };
initUndoRedo(); renderSegments(); setControlsEnabled(false); setStatus("Idle", "messages.chooseVideo"); loadPresets().catch((error) => log(t("messages.presetsUnavailable", { error: error.message || error })));
