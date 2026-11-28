// Tiny static file server for local preview of ./site (no dependencies).
// Usage: npm run serve [port]   → http://localhost:8080/
// Also serves the photo-field layout editor (tools/photo-layout-editor/) at
// /__layout-editor/. Its Save button writes site/js/photo-layout.js, accepted only
// from this computer. Neither is part of the published site.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanLayout, layoutModule } from './photo-layout-file.mjs';

const root = resolve(fileURLToPath(new URL('../site', import.meta.url)));
const editorRoot = resolve(fileURLToPath(new URL('../tools/photo-layout-editor', import.meta.url)));
const layoutFile = join(root, 'js', 'photo-layout.js');
const EDITOR = '/__layout-editor/';
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function readBody(req, limit = 1_000_000) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { fail(new Error('The layout is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

async function saveLayout(req, res) {
  const reply = (code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (!isLocal(req)) return reply(403, { ok: false, error: 'Saving only works from this computer (http://localhost).' });
  try {
    const layout = cleanLayout(JSON.parse(await readBody(req)));
    await writeFile(layoutFile, layoutModule(layout), 'utf8');
    console.log(`Saved the photo layout (${layout ? layout.photos.length + ' photos' : 'automatic'}) to site/js/photo-layout.js`);
    return reply(200, { ok: true });
  } catch (e) {
    return reply(400, { ok: false, error: e instanceof SyntaxError ? 'The layout was not valid JSON.' : e.message });
  }
}
const port = Number(process.argv[2] || process.env.PORT || 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method === 'POST' && pathname === EDITOR + 'save') return saveLayout(req, res);
    if (pathname === EDITOR.slice(0, -1)) {
      res.writeHead(301, { Location: EDITOR }).end();
      return;
    }
    const inEditor = pathname.startsWith(EDITOR);
    const base = inEditor ? editorRoot : root;
    let file = normalize(join(base, inEditor ? pathname.slice(EDITOR.length) : pathname));
    if (!file.startsWith(base)) throw Object.assign(new Error('forbidden'), { code: 403 });
    if ((await stat(file).catch(() => null))?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' }).end();
        return;
      }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    const headers = {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes', // browsers need byte ranges to seek in video (the hero scrub)
    };
    const range = /^bytes=([0-9]*)-([0-9]*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (start > end || start >= body.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, () => console.log(`Serving ${root}\n→ http://localhost:${port}/\n→ photo layout editor: http://localhost:${port}${EDITOR}`));
