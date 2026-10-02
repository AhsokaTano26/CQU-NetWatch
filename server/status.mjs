const finite = value => typeof value === 'number' && Number.isFinite(value);
import { classify } from '../shared/status.mjs';
export { classify };
export const mean = values => { const v = values.filter(finite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const max = values => { const v = values.filter(finite); return v.length ? Math.max(...v) : null; };

export function validValue(raw, metric, scale = 1) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw) * scale;
  if (!finite(n) || n < 0) return null;
  if (['online', 'http'].includes(metric) && n !== 0 && n !== 1) return null;
  if (['loss', 'lossWindow'].includes(metric) && n > 1) return null;
  return n;
}

export function normalizeSeries(series, metric, config, now, scale = 1) {
  return series.flatMap(s => {
    const labels = s.metric ?? {};
    const building = labels[config.labels.building];
    const campus = labels[config.labels.campus];
    const probe = labels[config.labels.probe];
    if (!building || !campus || !probe) return [];
    const timestamp = Number(s.value?.[0]);
    const recent = finite(timestamp) && now - timestamp <= config.thresholds.sampleMaxAge && timestamp <= now + 30;
    return [{ metric, building, campus, probe, target: labels[config.labels.target] || '',
      network: labels[config.labels.network] || 'unknown', group: labels[config.labels.group] || '',
      timestamp: recent ? timestamp : null, value: recent ? validValue(s.value?.[1], metric, scale) : null }];
  });
}

export function summarizeBuilding(building, samples, thresholds, incomplete = false, now = Date.now() / 1000) {
  const grouped = new Map();
  for (const s of samples) {
    const key = JSON.stringify([s.probe, s.network]);
    if (!grouped.has(key)) grouped.set(key, { id: s.probe, network: s.network, samples: [] });
    grouped.get(key).samples.push(s);
  }
  const probes = [...grouped.values()].map(p => {
    const values = metric => p.samples.filter(s => s.metric === metric).map(s => s.value);
    const lastSeen = max(values('lastSeen'));
    const age = finite(lastSeen) && lastSeen > 0 && lastSeen <= now + 30 ? Math.max(0, now-lastSeen) : null;
    const reportState = age === null ? 'unknown' : age > thresholds.nodeOfflineSeconds ? 'retired' : age >= thresholds.reportOfflineSeconds ? 'interrupted' : 'online';
    const online = reportState === 'online' ? 1 : reportState === 'interrupted' ? 0 : null;
    const quality = metric => online !== 1 ? null : mean(values(metric));
    const probe = { id: p.id, network: p.network, online, reportState,
      loss: quality('loss'), lossMax: online === 1 ? max(values('loss')) : null, lossWindow: quality('lossWindow'), latency: quality('latency'),
      jitter: online !== 1 ? null : max(values('jitter')), flaps: max(values('flaps')),
      http: quality('http'), httpLatency: quality('httpLatency'), lastSeen,
      timestamp: max(p.samples.map(s => s.timestamp)), targets: p.samples.filter(s => s.target).map(s => online === 1 ? s : { ...s, value: null }) };
    probe.status = classify([probe], thresholds, incomplete);
    return probe;
  });
  const active = probes.filter(p => p.online === 1);
  const status = classify(probes, thresholds);
  return { ...building, status: incomplete && status === 'online' ? 'pending' : status,
    loss: mean(active.map(p => p.loss)), lossWindow: mean(active.map(p => p.lossWindow)),
    latency: mean(active.map(p => p.latency)), jitter: max(active.map(p => p.jitter)),
    http: mean(active.map(p => p.http)), onlineProbes: active.length, totalProbes: probes.length, retiredProbes: probes.filter(p=>p.reportState==='retired').length,
    timestamp: max(samples.map(s => s.timestamp)), probes };
}
