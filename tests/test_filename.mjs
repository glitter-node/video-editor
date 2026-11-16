import assert from "node:assert/strict";
import { buildOutputFilename, outputExtension } from "../app/web/static/js/app/filename.js";

const cases = [
  ["video.mp4", "mp4", "video_edited.mp4"],
  ["sample.mov", "mp4", "sample_edited.mp4"],
  ["recording.webm", "mp4", "recording_edited.mp4"],
  ["movie.final.mp4", "mp4", "movie.final_edited.mp4"],
  ["20261112_151219_5.mp4", "mp4", "20261112_151219_5_edited.mp4"],
  ["sample.mp4", "webm", "sample_edited.webm"],
  ["sample.mp4", "mp3", "sample_edited.mp3"],
  ["한글 sample file.mp4", "m4a", "한글 sample file_edited.m4a"],
  ["", "mp4", "video_edited.mp4"],
  [".mp4", "mp4", "video_edited.mp4"],
  ["folder\\clip.mp4", "mp4", "clip_edited.mp4"],
  ["folder/clip\u0000.mp4", "mp4", "clip__edited.mp4"],
];

for (const [source, extension, expected] of cases) {
  assert.equal(buildOutputFilename(source, extension), expected);
}

assert.equal(buildOutputFilename("sample.mp4", ".MP3"), "sample_edited.mp3");
assert.equal(outputExtension("output.mp4", "video", "webm"), "mp4");
assert.equal(outputExtension("output", "image", "mp4"), "png");
assert.equal(outputExtension("output", "audio", "mp3"), "mp3");
console.log("filename tests passed");
