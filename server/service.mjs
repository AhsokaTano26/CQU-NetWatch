import { createStatusHistory } from './status-history.mjs';
import { createEventReader } from './events.mjs';
import { createHash } from 'node:crypto';
import { normalizeSeries, summarizeBuilding, validValue } from './status.mjs';

export const ranges = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
const safeId = (campus, building) => {
  const id = `${campus}-${building}`;
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : 'auto-' + createHash('sha256').update(id).digest('hex').slice(0, 16);
};

export function createService(config, prometheus) {
  const catalog = new Map(config.buildings.map(b => [b.id, b]));
  const readEvents = createEventReader(config, prometheus);
  let overviewCache; let overviewPending;
  const identity = (campus, building) => JSON.stringify([campus, building]);
  async function readAll(options = {}) {
    const keys = Object.keys(config.metrics).filter(k => config.metrics[k] && (!options.start || !config.metrics[k].instantOnly));
    const results = await Promise.allSettled(keys.map(k => prometheus.query(k, options)));
    const errors = []; const metrics = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') metrics[keys[i]] = r.value;
      else { metrics[keys[i]] = []; errors.push({ metric: keys[i], code: r.reason?.code || 'unreachable' }); }
    });
    const state = !config.prometheusUrl ? 'unconfigured' : errors.length === keys.length ? 'error' : errors.length ? 'partial' : 'ready';
    return { metrics, source: { state, errors } };
  }
  async function collectOverview() {
    const now = Date.now() / 1000;
    const { metrics, source } = await readAll();
    const samples = Object.entries(metrics).flatMap(([key, series]) => normalizeSeries(series, key, config, now, config.metrics[key].scale));
    const byBuilding = new Map();
    for (const sample of samples) {
      const key = identity(sample.campus, sample.building);
      if (!byBuilding.has(key)) byBuilding.set(key, []);
      byBuilding.get(key).push(sample);
      if (![...catalog.values()].some(b => b.campus === sample.campus && b.building === sample.building) && catalog.size < 1000) {
        const id = safeId(sample.campus, sample.building);
        catalog.set(id, { id, campus: sample.campus, building: sample.building, group: sample.group || 'other', name: sample.building });
      }
    }
    const buildings = [...catalog.values()].map(b => summarizeBuilding(b, byBuilding.get(identity(b.campus, b.building)) || [], config.thresholds, source.errors.length > 0, now));
    const campuses = [...config.campuses];
    for (const b of buildings) if (!campuses.some(c => c.id === b.campus)) campuses.push({ id: b.campus, name: b.campus, region: b.campus });
    const counts = { online: 0, offline: 0, pending: 0, unstable: 0, empty: 0 };
    buildings.forEach(b => counts[b.status]++);
    return { title: config.title, generatedAt: Math.floor(now), source, refreshSeconds: config.refreshSeconds,
      thresholds: config.thresholds, campuses, groups: config.groups, counts, buildings, events: readEvents(buildings, source, now) };
  }
  async function overview() {
    if (overviewCache && overviewCache.expires > Date.now()) return overviewCache.data;
    if (overviewPending) return overviewPending;
    overviewPending = collectOverview().then(data => {
      overviewCache = { data, expires: Date.now() + config.cacheSeconds * 1000 }; return data;
    }).finally(() => { overviewPending = null; });
    return overviewPending;
  }
  async function history(id, range = '24h') {
    if (!ranges[range]) throw Object.assign(new Error('无效时间范围'), { status: 400 });
    if (!catalog.has(id)) await overview();
    const building = catalog.get(id);
    if (!building) throw Object.assign(new Error('楼栋不存在'), { status: 404 });
    const end = Math.floor(Date.now() / 30000) * 30; const duration = ranges[range];
    const start = end - duration; const step = Math.max(30, Math.ceil(duration / 719 / 15) * 15);
    const { metrics: raw, source } = await readAll({ building, start, end, step });
    const metrics = {};
    for (const [key, series] of Object.entries(raw)) {
      metrics[key] = series.filter(s => s.metric?.[config.labels.campus] === building.campus && s.metric?.[config.labels.building] === building.building).flatMap(s => {
        const probe = s.metric[config.labels.probe]; if (!probe) return [];
        const network = s.metric[config.labels.network] || 'unknown';
        const target = s.metric[config.labels.target] || '';
        const points = s.values.map(([t, value]) => [Number(t), validValue(value, key, config.metrics[key].scale)]).filter(([t]) => Number.isFinite(t) && t >= start && t <= end);
        return [{ probe, network, target, points }];
      });
    }
    return { building, range, start, end, duration, step, generatedAt: Math.floor(Date.now()/1000), thresholds: config.thresholds, source, metrics };
  }
  return { overview, history, statusHistory: createStatusHistory(config, prometheus), configured: Boolean(config.prometheusUrl) };
}
