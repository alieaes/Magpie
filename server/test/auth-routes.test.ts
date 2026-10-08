// 로그인 라우트 테스트. Google에 실제로 접속하지 않도록 OIDC 설정을 미리 만든 것으로 바꿔 끼운다.
// 쿠키 없는 요청만 보내므로 DB에 접속하지 않는다.

import { describe, expect, it } from 'vitest';
import { Configuration } from 'openid-client';
import { createApp } from '../src/app';
import { safeReturnTo } from '../src/auth/google';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db';

const SITE = 'http://localhost:5480';
const config = loadConfig({
  SITE_URL: SITE,
  DB_HOST: '127.0.0.1',
  DB_USER: 'none',
  DB_PASSWORD: '',
  DB_NAME: 'none-dev',
});
const googleConfig = new Configuration(
  {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  'test-client.apps.googleusercontent.com',
  'test-secret',
);

/** 로그인 설정을 켜거나 끈 앱 */
function makeApp(loginOn: boolean) {
  return createApp({ db: createDb(config), config, oidc: loginOn ? async () => googleConfig : null });
}

describe('GET /auth/google', () => {
  it('Google 로그인 주소로 보내고, 임시 값을 쿠키에 둔다', async () => {
    const res = await makeApp(true).request('/auth/google?returnTo=/ranking');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = location.searchParams;
    expect(q.get('scope')).toBe('openid');
    expect(q.get('redirect_uri')).toBe(`${SITE}/auth/google/callback`);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(q.get('state')).toBeTruthy();
    expect(q.get('nonce')).toBeTruthy();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^magpie_oauth=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('로그인 설정이 없으면 메인으로 돌려보낸다', async () => {
    const res = await makeApp(false).request('/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?login=unavailable');
  });

  it('임시 쿠키 없이 돌아오면 실패로 처리한다', async () => {
    const res = await makeApp(true).request('/auth/google/callback?code=x&state=y');
    expect(res.headers.get('location')).toBe('/?login=failed');
  });
});

describe('요청 위조 방지', () => {
  it('Origin이 없거나 다르면 403', async () => {
    const app = makeApp(true);
    expect((await app.request('/auth/logout', { method: 'POST' })).status).toBe(403);
    expect((await app.request('/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });

  it('우리 사이트에서 온 로그아웃은 204', async () => {
    const res = await makeApp(true).request('/auth/logout', { method: 'POST', headers: { origin: SITE } });
    expect(res.status).toBe(204);
  });
});

describe('GET /api/me', () => {
  it('비로그인이면 user는 null, 로그인 가능 여부를 알려준다', async () => {
    expect(await (await makeApp(true).request('/api/me')).json()).toEqual({ user: null, loginAvailable: true });
    expect(await (await makeApp(false).request('/api/me')).json()).toEqual({ user: null, loginAvailable: false });
  });

  it('비로그인이면 닉네임을 바꿀 수 없다', async () => {
    const res = await makeApp(true).request('/api/me/nickname', {
      method: 'PUT',
      headers: { origin: SITE, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: '까치01' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('safeReturnTo', () => {
  it('우리 사이트 안의 경로만 받는다', () => {
    expect(safeReturnTo('/ranking?target=apple-ten')).toBe('/ranking?target=apple-ten');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo('/auth/google')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
  });
});
