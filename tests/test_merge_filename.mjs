import assert from "node:assert/strict";
import { applyMergeDownloadName, mergedDownloadFilename, mergeFilenameForOrder } from "../app/web/static/js/app/merge-filename.js";
import { moveClip, reorderClip } from "../app/web/static/js/app/merge-state.js";

for (const [source, expected] of [
  ["video01.mp4", "video01_merged.mp4"],
  ["camera.webm", "camera_merged.mp4"],
  ["movie.final.mov", "movie.final_merged.mp4"],
  ["clip.mkv", "clip_merged.mp4"],
  ["folder/clip.mp4", "clip_merged.mp4"],
  ["folder\\clip.mp4", "clip_merged.mp4"],
  ["bad\u0000name.mp4", "bad_name_merged.mp4"],
  ["unsafe<>:\"|?*.mp4", "unsafe________merged.mp4"],
  [".mp4", "merged.mp4"],
  ["", "merged.mp4"],
]) assert.equal(mergedDownloadFilename(source), expected);

const entries = [{ id: "a", file: { name: "first.mp4" } }, { id: "b", file: { name: "second.webm" } }];
let order = ["a", "b"];
assert.equal(mergeFilenameForOrder(entries, order), "first_merged.mp4");
order = moveClip(order, "b", -1);
assert.equal(mergeFilenameForOrder(entries, order), "second_merged.mp4");
order = reorderClip(order, "a", "b", false);
assert.equal(mergeFilenameForOrder(entries, order), "first_merged.mp4");
entries.shift();
order = order.filter((id) => id !== "a");
assert.equal(mergeFilenameForOrder(entries, order), "second_merged.mp4");
assert.equal(mergeFilenameForOrder([], []), "merged.mp4");

const download = { href: "blob:example", download: "" };
const label = { textContent: "" };
applyMergeDownloadName(download, label, "second_merged.mp4");
assert.equal(download.href, "blob:example");
assert.equal(download.download, "second_merged.mp4");
assert.equal(label.textContent, "second_merged.mp4");
console.log("Merge filename tests passed");
