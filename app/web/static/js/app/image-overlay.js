export const maxImageBytes = 20 * 1024 * 1024;
export const maxImagePixels = 40_000_000;
export const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function normalizedCrop(meta, ui) {
  if (!ui.cropEnable || Number(ui.cropW) <= 0 || Number(ui.cropH) <= 0) return null;
  const x = Math.max(0, Math.min(Math.floor(Number(ui.cropX) || 0), meta.width - 2));
  const y = Math.max(0, Math.min(Math.floor(Number(ui.cropY) || 0), meta.height - 2));
  const width = Math.max(2, Math.min(Math.floor(Number(ui.cropW)), meta.width - x));
  const height = Math.max(2, Math.min(Math.floor(Number(ui.cropH)), meta.height - y));
  return { x, y, width: width - width % 2, height: height - height % 2 };
}

export function outputDimensions(meta, ui) {
  if (ui.canvasEnabled) {
    return {
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1080, height: 1080 },
    }[ui.canvasAspectRatio || "16:9"];
  }
  let width = meta.width;
  let height = meta.height;
  const crop = normalizedCrop(meta, ui);
  if (crop) {
    width = crop.width;
    height = crop.height;
  }
  if (ui.scaleEnable) {
    const targetWidth = Number(ui.scaleW) > 0 ? Math.max(2, Math.floor(Number(ui.scaleW) / 2) * 2) : null;
    const targetHeight = Number(ui.scaleH) > 0 ? Math.max(2, Math.floor(Number(ui.scaleH) / 2) * 2) : null;
    if (ui.scaleKeepAspect && targetWidth && targetHeight) {
      const scaledWidth = Math.min(targetWidth, 2 * Math.round(targetHeight * width / height / 2));
      const scaledHeight = Math.min(targetHeight, 2 * Math.round(targetWidth * height / width / 2));
      width = Math.max(2, scaledWidth);
      height = Math.max(2, scaledHeight);
    } else if (targetWidth && targetHeight) {
      width = targetWidth;
      height = targetHeight;
    } else if (targetWidth) {
      height = Math.max(2, 2 * Math.round(height * targetWidth / width / 2));
      width = targetWidth;
    } else if (targetHeight) {
      width = Math.max(2, 2 * Math.round(width * targetHeight / height / 2));
      height = targetHeight;
    }
  }
  const dimensions = { width: Math.max(2, Math.floor(width / 2) * 2), height: Math.max(2, Math.floor(height / 2) * 2) };
  return Number(ui.transformRotation) === 90 || Number(ui.transformRotation) === 270
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

export function previewCanvasGeometry(meta, ui, hostWidth, hostHeight) {
  const canvas = outputDimensions(meta, ui);
  const crop = normalizedCrop(meta, ui) || { x: 0, y: 0, width: meta.width, height: meta.height };
  const scaled = outputDimensions(meta, { ...ui, canvasEnabled: false, transformRotation: 0 });
  const turned = Number(ui.transformRotation) === 90 || Number(ui.transformRotation) === 270;
  const rotatedWidth = turned ? scaled.height : scaled.width;
  const rotatedHeight = turned ? scaled.width : scaled.height;
  const fitScale = Math.min(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
  const stageScale = Math.min(hostWidth / canvas.width, hostHeight / canvas.height);
  const viewportWidth = scaled.width * fitScale * stageScale;
  const viewportHeight = scaled.height * fitScale * stageScale;
  return {
    stageWidth: canvas.width * stageScale,
    stageHeight: canvas.height * stageScale,
    viewportWidth,
    viewportHeight,
    sourceWidth: viewportWidth * meta.width / crop.width,
    sourceHeight: viewportHeight * meta.height / crop.height,
    sourceLeft: -viewportWidth * crop.x / crop.width,
    sourceTop: -viewportHeight * crop.y / crop.height,
  };
}

export function imageGeometry(item, frameWidth, frameHeight) {
  const width = Math.max(1, Math.round(frameWidth * item.width_pct / 100));
  const height = Math.max(1, Math.round(width * item.image_height / item.image_width));
  const x = Math.round(frameWidth * item.x_pct / 100);
  const y = Math.round(frameHeight * item.y_pct / 100);
  return { x, y, width, height, valid: x >= 0 && y >= 0 && x + width <= frameWidth && y + height <= frameHeight };
}

export async function decodeImage(file) {
  if (!imageTypes.has(file.type)) throw new Error("Unsupported image format.");
  if (!file.size || file.size > maxImageBytes) throw new Error("Image file is too large or empty.");
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const png = header.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const jpeg = header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp = header.length >= 12 && [82, 73, 70, 70].every((byte, index) => header[index] === byte) && [87, 69, 66, 80].every((byte, index) => header[index + 8] === byte);
  if (!((file.type === "image/png" && png) || (file.type === "image/jpeg" && jpeg) || (file.type === "image/webp" && webp))) throw new Error("Unsupported image format.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Image could not be decoded."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 10000 || image.naturalHeight > 10000 || image.naturalWidth * image.naturalHeight > maxImagePixels) throw new Error("Image dimensions are too large.");
    return { file, url, image, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function releaseImageAsset(asset) {
  asset.image.removeAttribute("src");
  URL.revokeObjectURL(asset.url);
}

export async function renderImageAssets(items, registry, frame) {
  if (frame.width * frame.height > maxImagePixels) throw new Error("Output frame is too large for image overlay preparation.");
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image overlay preparation is unavailable.");
  const results = [];
  for (const item of items) {
    const asset = registry.get(item.file_ref);
    if (!asset) throw new Error("Image file unavailable.");
    const geometry = imageGeometry(item, frame.width, frame.height);
    if (!geometry.valid) throw new Error("Invalid image position or size.");
    context.clearRect(0, 0, frame.width, frame.height);
    context.globalAlpha = item.opacity;
    context.drawImage(asset.image, geometry.x, geometry.y, geometry.width, geometry.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Image overlay preparation failed.");
    results.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return results;
}
