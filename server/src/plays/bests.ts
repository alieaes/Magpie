// 최고 기록 갱신. 통과한 판이 더 좋은 기록일 때만 best_daily·best_alltime을 바꾼다.
// 동점이면 먼저 달성한 기록을 그대로 둔다(랭킹의 동점 규칙과 같다). 근거: docs/design/261006-06-ranking.md §6

import { sql, type InsertResult, type Kysely, type UpdateResult } from 'kysely';
import { kstDayKey, type GameMeta } from '@magpie/shared';
import type { Database } from '../db/types';

export interface BestCandidate {
  userId: number;
  game: GameMeta;
  score: number;
  /** 판이 끝난 시각. 일간 기록의 날짜(KST)도 이것으로 정한다 */
  achievedAt: Date;
  playId: number;
}

/** 이 판으로 바뀐 최고 기록 */
export interface BestChange {
  today: boolean;
  allTime: boolean;
}

/** 일간·역대 최고 기록을 갱신한다. 같은 트랜잭션 안에서 부른다 */
export async function updateBests(trx: Kysely<Database>, c: BestCandidate): Promise<BestChange> {
  const day = kstDayKey(c.achievedAt);
  // 기존 기록이 새 점수보다 나쁘면 바꾼다. 높을수록 좋은 게임은 '기존 < 새 점수'
  const worse = c.game.sort === 'asc' ? '>' : '<';
  const values = { user_id: c.userId, game_id: c.game.id, score: c.score, achieved_at: c.achievedAt, play_id: c.playId };
  const changes = { score: c.score, achieved_at: c.achievedAt, play_id: c.playId };

  const today = await keepBetter(
    () =>
      trx
        .updateTable('best_daily')
        .set(changes)
        .where('user_id', '=', c.userId)
        .where('game_id', '=', c.game.id)
        .where(sql<string>`day`, '=', day)
        .where('score', worse, c.score)
        .executeTakeFirst(),
    () => trx.insertInto('best_daily').values({ ...values, day }).orIgnore().executeTakeFirst(),
  );
  const allTime = await keepBetter(
    () =>
      trx
        .updateTable('best_alltime')
        .set(changes)
        .where('user_id', '=', c.userId)
        .where('game_id', '=', c.game.id)
        .where('score', worse, c.score)
        .executeTakeFirst(),
    () => trx.insertInto('best_alltime').values(values).orIgnore().executeTakeFirst(),
  );
  return { today, allTime };
}

/**
 * 더 좋으면 바꾸고(update), 기록이 없으면 넣는다(insert, 이미 있으면 무시). 바뀌었으면 true.
 * 같은 유저의 다른 판이 동시에 먼저 넣었으면 insert가 무시되므로, 그 기록과 한 번 더 비교한다.
 */
async function keepBetter(update: () => Promise<UpdateResult>, insert: () => Promise<InsertResult>): Promise<boolean> {
  if (Number((await update()).numUpdatedRows) > 0) return true;
  if (Number((await insert()).numInsertedOrUpdatedRows ?? 0) > 0) return true;
  return Number((await update()).numUpdatedRows) > 0;
}
