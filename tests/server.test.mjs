import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../server/config.mjs';
import { Prometheus, buildExpression, QueryError } from '../server/prometheus.mjs';
import { createService } from '../server/service.mjs';
import { createServer } from '../server/http.mjs';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function fixture(t, handler) {
  const s = httpServer(handler); const url = await listen(s);
  t.after(() => new Promise(resolve => { s.closeAllConnections(); s.close(resolve); })); return url;
}
const metric = { campus: 'hx', building: 'zy05', building_group: 'zy', probe_id: 'hx-zy05-one', network_type: 'wired', target: 'aliyun_dns' };
test('query templates escape labels and gate quality on online and last seen', async () => {
  const c = await loadConfig({});
  const expr = buildExpression(c, 'loss', { campus: 'hx', building: 'a"\\b' });
  assert.ok(expr.includes('building="a\\"\\\\b"'));
  assert.ok(expr.includes('last_seen_timestamp_seconds')); assert.ok(expr.includes('1800')); assert.ok(expr.includes('86400')); assert.ok(!expr.includes('{{reportOfflineSeconds}}'));
  assert.ok(expr.includes('time() - campus_probe_last_seen_timestamp_seconds'));
  assert.ok(expr.includes('<= 180'));
  assert.ok(buildExpression(c, 'online').includes('timestamp(campus_probe_last_seen_timestamp_seconds'));
});
test('concurrent identical queries share one request and cache, preserving API subpath', async t => {
  let requests = 0;
  const url = await fixture(t, (req, res) => {
    requests++; assert.ok(req.url.startsWith('/prom/api/v1/query?'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [{ metric, value: [Date.now()/1000, '1'] }] } }));
  });
  const c = await loadConfig({ PROMETHEUS_URL: url + '/prom' });
  const p = new Prometheus(c); t.after(() => p.close());
  const results = await Promise.all([p.query('online'), p.query('online')]);
  await p.query('online');
  assert.equal(requests, 1); assert.equal(results[0][0].value[1], '1');
});
test('history protocol, units and adaptive point bound work end to end', async t => {
  const seen = [];
  const url = await fixture(t, (req, res) => {
    const u = new URL(req.url, 'http://local'); const q = u.searchParams.get('query');
    seen.push(u); const range = u.pathname.endsWith('query_range');
    const now = Date.now()/1000;
    const value = q.includes('loss') ? '0.2' : q.includes('icmp') || q.includes('http') ? '0.025' : q.includes('changes(') ? '0' : q.includes('bool') ? '1' : String(now-5);
    const result = range ? [{ metric, values: [[Number(u.searchParams.get('start')), value], [Number(u.searchParams.get('end')), value]] }] : [{ metric, value: [now, value] }];
    res.end(JSON.stringify({ status: 'success', data: { resultType: range ? 'matrix' : 'vector', result } }));
  });
  const c = await loadConfig({ PROMETHEUS_URL: url });
  const p = new Prometheus(c); t.after(() => p.close()); const service = createService(c, p);
  const overview = await service.overview();
  const building = overview.buildings.find(b => b.id === 'hx-zy05');
  assert.equal(building.status, 'unstable'); assert.equal(building.latency, 25);
  const history = await service.history('hx-zy05', '7d');
  assert.ok(history.metrics.flaps); assert.ok(history.metrics.lossWindow);
  assert.ok(history.step >= history.duration / 719);
  assert.equal(history.metrics.latency[0].points[0][1], 25);
  assert.ok(seen.filter(u => u.pathname.endsWith('query_range')).every(u => u.searchParams.get('query').includes('building="zy05"')));
});
test('unconfigured is distinct from empty or failed and contains no credentials', async () => {
  const c = await loadConfig({}); const p = new Prometheus(c); const service = createService(c, p);
  const result = await service.overview();
  assert.equal(result.source.state, 'unconfigured'); assert.ok(result.buildings.every(b => b.status === 'empty'));
  assert.ok(!JSON.stringify(result).includes('prometheusUrl'));
});
test('upstream errors are sanitized; partial failures never turn buildings green', async t => {
  const url = await fixture(t, (req, res) => {
    if (new URL(req.url, 'http://local').searchParams.get('query').includes('loss')) { res.statusCode = 500; res.end('secret-token-in-error'); return; }
    res.end(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [{ metric, value: [Date.now()/1000, '1'] }] } }));
  });
  const c = await loadConfig({ PROMETHEUS_URL: url, PROMETHEUS_TOKEN: 'private-secret' });
  const p = new Prometheus(c); t.after(() => p.close());
  const result = await createService(c, p).overview();
  assert.equal(result.source.state, 'partial');
  assert.notEqual(result.buildings.find(b => b.id === 'hx-zy05').status, 'online');
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('timeouts terminate queries', async t => {
  const url = await fixture(t, () => {});
  const c = await loadConfig({ PROMETHEUS_URL: url }); c.timeoutMs = 50;
  const p = new Prometheus(c); t.after(() => p.close());
  await assert.rejects(p.query('online'), e => e instanceof QueryError && e.code === 'timeout');
});
test('public API accepts only GET and known range/building, never arbitrary queries', async t => {
  const c = await loadConfig({}); const p = new Prometheus(c); t.after(() => p.close());
  const service = createService(c, p); const s = createServer(service);
  const url = await listen(s); t.after(() => new Promise(resolve => { s.closeAllConnections(); s.close(resolve); }));
  assert.equal((await fetch(url + '/api/overview')).status, 200);
  const statusHistory = await fetch(url + '/api/status-history'); assert.equal(statusHistory.status, 200); assert.equal((await statusHistory.json()).source.state, 'unconfigured');
  assert.equal((await fetch(url + '/api/status-history?query=up')).status, 400);
  assert.equal((await fetch(url + '/api/overview?query=up')).status, 400);
  assert.equal((await fetch(url + '/api/overview', { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + '/api/buildings/hx-zy05/history?range=100d')).status, 400);
  assert.equal((await fetch(url + '/api/buildings/missing/history')).status, 404);
  assert.equal((await fetch(url + '/api/v1/query?query=up')).status, 404);
});

test('static frontend root and deep links work; traversal, hidden files and missing assets do not', async t => {
  const root = await mkdtemp(join(tmpdir(), 'netprobe-static-'));
  await writeFile(join(root, 'index.html'), '<main>NetProbe</main>');
  await mkdir(join(root, 'assets')); await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)');
  const s = createServer({ configured: false }, root); const url = await listen(s);
  t.after(() => new Promise(resolve => { s.closeAllConnections(); s.close(resolve); }));
  assert.equal((await fetch(url + '/')).status, 200);
  assert.equal((await fetch(url + '/buildings/hx-zy05')).status, 200);
  assert.equal((await fetch(url + '/monitoring')).status, 200);
  assert.equal((await fetch(url + '/status')).status, 200);
  const asset = await fetch(url + '/assets/app.js'); assert.equal(asset.status, 200); assert.ok(asset.headers.get('cache-control').includes('immutable'));
  assert.equal((await fetch(url + '/assets/missing.js')).status, 404);
  assert.equal((await fetch(url + '/%2eenv')).status, 404);
  assert.equal((await fetch(url + '/..%2fserver%2findex.mjs')).status, 404);
});

test('upstream results have bounded series and point counts', async t => {
  const url = await fixture(t, (req, res) => res.end(JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric, values: Array.from({ length: 721 }, (_, i) => [i, '1']) }] } })));
  const c = await loadConfig({ PROMETHEUS_URL: url }); const p = new Prometheus(c); t.after(() => p.close());
  await assert.rejects(p.query('online', { start: 0, end: 1000, step: 1 }), e => e.code === 'limit');
});

test('query cache memory is bounded by bytes', async t => {
  const url = await fixture(t, (req, res) => res.end(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [{ metric, value: [Date.now()/1000, '1'] }] } })));
  const c = await loadConfig({ PROMETHEUS_URL: url }); const p = new Prometheus(c); p.cacheMaxBytes = 200; t.after(() => p.close());
  await p.query('online'); await p.query('online', { building: { campus: 'hx', building: 'sy03' } });
  assert.ok(p.cacheBytes <= 200); assert.ok(p.cache.size <= 1);
});
