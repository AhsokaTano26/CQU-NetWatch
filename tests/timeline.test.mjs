import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineForProbe } from '../shared/status.mjs';
const series = { probe: 'p', network: 'wired', target: '', points: [[0, 1], [30, 1]] };
const thresholds = { lossWarning: 0.01, lossUnstable: 0.05, jitterUnstable: 30, flapUnstable: 3 };
function history(extra = {}) { return { start: 0, end: 60, step: 30, thresholds, source: { errors: [] }, metrics: { online: [series], loss: [{ ...series, points: [[0, 0], [30, 0]] }], jitter: [{ ...series, points: [[0, 0], [30, 0]] }], ...extra } }; }
test('timeline uses the same window-loss and flap rule as current status', () => {
  for (const [key, value] of [['lossWindow', 0.1], ['flaps', 4]]) {
    const h = history({ [key]: [{ ...series, points: [[0, value], [30, value]] }] });
    assert.equal(timelineForProbe(h, series)[0]?.status, 'unstable');
  }
});
test('partial query errors downgrade timeline online to waiting', () => {
  const h = history(); h.source.errors = [{ metric: 'jitter', code: 'upstream' }];
  assert.equal(timelineForProbe(h, series)[0]?.status, 'pending');
});
test('timeline explicitly preserves missing data gaps and offline observations', () => {
  const s = { ...series, points: [[0, 0]] }; const h = history();
  const blocks = timelineForProbe(h, s);
  assert.equal(blocks[0]?.status, 'offline'); assert.equal(blocks[1]?.status, 'empty');
});
