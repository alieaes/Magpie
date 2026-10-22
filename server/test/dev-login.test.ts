// 개발용 테스트 로그인 테스트. 켜지는 조건과 경로 검사는 DB 없이, 로그인 흐름은 개발 DB(-dev) 되돌림 트랜잭션에서 본다.
// 근거: docs/design/261022-05-dev-login.md

import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { devLoginEnabled, findOrCreateDevUser } from '../src/auth/dev-login';
import { findOrCreateUser, setNickname } from '../src/auth/users';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db';
import { canRunDb, devConfig, inRollback, withTestApp } from './helpers';

const SITE = 'http://localhost:5480';
const BASE = { SITE_URL: SITE, DB_HOST: '127.0.0.1', DB_USER: 'none', DB_PASSWORD: '', DB_NAME: 'none-dev' };

/** 설정을 바꾼 앱 (쿠키 없는 요청과 본문 검사 실패만 보내므로 DB에 접속하지 않는다) */
function makeApp(env: Record<string, string> = {}) {
  const config = loadConfig({ ...BASE, ...env });
  return createApp({ db: createDb(config), config, oidc: null });
}

/** 우리 사이트에서 보낸 테스트 로그인 요청 */
function devLogin(app: ReturnType<typeof makeApp>, body: unknown, origin = SITE) {
  return app.request('/auth/dev-login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('켜지는 조건', () => {
  it('-dev DB + localhost 사이트 + DEV_LOGIN≠0 을 모두 만족할 때만 켠다', () => {
    const on = (env: Record<string, string>) => devLoginEnabled(loadConfig({ ...BASE, ...env }));
    expect(on({})).toBe(true);
    expect(on({ SITE_URL: 'http://127.0.0.1:5480', DEV_LOGIN: '1' })).toBe(true);
    expect(on({ DB_NAME: 'magpie' })).toBe(false);
    expect(on({ SITE_URL: 'https://magpie.aviaryhub.org' })).toBe(false);
    expect(on({ SITE_URL: 'http://localhost.evil.example' })).toBe(false);
    expect(on({ DEV_LOGIN: '0' })).toBe(false);
  });

  it('꺼져 있으면 경로가 없는 것처럼 404, /api/me의 devLogin은 false', async () => {
    const offEnvs: Record<string, string>[] = [{ DB_NAME: 'magpie' }, { SITE_URL: 'https://magpie.aviaryhub.org' }, { DEV_LOGIN: '0' }];
    for (const env of offEnvs) {
      const app = makeApp(env);
      const site = env.SITE_URL ?? SITE;
      expect((await devLogin(app, { account: 1 }, site)).status).toBe(404);
      expect(await (await app.request('/api/me')).json()).toMatchObject({ devLogin: false });
    }
    expect(await (await makeApp().request('/api/me')).json()).toEqual({ user: null, loginAvailable: false, devLogin: true });
  });

  it('켜져 있어도 잘못된 계정 번호는 400, 다른 사이트에서 온 요청은 403', async () => {
    const app = makeApp();
    for (const account of [0, 4, 1.5, '1', null]) expect((await devLogin(app, { account })).status).toBe(400);
    expect((await devLogin(app, { account: 1 }, 'https://evil.example')).status).toBe(403);
  });
});

describe.skipIf(!canRunDb || !devConfig || !devLoginEnabled(devConfig))('테스트 계정 로그인 (개발 DB)', () => {
  it('세션 쿠키를 주고, 같은 번호로 다시 로그인하면 같은 유저다', () =>
    withTestApp(async (app) => {
      const first = await app.post('/auth/dev-login', { account: 2 });
      expect(first.status).toBe(204);
      const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!;
      expect(cookie).toMatch(/magpie_session=/);
      const me = (await (await app.get('/api/me', cookie)).json()) as { user: { nickname: string | null } | null };
      expect(me.user).not.toBeNull();
      const again = await app.post('/auth/dev-login', { account: 2 });
      const ids = await app.trx.selectFrom('users').select('id').where('google_sub', '=', 'dev-login:2').execute();
      expect(again.status).toBe(204);
      expect(ids).toHaveLength(1);
    }));

  it('처음 만들 때 닉네임 "테스트N"을 채우고, 이미 누가 쓰는 이름이면 비워 둔다', () =>
    inRollback(async (trx) => {
      const user = await findOrCreateDevUser(trx, 97);
      expect(user.nickname).toBe('테스트97');
      expect((await findOrCreateDevUser(trx, 97)).id).toBe(user.id);
      const other = await findOrCreateUser(trx, `test-sub:${Date.now()}`);
      await setNickname(trx, other.id, '테스트98');
      expect((await findOrCreateDevUser(trx, 98)).nickname).toBeNull();
    }));
});
