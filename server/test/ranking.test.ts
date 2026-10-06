// 랭킹 SQL 통합 테스트. 개발 DB(-dev)에 붙어서 트랜잭션 안에서 데이터를 넣고, 끝나면 되돌린다.
// DB 설정이 없거나 개발 DB가 아니면 건너뛴다.

import { describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { findGame, rankToPoints, type GameMeta } from '@magpie/shared';
import { loadConfig, loadEnvFile } from '../src/config';
import { createDb } from '../src/db';
import type { Database } from '../src/db/types';
import { rankGame, rankTotal } from '../src/ranking/queries';

loadEnvFile();
const config = (() => {
  try {
    return loadConfig();
  } catch {
    return null;
  }
})();
const canRun = config !== null && config.DB_NAME.endsWith('-dev');

// 실제 데이터와 겹치지 않는 날짜
const TEST_DAY = '2000-01-01';
const ROLLBACK = new Error('rollback');

/** 트랜잭션 안에서 테스트를 돌리고 항상 되돌린다 */
async function inRollback(fn: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
  const db = createDb(config!);
  try {
    await db.transaction().execute(async (trx) => {
      await fn(trx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await db.destroy();
  }
}

/** 테스트 유저 하나를 만든다 */
async function addUser(trx: Kysely<Database>, nickname: string): Promise<number> {
  const r = await trx
    .insertInto('users')
    .values({ google_sub: `test:${nickname}:${Math.random()}`, nickname: `${nickname}${Date.now() % 100000}` })
    .executeTakeFirstOrThrow();
  return Number(r.insertId);
}

/** 테스트 날짜의 일간 최고 기록을 하나 넣는다 */
async function addDaily(trx: Kysely<Database>, userId: number, gameId: string, score: number, at: string) {
  const achieved = new Date(at);
  const play = await trx
    .insertInto('plays')
    .values({ user_id: userId, game_id: gameId, seed: 'test', score, status: 'accepted', started_at: achieved, ended_at: achieved })
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('best_daily')
    .values({ user_id: userId, game_id: gameId, day: TEST_DAY, score, achieved_at: achieved, play_id: Number(play.insertId) })
    .execute();
}

describe.skipIf(!canRun)('랭킹 SQL (개발 DB)', () => {
  const apple = findGame('apple-ten')!;
  const merge = findGame('fruit-merge')!;

  it('게임별: 점수 높은 순, 동점이면 먼저 달성한 사람이 위', async () => {
    await inRollback(async (trx) => {
      const a = await addUser(trx, 'a');
      const b = await addUser(trx, 'b');
      const c = await addUser(trx, 'c');
      await addDaily(trx, a, 'apple-ten', 120, '2000-01-01T01:00:00Z');
      await addDaily(trx, b, 'apple-ten', 150, '2000-01-01T03:00:00Z');
      await addDaily(trx, c, 'apple-ten', 150, '2000-01-01T02:00:00Z');

      const rows = await rankGame(trx, apple, 'daily', TEST_DAY);
      expect(rows.map((r) => [r.userId, r.rank, r.score])).toEqual([
        [c, 1, 150],
        [b, 2, 150],
        [a, 3, 120],
      ]);
    });
  });

  it('게임별: 낮을수록 좋은 게임은 오름차순', async () => {
    await inRollback(async (trx) => {
      const a = await addUser(trx, 'a');
      const b = await addUser(trx, 'b');
      await addDaily(trx, a, 'apple-ten', 30, '2000-01-01T01:00:00Z');
      await addDaily(trx, b, 'apple-ten', 12, '2000-01-01T02:00:00Z');
      const asc: GameMeta = { ...apple, sort: 'asc' };
      const rows = await rankGame(trx, asc, 'daily', TEST_DAY);
      expect(rows.map((r) => r.userId)).toEqual([b, a]);
    });
  });

  it('총합: 게임별 순위를 환산점으로 바꿔 더한다', async () => {
    await inRollback(async (trx) => {
      const a = await addUser(trx, 'a');
      const b = await addUser(trx, 'b');
      const c = await addUser(trx, 'c');
      // 사과: a 1위, b 2위, c 3위 (3명)
      await addDaily(trx, a, 'apple-ten', 160, '2000-01-01T01:00:00Z');
      await addDaily(trx, b, 'apple-ten', 140, '2000-01-01T01:00:00Z');
      await addDaily(trx, c, 'apple-ten', 100, '2000-01-01T01:00:00Z');
      // 과일 합치기: c 1위, b 2위 (2명), a는 안 함
      await addDaily(trx, c, 'fruit-merge', 3000, '2000-01-01T02:00:00Z');
      await addDaily(trx, b, 'fruit-merge', 2000, '2000-01-01T02:00:00Z');

      const rows = await rankTotal(trx, 'daily', TEST_DAY);
      const byUser = new Map(rows.map((r) => [r.userId, r]));
      expect(byUser.get(a)?.score).toBe(rankToPoints(1, 3));
      expect(byUser.get(b)?.score).toBe(rankToPoints(2, 3) + rankToPoints(2, 2));
      expect(byUser.get(c)?.score).toBe(rankToPoints(3, 3) + rankToPoints(1, 2));
      // c: 333 + 1000 = 1333, b: 667 + 500 = 1167, a: 1000
      expect(rows.map((r) => r.userId)).toEqual([c, b, a]);
      expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
      expect(merge.sort).toBe('desc');
    });
  });
});
