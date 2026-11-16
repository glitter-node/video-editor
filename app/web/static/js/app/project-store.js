const databaseName = "video-editor-projects";
const databaseVersion = 2;
const projectStoreName = "projects";
const mediaStoreName = "media";
const maxProjectBytes = 4 * 1024 * 1024;
const recentSaveQueues = new Map();
const projectSaveQueues = new Map();
const projectStyles = document.createElement("link");
projectStyles.rel = "stylesheet";
projectStyles.href = "/static/css/project.css?v=4";
document.head.append(projectStyles);

function clone(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(projectStoreName)) {
        const store = db.createObjectStore(projectStoreName, { keyPath: "id" });
        store.createIndex("page", "page", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(mediaStoreName)) {
        const store = db.createObjectStore(mediaStoreName, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open project storage."));
  });
}

function transaction(mode, action, storeNames = [projectStoreName]) {
  return database().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
    let result;
    try { result = action(stores); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result instanceof IDBRequest ? result.result : result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Project storage operation failed.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Project storage operation was aborted.")); };
  }));
}

export function fileDescriptor(file, extra = {}) {
  if (!file) return null;
  return { name: String(file.name || ""), size: Number(file.size) || 0, type: String(file.type || ""), lastModified: Number(file.lastModified) || 0, ...extra };
}

export function mediaId() {
  return crypto.randomUUID();
}

export function mediaRecord(file, { id = mediaId(), projectId = "", ...extra } = {}) {
  if (!file) return null;
  return { id, projectId, ...fileDescriptor(file, { media_id: id, ...extra }), blob: file };
}

export function fileFromMedia(record) {
  if (!(record?.blob instanceof Blob)) return null;
  const file = new File([record.blob], record.name || "media", { type: record.type || "application/octet-stream", lastModified: Number(record.lastModified) || Date.now() });
  return fileMatches(file, record) ? file : null;
}

export function fileMatches(file, descriptor) {
  return Boolean(file && descriptor && file.name === descriptor.name && file.size === descriptor.size && (descriptor.type === "" || file.type === descriptor.type) && (!descriptor.lastModified || file.lastModified === descriptor.lastModified));
}

export function projectSourcesMatch(project, files) {
  if (!Array.isArray(files)) return false;
  if (project?.page === "merge") {
    const entries = project.state?.entries;
    return Array.isArray(entries) && entries.length === files.length && entries.every((entry, index) => fileMatches(files[index], entry.file));
  }
  const source = project?.state?.media?.find((item) => item.role === "source") || project?.media?.find((item) => item.role === "source");
  return files.length === 1 && fileMatches(files[0], source);
}

export function createProject({ id, page, name, state, media = [] }) {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: id || crypto.randomUUID(), page, name: String(name || "Untitled Project"), createdAt: now, updatedAt: now, state: clone(state), media: clone(media) };
}

export function recentProjectId(page) {
  return `recent:${page}`;
}

export function validateProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("Invalid project JSON.");
  if (project.schemaVersion !== 1) throw new Error(`Unsupported project schema version: ${project.schemaVersion ?? "missing"}.`);
  if (typeof project.id !== "string" || !project.id || typeof project.name !== "string" || typeof project.page !== "string" || !["app", "min", "merge"].includes(project.page)) throw new Error("Project metadata is invalid.");
  if (project.projectType !== undefined && !["recent", "saved"].includes(project.projectType)) throw new Error("Project type is invalid.");
  if (!project.state || typeof project.state !== "object" || Array.isArray(project.state) || !Array.isArray(project.media || [])) throw new Error("Project state is invalid.");
  const text = JSON.stringify(project);
  if (new TextEncoder().encode(text).byteLength > maxProjectBytes) throw new Error("Project data exceeds the allowed size.");
  const check = (value, path = "project") => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid numeric value at ${path}.`);
    if (Array.isArray(value)) value.forEach((item, index) => check(item, `${path}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => check(item, `${path}.${key}`));
  };
  check(project);
  if (project.page === "app") {
    const recipe = project.state.recipe;
    if (!recipe || typeof recipe !== "object" || !project.state.meta || typeof project.state.meta !== "object") throw new Error("Single-edit project state is invalid.");
    const validateRange = (range, path) => { if (!range || !Number.isInteger(range.start_ms) || range.start_ms < 0 || !Number.isInteger(range.end_ms) || range.end_ms <= range.start_ms) throw new Error(`Invalid time range at ${path}.`); };
    if (recipe.trim) { if (!Number.isInteger(recipe.trim.start_ms) || recipe.trim.start_ms < 0 || (recipe.trim.end_ms !== null && (!Number.isInteger(recipe.trim.end_ms) || recipe.trim.end_ms <= recipe.trim.start_ms))) throw new Error("Invalid trim range."); }
    (recipe.remove_segments || []).forEach((range, index) => validateRange(range, `remove_segments[${index}]`));
    (recipe.subtitles?.cues || []).forEach((cue, index) => validateRange({ start_ms: cue.start_ms, end_ms: cue.end_ms }, `subtitles.cues[${index}]`));
  }
  if (project.page === "merge") {
    const mergeState = project.state;
    if (!Array.isArray(mergeState.entries) || !Array.isArray(mergeState.order) || !mergeState.output) throw new Error("Merge project state is invalid.");
    if (!Number.isInteger(Number(mergeState.output.width)) || !Number.isInteger(Number(mergeState.output.height)) || !Number.isFinite(Number(mergeState.output.fps))) throw new Error("Merge output settings are invalid.");
    mergeState.entries.forEach((entry, index) => { if (!/^\d+(?:\.\d{1,3})?$/.test(String(entry.startSeconds ?? "")) || !/^\d+(?:\.\d{1,3})?$/.test(String(entry.endSeconds ?? ""))) throw new Error(`Invalid merge clip range at entries[${index}].`); });
  }
  return clone(project);
}

