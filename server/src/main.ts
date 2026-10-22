import { serve } from '@hono/node-server';
import { createApp } from './app';
import { DEV_ACCOUNTS, devLoginEnabled } from './auth/dev-login';
import { purgeExpiredSessions } from './auth/session';
import { loadConfig, loadEnvFile } from './config';
import { createDb, type Db } from './db';
import { abandonStalePlays } from './plays/service';
import { VERSION } from './version';

const DAY_MS = 86_400_000;

/** 정리 작업 하나를 돌리고 정리한 개수를 찍는다. 실패해도 서버는 계속 돈다 */
async function runCleanup(label: string, task: () => Promise<number>): Promise<void> {
  try {
    const count = await task();
    if (count > 0) console.log(`[magpie] ${label} ${count}개 정리`);
  } catch (err) {
    console.warn(`[magpie] ${label} 정리 실패:`, err instanceof Error ? err.message : err);
  }
}

/** 하루 한 번 하는 정리: 만료 세션, 끝나지 않고 하루가 지난 판 */
async function dailyCleanup(db: Db): Promise<void> {
  await runCleanup('만료 세션', () => purgeExpiredSessions(db));
  await runCleanup('하루 지난 미완료 판', () => abandonStalePlays(db));
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
    if (devLoginEnabled(config)) console.log(`[auth] 개발용 테스트 로그인 켜짐 (테스트1~${DEV_ACCOUNTS})`);
  });

  // 정리는 시작할 때 한 번, 그 뒤 하루에 한 번 한다
  void dailyCleanup(db);
  const cleanupTimer = setInterval(() => void dailyCleanup(db), DAY_MS);
  cleanupTimer.unref();

  // NSSM은 서비스를 멈출 때 Ctrl+C(SIGINT)를 보낸다
  const shutdown = () => {
    clearInterval(cleanupTimer);
    server.close(() => {
      void db.destroy().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
