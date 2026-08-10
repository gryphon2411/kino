import { createClient } from 'redis';
import { getBffConfig } from './config.js';

let client;
let connecting;

export async function redisClient() {
  if (!client) {
    const { redis } = getBffConfig();
    client = createClient({
      username: redis.username,
      password: redis.password,
      database: redis.database,
      socket: {
        host: redis.host,
        port: redis.port,
      },
    });
  }

  if (!client.isOpen) {
    connecting ||= client.connect().finally(() => {
      connecting = undefined;
    });
    await connecting;
  }
  return client;
}
