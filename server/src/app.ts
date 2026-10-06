import { Hono } from 'hono';
import type { Config } from './config';
import type { Db } from './db';
import { jsonError } from './lib/errors';
import { healthRoutes } from './routes/health';

/** 라우트가 쓰는 의존성 */
export interface AppDeps {
  db: Db;
  config: Config;
}

/** API 앱을 만든다. 라우트를 여기서 모두 붙인다 */
export function createApp({ db }: AppDeps) {
  const app = new Hono().route('/', healthRoutes(db));

  app.notFound((c) => jsonError(c, 404, 'NOT_FOUND', '없는 주소입니다.'));
  app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return jsonError(c, 500, 'INTERNAL', '서버 오류가 발생했습니다.');
  });
  return app;
}

/** 클라이언트 RPC가 쓰는 앱 타입 */
export type AppType = ReturnType<typeof createApp>;