export async function saveProject(project) {
  const checked = validateProject(project);
  checked.updatedAt = new Date().toISOString();
  return transaction("readwrite", ({ [projectStoreName]: store }) => store.put(checked));
}

async function saveProjectWithMediaNow(project, records = []) {
  const checked = validateProject(project);
  checked.updatedAt = new Date().toISOString();
  const media = records.filter((record) => record?.id && record.blob).map((record) => ({ ...record, projectId: checked.id }));
  const mediaIds = new Set([...media.map((record) => record.id), ...(checked.media || []).map((record) => record.media_id).filter(Boolean)]);
  return transaction("readwrite", ({ [projectStoreName]: projects, [mediaStoreName]: mediaStore }) => {
    const existingRequest = mediaStore.getAll();
    existingRequest.onsuccess = () => {
      existingRequest.result.filter((record) => record.projectId === checked.id && !mediaIds.has(record.id)).forEach((record) => mediaStore.delete(record.id));
      media.forEach((record) => {
        const existing = existingRequest.result.find((item) => item.id === record.id && item.projectId === checked.id);
        if (!existing || existing.name !== record.name || existing.size !== record.size || existing.type !== record.type || existing.lastModified !== record.lastModified) mediaStore.put(record);
      });
    };
    return projects.put(checked);
  }, [projectStoreName, mediaStoreName]);
}

export function saveProjectWithMedia(project, records = []) {
  const key = project?.id;
  const previous = projectSaveQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => saveProjectWithMediaNow(project, records));
  const queued = next.finally(() => { if (projectSaveQueues.get(key) === queued) projectSaveQueues.delete(key); });
  projectSaveQueues.set(key, queued);
  return queued;
}

export function saveRecentProject(project, records = []) {
  const page = project?.page;
  const key = recentProjectId(page);
  const previous = recentSaveQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => saveProjectWithMedia({ ...clone(project), id: key, projectType: "recent", name: "Recent Work" }, records));
  const queued = next.finally(() => { if (recentSaveQueues.get(key) === queued) recentSaveQueues.delete(key); });
  recentSaveQueues.set(key, queued);
  return queued;
}

export async function getProject(id) {
  return transaction("readonly", ({ [projectStoreName]: store }) => store.get(id));
}

export async function getRecentProject(page) {
  return getProject(recentProjectId(page));
}

export async function getProjectWithMedia(id) {
  const project = await getProject(id);
  if (!project) return null;
  const media = await transaction("readonly", ({ [mediaStoreName]: store }) => store.index("projectId").getAll(id), [mediaStoreName]);
  return { project, media };
}

export async function getRecentProjectWithMedia(page) {
  await recentSaveQueues.get(recentProjectId(page))?.catch(() => {});
  return getProjectWithMedia(recentProjectId(page));
}

export async function listProjects(page) {
  const projects = await transaction("readonly", ({ [projectStoreName]: store }) => store.getAll());
  return projects.filter((project) => project.projectType !== "recent" && (!page || project.page === page)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function deleteProject(id) {
  await projectSaveQueues.get(id)?.catch(() => {});
  await recentSaveQueues.get(id)?.catch(() => {});
  return transaction("readwrite", ({ [projectStoreName]: projects, [mediaStoreName]: media }) => {
    const projectRequest = projects.get(id);
    projectRequest.onsuccess = () => {
      if (!projectRequest.result) return;
      const allProjectsRequest = projects.getAll();
      allProjectsRequest.onsuccess = () => {
        const references = new Set(allProjectsRequest.result.filter((project) => project.id !== id).flatMap((project) => (project.media || []).map((item) => item.media_id).filter(Boolean)));
        const mediaRequest = media.getAll();
        mediaRequest.onsuccess = () => mediaRequest.result.filter((record) => record.projectId === id && !references.has(record.id)).forEach((record) => media.delete(record.id));
      };
      projects.delete(id);
    };
    return projectRequest;
  }, [projectStoreName, mediaStoreName]);
}

export function projectText(project) {
  return JSON.stringify(validateProject(project), null, 2);
}

export function downloadProject(project) {
  const blob = new Blob([projectText(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${String(project.name || "project").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "project"}.video-project.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function readProjectFile(file) {
  return file.text().then((text) => {
    if (new TextEncoder().encode(text).byteLength > maxProjectBytes) throw new Error("Project file exceeds the allowed size.");
    return validateProject(JSON.parse(text));
  }).catch((error) => { throw new Error(error instanceof SyntaxError ? "Project file is not valid JSON." : error.message); });
}
