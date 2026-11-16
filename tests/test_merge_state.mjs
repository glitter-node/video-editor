import assert from "node:assert/strict";
import { buildMergeRecipe, moveClip, parseSecondsMs, reorderClip, timelineClips, validateAddition } from "../app/web/static/js/app/merge-state.js";
import { activeMergeTransitions, mergeBoundaries, mergeTransitionLayout } from "../app/web/static/js/app/merge-transitions.js";

const file = (name, size = 100) => ({ name, size });
const entries = [
  { id: "video-1", file: file("same.mp4"), meta: { duration_ms: 3000, width: 1920, height: 1080 }, fps: "30", hasAudio: true },
  { id: "video-2", file: file("same.mp4"), meta: { duration_ms: 2000, width: 1280, height: 720 }, fps: "24", hasAudio: false },
];
const output = { width: "1280", height: "720", fps: "30" };
validateAddition(entries, [file("third.webm")]);
assert.throws(() => validateAddition(entries, [file("bad.avi")]), /Unsupported/);
assert.throws(() => validateAddition(entries, [file("empty.mp4", 0)]), /Invalid/);
assert.deepEqual(moveClip(["video-1", "video-2"], "video-2", -1), ["video-2", "video-1"]);
assert.deepEqual(reorderClip(["video-1", "video-2"], "video-1", "video-2", true), ["video-2", "video-1"]);
assert.deepEqual(reorderClip(["video-1", "video-2"], "missing", "video-2"), ["video-1", "video-2"]);
assert.equal(mergeBoundaries(["video-1"]).length, 0);
assert.equal(mergeBoundaries(["video-1", "video-2"]).length, 1);
assert.equal(mergeBoundaries(["video-1", "video-2", "video-3"]).length, 2);
assert.equal(mergeBoundaries(["video-1", "video-2", "video-3", "video-4"]).length, 3);
const transitionClips = [
  { id: "video-1", duration_ms: 3000 },
  { id: "video-2", duration_ms: 2000 },
  { id: "video-3", duration_ms: 4000 },
  { id: "video-4", duration_ms: 2500 },
];
const transitionSettings = new Map([["video-1|video-2", { type: "crossfade", duration_ms: 500 }], ["video-2|video-3", { type: "fadeblack", duration_ms: 700 }]]);
assert.equal(mergeTransitionLayout(transitionClips, transitionSettings).boundaries.length, 3);
assert.deepEqual(activeMergeTransitions(["video-1", "video-2", "video-3", "video-4"], transitionSettings), [{ from_id: "video-1", to_id: "video-2", type: "crossfade", duration_ms: 500 }, { from_id: "video-2", to_id: "video-3", type: "fadeblack", duration_ms: 700 }]);
assert.equal(parseSecondsMs("0.001"), 1);
assert.equal(parseSecondsMs("2.345"), 2345);
for (const value of ["", "-1", "1.0001", "NaN", "Infinity", "1e2", "1.2.3"]) assert.throws(() => parseSecondsMs(value), /invalidRange/);
const recipe = buildMergeRecipe(entries, ["video-2", "video-1"], output);
assert.deepEqual(recipe.inputs.map((input) => input.id), ["video-1", "video-2"]);
assert.deepEqual(recipe.clips.map((clip) => clip.input_id), ["video-2", "video-1"]);
assert.equal(recipe.inputs[0].has_audio, true);
assert.equal(recipe.inputs[1].has_audio, false);
assert.equal(recipe.output.video_codec, "libx264");
const trimmed = [{ ...entries[0], startSeconds: "0.500", endSeconds: "1.750" }, { ...entries[1], startSeconds: "0", endSeconds: "0.001" }];
const trimmedRecipe = buildMergeRecipe(trimmed, ["video-2", "video-1"], output);
assert.deepEqual(trimmedRecipe.inputs.map((input) => input.id), ["video-1", "video-2"]);
assert.deepEqual(trimmedRecipe.clips, [{ input_id: "video-2", start_ms: 0, end_ms: 1 }, { input_id: "video-1", start_ms: 500, end_ms: 1750 }]);
assert.equal(timelineClips(trimmed, ["video-2", "video-1"]).reduce((sum, clip) => sum + clip.duration_ms, 0), 1251);
assert.throws(() => buildMergeRecipe([{ ...entries[0], startSeconds: "2", endSeconds: "1" }, entries[1]], ["video-1", "video-2"], output), /invalidRange/);
assert.throws(() => buildMergeRecipe([{ ...entries[0], endSeconds: "3.001" }, entries[1]], ["video-1", "video-2"], output), /invalidRange/);
assert.throws(() => buildMergeRecipe([{ ...entries[0], fps: "" }, entries[1]], ["video-1", "video-2"], output), /FPS/);
assert.throws(() => buildMergeRecipe([{ ...entries[0], hasAudio: null }, entries[1]], ["video-1", "video-2"], output), /audio/);
assert.throws(() => buildMergeRecipe([{ ...entries[0], meta: null }, entries[1]], ["video-1", "video-2"], output), /Metadata/);
assert.throws(() => buildMergeRecipe(entries, ["video-1", "video-1"], output), /order/);
assert.throws(() => buildMergeRecipe(entries, ["video-1", "video-2"], { ...output, width: "1279" }), /output/);
console.log("Merge state tests passed");
