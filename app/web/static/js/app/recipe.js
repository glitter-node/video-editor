export function serializeRecipe(recipe) {
  if (!recipe || typeof recipe !== "object" || !("canvas" in recipe)) return recipe;
  if (recipe.canvas !== null && recipe.canvas?.enabled !== false) return recipe;
  const { canvas, ...withoutCanvas } = recipe;
  return withoutCanvas;
}

export function buildRecipeFromUi(ui) {
  const backgroundColor = /^#[0-9a-fA-F]{6}$/.test(ui.canvasBackgroundHex || "")
    ? ui.canvasBackgroundHex.toUpperCase()
    : "#000000";
  const recipe = {
    remove_segments: Array.isArray(ui.removeSegments)
      ? ui.removeSegments.slice()
      : [],
    container: ui.container || "mp4",
    ...(ui.outputFps ? { output_fps: Number(ui.outputFps) } : {}),
    playback_speed: Number(ui.playbackSpeed ?? 1),
    transform: {
      rotation: Number(ui.transformRotation ?? 0),
      flip_horizontal: Boolean(ui.transformFlipHorizontal),
      flip_vertical: Boolean(ui.transformFlipVertical),
    },
    ...(ui.canvasEnabled ? {
      canvas: {
        enabled: true,
        aspect_ratio: ui.canvasAspectRatio || "16:9",
        fit: "contain",
        background_color: backgroundColor,
      },
    } : {}),
    video_fade: ui.videoFade ? JSON.parse(JSON.stringify(ui.videoFade)) : null,
    color_adjustment: ui.colorAdjustment ? { ...ui.colorAdjustment } : null,
    text_overlays: Array.isArray(ui.textOverlays) ? ui.textOverlays.map((item) => ({ ...item })) : [],
    subtitles: ui.subtitles ? JSON.parse(JSON.stringify(ui.subtitles)) : { cues: [], style: {} },
    audio_keyframes: ui.audioKeyframes ? JSON.parse(JSON.stringify(ui.audioKeyframes)) : null,
    image_overlays: Array.isArray(ui.imageOverlays) ? ui.imageOverlays.map((item) => ({ ...item })) : [],
    selected_image_id: ui.selectedImageId || null,
    video_transitions: Array.isArray(ui.videoTransitions) ? ui.videoTransitions.map((item) => ({ ...item })) : [],
    selected_transition_id: ui.selectedTransitionId || null,
  };

  const start = toInt(ui.trimStart);
  const end = toIntOrNull(ui.trimEnd);

  if (start !== null || end !== null) {
    recipe.trim = { start_ms: start ?? 0, end_ms: end };
  }

  if (ui.audioMix) recipe.audio_mix = JSON.parse(JSON.stringify(ui.audioMix));

  if (ui.audioMode) {
    if (ui.audioMode === "extract") {
      recipe.audio = {
        mode: "extract",
        extract_format: ui.audioFormat || "mp3",
      };
    } else if (ui.audioMode === "mute") {
      recipe.audio = { mode: "mute" };
    } else {
      recipe.audio = { mode: "keep" };
    }
  }

  if (ui.cropEnable) {
    const x = toIntOrNull(ui.cropX);
    const y = toIntOrNull(ui.cropY);
    const w = toIntOrNull(ui.cropW);
    const h = toIntOrNull(ui.cropH);
    if (x !== null && y !== null && w !== null && h !== null) {
      recipe.crop = { x, y, w, h };
    }
  }

  if (ui.scaleEnable) {
    const width = toIntOrNull(ui.scaleW);
    const height = toIntOrNull(ui.scaleH);
    if (width !== null || height !== null) {
      recipe.scale = { width, height, keep_aspect: !!ui.scaleKeepAspect };
    }
  }

  const video_kbps = toIntOrNull(ui.videoKbps);
  const audio_kbps = toIntOrNull(ui.audioKbps);
  if (video_kbps !== null || audio_kbps !== null) {
    recipe.bitrate = { video_kbps, audio_kbps };
  }

  if (ui.frameEnable) {
    const at_ms = toIntOrNull(ui.frameAt);
    if (at_ms !== null) {
      recipe.frame_capture = { at_ms, format: "png" };
    }
  }

  return recipe;
}

export function applyPatch(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (Array.isArray(v)) {
      out[k] = v.slice();
      continue;
    }
    if (v && typeof v === "object") {
      out[k] = { ...(out[k] || {}), ...v };
      continue;
    }
    out[k] = v;
  }
  return out;
}

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function toIntOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  return toInt(v);
}
