// 관리자 대시보드의 게임별 플레이 이력. 근거: docs/design/261024-02-admin-play-history.md §2~§4
// 로그인 판은 plays에서 끝난 판만(최근에 끝난 순), 비로그인 판은 practice_plays에서 받은 순.
// 새 판이 들어와도 겹치거나 빠지지 않게 위치(커서)로 다음 묶음을 넘긴다.

import type { Kysely } from 'kysely';
import type { AdminGuestPlay, AdminMemberPlay, AdminPlaysResponse, AdminPlayWho, PlayRejectReason } from '@magpie/shared';
import type { Database } from '../db/types';

/** 한 번에 주는 줄 수 */
export const PLAY_HISTORY_PAGE = 50;

const MEMBER_CURSOR = /^(\d{1,15})_(\d{1,19})$/;
const GUEST_CURSOR = /^\d{1,19}$/;

/** 커서가 그 구분의 모양인지 본다. 틀리면 요청을 거절한다 */
export function isPlayHistoryCursor(who: AdminPlayWho, cursor: string): boolean {
  return (who === 'member' ? MEMBER_CURSOR : GUEST_CURSOR).test(cursor);
}

/** 로그인 판: 끝난 판만 최근에 끝난 순. 커서는 "끝난 시각(ms)_판 번호" */
async function memberPlays(db: Kysely<Database>, gameId: string, cursor: string | undefined): Promise<AdminPlaysResponse> {
  let query = db
    .selectFrom('plays')
    .innerJoin('users', 'users.id', 'plays.user_id')
    .select(['plays.id', 'plays.ended_at', 'plays.ip', 'plays.status', 'plays.score', 'plays.reject_reason', 'users.nickname'])
    .where('plays.game_id', '=', gameId)
    .where('plays.ended_at', 'is not', null);
  const match = cursor ? MEMBER_CURSOR.exec(cursor) : null;
  if (match) {
    const at = new Date(Number(match[1]));
    const id = Number(match[2]);
    query = query.where((eb) =>
      eb.or([eb('plays.ended_at', '<', at), eb.and([eb('plays.ended_at', '=', at), eb('plays.id', '<', id)])]),
    );
  }
  const rows = await query.orderBy('plays.ended_at', 'desc').orderBy('plays.id', 'desc').limit(PLAY_HISTORY_PAGE + 1).execute();

  const items: AdminMemberPlay[] = rows.slice(0, PLAY_HISTORY_PAGE).map((r) => ({
    playId: Number(r.id),
    at: r.ended_at!.toISOString(),
    nickname: r.nickname,
    ip: r.ip,
    score: r.status === 'accepted' ? r.score : null,
    rejectReason: r.status === 'rejected' ? ((r.reject_reason ?? 'bad_input') as PlayRejectReason) : null,
  }));
  const last = items.at(-1);
  const nextCursor = rows.length > PLAY_HISTORY_PAGE && last ? `${new Date(last.at).getTime()}_${last.playId}` : null;
  return { who: 'member', items, nextCursor };
}

/** 비로그인 판: 받은 순(번호 순). 커서는 마지막 번호 */
async function guestPlays(db: Kysely<Database>, gameId: string, cursor: string | undefined): Promise<AdminPlaysResponse> {
  let query = db.selectFrom('practice_plays').select(['id', 'created_at', 'ip', 'score']).where('game_id', '=', gameId);
  if (cursor && GUEST_CURSOR.test(cursor)) query = query.where('id', '<', Number(cursor));
  const rows = await query.orderBy('id', 'desc').limit(PLAY_HISTORY_PAGE + 1).execute();

  const items: AdminGuestPlay[] = rows.slice(0, PLAY_HISTORY_PAGE).map((r) => ({
    id: Number(r.id),
    at: r.created_at.toISOString(),
    ip: r.ip,
    score: r.score,
  }));
  const last = items.at(-1);
  const nextCursor = rows.length > PLAY_HISTORY_PAGE && last ? String(last.id) : null;
  return { who: 'guest', items, nextCursor };
}

/** 게임별 플레이 이력 한 묶음 */
export function listPlayHistory(
  db: Kysely<Database>,
  gameId: string,
  who: AdminPlayWho,
  cursor?: string,
): Promise<AdminPlaysResponse> {
  return who === 'member' ? memberPlays(db, gameId, cursor) : guestPlays(db, gameId, cursor);
}
