import { Hono } from 'hono';
import type { Config } from './config';
import type { Db } from './db';
import { jsonError } from './lib/errors';
import { createRankingService, type RankingService } from './ranking/service';
import { healthRoutes } from './routes/health';
import { rankingRoutes } from './routes/rankings';

/** 라우트가 쓰는 의존성. 테스트에서는 서비스를 바꿔 끼울 수 있다 */
export interface AppDeps {
  db: Db;
  config: Config;
  ranking?: RankingService;
}

/** API 앱을 만든다. 라우트를 여기서 모두 붙인다 */
export function createApp({ db, ranking = createRankingService(db) }: AppDeps) {
  const api = new Hono()
    // API 응답은 사람마다 다르고(내 순위) 자주 바뀐다. Cloudflare·브라우저가 캐시하지 않게 한다
    .use(async (c, next) => {
      await next();
      c.header('Cache-Control', 'no-store');
    })
    .route('/', rankingRoutes(ranking));

  const app = new Hono().route('/', healthRoutes(db)).route('/api', api);

  app.notFound((c) => jsonError(c, 404, 'NOT_FOUND', '없는 주소입니다.'));
  app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return jsonError(c, 500, 'INTERNAL', '서버 오류가 발생했습니다.');
  });
  return app;
}

/** 클라이언트 RPC가 쓰는 앱 타입 */
export type AppType = ReturnType<typeof createApp>;
