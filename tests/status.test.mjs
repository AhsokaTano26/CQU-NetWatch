import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, summarizeBuilding, normalizeSeries } from '../server/status.mjs';

const thresholds = { lossWarning: 0.01, lossUnstable: 0.05, jitterUnstable: 30, flapUnstable: 3, sampleMaxAge: 180, reportOfflineSeconds: 1800, nodeOfflineSeconds: 86400 };
const p = (online, loss = 0, extra = {}) => ({ online, loss, jitter: 1, ...extra });
test('no finite samples stay empty, not offline', () => {
  assert.equal(classify([], thresholds), 'empty');
  assert.equal(classify([p(null, null)], thresholds), 'empty');
});
test('all explicitly offline probes are red even without ICMP data', () => {
  assert.equal(classify([p(0, null), p(0, null)], thresholds), 'offline');
});
test('unknown or partially offline probes are waiting, never green', () => {
  assert.equal(classify([p(null, 0)], thresholds), 'pending');
  assert.equal(classify([p(1), p(0, null)], thresholds), 'pending');
  assert.equal(classify([p(1, null)], thresholds), 'pending');
});
test('quality fluctuations are independent from waiting', () => {
  assert.equal(classify([p(1, 0.06), p(0, null)], thresholds), 'unstable');
  assert.equal(classify([p(1, 0, { jitter: 40 })], thresholds), 'unstable');
  assert.equal(classify([p(1, 0, { flaps: 4 })], thresholds), 'unstable');
  assert.equal(classify([p(1, 0.02)], thresholds), 'unstable');
  assert.equal(classify([p(1)], thresholds), 'online');
});
test('sample parser rejects NaN, negative values and stale samples', () => {
  const config = { labels: { building: 'building', campus: 'campus', probe: 'probe_id', target: 'target', network: 'network_type' }, thresholds };
  const raw = value => ({ metric: { building: 'zy05', campus: 'hx', probe_id: 'p' }, value });
  assert.equal(normalizeSeries([raw([1000, 'NaN'])], 'loss', config, 1000)[0].value, null);
  assert.equal(normalizeSeries([raw([500, '1'])], 'online', config, 1000)[0].value, null);
  assert.equal(normalizeSeries([raw([1000, '-1'])], 'latency', config, 1000)[0].value, null);
  assert.equal(normalizeSeries([raw([1000, '0.025'])], 'latency', config, 1000, 1000)[0].value, 25);
});
test('offline probes cannot contaminate building loss and missing probe data is explicit', () => {
  const building = { id: 'hx-zy05', name: '竹园5栋', campus: 'hx', building: 'zy05', group: 'zy' };
  const sample = (metric, probe, value, target = '') => ({ metric, probe, value, target, timestamp: 1000, network: 'wired' });
  const r = summarizeBuilding(building, [sample('lastSeen', 'a', 9995), sample('online', 'a', 1), sample('loss', 'a', 0), sample('latency', 'a', 20), sample('lastSeen', 'b', 8000), sample('online', 'b', 0), sample('loss', 'b', 1)], thresholds, false, 10000);
  assert.equal(r.loss, 0);
  assert.equal(r.onlineProbes, 1);
  assert.equal(r.totalProbes, 2);
  assert.equal(r.status, 'pending');
});
test('partial query failures downgrade both building and probe green states', () => {
  const b = { id: 'hx-zy05', campus: 'hx', building: 'zy05' };
  const samples = ['online', 'loss', 'jitter', 'lastSeen'].map(metric => ({ metric, probe: 'p', network: 'wired', value: metric === 'online' ? 1 : metric === 'lastSeen' ? 9995 : 0, timestamp: 1000, target: '' }));
  const r = summarizeBuilding(b, samples, thresholds, true, 10000);
  assert.equal(r.status, 'pending'); assert.equal(r.probes[0].status, 'pending');
});
