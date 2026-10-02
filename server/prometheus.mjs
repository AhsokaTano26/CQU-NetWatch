export class QueryError extends Error { constructor(code) { super(code); this.code = code; } }

export function buildExpression(config, metric, building) {
  const definition = config.metrics[metric];
  if (!definition) return null;
  const matchers = { ...config.matchers };
  if (building) { matchers[config.labels.campus] = building.campus; matchers[config.labels.building] = building.building; }
  const selector = `{${Object.entries(matchers).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join(',')}}`;
  const expand = query => query.replaceAll('{{selector}}', selector).replaceAll('{{reportOfflineSeconds}}', String(config.thresholds.reportOfflineSeconds)).replaceAll('{{nodeOfflineSeconds}}', String(config.thresholds.nodeOfflineSeconds));
  let expression = expand(definition.query);
  if (definition.freshnessMetric) expression = `(${expression}) and ((time() - timestamp(${definition.freshnessMetric}${selector})) <= ${config.thresholds.sampleMaxAge})`;
  if (!definition.freshOnly) return expression;
  const online = config.metrics.online && expand(config.metrics.online.query);
  const lastSeen = config.metrics.lastSeen && expand(config.metrics.lastSeen.query);
  if (!online || !lastSeen) throw new QueryError('configuration');
  const labels = ['campus', 'building', 'probe', 'network'].map(k => config.labels[k]).join(',');
  return `(${expression}) and on(${labels}) ((${online}) == 1) and on(${labels}) ((time() - ${lastSeen}) <= ${config.thresholds.sampleMaxAge})`;
}

export class Prometheus {
  constructor(config) {
    this.config = config; this.cache = new Map(); this.pending = new Map();
    this.cacheBytes = 0; this.cacheMaxBytes = 32 * 1024 * 1024;
    this.active = 0; this.queue = []; this.controller = new AbortController();
  }
  close() { this.controller.abort(); for (const entry of this.queue.splice(0)) entry.reject(new QueryError('closed')); this.cache.clear(); this.cacheBytes = 0; }
  async slot() {
    if (this.controller.signal.aborted) throw new QueryError('closed');
    if (this.active < 4) { this.active++; return; }
    if (this.queue.length >= 64) throw new QueryError('busy');
    await new Promise((resolve, reject) => this.queue.push({ resolve, reject }));
  }
  release() { const next = this.queue.shift(); if (next) next.resolve(); else this.active--; }
  async query(metric, options = {}) {
    const expression = buildExpression(this.config, metric, options.building);
    if (!expression || !this.config.prometheusUrl) return [];
    return this.queryExpression(expression, options);
  }
  async queryEvent(name, expression) {
    if (!expression || !this.config.prometheusUrl) return [];
    return this.queryExpression(expression, {}, ['p95', 'p99', 'count'].includes(name) ? 300 : this.config.cacheSeconds);
  }
  async queryExpression(expression, options = {}, ttl = this.config.cacheSeconds) {
    const key = JSON.stringify([expression, options.start, options.end, options.step]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) { this.cache.delete(key); this.cache.set(key, cached); return cached.result; }
    if (this.pending.has(key)) return this.pending.get(key);
    // Bound unique inflight keys as well as network concurrency.
    if (this.pending.size >= 68) throw new QueryError('busy');
    const task = this.request(expression, options).then(result => {
      const previous = this.cache.get(key);
      if (previous) this.cacheBytes -= previous.bytes;
      this.cache.delete(key);
      const bytes = Buffer.byteLength(JSON.stringify(result));
      if (bytes <= this.cacheMaxBytes) {
        this.cache.set(key, { result, bytes, expires: Date.now() + ttl * 1000 });
        this.cacheBytes += bytes;
      }
      while (this.cache.size > 100 || this.cacheBytes > this.cacheMaxBytes) {
        const oldest = this.cache.keys().next().value;
        this.cacheBytes -= this.cache.get(oldest).bytes; this.cache.delete(oldest);
      }
      return result;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task); return task;
  }
  async request(expression, options) {
    await this.slot();
    try {
      const range = options.start !== undefined;
      const url = new URL(this.config.prometheusUrl);
      url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1/${range ? 'query_range' : 'query'}`;
      url.searchParams.set('query', expression);
      url.searchParams.set('timeout', `${this.config.timeoutMs / 1000}s`);
      if (range) for (const key of ['start', 'end', 'step']) url.searchParams.set(key, String(options[key]));
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(this.config.timeoutMs)]);
      const response = await fetch(url, { signal, redirect: 'error', headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {} });
      if (!response.ok) { await response.body?.cancel(); throw new QueryError('upstream'); }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { throw new QueryError('limit'); }
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (data.status !== 'success' || data.data?.resultType !== (range ? 'matrix' : 'vector') || !Array.isArray(data.data.result)) throw new QueryError('invalid_response');
      if (data.data.result.length > (range ? 200 : 10000)) throw new QueryError('limit');
      if (range && data.data.result.some(s => !Array.isArray(s.values) || s.values.length > 720)) throw new QueryError('limit');
      return data.data.result;
    } catch (e) {
      if (e instanceof QueryError) throw e;
      throw new QueryError(e.name === 'TimeoutError' ? 'timeout' : this.controller.signal.aborted ? 'closed' : 'unreachable');
    } finally { this.release(); }
  }
}
