// Explicit, local-only preview. Never imported by the production entry point.
import { createServer as httpServer } from 'node:http';
import { loadConfig } from '../server/config.mjs';
import { Prometheus } from '../server/prometheus.mjs';
import { createService } from '../server/service.mjs';
import { createServer } from '../server/http.mjs';

const config = await loadConfig({});
config.refreshSeconds = 5; config.cacheSeconds = 2;
const overrides = { 'hx-zy05': 'unstable', 'hx-sy03': 'pending', 'hx-ly03': 'unstable', 'spba-a06': 'offline', 'spba-a11': 'online', 'lj-lj02': 'online' };
const entries = config.buildings.flatMap((b, index) => {
  const state = b.id === 'hx-my03' ? 'offline' : b.campus === 'hx' && index % 4 !== 0 ? 'unstable' : overrides[b.id] || (index % 11 === 0 ? 'empty' : index % 13 === 0 ? 'offline' : index % 17 === 0 ? 'pending' : index % 9 === 0 ? 'unstable' : 'online');
  if (state === 'empty') return [];
  return [0, 1].map(probe => ({ ...b, index, probe, state, online: state === 'offline' || state === 'pending' && probe === 1 ? 0 : 1 }));
});
const metricNames = { campus_probe_online: 'online', campus_probe_last_seen_timestamp_seconds: 'lastSeen', campus_probe_icmp_loss_ratio: 'loss', campus_probe_icmp_rtt_seconds: 'latency', campus_probe_icmp_jitter_seconds: 'jitter', campus_probe_http_success: 'http', campus_probe_http_duration_seconds: 'httpLatency', campus_probe_http_status_code: 'httpCode' };
const fakePrometheus = httpServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'); const query = url.searchParams.get('query') || '';
  let metric = metricNames[query.match(/campus_probe_[a-z_]+/)?.[0]];
  if (metric === 'lastSeen' && query.includes('< bool 1800')) metric = 'online';
  if (query.includes('changes(')) metric = 'flaps';
  if (query.includes('avg_over_time(')) metric = 'lossWindow';
  const building = query.match(/building="([^"]+)"/)?.[1]; const campus = query.match(/campus="([^"]+)"/)?.[1];
  const range = url.pathname.endsWith('query_range'); const now = Date.now() / 1000; const result = [];
  const eventMetric = query.includes('quantile_over_time(0.95') ? 'p95' : query.includes('quantile_over_time(0.99') ? 'p99' : query.startsWith('count_over_time(') ? 'count' : query.startsWith('(min_over_time(') ? 'sustainedLoss' : query.startsWith('(max_over_time(') ? 'sustainedOffline' : query.startsWith('max by(') && query.includes('last_seen') ? 'lastSeen' : null;
  const statusMetric = query.startsWith('avg by(campus)') ? 'online' : query.startsWith('count by(campus)') ? 'monitored' : query.startsWith('(sum by(campus)') ? 'loss' : null;
  if (eventMetric && !range) {
    for (const entry of entries.filter(e=>e.probe===0)) {
      const v = {p95:.004,p99:.012,count:2016,sustainedLoss:entry.state==='unstable'?.07:.002,sustainedOffline:entry.online?0:1,lastSeen:entry.id==='hx-my03'?now-2400:entry.online?now-8:now-90000}[eventMetric];
      result.push({metric:{campus:entry.campus,building:entry.building},value:[now,String(v)]});
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'success',data:{resultType:'vector',result}}));return;
  }
  if (statusMetric && range) {
    for (const c of config.campuses) {
      const values=[];const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end')),step=Number(url.searchParams.get('step'));
      for(let t=start;t<=end;t+=step){
        const hour=t/3600;const episode=Math.floor(hour)%24;
        if(c.id==='spbc' && t<end-172800)continue;
        const offline=c.id==='hx'&&(episode===7||episode===8);const loss=c.id==='hx'&&(episode===18||episode===19);
        const v=statusMetric==='monitored'?c.id==='hx'?32:8:statusMetric==='online'?offline?.25:c.id==='spbb'&&episode===12?.875:1:loss?.75:0;
        values.push([t,String(v)]);
      }
      result.push({metric:{campus:c.id},values});
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'success',data:{resultType:'matrix',result}}));return;
  }
  for (const entry of entries) {
    if (building && entry.building !== building || campus && entry.campus !== campus) continue;
    const targets = ['loss', 'lossWindow', 'latency', 'jitter'].includes(metric) ? ['alien_icmp', 'aliyun_dns', 'dnspod_dns'] : ['http', 'httpLatency', 'httpCode'].includes(metric) ? ['baidu_www', 'cqu_login', 'lanunion_www'] : [''];
    for (const [targetIndex, target] of targets.entries()) {
      const labels = { campus: entry.campus, building: entry.building, building_group: entry.group, probe_id: `${entry.campus}-${entry.building}-demo${entry.probe + 1}`, network_type: entry.probe ? 'wireless' : 'wired', ...(target ? { target } : {}) };
      function value(t) {
        const phase = t / 600 + entry.index * .7 + entry.probe;
        const dip = entry.state === 'unstable' && Math.sin(t / 900 + entry.probe) < -.94;
        const online = entry.online && !dip ? 1 : 0;
        if (metric === 'online') return online;
        if (metric === 'lastSeen') return entry.id === 'spba-a06' ? t - (entry.probe ? 90000 : 3600) : entry.id === 'hx-my03' ? t - 2400 : online ? t - 8 : t - 90000;
        if (metric === 'flaps') return entry.state === 'unstable' ? 4 : 0;
        if (!online) return null;
        const unstable = entry.state === 'unstable';
        if (metric === 'loss' || metric === 'lossWindow') return unstable ? .07 + (Math.sin(phase) + 1) * .045 : 0;
        if (metric === 'latency') return .010 + targetIndex * .009 + entry.probe * .009 + (Math.sin(phase) + 1) * (unstable ? .025 : .003);
        if (metric === 'jitter') return .001 + (Math.sin(phase * 2) + 1) * (unstable ? .019 : .001);
        if (metric === 'http') return unstable && target === 'cqu_login' && Math.sin(phase) > .3 ? 0 : 1;
        if (metric === 'httpCode') return 200;
        if (metric === 'httpLatency') return .045 + targetIndex * .03 + (Math.sin(phase) + 1) * .04;
        return null;
      }
      if (range) {
        const values = []; const start = Number(url.searchParams.get('start')); const end = Number(url.searchParams.get('end')); const step = Number(url.searchParams.get('step'));
        for (let t = start; t <= end; t += step) { const v = value(t); if (v !== null) values.push([t, String(v)]); }
        if (values.length) result.push({ metric: labels, values });
      } else { const v = value(now); if (v !== null) result.push({ metric: labels, value: [now, String(v)] }); }
    }
  }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'success', data: { resultType: range ? 'matrix' : 'vector', result } }));
});
await new Promise(resolve => fakePrometheus.listen(0, '127.0.0.1', resolve));
config.prometheusUrl = `http://127.0.0.1:${fakePrometheus.address().port}`;
const prometheus = new Prometheus(config); const service = createService(config, prometheus);
const tag = data => ({ ...data, source: { ...data.source, demo: true } });
const server = createServer({ ...service, overview: async () => tag(await service.overview()), history: async (...args) => tag(await service.history(...args)), statusHistory: async () => tag(await service.statusHistory()) });
const port = Number(process.env.DEMO_PORT || 3001);
server.listen(port, '127.0.0.1', () => console.log(`模拟演示（非真实监控）：http://127.0.0.1:${port}`));
server.on('error', e => { console.error(`Preview failed: ${e.code}`); prometheus.close(); fakePrometheus.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  prometheus.close(); server.closeAllConnections(); fakePrometheus.closeAllConnections(); server.close(); fakePrometheus.close();
});
