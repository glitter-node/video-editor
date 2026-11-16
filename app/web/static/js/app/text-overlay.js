export async function renderTextAssets(overlays, meta) {
  const width = meta.width;
  const height = meta.height;
  const assets = [];
  for (const item of overlays) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.font = `${item.font_size}px sans-serif`;
    context.fillStyle = item.color;
    context.textAlign = item.align;
    context.textBaseline = "top";
    const lines = item.text.split("\n");
    const lineHeight = item.font_size * 1.2;
    const x = Math.round(item.x * width);
    const y = Math.round(item.y * height);
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render text overlay.");
    assets.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return assets;
}
