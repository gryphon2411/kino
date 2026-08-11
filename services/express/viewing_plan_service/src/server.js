import { createServer } from 'node:http';
import { createApp } from './app.js';
import { getViewingPlanConfig } from './config.js';
import { createViewingPlanDatabase } from './database.js';
import { PostgresViewingPlanRepository } from './viewing-plan-repository.js';
import { ViewingPlanService } from './viewing-plan-service.js';

const config = getViewingPlanConfig();
const database = createViewingPlanDatabase(config);
const viewingPlanService = new ViewingPlanService(new PostgresViewingPlanRepository(database));
const app = createApp({
  config,
  viewingPlanService,
  ready: () => database.query('SELECT 1'),
});
const server = createServer(app);
server.headersTimeout = config.bffUpstreamTimeoutMs;
server.requestTimeout = config.bffUpstreamTimeoutMs;
server.keepAliveTimeout = config.bffUpstreamTimeoutMs;

let stopping;
async function shutdown() {
  if (!stopping) {
    stopping = (async () => {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await database.end();
    })();
  }
  return stopping;
}

server.listen(config.port, config.host, () => {
  console.info(`viewing-plan-service listening on ${config.host}:${config.port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    void shutdown().then(() => process.exit(0)).catch((error) => {
      console.error('viewing-plan-service failed to stop', error);
      process.exit(1);
    });
  });
}
