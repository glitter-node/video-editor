import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const fixtureDir = resolve('tests/fixtures/.generated');
mkdirSync(fixtureDir, { recursive: true });
const fixture = join(fixtureDir, 'sample.mp4');
if (!existsSync(fixture)) execFileSync('bash', [resolve('tests/fixtures/make-video.sh'), fixture]);
const appUrl = process.env.VIDEO_EDITOR_E2E_URL || 'http://127.0.0.1:8011/t/app';

async function openEditor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(appUrl);
  return errors;
}

async function selectVideo(page) {
  await page.locator('#file').setInputFiles(fixture);
  await expect(page.locator('#timelineEditor')).toBeVisible();
  await expect(page.locator('#metaResolution')).toHaveText('320 × 180');
  await expect(page.locator('#metaType')).toHaveText('video/mp4');
}

async function playheadMetrics(page) {
  return page.evaluate(() => {
    const track = document.querySelector('#timelineTrack');
    const head = document.querySelector('#timelinePlayhead');
    const video = document.querySelector('#inputPreview');
    const viewport = document.querySelector('#timelineViewport');
    const rect = track.getBoundingClientRect();
    const h = head.getBoundingClientRect();
    const style = getComputedStyle(head);
    return { expected: rect.left + rect.width * video.currentTime / video.duration, actual: h.left + h.width / 2, display: style.display, opacity: Number(style.opacity), visible: style.visibility, z: Number(style.zIndex), scroll: viewport.scrollLeft, width: rect.width, onTop: document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2) === head };
  });
}

test('playhead follows seek, playback, zoom, scroll and fit', async ({ page }) => {
  const errors = await openEditor(page);
  await expect(page.locator('#timelineEditor')).toBeHidden();
  await selectVideo(page);
  await expect(page.locator('#timelinePlayhead')).toBeVisible();
  const initial = await playheadMetrics(page);
  expect(Math.abs(initial.actual - initial.expected)).toBeLessThan(8);
  expect(initial.z).toBeGreaterThan(10);
  expect(initial.opacity).toBe(1);
  expect(initial.display).not.toBe('none');
  expect(initial.visible).toBe('visible');
  await page.locator('#inputPreview').evaluate(video => { video.currentTime = 1.5; });
  await expect.poll(async () => Number(await page.locator('#timelinePlayhead').getAttribute('aria-valuenow'))).toBeGreaterThan(1400);
  expect((await playheadMetrics(page)).onTop).toBe(true);
  for (const zoom of ['2x', '4x']) {
    await page.locator('#timelineZoomIn').click();
    await expect(page.locator('#timelineZoomValue')).toHaveText(zoom);
    const metrics = await playheadMetrics(page);
    expect(Math.abs(metrics.actual - metrics.expected)).toBeLessThan(8);
  }
  await page.locator('#timelineViewport').evaluate(node => { node.scrollLeft = 200; });
  expect(Math.abs((await playheadMetrics(page)).actual - (await playheadMetrics(page)).expected)).toBeLessThan(8);
  await page.locator('#timelineZoomFit').click();
  await expect(page.locator('#timelineZoomValue')).toHaveText('1x');
  expect(Math.abs((await playheadMetrics(page)).actual - (await playheadMetrics(page)).expected)).toBeLessThan(8);
  await page.locator('#inputPreview').evaluate(video => video.play());
  await expect.poll(async () => Number(await page.locator('#timelinePlayhead').getAttribute('aria-valuenow'))).toBeGreaterThan(1800);
  await page.locator('#inputPreview').evaluate(video => video.pause());
  const paused = await playheadMetrics(page);
  await expect.poll(async () => (await playheadMetrics(page)).actual).toBeGreaterThan(paused.actual - 2);
  expect(errors).toEqual([]);
});

