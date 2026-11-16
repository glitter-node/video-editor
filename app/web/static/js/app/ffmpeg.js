import { FFmpeg } from "/static/ffmpeg/index.js";
import { buildOutputFilename, outputExtension } from "./filename.js";
import { prepareMergeExecution } from "./merge-contract.js";

const ffmpeg = new FFmpeg();
let loaded = false;
let hooksBound = false;
let progressHandler = null;
let activeExecution = 0;
let executionBusy = false;
let loadGeneration = 0;
let activeLog = null;

export function cancelFfmpeg() {
  activeExecution += 1;
  loadGeneration += 1;
  progressHandler = null;
  activeLog = null;
  ffmpeg.terminate();
  loaded = false;
}

export async function ensureFfmpeg(log) {
  activeLog = log;
  if (!hooksBound) {
    ffmpeg.on("log", ({ message }) => {
      if (message) activeLog?.(message);
    });
    ffmpeg.on("progress", ({ progress, time }) => {
      const value = Number(progress);
      if (Number.isFinite(value) && value > 0) {
        progressHandler?.(Math.max(0, Math.min(100, value * 100)));
      }
      if (time !== undefined) activeLog?.(`Progress time: ${time} ms`);
    });
    hooksBound = true;
  }

  if (loaded) return;
  const generation = ++loadGeneration;
  log("Loading ffmpeg.wasm...");
  try {
    await ffmpeg.load({
      coreURL: "/static/ffmpeg/ffmpeg-core.js",
      wasmURL: "/static/ffmpeg/ffmpeg-core.wasm",
      workerURL: "/static/ffmpeg/worker.js",
    });
    if (generation !== loadGeneration) throw new Error("Processing was cancelled.");
  } catch (error) {
    ffmpeg.terminate();
    loaded = false;
    throw error;
  }
  loaded = true;
  log("ffmpeg.wasm loaded");
}

async function fileToU8(file) {
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

export async function runPlan({ file, planRes, log, onProgress, textAssets = [], imageAssets = [], subtitleAssets = [], musicFile = null }) {
  if (executionBusy) throw new Error("FFmpeg is already processing.");
  const executionId = ++activeExecution;
  const inName = "input";
  const rawExt = (file.name || "").split(".").pop()?.toLowerCase() || "mp4";
  const inExt = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "mp4";
  const inputName = `${inName}.${inExt}`;

  const outputs = Array.isArray(planRes.outputs) ? planRes.outputs : [];
  const out = outputs[0] || {
    name: `output.${planRes.container || "mp4"}`,
    kind: "video",
  };
  const rawOutputName = out.name || `output.${planRes.container || "mp4"}`;
  const outName = buildOutputFilename(file?.name, outputExtension(rawOutputName, out.kind, planRes.container));
  const fsInputName = `${executionId}-${inputName}`;
  const fsOutputName = `${executionId}-${rawOutputName}`;
  const temporaryAssetNames = [];
  let stage = "FFmpeg";

  executionBusy = true;
  try {
    progressHandler = onProgress || null;
    await ensureFfmpeg(log);
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
    await ffmpeg.deleteFile(fsInputName).catch(() => {});
    await ffmpeg.deleteFile(fsOutputName).catch(() => {});
    log("Writing input...");
    const inputBytes = await fileToU8(file);
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
    await ffmpeg.writeFile(fsInputName, inputBytes);
    const writeAssets = async (assets, kind) => {
      const inputs = [];
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        if (asset?.frames) {
          const pattern = `${executionId}-${kind}-${index}-%06d.png`;
          for (let frame = 0; frame < asset.frames.length; frame += 1) {
            if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
            const name = `${executionId}-${kind}-${index}-${String(frame).padStart(6, "0")}.png`;
            temporaryAssetNames.push(name);
            await ffmpeg.writeFile(name, asset.frames[frame]);
          }
          inputs.push("-framerate", String(asset.fps), "-i", pattern);
        } else {
          const name = `${executionId}-${kind}-${index}.png`;
          temporaryAssetNames.push(name);
          await ffmpeg.writeFile(name, asset);
          inputs.push("-i", name);
        }
      }
      return inputs;
    };
    const textInputs = await writeAssets(textAssets, "text");
    const imageInputs = await writeAssets(imageAssets, "image");
    const subtitleNames = subtitleAssets.map((_, index) => `${executionId}-subtitle-${index}.png`);
    for (let index = 0; index < subtitleAssets.length; index += 1) await ffmpeg.writeFile(subtitleNames[index], subtitleAssets[index]);
    const musicName = musicFile ? `${executionId}-music.${/^[a-z0-9]{1,8}$/.test(musicFile.name.split(".").pop()?.toLowerCase()) ? musicFile.name.split(".").pop().toLowerCase() : "bin"}` : null;
    if (musicName) await ffmpeg.writeFile(musicName, await fileToU8(musicFile));
    const args = ["-y", "-i", fsInputName, ...textInputs, ...imageInputs, ...subtitleNames.flatMap((name) => ["-i", name]), ...(musicName ? ["-i", musicName] : []), ...(planRes.ffmpeg_args || []), fsOutputName];
    log(`Exec: ffmpeg ${args.join(" ")}`);
    const exitCode = await ffmpeg.exec(args);
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
    if (exitCode !== 0) throw new Error(`FFmpeg failed with exit code ${exitCode}`);
    stage = "Output";
    log("Reading output...");
    const data = await ffmpeg.readFile(fsOutputName);
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
    return { out, outName, data };
  } catch (error) {
    error.stage ||= stage;
    error.message = `${stage}: ${error.message || "Processing failed."}`;
    throw error;
  } finally {
    if (executionId === activeExecution) { progressHandler = null; activeLog = null; }
    if (ffmpeg.loaded) {
      await ffmpeg.deleteFile(fsInputName).catch(() => {});
      await ffmpeg.deleteFile(fsOutputName).catch(() => {});
      for (const name of temporaryAssetNames) await ffmpeg.deleteFile(name).catch(() => {});
      for (let index = 0; index < subtitleAssets.length; index += 1) await ffmpeg.deleteFile(`${executionId}-subtitle-${index}.png`).catch(() => {});
      if (musicFile) await ffmpeg.deleteFile(`${executionId}-music.${/^[a-z0-9]{1,8}$/.test(musicFile.name.split(".").pop()?.toLowerCase()) ? musicFile.name.split(".").pop().toLowerCase() : "bin"}`).catch(() => {});
    }
    executionBusy = false;
  }
}

