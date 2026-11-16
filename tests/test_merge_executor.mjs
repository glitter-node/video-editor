import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareMergeExecution } from "../app/web/static/js/app/merge-contract.js";

const events = [];
let execResult = 0;
let output = new Uint8Array([1, 2, 3]);
let waitForExec = null;
let missingOutput = false;

class MockFFmpeg {
  loaded = false;
  files = new Map();
  on() {}
  async load() { this.loaded = true; }
  async writeFile(name, data) { this.files.set(name, data); events.push(`write:${name}`); }
  async deleteFile(name) { this.files.delete(name); events.push(`delete:${name}`); }
  async exec(args) { events.push(`exec:${args.join(" ")}`); if (waitForExec) await waitForExec; if (!missingOutput) this.files.set(args.at(-1), output); return execResult; }
  async readFile(name) { if (!this.files.has(name)) throw new Error("missing"); return this.files.get(name); }
  terminate() { this.loaded = false; this.files.clear(); events.push("terminate"); }
}

globalThis.__MockFFmpeg = MockFFmpeg;
globalThis.__prepareMergeExecution = prepareMergeExecution;
globalThis.__buildOutputFilename = () => "unused";
globalThis.__outputExtension = () => "mp4";
const source = (await readFile(new URL("../app/web/static/js/app/ffmpeg.js", import.meta.url), "utf8"))
  .replace(/^import .*\r?\n/gm, "");
const prefix = "const FFmpeg = globalThis.__MockFFmpeg; const prepareMergeExecution = globalThis.__prepareMergeExecution; const buildOutputFilename = globalThis.__buildOutputFilename; const outputExtension = globalThis.__outputExtension;\n";
const { runMergePlan, runPlan, cancelFfmpeg } = await import(`data:text/javascript;base64,${Buffer.from(prefix + source).toString("base64")}`);
const graph = "[0:v]trim=start=0.000:end=1.000[v0];[1:v]trim=start=0.000:end=1.000[v1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]";
const planRes = { mode: "merge", inputs: ["input_0.mp4", "input_1.webm"], input_count: 2, clip_count: 2, estimated_duration_ms: 2000, ffmpeg_args: ["-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p"], output_filename: "merged.mp4" };
const files = ["one.mp4", "two.webm"].map((name) => ({ name, size: 3, async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer; } }));
const run = (overrides = {}) => runMergePlan({ files, planRes, log: () => {}, ...overrides });

let result = await run();
assert.equal(result.blob.size, 3);
assert.equal(result.outputName, "merged.mp4");
result.revoke();
assert.equal(events.filter((event) => event.startsWith("write:")).length, 2);
assert.equal(events.filter((event) => event.startsWith("delete:")).length, 6);
assert.match(events.find((event) => event.startsWith("exec:")), /-i 1-input_0.mp4 -i 1-input_1.webm -filter_complex/);

execResult = 1;
await assert.rejects(run(), /FFmpeg failed/);
execResult = 0;
missingOutput = true;
await assert.rejects(run(), /missing/);
missingOutput = false;
output = new Uint8Array();
await assert.rejects(run(), /empty/);
output = new Uint8Array([1]);
result = await run();
result.revoke();

let release;
waitForExec = new Promise((resolve) => { release = resolve; });
const pending = run();
await new Promise((resolve) => setTimeout(resolve, 0));
await assert.rejects(run(), /already processing/);
cancelFfmpeg();
release();
await assert.rejects(pending, /cancelled/);
waitForExec = null;
result = await run();
result.revoke();
assert.ok(events.includes("terminate"));
const single = await runPlan({ file: files[0], planRes: { mode: "video", container: "mp4", ffmpeg_args: [], outputs: [{ name: "output.mp4", kind: "video" }] }, log: () => {} });
assert.equal(single.data.byteLength, 1);
console.log("Merge executor tests passed");