test('thumbnails, trim, remove segment, loop and clear', async ({ page }) => {
  const errors = await openEditor(page);
  await selectVideo(page);
  await expect(page.locator('.timeline-thumbnail')).toHaveCount(12, { timeout: 30000 });
  const samples = await page.locator('.timeline-thumbnail').first().evaluate(canvas => {
    const context = canvas.getContext('2d');
    return [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]].map(([x, y]) => [...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data]);
  });
  expect(new Set(samples.map(sample => sample.slice(0, 3).join(','))).size).toBeGreaterThan(1);
  await page.locator('#trimStart').fill('500');
  await page.locator('#trimEnd').fill('2500');
  await page.locator('#trimEnd').dispatchEvent('change');
  await expect(page.locator('#trimStartHandle')).toHaveAttribute('aria-valuenow', '500');
  await expect(page.locator('#trimEndHandle')).toHaveAttribute('aria-valuenow', '2500');
  await page.locator('#segStart').fill('1000');
  await page.locator('#segEnd').fill('1500');
  await page.locator('#addSeg').click();
  await expect(page.locator('.timeline-segment')).toHaveCount(1);
  await page.locator('#loopTrim').check();
  await page.locator('#inputPreview').evaluate(video => video.play());
  await expect.poll(async () => page.locator('#inputPreview').evaluate(video => video.currentTime)).toBeGreaterThan(0.5);
  await page.locator('#inputPreview').evaluate(video => video.pause());
  await page.locator('#clear').click();
  await expect(page.locator('#timelineEditor')).toBeHidden();
  await expect(page.locator('.timeline-thumbnail')).toHaveCount(0);
  await expect(page.locator('#loopTrim')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('trim handles and removed segment edits update the recipe', async ({ page }) => {
  await openEditor(page);
  await selectVideo(page);
  await page.locator('#trimStart').fill('500');
  await page.locator('#trimEnd').fill('2500');
  const start = page.locator('#trimStartHandle');
  const startBox = await start.boundingBox();
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox.x + startBox.width / 2 + 20, startBox.y + startBox.height / 2, { steps: 5 });
  await page.mouse.up();
  const movedStart = Number(await page.locator('#trimStart').inputValue());
  expect(movedStart).toBeGreaterThan(500);
  await page.locator('#segStart').fill('1000');
  await page.locator('#segEnd').fill('1500');
  await page.locator('#addSeg').click();
  const segment = page.locator('.timeline-segment').first();
  await expect(segment).toBeVisible();
  const segmentBox = await segment.boundingBox();
  await page.mouse.move(segmentBox.x + segmentBox.width / 2, segmentBox.y + segmentBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(segmentBox.x + segmentBox.width / 2 + 15, segmentBox.y + segmentBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#segList')).not.toContainText('1000–1500');
  const validation = page.waitForResponse(response => response.url().endsWith('/api/recipe/validate') && response.request().method() === 'POST');
  await page.locator('#validate').click();
  const request = (await validation).request().postDataJSON();
  expect(request.recipe.trim.start_ms).toBe(movedStart);
  expect(request.recipe.remove_segments).toHaveLength(1);
  expect(request.recipe.remove_segments[0].start_ms).toBeGreaterThan(1000);
});

test('zoom, scrolled seek, segment resizing, history and file replacement', async ({ page }) => {
  await openEditor(page);
  await selectVideo(page);
  await page.locator('#inputPreview').evaluate(video => { video.currentTime = 1.5; });
  for (const level of [2, 4, 8, 16]) {
    await page.locator('#timelineZoomIn').click();
    await expect(page.locator('#timelineZoomValue')).toHaveText(`${level}x`);
    const metrics = await playheadMetrics(page);
    expect(Math.abs(metrics.actual - metrics.expected)).toBeLessThan(8);
  }
  await page.locator('#timelineViewport').evaluate(node => { node.scrollLeft = node.scrollWidth / 3; });
  const track = await page.locator('#timelineTrack').boundingBox();
  const viewport = await page.locator('#timelineViewport').boundingBox();
  await page.mouse.click(viewport.x + viewport.width * 0.4, track.y + track.height * 0.7);
  await expect.poll(() => page.locator('#inputPreview').evaluate(video => video.currentTime)).toBeGreaterThan(1.4);
  expect(Math.abs((await playheadMetrics(page)).actual - (await playheadMetrics(page)).expected)).toBeLessThan(8);
  await page.locator('#segStart').fill('1000');
  await page.locator('#segEnd').fill('1500');
  await page.locator('#addSeg').click();
  await expect(page.locator('.timeline-segment')).toHaveCount(1);
  const right = page.locator('.timeline-segment-handle-right');
  const box = await right.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#segList')).not.toContainText('1000–1500');
  await expect(page.locator('#undoBtn')).toBeEnabled();
  await page.locator('#undoBtn').click();
  await expect(page.locator('#segList')).toContainText('1000–1500');
  await page.locator('#redoBtn').click();
  await expect(page.locator('#segList')).not.toContainText('1000–1500');
  await page.locator('#file').setInputFiles({ name: 'replacement.mp4', mimeType: 'video/mp4', buffer: readFileSync(fixture) });
  await expect(page.locator('#metaName')).toHaveText('replacement.mp4');
  await expect(page.locator('#timelineZoomValue')).toHaveText('1x');
  await expect(page.locator('.timeline-segment')).toHaveCount(0);
  await expect(page.locator('.timeline-thumbnail')).toHaveCount(12, { timeout: 30000 });
});

test('unsupported input reports failure and preserves the empty timeline', async ({ page }) => {
  await openEditor(page);
  await page.locator('#file').setInputFiles({ name: 'invalid.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid video data') });
  await expect(page.locator('#statusTitle')).toHaveText('Failed');
  await expect(page.locator('#timelineEditor')).toBeHidden();
  await expect(page.locator('#inputEmpty')).toBeVisible();
  await expect(page.locator('#run')).toBeDisabled();
});

test('browser FFmpeg trim produces a downloadable MP4', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await openEditor(page);
  await selectVideo(page);
  await page.locator('#trimStart').fill('500');
  await page.locator('#trimEnd').fill('2500');
  await page.locator('#validate').click();
  await expect(page.locator('#statusMessage')).toContainText('valid');
  await page.locator('#run').click();
  await expect(page.locator('#statusTitle')).toHaveText('Completed', { timeout: 150000 });
  await expect(page.locator('#outputVideoPanel')).toBeVisible();
  await expect(page.locator('#download')).toHaveAttribute('href', /^blob:/);
  const result = await page.locator('#download').evaluate(async link => ({ size: (await (await fetch(link.href)).blob()).size, duration: document.querySelector('#outVideo').duration }));
  expect(result.size).toBeGreaterThan(1000);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  const outputPath = resolve('test-results/result.mp4');
  await download.saveAs(outputPath);
  expect(statSync(outputPath).size).toBe(result.size);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', outputPath], { encoding: 'utf8' }));
  expect(probe.streams.some(stream => stream.codec_type === 'video' && stream.width === 320 && stream.height === 180)).toBe(true);
  expect(Number(probe.format.duration)).toBeGreaterThan(1.5);
  expect(Number(probe.format.duration)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('cancel terminates the worker and allows another run', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__workerCounts = { created: 0, terminated: 0 };
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__workerCounts.created += 1;
      }
      terminate() {
        window.__workerCounts.terminated += 1;
        return super.terminate();
      }
    };
  });
  await openEditor(page);
  await selectVideo(page);
  await page.locator('#run').click();
  await expect.poll(() => page.evaluate(() => window.__workerCounts.created), { timeout: 120000 }).toBeGreaterThan(0);
  await expect(page.locator('#cancel')).toBeEnabled();
  await page.locator('#cancel').click();
  await expect(page.locator('#statusTitle')).toHaveText('Cancelled');
  await expect.poll(() => page.evaluate(() => window.__workerCounts.terminated)).toBeGreaterThan(0);
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#run').click();
  await expect(page.locator('#statusTitle')).toHaveText('Completed', { timeout: 150000 });
  await page.locator('#clear').click();
  await expect(page.locator('#timelineEditor')).toBeHidden();
  await expect(page.locator('#outputSection')).toBeHidden();
  await expect(page.locator('#download')).toHaveAttribute('href', '#');
});
