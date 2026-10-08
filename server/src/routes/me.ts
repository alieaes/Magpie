// 내 정보: GET /api/me, PUT /api/me/nickname. 근거: docs/design/261006-07-login.md §3, §4

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { checkNickname } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { DuplicateNicknameError, setNickname } from '../auth/users';
import type { Database } from '../db/types';
import { jsonError } from '../lib/errors';
import type { RankingService } from '../ranking/service';

export interface MeRouteDeps {
  db: Kysely<Database>;
  loginAvailable: boolean;
  ranking: RankingService;
}

/** /api/me 라우트 */
export function meRoutes({ db, loginAvailable, ranking }: MeRouteDeps) {
  return new Hono<AppEnv>()
    .get('/me', (c) => {
      const user = c.get('user');
      return c.json({ user: user ? { nickname: user.nickname } : null, loginAvailable }, 200);
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
    );
}
