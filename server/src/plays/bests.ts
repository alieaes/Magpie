// 최고 기록 갱신. 통과한 판이 더 좋은 기록일 때만 best_daily·best_alltime을 바꾼다.
// 동점이면 먼저 달성한 기록을 그대로 둔다(랭킹의 동점 규칙과 같다). 근거: docs/design/261006-06-ranking.md §6
//
// 잠금: "없으면 UPDATE → INSERT" 순서는 없는 줄을 찾는 UPDATE가 틈(gap) 잠금을 걸어서,
// 다른 유저의 판이 동시에 끝나면 서로의 INSERT를 막아 교착(deadlock)이 난다.
// 그래서 기본 키로 한 번에 넣거나 고치고(INSERT ... ON DUPLICATE KEY UPDATE, 줄 잠금만 건다), 바뀌었는지는 다시 읽어 판 번호로 본다.

import { sql, type Kysely, type RawBuilder } from 'kysely';
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
  const values = { user_id: c.userId, game_id: c.game.id, score: c.score, achieved_at: c.achievedAt, play_id: c.playId };
  const better = isBetter(c.game);
  // MariaDB는 고칠 값을 왼쪽부터 차례로 계산한다. score를 먼저 바꾸면 뒤의 비교가 새 값을 보므로 score를 맨 끝에 둔다
  const keepBetter = {
    achieved_at: sql<Date>`IF(${better}, VALUES(achieved_at), achieved_at)`,
    play_id: sql<number>`IF(${better}, VALUES(play_id), play_id)`,
    score: sql<number>`IF(${better}, VALUES(score), score)`,
  };

  await trx.insertInto('best_daily').values({ ...values, day }).onDuplicateKeyUpdate(keepBetter).execute();
  await trx.insertInto('best_alltime').values(values).onDuplicateKeyUpdate(keepBetter).execute();

  const today = await trx
    .selectFrom('best_daily')
    .select('play_id')
    .where('user_id', '=', c.userId)
    .where('game_id', '=', c.game.id)
    .where(sql<string>`day`, '=', day)
    .executeTakeFirst();
  const allTime = await trx
    .selectFrom('best_alltime')
    .select('play_id')
    .where('user_id', '=', c.userId)
    .where('game_id', '=', c.game.id)
    .executeTakeFirst();
  return { today: Number(today?.play_id) === c.playId, allTime: Number(allTime?.play_id) === c.playId };
}

/** 새 값(VALUES)이 기존 값보다 좋은지 보는 식. 높을수록 좋은 게임은 '새 점수 > 기존 점수'. 같으면 기존을 둔다 */
function isBetter(game: GameMeta): RawBuilder<boolean> {
  return game.sort === 'asc' ? sql<boolean>`VALUES(score) < score` : sql<boolean>`VALUES(score) > score`;
}
