const finite = value => typeof value === 'number' && Number.isFinite(value);
export function classify(probes, t, incomplete = false) {
  probes = probes.filter(p => p.reportState !== 'retired');
  if (!probes.some(p => [p.online, p.loss, p.latency, p.http].some(finite))) return 'empty';
  if (probes.length && probes.every(p => p.online === 0)) return 'offline';
  const active = probes.filter(p => p.online === 1);
  if (active.some(p => p.loss > 0 || p.lossMax > 0 || p.lossWindow > 0 || p.jitter >= t.jitterUnstable || p.flaps >= t.flapUnstable)) return 'unstable';
  if (incomplete || !active.length || probes.some(p => p.online !== 1 || !finite(p.loss) || p.loss >= t.lossWarning)) return 'pending';
  return 'online';
}

export function timelineForProbe(history, series) {
  const metricMaps = {};
  for (const key of ['loss', 'lossWindow', 'jitter', 'flaps']) {
    metricMaps[key] = (history.metrics[key] || []).filter(s => s.probe === series.probe && s.network === series.network).map(s => new Map(s.points));
  }
  const online = new Map(series.points); const blocks = [];
  for (let t = history.start; t < history.end; t += history.step) {
    const values = key => metricMaps[key].map(m => m.get(t)).filter(finite);
    const avg = key => { const n = values(key); return n.length ? n.reduce((a,b)=>a+b,0)/n.length : null; };
    const max = key => { const n = values(key); return n.length ? Math.max(...n) : null; };
    const state = online.get(t);
    const status = state == null ? 'empty' : classify([{ online: state, loss: avg('loss'), lossMax: max('loss'), lossWindow: avg('lossWindow'), jitter: max('jitter'), flaps: max('flaps') }], history.thresholds, history.source.errors.length > 0);
    const end = Math.min(t + history.step, history.end); const previous = blocks[blocks.length - 1];
    if (previous?.status === status) previous.end = end;
    else blocks.push({ start: t, end, status });
  }
  return blocks;
}
