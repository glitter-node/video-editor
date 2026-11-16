const validThemes = new Set(["light", "dark"]);
const storageKey = "video-editor-theme";

export function normalizeTheme(value) {
  return validThemes.has(value) ? value : "light";
}

export function readStoredTheme(storage) {
  try {
    const source = storage || globalThis.localStorage;
    return normalizeTheme(source.getItem(storageKey));
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  const selected = normalizeTheme(theme);
  document.documentElement.dataset.theme = selected;
  return selected;
}

export function initializeTheme(select, storage) {
  const current = applyTheme(readStoredTheme(storage));
  select.value = current;
  select.addEventListener("change", () => {
    const selected = applyTheme(select.value);
    try {
      const target = storage || globalThis.localStorage;
      target.setItem(storageKey, selected);
    } catch {
      select.value = selected;
    }
  });
  return current;
}
