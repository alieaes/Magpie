import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { RANKING_MAX_LIMIT, hasDailyRanking, isGameId, type RankingTarget } from '@magpie/shared';
import type { AppEnv } from '../app-env';
import { jsonError } from '../lib/errors';
import type { RankingService } from '../ranking/service';
import type { SaveService } from '../saves/service';

const RankingQuery = z.object({
  target: z
    .string()
    .default('total')
    .refine((t) => t === 'total' || isGameId(t), { message: '없는 게임입니다.' })
    .transform((t) => t as RankingTarget),
  /** 빼면 일간. 일간 랭킹이 없는 게임(성장형)은 역대 */
  period: z.enum(['daily', 'alltime']).optional(),
  limit: z.coerce.number().int().min(1).max(RANKING_MAX_LIMIT).default(10),
});

/** 랭킹 조회 API: GET /api/rankings, GET /api/games/summary */
export function rankingRoutes(ranking: RankingService, saves: SaveService) {
  return new Hono<AppEnv>()
    .get(
      '/rankings',
      zValidator('query', RankingQuery, (result, c) => {
        if (!result.success) {
          const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
          return jsonError(c, 400, 'BAD_REQUEST', message);
        }
      }),
      async (c) => {
        const { target, limit } = c.req.valid('query');
        const daily = hasDailyRanking(target);
        const period = c.req.valid('query').period ?? (daily ? 'daily' : 'alltime');
        if (period === 'daily' && !daily) return jsonError(c, 400, 'BAD_REQUEST', '이 게임은 일간 랭킹이 없어요.');
        const user = c.get('user');
        // 관리자에게는 관리 메뉴가 쓸 유저·판 번호를 같이 준다
        return c.json(await ranking.getRanking(target, period, limit, user?.id ?? null, user?.isAdmin === true), 200);
      },
    )
    .get('/games/summary', async (c) => {
      const userId = c.get('user')?.id ?? null;
      const [summaries, days] = await Promise.all([
        ranking.getGamesSummary(userId),
        userId === null ? Promise.resolve(new Map<string, number>()) : saves.progress(userId),
      ]);
      // 성장형 게임은 저장이 몇 일째인지 같이 준다
      return c.json(
        summaries.map((s) => {
          const day = days.get(s.gameId);
          return day === undefined ? s : { ...s, progress: { day } };
        }),
        200,
      );
    });
}
