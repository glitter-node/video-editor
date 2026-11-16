export function mergedDownloadFilename(sourceName) {
  const leaf = String(sourceName ?? "").split(/[\\/]/).pop() || "";
  const dot = leaf.lastIndexOf(".");
  const stem = dot > 0 ? leaf.slice(0, dot) : dot === 0 ? "" : leaf;
  const safe = stem
    .replace(/[\u0000-\u001f\u007f<>:"|?*\\/\u202a-\u202e\u2066-\u2069]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180)
    .replace(/[. ]+$/g, "");
  return safe ? `${safe}_merged.mp4` : "merged.mp4";
}

export function mergeFilenameForOrder(entries, order) {
  const first = entries.find((entry) => entry.id === order?.[0]) || entries[0];
  return mergedDownloadFilename(first?.file?.name);
}

export function applyMergeDownloadName(downloadElement, nameElement, filename) {
  downloadElement.download = filename;
  nameElement.textContent = filename;
}
