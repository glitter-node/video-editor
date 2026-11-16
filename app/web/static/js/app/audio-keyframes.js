export const defaultAudioKeyframes = () => ({ original: { enabled: false, keyframes: [] }, background_music: { enabled: false, keyframes: [] } });
export const audioKeyframeTracks = ["original", "background_music"];

export function sortedKeyframes(track) {
  return [...track.keyframes].sort((a, b) => a.time_ms - b.time_ms || String(a.id).localeCompare(String(b.id)));
}

export function keyframeVolume(track, timeMs) {
  if (!track?.enabled || !track.keyframes.length) return 100;
  const points = sortedKeyframes(track);
  if (timeMs <= points[0].time_ms) return points[0].volume_percent;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (timeMs <= right.time_ms) return left.volume_percent + (right.volume_percent - left.volume_percent) * (timeMs - left.time_ms) / (right.time_ms - left.time_ms);
  }
  return points[points.length - 1].volume_percent;
}

export function validateAudioKeyframes(value, duration) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("keyframe.invalidTrack");
  for (const name of audioKeyframeTracks) {
    const track = value[name];
    if (!track || typeof track !== "object" || typeof track.enabled !== "boolean" || !Array.isArray(track.keyframes) || track.keyframes.length > 100) throw new Error("keyframe.invalidTrack");
    const ids = new Set(), times = new Set();
    for (const point of track.keyframes) {
      if (typeof point.id !== "string" || point.id.length > 48 || !new RegExp(`^${name.replace("_", "-")}-kf-[1-9][0-9]*$`).test(point.id) || ids.has(point.id)) throw new Error("keyframe.invalidTrack");
      ids.add(point.id);
      if (!Number.isInteger(point.time_ms) || point.time_ms < 0 || point.time_ms > duration) throw new Error("keyframe.invalidTime");
      if (times.has(point.time_ms)) throw new Error("keyframe.duplicateTime");
      times.add(point.time_ms);
      if (typeof point.volume_percent !== "number" || !Number.isFinite(point.volume_percent) || point.volume_percent < 0 || point.volume_percent > 200) throw new Error("keyframe.invalidVolume");
    }
  }
  return value;
}
