import { loadConfig } from './config.mjs';
import { Prometheus } from './prometheus.mjs';
import { createService } from './service.mjs';
import { createServer } from './http.mjs';

const config = await loadConfig();
const prometheus = new Prometheus(config);
const server = createServer(createService(config, prometheus));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口');
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`CQU NetProbe listening on :${port}; Prometheus ${config.prometheusUrl ? 'configured' : 'not configured'}`);
});
server.on('error', e => { console.error(`Server startup failed: ${e.code}`); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  prometheus.close(); server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 5000).unref();
});
