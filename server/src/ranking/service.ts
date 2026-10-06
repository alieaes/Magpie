// 랭킹 조회 서비스. 전체 순위를 10초 캐시해 두고, 상위 N명과 내 순위를 거기서 잘라 준다.

import type { Kysely } from 'kysely';
import {
  GAMES,
  findGame,
  kstDayKey,
  nextKstMidnight,
  type GameSummary,
  type RankingPeriod,
  type RankingResponse,
  type RankingTarget,
} from '@magpie/shared';
import type { Database } from '../db/types';
import { TtlCache } from '../lib/ttl-cache';
import { rankGame, rankTotal, type RankedRow } from './queries';

const CACHE_TTL_MS = 10_000;

export interface RankingService {
  getRanking(target: RankingTarget, period: RankingPeriod, limit: number, userId: number | null): Promise<RankingResponse>;
  getGamesSummary(userId: number | null): Promise<GameSummary[]>;
}

/** 랭킹 서비스를 만든다. now는 테스트에서 시각을 고정할 때 바꾼다 */
export function createRankingService(db: Kysely<Database>, now: () => Date = () => new Date()): RankingService {
  const cache = new TtlCache<RankedRow[]>(CACHE_TTL_MS);

  /** 대상·기간의 전체 순위를 캐시에서 꺼내거나 새로 계산한다 */
  function loadRows(target: RankingTarget, period: RankingPeriod, day: string): Promise<RankedRow[]> {
    const key = `${target}|${period}|${period === 'daily' ? day : ''}`;
    return cache.getOrLoad(key, () => {
      if (target === 'total') return rankTotal(db, period, day);
      const game = findGame(target);
      if (!game) throw new Error(`없는 게임: ${target}`);
      return rankGame(db, game, period, day);
    });
  }

  return {
    /** 상위 limit명과 내 순위를 돌려준다 */
    async getRanking(target, period, limit, userId) {
      const at = now();
      const day = kstDayKey(at);
      const rows = await loadRows(target, period, day);
      const mine = userId === null ? undefined : rows.find((r) => r.userId === userId);

      const response: RankingResponse = {
        target,
        period,
        participants: rows.length,
        entries: rows.slice(0, limit).map(({ rank, nickname, score }) => ({ rank, nickname, score })),
      };
      if (period === 'daily') {
        response.day = day;
        response.resetsAt = nextKstMidnight(at).toISOString();
      }
      if (mine) response.me = { rank: mine.rank, score: mine.score };
      return response;
    },

    /** 로비 카드용: 게임마다 오늘 1위와 내 오늘·역대 최고 기록 */
    async getGamesSummary(userId) {
      const day = kstDayKey(now());
      return Promise.all(
        GAMES.map(async (game): Promise<GameSummary> => {
          const daily = await loadRows(game.id, 'daily', day);
          const top = daily[0];
          let myTodayBest: number | null = null;
          let myAllTimeBest: number | null = null;
          if (userId !== null) {
            myTodayBest = daily.find((r) => r.userId === userId)?.score ?? null;
            const alltime = await loadRows(game.id, 'alltime', day);
            myAllTimeBest = alltime.find((r) => r.userId === userId)?.score ?? null;
          }
          return {
            gameId: game.id,
            todayTop: top ? { nickname: top.nickname, score: top.score } : null,
            myTodayBest,
            myAllTimeBest,
          };
        }),
      );
    },
  };
}
