// 관리자 API: POST /api/admin/plays/:playId/remove, POST /api/admin/users/:userId/reset-nickname.
// 관리자만 쓸 수 있다. 화면의 표시와 상관없이 항상 서버가 권한을 확인한다. 근거: docs/design/261008-02-admin.md §4

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { removePlay, resetNickname } from '../admin/service';
import type { Database } from '../db/types';
import { jsonError, rejectInvalid } from '../lib/errors';
import type { RankingService } from '../ranking/service';

export interface AdminRouteDeps {
  db: Kysely<Database>;
  ranking: RankingService;
}

const PlayParam = z.object({ playId: z.coerce.number().int().positive() });
const UserParam = z.object({ userId: z.coerce.number().int().positive() });

/** /api/admin 라우트 */
export function adminRoutes({ db, ranking }: AdminRouteDeps) {
  return new Hono<AppEnv>()
    .use('/admin/*', async (c, next) => {
      const user = c.get('user');
      if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
      if (!user.isAdmin) return jsonError(c, 403, 'FORBIDDEN', '관리자만 할 수 있어요.');
      await next();
    })
    .post('/admin/plays/:playId/remove', zValidator('param', PlayParam, rejectInvalid), async (c) => {
      const result = await removePlay(db, c.get('user')!.id, c.req.valid('param').playId);
      if (result === 'not_found') return jsonError(c, 404, 'NOT_FOUND', '없는 판입니다.');
      if (result === 'not_accepted') return jsonError(c, 409, 'PLAY_NOT_ACCEPTED', '이미 지웠거나 인정되지 않은 기록입니다.');
      ranking.invalidate();
      return c.body(null, 204);
    })
    .post('/admin/users/:userId/reset-nickname', zValidator('param', UserParam, rejectInvalid), async (c) => {
      const result = await resetNickname(db, c.get('user')!.id, c.req.valid('param').userId);
      if (result === 'not_found') return jsonError(c, 404, 'NOT_FOUND', '없는 유저입니다.');
      if (result === 'already_empty') return jsonError(c, 409, 'NICKNAME_EMPTY', '이미 닉네임이 없어요.');
      ranking.invalidate();
      return c.body(null, 204);
    });
}
