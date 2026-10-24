// 내 정보: GET /api/me, PUT /api/me/nickname, DELETE /api/me(탈퇴).
// GET /api/me에서 방문자도 센다(docs/design/261024-01-admin-dashboard.md §1).
// 근거: docs/design/261006-07-login.md §3, §4, docs/design/261008-01-account-delete.md

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { checkNickname, deleteConfirmText } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { deleteAccount } from '../auth/account';
import type { CookieSettings } from '../auth/cookies';
import { clearSessionCookie } from '../auth/session';
import { DuplicateNicknameError, setNickname } from '../auth/users';
import type { Database } from '../db/types';
import { jsonError, rejectInvalid } from '../lib/errors';
import type { RankingService } from '../ranking/service';
import { VISITOR_MAX_AGE_SECONDS, isVisitorId, newVisitorId, type VisitService } from '../visits/service';

export interface MeRouteDeps {
  db: Kysely<Database>;
  cookies: CookieSettings;
  loginAvailable: boolean;
  /** 개발용 테스트 로그인이 켜져 있는지 */
  devLogin: boolean;
  ranking: RankingService;
  visits: VisitService;
}

/** /api/me 라우트 */
export function meRoutes({ db, cookies, loginAvailable, devLogin, ranking, visits }: MeRouteDeps) {
  return new Hono<AppEnv>()
    .get('/me', async (c) => {
      // 앱이 뜰 때마다 부르므로 여기서 방문자를 센다. 쿠키가 없거나 모양이 틀리면 새로 준다
      let visitorId = getCookie(c, cookies.visitor);
      if (!isVisitorId(visitorId)) {
        visitorId = newVisitorId();
        setCookie(c, cookies.visitor, visitorId, { ...cookies.base, maxAge: VISITOR_MAX_AGE_SECONDS });
      }
      try {
        await visits.record(visitorId);
      } catch (err) {
        console.warn('[visits] 방문을 적지 못했다', err);
      }

      const user = c.get('user');
      return c.json({ user: user ? { nickname: user.nickname, isAdmin: user.isAdmin } : null, loginAvailable, devLogin }, 200);
    })
    .put(
      '/me/nickname',
      zValidator('json', z.object({ nickname: z.string().max(100) }), (result, c) => {
        if (!result.success) return jsonError(c, 400, 'BAD_REQUEST', '닉네임을 보내 주세요.');
      }),
      async (c) => {
        const user = c.get('user');
        if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
        const check = checkNickname(c.req.valid('json').nickname);
        if (!check.ok) return jsonError(c, 400, `NICKNAME_${check.reason.toUpperCase()}`, check.message);
        try {
          await setNickname(db, user.id, check.value);
        } catch (err) {
          if (err instanceof DuplicateNicknameError) return jsonError(c, 409, 'NICKNAME_TAKEN', '이미 쓰는 닉네임이에요.');
          throw err;
        }
        // 랭킹에 보이는 이름이 바로 바뀌도록 캐시를 비운다
        ranking.invalidate();
        return c.json({ nickname: check.value }, 200);
      },
    )
    .delete('/me', zValidator('json', z.object({ confirm: z.string().max(100) }), rejectInvalid), async (c) => {
      const user = c.get('user');
      if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
      // 잘못 누르는 것을 막는다: 닉네임(닉네임 전이면 "탈퇴")을 똑같이 입력해야 한다
      if (c.req.valid('json').confirm.trim() !== deleteConfirmText(user.nickname)) {
        return jsonError(c, 400, 'CONFIRM_MISMATCH', '확인 문구가 맞지 않아요.');
      }
      await deleteAccount(db, user.id);
      // 랭킹에서 바로 빠지도록 캐시를 비운다. 다른 서버 프로세스는 10초 안에 따라온다
      ranking.invalidate();
      clearSessionCookie(c, cookies);
      return c.body(null, 204);
    });
}
