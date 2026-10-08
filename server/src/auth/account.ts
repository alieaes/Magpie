// 회원 탈퇴: 유저와 그 유저의 기록을 모두 지운다. 근거: docs/design/261008-01-account-delete.md
//
// 잠금: 유저 번호 조건으로 바로 지우면 맞는 줄 뒤의 틈(gap)까지 잠가 다른 유저의 기록 저장과 교착이 날 수 있다.
// 그래서 먼저 읽고 기본 키로 지운다 (판 기록·관리자 기능과 같은 규칙, docs/spec/plays.md).

import { sql, type Kysely } from 'kysely';
import { inTransaction } from '../db';
import type { Database } from '../db/types';

// 한 번에 지울 기본 키 개수. 판이 아주 많은 유저도 쿼리 하나가 너무 커지지 않게 나눈다
const CHUNK = 500;

/**
 * 유저를 지운다. 한 트랜잭션에서 최고 기록, 판과 입력 기록, 세션, 유저 줄을 지운다.
 * 관리자 작업 기록은 남기되 대상 번호만 남도록 이전 닉네임을 지운다.
 */
export async function deleteAccount(db: Kysely<Database>, userId: number): Promise<void> {
  await inTransaction(db, async (trx) => {
    const dailyRows = await trx.selectFrom('best_daily').select(['game_id', 'day']).where('user_id', '=', userId).execute();
    const daysByGame = new Map<string, string[]>();
    for (const row of dailyRows) {
      // DATE 열은 UTC 자정의 Date로 읽힌다(연결 시간대 UTC). 날짜 문자열로 맞춘다
      const days = daysByGame.get(row.game_id) ?? [];
      days.push(row.day.toISOString().slice(0, 10));
      daysByGame.set(row.game_id, days);
    }
    for (const [gameId, days] of daysByGame) {
      for (const part of chunks(days)) {
        await trx
          .deleteFrom('best_daily')
          .where('user_id', '=', userId)
          .where('game_id', '=', gameId)
          .where(sql<string>`day`, 'in', part)
          .execute();
      }
    }

    const alltimeGames = await trx.selectFrom('best_alltime').select('game_id').where('user_id', '=', userId).execute();
    if (alltimeGames.length > 0) {
      await trx
        .deleteFrom('best_alltime')
        .where('user_id', '=', userId)
        .where('game_id', 'in', alltimeGames.map((r) => r.game_id))
        .execute();
    }

    const playIds = (await trx.selectFrom('plays').select('id').where('user_id', '=', userId).execute()).map((r) => r.id);
    for (const part of chunks(playIds)) {
      await trx.deleteFrom('play_replays').where('play_id', 'in', part).execute();
      await trx.deleteFrom('plays').where('id', 'in', part).execute();
    }

    const sessions = (await trx.selectFrom('sessions').select('id_hash').where('user_id', '=', userId).execute()).map((r) => r.id_hash);
    for (const part of chunks(sessions)) await trx.deleteFrom('sessions').where('id_hash', 'in', part).execute();

    // 관리자 작업 기록에는 대상 번호만 남긴다(이전 닉네임은 지운다)
    const named = (
      await trx
        .selectFrom('admin_actions')
        .select('id')
        .where('target_user_id', '=', userId)
        .where('action', '=', 'reset_nickname')
        .execute()
    ).map((r) => r.id);
    for (const part of chunks(named)) {
      await trx
        .updateTable('admin_actions')
        .set({ detail: sql<string>`JSON_REMOVE(detail, '$.nickname')` })
        .where('id', 'in', part)
        .execute();
    }

    await trx.deleteFrom('users').where('id', '=', userId).execute();
  });
}

/** 배열을 CHUNK개씩 나눈다 */
function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}
