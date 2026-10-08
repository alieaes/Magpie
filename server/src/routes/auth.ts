// Google 로그인 라우트. 근거: docs/design/261006-07-login.md §1, §4

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Kysely } from 'kysely';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import type { CookieSettings } from '../auth/cookies';
import { safeReturnTo, type OidcConfigLoader } from '../auth/google';
import { clearSessionCookie, createSession, deleteSession, setSessionCookie } from '../auth/session';
import { findOrCreateUser } from '../auth/users';
import type { Database } from '../db/types';

// 로그인 도중 쿠키에 잠깐 두는 값. 10분 안에 돌아오지 않으면 다시 시작한다
const OAuthState = z.object({ state: z.string(), nonce: z.string(), verifier: z.string(), returnTo: z.string() });
const OAUTH_MAX_AGE_SECONDS = 600;

export interface AuthRouteDeps {
  db: Kysely<Database>;
  siteUrl: string;
  cookies: CookieSettings;
  /** 로그인 설정이 없으면 null (로그인 막힘) */
  oidc: OidcConfigLoader | null;
}

/** /auth/google, /auth/google/callback, /auth/logout */
export function authRoutes({ db, siteUrl, cookies, oidc }: AuthRouteDeps) {
  const callbackUrl = `${siteUrl}/auth/google/callback`;

  return new Hono<AppEnv>()
    .get('/google', async (c) => {
      if (!oidc) return c.redirect('/?login=unavailable', 302);
      const config = await oidc();
      const verifier = randomPKCECodeVerifier();
      const state = randomState();
      const nonce = randomNonce();
      const url = buildAuthorizationUrl(config, {
        redirect_uri: callbackUrl,
        scope: 'openid',
        code_challenge: await calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
        prompt: 'select_account',
      });
      const pending = { state, nonce, verifier, returnTo: safeReturnTo(c.req.query('returnTo')) };
      setCookie(c, cookies.oauth, JSON.stringify(pending), { ...cookies.base, maxAge: OAUTH_MAX_AGE_SECONDS });
      return c.redirect(url.href, 302);
    })
    .get('/google/callback', async (c) => {
      const raw = getCookie(c, cookies.oauth);
      deleteCookie(c, cookies.oauth, { path: '/', secure: cookies.secure });
      const parsed = raw ? OAuthState.safeParse(safeJson(raw)) : null;
      if (!oidc || !parsed?.success) return c.redirect('/?login=failed', 302);
      const pending = parsed.data;
      try {
        const config = await oidc();
        // Google에 등록한 리디렉션 주소와 똑같아야 해서, 프록시 뒤 내부 주소가 아니라 사이트 주소로 다시 만든다
        const current = new URL(`${callbackUrl}${new URL(c.req.url).search}`);
        const tokens = await authorizationCodeGrant(config, current, {
          pkceCodeVerifier: pending.verifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        });
        const sub = tokens.claims()?.sub;
        if (!sub) throw new Error('ID 토큰에 sub가 없다');
        const user = await findOrCreateUser(db, sub);
        const { token } = await createSession(db, user.id);
        setSessionCookie(c, cookies, token);
        return c.redirect(pending.returnTo, 302);
      } catch (err) {
        console.warn('[auth] 로그인 실패:', err instanceof Error ? err.message : err);
        return c.redirect('/?login=failed', 302);
      }
    })
    .post('/logout', async (c) => {
      const token = getCookie(c, cookies.session);
      if (token) await deleteSession(db, token);
      clearSessionCookie(c, cookies);
      return c.body(null, 204);
    });
}

/** JSON 파싱. 깨진 값이면 null */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
