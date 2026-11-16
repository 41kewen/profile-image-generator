import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// 只准备用户指定位置的一个可见范围，不批量预取城市或缩放级别。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lat = Number(process.argv[2] || 30.248);
const lon = Number(process.argv[3] || 120.151);
const zoom = Number(process.argv[4] || 12);
const target = path.resolve(process.argv[5] || path.join(root, 'assets', 'map-default.png'));
if (!Number.isFinite(lat) || Math.abs(lat) > 85.051128 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !Number.isInteger(zoom) || zoom < 3 || zoom > 17) throw new Error('位置或缩放级别无效。');
const width = 505;
const height = 309;
const worldSize = 256 * 2 ** zoom;
const centerX = (lon + 180) / 360 * worldSize;
const centerY = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * worldSize;
const firstX = Math.floor((centerX - width / 2) / 256);
const firstY = Math.floor((centerY - height / 2) / 256);
const lastX = Math.floor((centerX + width / 2 - 1) / 256);
const lastY = Math.floor((centerY + height / 2 - 1) / 256);
const layers = [];
for (let y = firstY; y <= lastY; y += 1) {
  for (let x = firstX; x <= lastX; x += 1) {
    const tileX = ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
    const url = `https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'profile-image-generator/1.1 (https://github.com/41kewen/profile-image-generator)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`地图请求失败：HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== 256 || metadata.height !== 256) throw new Error('地图瓦片尺寸无效。');
    const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
    let warningPixels = 0;
    for (let index = 0; index < pixels.length; index += 3) {
      if (pixels[index] > 248 && pixels[index + 1] > 248 && pixels[index + 2] < 10) warningPixels += 1;
    }
    if (warningPixels > 100) throw new Error('地图服务返回了访问限制错误图，未写入素材。');
    layers.push({ input: bytes, left: (x - firstX) * 256, top: (y - firstY) * 256 });
  }
}
const combined = await sharp({ create: { width: (lastX - firstX + 1) * 256, height: (lastY - firstY + 1) * 256, channels: 3, background: '#e4eddf' } }).composite(layers).png().toBuffer();
const map = await sharp(combined).extract({ left: Math.round(centerX - width / 2 - firstX * 256), top: Math.round(centerY - height / 2 - firstY * 256), width, height }).png().toBuffer();
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, map);
const sources = {
  decorativeAssets: { files: '*.svg', author: 'kewen', license: 'MIT', source: '本项目原创矢量装饰素材' },
  map: { file: path.basename(target), lat, lon, zoom, width, height, attribution: '© OpenStreetMap contributors',
    imageLicense: 'CC-BY-SA-2.0', dataLicense: 'ODbL-1.0', source: 'https://tile.openstreetmap.org/', copyright: 'https://www.openstreetmap.org/copyright' },
};
await writeFile(path.join(path.dirname(target), 'sources.json'), JSON.stringify(sources, null, 2), 'utf8');
console.log(JSON.stringify({ output: target, bytes: map.length, ...sources.map }, null, 2));
