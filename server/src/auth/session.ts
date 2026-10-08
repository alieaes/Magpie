// 로그인 세션. 근거: docs/design/261006-07-login.md §2
// 세션 값(무작위 32바이트)은 쿠키에만 있고, DB에는 SHA-256 해시만 둔다.

import { createHash, randomBytes } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Kysely } from 'kysely';
import type { AppEnv, SessionUser } from '../app-env';
import type { Database } from '../db/types';
import type { CookieSettings } from './cookies';

const DAY_MS = 86_400_000;
const SESSION_DAYS = 30;
const RENEW_BELOW_DAYS = 15;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;

/** 세션 값을 DB에 둘 해시로 바꾼다 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 새 세션을 만들고 쿠키에 넣을 값을 돌려준다 */
export async function createSession(
  db: Kysely<Database>,
  userId: number,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await db.insertInto('sessions').values({ id_hash: hashToken(token), user_id: userId, expires_at: expiresAt }).execute();
  return { token, expiresAt };
}

/**
 * 쿠키 값으로 세션을 확인한다. 없거나 만료면 null.
 * 남은 기간이 15일 아래면 30일로 다시 늘리고 renewed를 켠다 (쿠키도 다시 줘야 한다).
 */
export async function resolveSession(
  db: Kysely<Database>,
  token: string,
  now = new Date(),
): Promise<{ user: SessionUser; renewed: boolean } | null> {
  const idHash = hashToken(token);
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id as id', 'users.nickname as nickname', 'sessions.expires_at as expiresAt'])
    .where('sessions.id_hash', '=', idHash)
    .where('sessions.expires_at', '>', now)
    .executeTakeFirst();
  if (!row) return null;

  let renewed = false;
  if (row.expiresAt.getTime() - now.getTime() < RENEW_BELOW_DAYS * DAY_MS) {
    await db
      .updateTable('sessions')
      .set({ expires_at: new Date(now.getTime() + SESSION_DAYS * DAY_MS) })
      .where('id_hash', '=', idHash)
      .execute();
    renewed = true;
  }
  return { user: { id: Number(row.id), nickname: row.nickname }, renewed };
}

/** 세션을 지운다 (로그아웃) */
export async function deleteSession(db: Kysely<Database>, token: string): Promise<void> {
  await db.deleteFrom('sessions').where('id_hash', '=', hashToken(token)).execute();
}

/** 만료된 세션을 지우고 지운 개수를 돌려준다 */
export async function purgeExpiredSessions(db: Kysely<Database>, now = new Date()): Promise<number> {
  const result = await db.deleteFrom('sessions').where('expires_at', '<=', now).executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** 세션 쿠키를 준다 */
export function setSessionCookie(c: Parameters<MiddlewareHandler>[0], cookies: CookieSettings, token: string): void {
  setCookie(c, cookies.session, token, { ...cookies.base, maxAge: SESSION_MAX_AGE_SECONDS });
}

/** 세션 쿠키를 지운다 */
export function clearSessionCookie(c: Parameters<MiddlewareHandler>[0], cookies: CookieSettings): void {
  deleteCookie(c, cookies.session, { path: '/', secure: cookies.secure });
}

/** 요청마다 세션 쿠키를 확인해 c.get('user')를 채운다. 쿠키가 없으면 DB를 보지 않는다 */
export function sessionMiddleware(db: Kysely<Database>, cookies: CookieSettings): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null);
    const token = getCookie(c, cookies.session);
    if (token) {
      const session = await resolveSession(db, token);
      if (session) {
        c.set('user', session.user);
        if (session.renewed) setSessionCookie(c, cookies, token);
      } else {
        clearSessionCookie(c, cookies);
      }
    }
    await next();
  };
}
