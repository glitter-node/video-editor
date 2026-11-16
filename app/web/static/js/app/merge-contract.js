const INPUT_NAME = /^input_(\d+)\.(mp4|mov|mkv|webm)$/;
const OUTPUT_NAME = /^merged\.mp4$/;
const MAX_INPUT_SIZE = 2 * 1024 ** 3;
const MAX_TOTAL_SIZE = 2 * 1024 ** 3;

export function prepareMergeExecution({ files, planRes, executionId }) {
  if (!planRes || planRes.mode !== "merge") throw new Error("Invalid merge plan mode.");
  if (!Array.isArray(files) || !Array.isArray(planRes.inputs)) throw new Error("Merge inputs are required.");
  if (files.length < 2 || files.length > 20 || files.length !== planRes.inputs.length || planRes.input_count !== files.length) throw new Error("Merge input count mismatch.");
  if (!Number.isInteger(planRes.clip_count) || planRes.clip_count < 2 || planRes.clip_count > 100) throw new Error("Invalid merge clip count.");
  if (!Number.isInteger(planRes.estimated_duration_ms) || planRes.estimated_duration_ms < 1 || planRes.estimated_duration_ms > 86400000) throw new Error("Invalid merge duration.");
  if (!OUTPUT_NAME.test(planRes.output_filename)) throw new Error("Invalid merge output filename.");
  if (!Number.isSafeInteger(executionId) || executionId < 1) throw new Error("Invalid execution ID.");
  const inputNames = [];
  let totalSize = 0;
  files.forEach((file, index) => {
    const name = planRes.inputs[index];
    const match = typeof name === "string" && INPUT_NAME.exec(name);
    if (!match || Number(match[1]) !== index) throw new Error("Invalid merge input filename or order.");
    if (!file || typeof file.arrayBuffer !== "function" || !Number.isSafeInteger(file.size) || file.size < 1) throw new Error("Invalid or empty merge input file.");
    if (file.size > MAX_INPUT_SIZE) throw new Error("Merge input file exceeds 2 GiB.");
    totalSize += file.size;
    if (totalSize > MAX_TOTAL_SIZE) throw new Error("Merge inputs exceed the 2 GiB total limit.");
    const ext = file.name?.split(".").pop()?.toLowerCase();
    if (ext !== match[2]) throw new Error("Input file extension does not match the merge plan.");
    inputNames.push(`${executionId}-${name}`);
  });
  const options = planRes.ffmpeg_args;
  if (!Array.isArray(options) || options.some((value) => typeof value !== "string")) throw new Error("Invalid merge FFmpeg options.");
  let codecOptions = options.slice(8);
  if (codecOptions[0] === "-b:v") {
    const bitrate = codecOptions[1];
    if (!/^(?:[1-9]\d*)k$/.test(bitrate) || Number(bitrate.slice(0, -1)) < 100 || Number(bitrate.slice(0, -1)) > 200000) throw new Error("Invalid merge video bitrate.");
    codecOptions = codecOptions.slice(2);
  }
  if (options.length !== 8 + (options[8] === "-b:v" ? 2 : 0) + 4 || codecOptions.length !== 4) throw new Error("Invalid merge FFmpeg options.");
  const [filterFlag, graph, mapVideoFlag, mapVideo, mapAudioFlag, mapAudio, videoFlag, videoCodec, audioFlag, audioCodec, pixelFlag, pixelFormat] = [...options.slice(0, 8), ...codecOptions];
  if (filterFlag !== "-filter_complex" || mapVideoFlag !== "-map" || mapVideo !== "[vout]" || mapAudioFlag !== "-map" || mapAudio !== "[aout]" || videoFlag !== "-c:v" || videoCodec !== "libx264" || audioFlag !== "-c:a" || audioCodec !== "aac" || pixelFlag !== "-pix_fmt" || pixelFormat !== "yuv420p") throw new Error("Unsupported merge FFmpeg options.");
  const activeCount = planRes.active_transition_count ?? 0;
  if (!Number.isInteger(activeCount) || activeCount < 0 || activeCount >= planRes.clip_count) throw new Error("Invalid merge transition count.");
  if (!/^[\w\[\]:=.,;()+\-*/]+$/.test(graph) || graph.length > 30000) throw new Error("Invalid merge filter graph.");
  if (activeCount === 0) {
    if (!graph.includes(`concat=n=${planRes.clip_count}:v=1:a=1[vout][aout]`)) throw new Error("Invalid merge filter graph.");
  } else {
    const videoTransitions = graph.match(/xfade=transition=(?:fade|fadeblack|wipeleft|wiperight):duration=\d+\.\d{3}:offset=\d+\.\d{3}/g) || [];
    const audioTransitions = graph.match(/acrossfade=d=\d+\.\d{3}:c1=tri:c2=tri/g) || [];
    if (videoTransitions.length !== activeCount || audioTransitions.length !== activeCount || !graph.includes("[vout]") || !graph.includes("[aout]")) throw new Error("Invalid merge transition graph.");
  }
  const outputName = `${executionId}-${planRes.output_filename}`;
  const args = ["-y", ...inputNames.flatMap((name) => ["-i", name]), ...options, outputName];
  return { inputNames, outputName, args };
}
