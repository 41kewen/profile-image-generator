import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 19168);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024–65535 的整数。');
const html = await readFile(path.join(root, 'dist', '图片生成器.html'));
const server = http.createServer((request, response) => {
  const route = (request.url || '/').split('?')[0];
  const isHtml = ['GET', 'HEAD'].includes(request.method) && ['/', '/index.html'].includes(route);
  const isHealth = request.method === 'GET' && route === '/health';
  const body = isHtml ? html : Buffer.from(isHealth ? '{"application":"profile-image-generator-v1"}' : 'Not found');
  response.writeHead(isHtml || isHealth ? 200 : 404, {
    'Content-Type': isHtml ? 'text/html; charset=utf-8' : isHealth ? 'application/json' : 'text/plain',
    'Content-Length': body.length, 'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.listen(port, '127.0.0.1', () => console.log(`图片生成器：http://127.0.0.1:${port}/（Ctrl+C 停止）`));
server.on('error', (error) => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
