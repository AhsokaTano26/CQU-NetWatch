import { createServer as httpServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

export function createServer(service, staticRoot = dist) {
  const server = httpServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    try {
      if (req.url.length > 2048) return json(res, 414, { error: '请求地址过长' });
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith('/api/')) {
        if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: '只支持只读 GET 请求' }); }
        if (path === '/api/health') return json(res, 200, { status: 'ok', configured: service.configured });
        let allowed = [];
        if (path === '/api/overview') {
          if ([...url.searchParams.keys()].length) return json(res, 400, { error: '不支持自定义查询参数' });
          return json(res, 200, await service.overview());
        }
        if (path === '/api/status-history') {
          if ([...url.searchParams.keys()].length) return json(res, 400, { error: '不支持自定义查询参数' });
          return json(res, 200, await service.statusHistory());
        }
        const match = path.match(/^\/api\/buildings\/([a-zA-Z0-9_-]+)\/history$/);
        if (match) {
          allowed = ['range'];
          if ([...url.searchParams.keys()].some(k => !allowed.includes(k)) || url.searchParams.getAll('range').length > 1) return json(res, 400, { error: '无效查询参数' });
          return json(res, 200, await service.history(match[1], url.searchParams.get('range') || '24h'));
        }
        return json(res, 404, { error: '接口不存在' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '只支持 GET 或 HEAD 请求' });
      if (path.split('/').some(p => p.startsWith('.') || p.includes('\\'))) return json(res, 404, { error: '页面不存在' });
      let file = resolve(staticRoot, '.' + path);
      if (file !== resolve(staticRoot) && !file.startsWith(resolve(staticRoot) + sep)) return json(res, 404, { error: '页面不存在' });
      let info;
      try { info = await stat(file); } catch {}
      if (!info?.isFile()) {
        if (extname(path) || !['/', '/monitoring', '/status'].includes(path) && !/^\/buildings\/[a-zA-Z0-9_-]+$/.test(path)) return json(res, 404, { error: '页面不存在' });
        file = resolve(staticRoot, 'index.html');
        try { info = await stat(file); } catch { return json(res, 503, { error: '前端未构建，请先执行 npm run build' }); }
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': info.size,
        'Cache-Control': file.includes(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, e instanceof URIError ? 400 : e.status || 500, { error: e.status ? e.message : '服务暂时不可用' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}
