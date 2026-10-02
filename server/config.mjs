import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function loadConfig(env = process.env) {
  const base = JSON.parse(await readFile(resolve(root, 'config/default.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(resolve(root, 'config/catalog.json'), 'utf8'));
  const local = env.NETPROBE_CONFIG ? JSON.parse(await readFile(resolve(env.NETPROBE_CONFIG), 'utf8')) : {};
  const config = { ...base, ...catalog, ...local, labels: { ...base.labels, ...local.labels },
    thresholds: { ...base.thresholds, ...local.thresholds }, events: { ...base.events, ...local.events }, metrics: { ...base.metrics, ...local.metrics } };
  config.prometheusUrl = env.PROMETHEUS_URL || config.prometheusUrl;
  config.token = env.PROMETHEUS_TOKEN || '';
  if (config.prometheusUrl) {
    const url = new URL(config.prometheusUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('PROMETHEUS_URL 必须是无凭据及查询参数的 HTTP(S) 地址');
  }
  for (const [key, value] of Object.entries(config.labels)) if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`无效标签: ${key}`);
  for (const key of Object.keys(config.matchers || {})) if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error('无效查询选择标签');
  for (const [key, metric] of Object.entries(config.metrics)) {
    if (metric === null) continue;
    if (!metric || typeof metric.query !== 'string' || !metric.query.includes('{{selector}}') || !Number.isFinite(metric.scale) || metric.scale <= 0) throw new Error(`无效指标配置: ${key}`);
    if (metric.freshnessMetric && !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric.freshnessMetric)) throw new Error(`无效时效指标: ${key}`);
  }
  for (const key of ['refreshSeconds', 'cacheSeconds', 'timeoutMs']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`无效参数: ${key}`);
  for (const value of Object.values(config.thresholds)) if (!Number.isFinite(value) || value < 0) throw new Error('无效阈值');
  if (config.thresholds.lossWarning > config.thresholds.lossUnstable || config.thresholds.lossUnstable > 1 || config.thresholds.sampleMaxAge < 1) throw new Error('无效丢包/时效阈值');
  if (config.thresholds.reportOfflineSeconds <= 0 || config.thresholds.nodeOfflineSeconds <= config.thresholds.reportOfflineSeconds) throw new Error('无效探针上报时间阈值');
  if (typeof config.events.enabled !== 'boolean') throw new Error('无效事件开关');
  for (const [key, value] of Object.entries(config.events)) if (key !== 'enabled' && (!Number.isFinite(value) || value <= 0)) throw new Error('无效事件参数');
  if (config.events.campusRatio > 1 || config.events.lossCriticalFloor > 1 || !Number.isInteger(config.events.minSamples) || !Number.isInteger(config.events.campusMinBuildings)) throw new Error('无效事件阈值');
  const ids = new Set();
  for (const b of config.buildings) {
    if (!/^[a-zA-Z0-9_-]+$/.test(b.id) || ids.has(b.id) || !b.campus || !b.building || !b.name || !b.group) throw new Error('无效或重复楼栋');
    ids.add(b.id);
  }
  return config;
}
