import { serve } from '@hono/node-server';
import { createApp } from './app';
import { purgeExpiredSessions } from './auth/session';
import { loadConfig, loadEnvFile } from './config';
import { createDb, type Db } from './db';
import { VERSION } from './version';

const DAY_MS = 86_400_000;

/** 만료된 세션을 지운다. 실패해도 서버는 계속 돈다 */
async function purgeSessions(db: Db): Promise<void> {
  try {
    const count = await purgeExpiredSessions(db);
    if (count > 0) console.log(`[magpie] 만료 세션 ${count}개 정리`);
  } catch (err) {
    console.warn('[magpie] 만료 세션 정리 실패:', err instanceof Error ? err.message : err);
  }
}

/** 서버를 띄운다. nginx가 같은 PC에서 넘겨주므로 127.0.0.1에만 연다 */
function main(): void {
  loadEnvFile();
  const config = loadConfig();
  const db = createDb(config);
  const app = createApp({ db, config });
  const loginReady = Boolean(config.GOOGLE_CLIENT_ID?.trim() && config.GOOGLE_CLIENT_SECRET?.trim());

  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1' }, (info) => {
    console.log(
      `[magpie] API 서버 시작 http://127.0.0.1:${info.port} (version ${VERSION}, db ${config.DB_NAME}, 로그인 ${loginReady ? '켜짐' : '꺼짐'})`,
    );
  });

  // 만료 세션은 시작할 때 한 번, 그 뒤 하루에 한 번 지운다
  void purgeSessions(db);
  const purgeTimer = setInterval(() => void purgeSessions(db), DAY_MS);
  purgeTimer.unref();

  // NSSM은 서비스를 멈출 때 Ctrl+C(SIGINT)를 보낸다
  const shutdown = () => {
    clearInterval(purgeTimer);
    server.close(() => {
      void db.destroy().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
