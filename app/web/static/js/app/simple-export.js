const tiers = [1080, 720, 480];

export function normalizeSimpleExport(value) {
  const resolution = value?.resolution === "original" || tiers.includes(Number(value?.resolution)) ? String(value.resolution) : null;
  const quality = ["smaller", "balanced", "high"].includes(value?.quality) ? value.quality : null;
  const mode = value?.mode === "simple" || value?.mode === "advanced" ? value.mode : value?.active === true ? "simple" : "advanced";
  return { resolution, quality, mode };
}

export function simpleExportReady(meta, value) {
  return Boolean(value?.resolution && value?.quality && simpleDimensions(meta, value.resolution) && simpleResolutionOptions(meta).includes(value.resolution));
}

export function simpleResolutionOptions(meta) {
  return ["original", ...tiers.filter((tier) => simpleDimensions(meta, tier)).map(String)];
}

export function simpleDimensions(meta, resolution = "original") {
  const width = Number(meta?.width);
  const height = Number(meta?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  if (resolution === "original" || !tiers.includes(Number(resolution))) return { width, height, scaled: false };
  const ratio = Number(meta.displayAspectRatio) > 0 ? Number(meta.displayAspectRatio) : width / height;
  const displayWidth = height * ratio;
  const shortSide = Math.min(displayWidth, height);
  if (shortSide < Number(resolution)) return null;
  const factor = Number(resolution) / shortSide;
  const targetWidth = Math.max(2, 2 * Math.round(displayWidth * factor / 2));
  const targetHeight = Math.max(2, 2 * Math.round(height * factor / 2));
  if (targetWidth > 16384 || targetHeight > 16384 || targetWidth > width || targetHeight > height || targetWidth > displayWidth + 1 || targetHeight > height + 1) return null;
  return { width: targetWidth, height: targetHeight, scaled: true };
}

export function simpleVideoBitrate(meta, resolution = "original", quality = "balanced") {
  const dimensions = simpleDimensions(meta, resolution);
  if (!dimensions) return null;
  const pixels = dimensions.width * dimensions.height;
  const base = { smaller: 2500, balanced: 5000, high: 8000 }[quality] || 5000;
  return Math.max(500, Math.min(200000, Math.round(base * pixels / (1920 * 1080))));
}

export function simpleResolutionLabel(value, translate) {
  return value === "original" ? translate("simple.original") : `${value}p`;
}
