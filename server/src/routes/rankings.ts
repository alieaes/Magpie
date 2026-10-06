import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { RANKING_MAX_LIMIT, isGameId, type RankingTarget } from '@magpie/shared';
import { getSessionUserId } from '../auth/session';
import { jsonError } from '../lib/errors';
import type { RankingService } from '../ranking/service';

const RankingQuery = z.object({
  target: z
    .string()
    .default('total')
    .refine((t) => t === 'total' || isGameId(t), { message: '없는 게임입니다.' })
    .transform((t) => t as RankingTarget),
  period: z.enum(['daily', 'alltime']).default('daily'),
  limit: z.coerce.number().int().min(1).max(RANKING_MAX_LIMIT).default(10),
});

/** 랭킹 조회 API: GET /api/rankings, GET /api/games/summary */
export function rankingRoutes(ranking: RankingService) {
  return new Hono()
    .get(
      '/rankings',
      zValidator('query', RankingQuery, (result, c) => {
        if (!result.success) {
          const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
          return jsonError(c, 400, 'BAD_REQUEST', message);
        }
      }),
      async (c) => {
        const { target, period, limit } = c.req.valid('query');
        const userId = await getSessionUserId(c);
        return c.json(await ranking.getRanking(target, period, limit, userId), 200);
      },
    )
    .get('/games/summary', async (c) => {
      const userId = await getSessionUserId(c);
      return c.json(await ranking.getGamesSummary(userId), 200);
    });
}
