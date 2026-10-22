// 관리자 기능: 기록 삭제, 닉네임 초기화, 게임 랭킹 초기화. 한 일은 모두 admin_actions에 남긴다.
// 근거: docs/design/261008-02-admin.md, docs/design/261022-08-game-ranking-reset.md

import { sql, type Kysely } from 'kysely';
import { findGame, isGrowthGame } from '@magpie/shared';
import { inTransaction } from '../db';
import type { AdminActionKind, Database } from '../db/types';
import { chunks } from '../lib/chunks';

export type RemovePlayResult = 'removed' | 'not_found' | 'not_accepted';
export type ResetNicknameResult = 'reset' | 'not_found' | 'already_empty';
/** not_resettable = 미니게임(일간이 매일 새로 시작하고 역대는 쌓이는 것이 규칙이라 대상이 아니다) */
export type ResetRankingResult = 'reset' | 'not_found' | 'not_resettable' | 'empty';

/**
 * 기록 삭제: 통과한 판을 거절(admin)로 바꾸고, 그 판을 가리키는 일간·역대 최고 기록 줄을 지운다.
 * 그 유저의 다음으로 좋은 기록이 대신 올라오지는 않는다(최고 기록 표는 1등 기록만 들고 있다).
 */
export async function removePlay(db: Kysely<Database>, adminId: number, playId: number): Promise<RemovePlayResult> {
  return inTransaction(db, async (trx) => {
    const play = await trx
      .selectFrom('plays')
      .select(['user_id', 'game_id', 'score', 'status'])
      .where('id', '=', playId)
      .forUpdate()
      .executeTakeFirst();
    if (!play) return 'not_found';
    if (play.status !== 'accepted') return 'not_accepted';

    await trx.updateTable('plays').set({ status: 'rejected', reject_reason: 'admin', score: null }).where('id', '=', playId).execute();
    // 그 판을 가리키는 줄을 찾아 기본 키로 지운다(틈 잠금을 피한다). 그 사이 다른 판으로 바뀌었으면 play_id 조건에서 빠진다
    const userId = Number(play.user_id);
    const days = await trx.selectFrom('best_daily').select('day').where('play_id', '=', playId).execute();
    let removedDaily = 0;
    for (const { day } of days) {
      const result = await trx
        .deleteFrom('best_daily')
        .where('user_id', '=', userId)
        .where('game_id', '=', play.game_id)
        // DATE 열은 UTC 자정의 Date로 읽힌다(연결 시간대 UTC). 날짜 문자열로 맞춘다
        .where(sql<string>`day`, '=', day.toISOString().slice(0, 10))
        .where('play_id', '=', playId)
        .executeTakeFirst();
      removedDaily += Number(result.numDeletedRows);
    }
    const alltime = await trx
      .deleteFrom('best_alltime')
      .where('user_id', '=', userId)
      .where('game_id', '=', play.game_id)
      .where('play_id', '=', playId)
      .executeTakeFirst();
    await logAction(trx, adminId, 'remove_play', userId, playId, {
      gameId: play.game_id,
      score: play.score,
      removedDaily,
      removedAllTime: Number(alltime.numDeletedRows),
    });
    return 'removed';
  });
}

/** 닉네임 초기화: 닉네임을 비운다. 그 유저는 다음 접속 때 다시 정해야 하고, 그 전까지 랭킹에는 "이름 없음"으로 나온다 */
export async function resetNickname(db: Kysely<Database>, adminId: number, userId: number): Promise<ResetNicknameResult> {
  return inTransaction(db, async (trx) => {
    const user = await trx.selectFrom('users').select('nickname').where('id', '=', userId).forUpdate().executeTakeFirst();
    if (!user) return 'not_found';
    if (user.nickname === null) return 'already_empty';
    await trx.updateTable('users').set({ nickname: null }).where('id', '=', userId).execute();
    await logAction(trx, adminId, 'reset_nickname', userId, null, { nickname: user.nickname });
    return 'reset';
  });
}

/**
 * 게임 랭킹 초기화: "게임" 분류(성장형) 게임의 전체 랭킹(best_alltime) 줄을 모두 지운다.
 * 판 기록·가게 저장은 그대로라 가게는 이어서 하고, 그 뒤 끝나는 하루부터 다시 쌓인다.
 * 지운 줄은 판 기록(통과한 판 중 초기화 시각 전 유저별 최고)으로 다시 만들 수 있어 작업 기록에는 줄 수만 남긴다.
 */
export async function resetGameRanking(db: Kysely<Database>, adminId: number, gameId: string): Promise<ResetRankingResult> {
  const game = findGame(gameId);
  if (!game) return 'not_found';
  if (!isGrowthGame(game)) return 'not_resettable';
  return inTransaction(db, async (trx) => {
    // 순위 색인(game_id, score)으로 그 게임의 줄을 잠그고 읽은 뒤 기본 키로 지운다(틈 잠금을 피한다).
    // 잠그기 전에 끝난 하루는 같이 지워지고, 그 뒤에 끝난 하루는 새 랭킹의 첫 기록이 된다
    const userIds = (await trx.selectFrom('best_alltime').select('user_id').where('game_id', '=', game.id).forUpdate().execute()).map((r) =>
      Number(r.user_id),
    );
    if (userIds.length === 0) return 'empty';
    for (const part of chunks(userIds)) {
      await trx.deleteFrom('best_alltime').where('game_id', '=', game.id).where('user_id', 'in', part).execute();
    }
    await logAction(trx, adminId, 'reset_ranking', null, null, { gameId: game.id, removed: userIds.length });
    return 'reset';
  });
}

/** 관리자 작업 한 줄을 남긴다. detail에는 처리 전 값을 둔다 */
async function logAction(
  trx: Kysely<Database>,
  adminId: number,
  action: AdminActionKind,
  targetUserId: number | null,
  playId: number | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await trx
    .insertInto('admin_actions')
    .values({ admin_user_id: adminId, action, target_user_id: targetUserId, play_id: playId, detail: JSON.stringify(detail) })
    .execute();
}
