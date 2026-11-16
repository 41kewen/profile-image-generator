import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'validation');
await mkdir(output, { recursive: true });
const fixture = path.join(output, 'wide-crop-fixture.png');
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4800" height="1600"><rect width="1600" height="1600" fill="#df6675"/><rect x="1600" width="1600" height="1600" fill="#75ad9c"/><rect x="3200" width="1600" height="1600" fill="#648bbb"/></svg>')).png().toFile(fixture);
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
async function rendered() { return page.evaluate(() => window.generator.render(1)); }
async function upload(slot = 'avatar') {
  await page.locator('#status').evaluate((node) => { node.textContent = ''; });
  await page.locator(`[data-asset="${slot}"]`).setInputFiles(fixture);
  await page.locator('#crop-dialog').waitFor({ state: 'visible' });
}
async function applied() { await page.waitForFunction(() => document.querySelector('#status').textContent.includes('图片已更换')); }
async function pixels() {
  const data = await page.locator('#avatar-thumbnail').getAttribute('src');
  return sharp(Buffer.from(data.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
try {
  await page.goto(pathToFileURL(path.join(root, 'dist', '图片生成器.html')).href);
  await page.waitForFunction(() => window.generatorReady);
  const before = await rendered();
  await upload();
  assert.equal(await rendered(), before);
  await page.locator('#crop-cancel').click();
  assert.equal(await rendered(), before);
  checks.push('4800×1600 原图等待确认，取消不改变项目');

  await upload();
  await page.locator('#crop-canvas').focus();
  for (let index = 0; index < 9; index += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.screenshot({ path: path.join(output, 'manual-crop-preview.png'), fullPage: true });
  await page.locator('#crop-confirm').click();
  await applied();
  const cropped = await pixels();
  const midpoint = (Math.floor(cropped.info.height / 2) * cropped.info.width + Math.floor(cropped.info.width / 2)) * 4;
  assert.deepEqual([...cropped.data.subarray(midpoint, midpoint + 3)], [223, 102, 117]);
  assert.notEqual(await rendered(), before);
  await writeFile(path.join(output, 'manual-crop-result.png'), Buffer.from((await rendered()).split(',')[1], 'base64'));
  checks.push('手动移动到左侧，实际生成红色选区而非默认中间绿色');

  const selected = await rendered();
  await upload();
  await page.keyboard.press('Escape');
  assert.equal(await rendered(), selected);
  checks.push('Esc 取消保留已确认图片');

  await upload();
  assert.equal(await page.locator('#crop-whole').count(), 0);
  assert.equal(await page.locator('#crop-dialog').getByText('保留整张图片').count(), 0);
  await page.locator('#crop-cancel').click();
  checks.push('整图保留按钮和提示已移除，手动裁剪与取消仍可用');

  for (const slot of ['cover', 'background', 'profileBackground', 'mapImage', 'projectBackground', 'hobbiesBackground', 'projectIcon0']) {
    await upload(slot);
    await page.locator('#crop-zoom').fill('2');
    await page.locator('#crop-zoom').dispatchEvent('input');
    assert.equal(await page.locator('#crop-zoom-value').textContent(), '2.0×');
    await page.locator('#crop-confirm').click();
    await applied();
  }
  checks.push('封面、全景、简介背景、地图、卡片背景、图标均走手动取景');

  await page.setViewportSize({ width: 390, height: 844 });
  await upload();
  assert(await page.locator('#crop-dialog').evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
  await page.screenshot({ path: path.join(output, 'manual-crop-mobile.png'), fullPage: true });
  await page.locator('#crop-cancel').click();
  assert.deepEqual(errors, []);
  checks.push('手机裁剪窗口无横向溢出，无 JavaScript 运行时异常');
  await writeFile(path.join(output, 'manual-crop-tests.json'), JSON.stringify({ checks, errors }, null, 2));
  checks.forEach((name) => console.log('PASS', name));
} finally { await browser.close(); }
