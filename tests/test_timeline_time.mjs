import assert from "node:assert/strict";
import { chooseTickStep, clampMs, formatTime } from "../app/web/static/js/app/time.js";

assert.equal(clampMs(-1, 1000), 0);
assert.equal(clampMs(Number.NaN, 1000), 0);
assert.equal(clampMs(Number.POSITIVE_INFINITY, 1000), 0);
assert.equal(clampMs(1500, 1000), 1000);
assert.equal(formatTime(0), "00:00.000");
assert.equal(formatTime(500), "00:00.500");
assert.equal(formatTime(1500), "00:01.500");
assert.equal(formatTime(60000), "01:00.000");
assert.equal(formatTime(3600000), "01:00:00.000");
assert.equal(chooseTickStep(2000), 1000);
assert.equal(chooseTickStep(3600000), 600000);
console.log("timeline time tests passed");
