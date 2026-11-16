import assert from "node:assert/strict";
import { applyTheme, normalizeTheme, readStoredTheme } from "../app/web/static/js/app/theme.js";

assert.equal(normalizeTheme("light"), "light");
assert.equal(normalizeTheme("dark"), "dark");
assert.equal(normalizeTheme("solarized"), "light");
assert.equal(readStoredTheme({ getItem: () => "dark" }), "dark");
assert.equal(readStoredTheme({ getItem: () => "invalid" }), "light");
assert.equal(readStoredTheme({ getItem: () => { throw new Error("storage unavailable"); } }), "light");
globalThis.document = { documentElement: { dataset: {} } };
assert.equal(applyTheme("dark"), "dark");
assert.equal(document.documentElement.dataset.theme, "dark");
assert.equal(applyTheme("invalid"), "light");
assert.equal(document.documentElement.dataset.theme, "light");
console.log("theme tests passed");
