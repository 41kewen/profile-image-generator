import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'dist'));
const files = {
  background: 'background.svg', cover: 'cover.svg', avatar: 'avatar.svg',
  idea: 'idea.svg', code: 'code.svg', compass: 'compass.svg',
  headphones: 'headphones.svg', music: 'music.svg', mapDefault: 'map-default.png',
};
const assets = {};
for (const [key, filename] of Object.entries(files)) {
  const bytes = await readFile(path.join(root, 'assets', filename));
  const mime = filename.endsWith('.svg') ? 'svg+xml' : 'png';
  assets[key] = `data:image/${mime};base64,${bytes.toString('base64')}`;
}
let html = await readFile(path.join(root, 'src', 'editor.html'), 'utf8');
for (const [marker, filename] of Object.entries({ INLINE_STYLE: 'style.css', INLINE_RENDERER: 'renderer.js', INLINE_APP: 'app.js' })) {
  const content = await readFile(path.join(root, 'src', filename), 'utf8');
  if (content.toLowerCase().includes('</script')) throw new Error(`脚本包含不能内嵌的结束标签：${filename}`);
  if (!html.includes(`/* ${marker} */`)) throw new Error(`缺少打包标记：${marker}`);
  html = html.replace(`/* ${marker} */`, () => content);
}
html = html.replace('/* INLINE_ASSETS */', () => `const DEFAULT_ASSETS = ${JSON.stringify(assets)};`);
if (/\/\* INLINE_/.test(html)) throw new Error('打包存在未替换标记。');
await mkdir(output, { recursive: true });
const target = path.join(output, '图片生成器.html');
await writeFile(target + '.tmp', html, 'utf8');
await rename(target + '.tmp', target);
// Windows PowerShell 5.1 需要 BOM 才能正确读取源码中的中文文件名。
await writeFile(path.join(output, 'start-generator.ps1'), '\ufeff' + await readFile(path.join(root, 'src', 'start-generator.ps1'), 'utf8'), 'utf8');
await writeFile(path.join(output, 'start-generator.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-generator.ps1"\r\nif errorlevel 1 pause\r\n');
await writeFile(path.join(output, 'stop-generator.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-generator.ps1" -Stop\r\nif errorlevel 1 pause\r\n');
for (const filename of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await writeFile(path.join(output, filename), await readFile(path.join(root, filename)));
}
console.log(JSON.stringify({ output: target, bytes: Buffer.byteLength(html), embeddedAssets: Object.keys(assets).length }, null, 2));