export async function runMergePlan({ files, planRes, log = () => {}, onProgress, onStatus = () => {} }) {
  if (executionBusy) throw new Error("FFmpeg is already processing.");
  const executionId = ++activeExecution;
  let stage = "Validation";
  let prepared;
  try {
    prepared = prepareMergeExecution({ files, planRes, executionId });
  } catch (error) {
    error.stage = "Validation";
    throw error;
  }
  executionBusy = true;
  const { inputNames, outputName, args } = prepared;
  const checkCancelled = () => {
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
  };
  try {
    onStatus("Preparing");
    stage = "FFmpeg";
    onStatus("Loading");
    await ensureFfmpeg(log);
    checkCancelled();
    progressHandler = (value) => {
      if (executionId === activeExecution) onProgress?.(value);
    };
    onStatus("Writing inputs");
    await ffmpeg.deleteFile(outputName).catch(() => {});
    for (let index = 0; index < files.length; index += 1) {
      checkCancelled();
      await ffmpeg.deleteFile(inputNames[index]).catch(() => {});
      log(`Writing input ${index + 1} of ${files.length}...`);
      const bytes = new Uint8Array(await files[index].arrayBuffer());
      checkCancelled();
      await ffmpeg.writeFile(inputNames[index], bytes);
    }
    checkCancelled();
    onStatus("Processing");
    log(`Exec: ffmpeg ${args.join(" ")}`);
    const exitCode = await ffmpeg.exec(args);
    checkCancelled();
    if (exitCode !== 0) throw new Error(`FFmpeg failed with exit code ${exitCode}`);
    onStatus("Reading output");
    stage = "Output";
    let data;
    try {
      data = await ffmpeg.readFile(outputName);
    } catch {
      throw new Error("Merge output file is missing.");
    }
    checkCancelled();
    if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new Error("Merge output file is empty.");
    const blob = new Blob([data], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    try {
      checkCancelled();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    onStatus("Completed");
    return { blob, url, outputName: planRes.output_filename, revoke: () => URL.revokeObjectURL(url) };
  } catch (error) {
    error.stage ||= stage;
    onStatus(executionId !== activeExecution ? "Cancelled" : "Failed");
    if (executionId !== activeExecution) throw new Error("Processing was cancelled.");
    throw error;
  } finally {
    if (executionId === activeExecution) { progressHandler = null; activeLog = null; }
    if (ffmpeg.loaded) {
      for (const name of [...inputNames, outputName]) await ffmpeg.deleteFile(name).catch(() => {});
    }
    executionBusy = false;
  }
}
