import { Hono } from 'hono';
import type { AppEnv } from './app-env';
import { cookieSettings } from './auth/cookies';
import { googleConfigLoader, type OidcConfigLoader } from './auth/google';
import { sessionMiddleware } from './auth/session';
import type { Config } from './config';
import type { Db } from './db';
import { jsonError } from './lib/errors';
import { sameOriginOnly } from './lib/origin';
import { createRankingService, type RankingService } from './ranking/service';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { rankingRoutes } from './routes/rankings';

/** 라우트가 쓰는 의존성. 테스트에서는 서비스와 로그인 설정을 바꿔 끼울 수 있다 */
export interface AppDeps {
  db: Db;
  config: Config;
  ranking?: RankingService;
  /** 없으면 .env의 Google 설정으로 만든다. null이면 로그인을 막는다 */
  oidc?: OidcConfigLoader | null;
}

/** .env에 Google 클라이언트 ID·시크릿이 둘 다 있으면 로그인 설정을 만든다 */
function defaultOidc(config: Config): OidcConfigLoader | null {
  const id = config.GOOGLE_CLIENT_ID?.trim();
  const secret = config.GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? googleConfigLoader(id, secret) : null;
}

/** API 앱을 만든다. 라우트를 여기서 모두 붙인다 */
export function createApp({ db, config, ranking = createRankingService(db), oidc = defaultOidc(config) }: AppDeps) {
  const cookies = cookieSettings(config.SITE_URL);
  const session = sessionMiddleware(db, cookies);
  const sameOrigin = sameOriginOnly(config.SITE_URL);

  const api = new Hono<AppEnv>()
    .use(sameOrigin)
    .use(session)
    // API 응답은 사람마다 다르고(내 순위) 자주 바뀐다. Cloudflare·브라우저가 캐시하지 않게 한다
    .use(async (c, next) => {
      await next();
      c.header('Cache-Control', 'no-store');
    })
    .route('/', rankingRoutes(ranking))
    .route('/', meRoutes({ db, loginAvailable: oidc !== null, ranking }));

  const auth = new Hono<AppEnv>()
    .use(sameOrigin)
    .use(async (c, next) => {
      await next();
      c.header('Cache-Control', 'no-store');
    })
    .route('/', authRoutes({ db, siteUrl: config.SITE_URL, cookies, oidc }));

  const app = new Hono<AppEnv>().route('/', healthRoutes(db)).route('/api', api).route('/auth', auth);

  app.notFound((c) => jsonError(c, 404, 'NOT_FOUND', '없는 주소입니다.'));
  app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return jsonError(c, 500, 'INTERNAL', '서버 오류가 발생했습니다.');
  });
  return app;
}

/** 클라이언트 RPC가 쓰는 앱 타입 */
export type AppType = ReturnType<typeof createApp>;
