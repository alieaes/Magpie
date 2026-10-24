// 관리자 API: POST /api/admin/plays/:playId/remove, POST /api/admin/users/:userId/reset-nickname,
// POST /api/admin/games/:gameId/reset-ranking(docs/design/261022-08-game-ranking-reset.md),
// GET /api/admin/visitors(대시보드, docs/design/261024-01-admin-dashboard.md),
// GET /api/admin/plays(플레이 이력, docs/design/261024-02-admin-play-history.md).
// 관리자만 쓸 수 있다. 화면의 표시와 상관없이 항상 서버가 권한을 확인한다. 근거: docs/design/261008-02-admin.md §4

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { isGameId } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { isPlayHistoryCursor, listPlayHistory } from '../admin/play-history';
import { removePlay, resetGameRanking, resetNickname } from '../admin/service';
import type { Database } from '../db/types';
import { jsonError, rejectInvalid } from '../lib/errors';
import type { LogicRegistry } from '../plays/logics';
import type { RankingService } from '../ranking/service';
import type { VisitService } from '../visits/service';

export interface AdminRouteDeps {
  db: Kysely<Database>;
  ranking: RankingService;
  visits: VisitService;
  /** 플레이 이력은 기록할 수 있는 게임만 받는다 */
  logics: LogicRegistry;
}

const PlayParam = z.object({ playId: z.coerce.number().int().positive() });
const UserParam = z.object({ userId: z.coerce.number().int().positive() });
const GameParam = z.object({ gameId: z.string().min(1).max(32) });
const PlaysQuery = z.object({
  gameId: z.string().min(1).max(32),
  who: z.enum(['member', 'guest']),
  cursor: z.string().max(40).optional(),
});

/** /api/admin 라우트 */
export function adminRoutes({ db, ranking, visits, logics }: AdminRouteDeps) {
  return new Hono<AppEnv>()
    .use('/admin/*', async (c, next) => {
      const user = c.get('user');
      if (!user) return jsonError(c, 401, 'UNAUTHORIZED', '로그인이 필요해요.');
      if (!user.isAdmin) return jsonError(c, 403, 'FORBIDDEN', '관리자만 할 수 있어요.');
      await next();
    })
    .get('/admin/visitors', async (c) => c.json(await visits.summary(), 200))
    .get('/admin/plays', zValidator('query', PlaysQuery, rejectInvalid), async (c) => {
      const { gameId, who, cursor } = c.req.valid('query');
      if (!isGameId(gameId) || !logics.isRecordable(gameId)) return jsonError(c, 400, 'BAD_REQUEST', '기록할 수 없는 게임입니다.');
      if (cursor !== undefined && !isPlayHistoryCursor(who, cursor)) return jsonError(c, 400, 'BAD_REQUEST', '잘못된 위치입니다.');
      return c.json(await listPlayHistory(db, gameId, who, cursor), 200);
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
    })
    .post('/admin/games/:gameId/reset-ranking', zValidator('param', GameParam, rejectInvalid), async (c) => {
      const result = await resetGameRanking(db, c.get('user')!.id, c.req.valid('param').gameId);
      if (result === 'not_found') return jsonError(c, 404, 'NOT_FOUND', '없는 게임입니다.');
      if (result === 'not_resettable') return jsonError(c, 400, 'BAD_REQUEST', '미니게임 랭킹은 초기화할 수 없어요.');
      if (result === 'empty') return jsonError(c, 409, 'RANKING_EMPTY', '이미 비어 있어요.');
      ranking.invalidate();
      return c.body(null, 204);
    });
}
