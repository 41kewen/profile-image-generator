import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.GENERATOR_TEST_OUTPUT || path.join(root, 'dist'));
const validation = path.join(root, 'validation');
const online = process.argv.includes('--online');
await mkdir(validation, { recursive: true });
const server = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: root, env: { ...process.env, PORT: '19169' }, windowsHide: true, stdio: 'ignore' });
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const fixture = await sharp(path.join(root, 'assets', 'map-default.png')).resize(256, 256).png().toBuffer();
if (!online) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: fixture, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ lat: '30.248', lon: '120.151', display_name: '杭州示例地点' }]) }));
}
const checks = [];
async function check(name, task) { await task(); checks.push(name); console.log('PASS', name); }
async function ready() { await page.waitForFunction(() => window.generatorReady && window.generator.isMapReady()); }
async function png() { return Buffer.from((await page.evaluate(() => window.generator.render(1))).split(',')[1], 'base64'); }
try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:19169/health')).ok) break; }
    catch { /* 有限次数等待本机服务启动。 */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.goto(pathToFileURL(path.join(output, '图片生成器.html')).href);
  await ready();
  await check('通用默认资料，不包含旧账号和项目', async () => {
    const state = await page.evaluate(() => window.generator.getState());
    assert.equal(state.profile.name, '你的名字');
    assert.equal(state.profile.handle, '@your_handle');
    assert.equal(state.appearance.windowTitle, '个人名片');
    assert.equal(state.project.title, '你的项目');
    assert.equal(state.location.lat, 30.248);
  });
  await check('真实导出按钮生成高清 PNG', async () => {
    const event = page.waitForEvent('download');
    await page.locator('#export-png').click();
    await (await event).saveAs(path.join(validation, 'example-default.png'));
    const metadata = await sharp(path.join(validation, 'example-default.png')).metadata();
    assert.equal(metadata.width, 2752);
    assert.equal(metadata.height, 1856);
  });
  await check('配置恢复的 PNG 像素完全一致', async () => {
    await page.locator('[data-bind="profile.name"]').fill('测试创作者');
    const before = await png();
    const event = page.waitForEvent('download');
    await page.locator('#save-config').click();
    const config = path.join(validation, 'neutral-roundtrip.json');
    await (await event).saveAs(config);
    await page.reload();
    await ready();
    await page.locator('#load-config').setInputFiles(config);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('配置已导入'));
    assert.deepEqual(await sharp(await png()).raw().toBuffer(), await sharp(before).raw().toBuffer());
  });
  await check('图片上传实际改变成图', async () => {
    const before = await png();
    const uploaded = path.join(validation, 'upload-fixture.png');
    await sharp({ create: { width: 300, height: 300, channels: 3, background: '#4c8198' } }).png().toFile(uploaded);
    await page.locator('[data-asset="avatar"]').setInputFiles(uploaded);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('图片已更换'));
    assert.notDeepEqual(await png(), before);
  });
  await check(online ? '真实在线地图选点' : '地图坐标与请求集成（固定瓦片）', async () => {
    await page.goto('http://127.0.0.1:19169/');
    await ready();
    await page.locator('#tab-location').click();
    await page.locator('#city').selectOption('shanghai');
    await ready();
    assert.equal((await page.evaluate(() => window.generator.getState())).location.lat, 31.2304);
    await page.locator('#map-picker').click({ position: { x: 180, y: 70 } });
    await ready();
    assert.notEqual((await page.evaluate(() => window.generator.getState())).location.lon, 121.4737);
  });
  await check('地图失败会暂停导出', async () => {
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.locator('#city').selectOption('chengdu');
    await page.waitForFunction(() => document.querySelector('#map-status').textContent.includes('加载失败'));
    assert.equal(await page.locator('#export-png').isDisabled(), true);
    await page.locator('#city').selectOption('hangzhou');
    await ready();
  });
  await check('320px 移动端无横向溢出', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: path.join(validation, 'neutral-mobile.png'), fullPage: true });
  });
  assert.deepEqual(failures, []);
  await writeFile(path.join(validation, 'neutral-test-results.json'), JSON.stringify({ mode: online ? 'online' : 'fixtures', checks, runtimeErrors: failures }, null, 2));
  console.log(`Passed ${checks.length} checks.`);
} finally {
  await browser.close();
  server.kill();
}
