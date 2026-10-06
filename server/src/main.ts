import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig, loadEnvFile } from './config';
import { createDb } from './db';
import { VERSION } from './version';

/** 서버를 띄운다. nginx가 같은 PC에서 넘겨주므로 127.0.0.1에만 연다 */
function main(): void {
  loadEnvFile();
  const config = loadConfig();
  const db = createDb(config);
  const app = createApp({ db, config });

  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1' }, (info) => {
    console.log(`[magpie] API 서버 시작 http://127.0.0.1:${info.port} (version ${VERSION}, db ${config.DB_NAME})`);
  });

  // NSSM은 서비스를 멈출 때 Ctrl+C(SIGINT)를 보낸다
  const shutdown = () => {
    server.close(() => {
      void db.destroy().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
