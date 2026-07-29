import { buildApp } from './app.js';
import { getTicketConfig } from './config.js';
import { createTicketDatabase } from './database.js';

const config = getTicketConfig();
const database = createTicketDatabase(config);
const app = buildApp(config, database);

async function start() {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error, 'ticket-service failed to start');
    const shutdownExitCode = await shutdown();
    process.exit(shutdownExitCode || 1);
  }
}

let shutdownPromise: Promise<number> | undefined;

function shutdown(): Promise<number> {
  if (shutdownPromise === undefined) {
    shutdownPromise = (async () => {
      let failed = false;
      try {
        await app.close();
      } catch (error) {
        failed = true;
        app.log.error(error, 'ticket-service failed to close Fastify');
      }
      try {
        await database.end();
      } catch (error) {
        failed = true;
        app.log.error(error, 'ticket-service failed to close database connections');
      }
      return failed ? 1 : 0;
    })();
  }
  return shutdownPromise;
}

function stop(signal: 'SIGTERM' | 'SIGINT') {
  void shutdown().then((exitCode) => {
    app.log.info({ signal }, 'ticket-service stopped');
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

void start();
