// 관리자 기능 통합 테스트. 개발 DB(-dev)의 되돌림 트랜잭션 안에서 실제 판을 만들고 관리 API를 부른다.

import { describe, expect, it } from 'vitest';
import type { RankingResponse, StartPlayResponse } from '@magpie/shared';
import { canRunDb, playAppleGreedy, withTestApp, type TestApp, type TestUser } from './helpers';

/** 사과게임 한 판을 통과시키고 판 번호를 돌려준다 */
async function acceptedPlay(app: TestApp, user: TestUser, moves: number): Promise<number> {
  const play = (await (await app.post('/api/plays', { gameId: 'apple-ten' }, user.cookie)).json()) as StartPlayResponse;
  const { inputs, score } = playAppleGreedy(play.seed, moves);
  const ticks = inputs.at(-1)!.t + 30;
  app.advance((ticks / 60) * 1000 + 500);
  const res = await app.post(`/api/plays/${play.playId}/finish`, { inputs, ticks, score }, user.cookie);
  expect(await res.json()).toMatchObject({ accepted: true });
  return play.playId;
}

/** 작업 기록의 detail을 객체로 읽는다. 드라이버가 이미 풀었으면 그대로 */
function parseDetail(detail: unknown): unknown {
  return typeof detail === 'string' ? JSON.parse(detail) : detail;
}

/** 사과게임 일간 랭킹을 받는다 */
async function appleDaily(app: TestApp, cookie?: string): Promise<RankingResponse> {
  return (await (await app.get('/api/rankings?target=apple-ten&period=daily&limit=100', cookie)).json()) as RankingResponse;
}

describe.skipIf(!canRunDb)('관리자 (개발 DB)', () => {
  it('관리 API는 관리자만: 비로그인 401, 일반 유저 403', async () => {
    await withTestApp(async (app) => {
      expect((await app.post('/api/admin/plays/1/remove')).status).toBe(401);
      const user = await app.login();
      expect((await app.post('/api/admin/plays/1/remove', undefined, user.cookie)).status).toBe(403);
      expect((await app.post(`/api/admin/users/${user.id}/reset-nickname`, undefined, user.cookie)).status).toBe(403);
    });
  });

  it('내 정보에 관리자 여부가 있고, 랭킹은 관리자에게만 유저·판 번호를 준다', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const player = await app.login();
      const playId = await acceptedPlay(app, player, 5);

      expect(await (await app.get('/api/me', admin.cookie)).json()).toMatchObject({ user: { isAdmin: true } });
      expect(await (await app.get('/api/me', player.cookie)).json()).toMatchObject({ user: { isAdmin: false } });

      const forAdmin = await appleDaily(app, admin.cookie);
      expect(forAdmin.entries).toEqual([expect.objectContaining({ rank: 1, userId: player.id, playId })]);
      const forPlayer = await appleDaily(app, player.cookie);
      expect(Object.keys(forPlayer.entries[0]!).sort()).toEqual(['nickname', 'rank', 'score']);

      const total = (await (await app.get('/api/rankings?target=total&period=daily', admin.cookie)).json()) as RankingResponse;
      expect(total.entries[0]).toMatchObject({ userId: player.id });
      expect(total.entries[0]).not.toHaveProperty('playId');
    });
  });

  it('기록 삭제: 판을 admin으로 거절하고 그 판의 최고 기록 줄을 지운다. 작업 기록을 남긴다', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const player = await app.login();
      const low = await acceptedPlay(app, player, 3);
      const high = await acceptedPlay(app, player, 10);
      expect((await appleDaily(app)).entries).toHaveLength(1);

      expect((await app.post(`/api/admin/plays/${high}/remove`, undefined, admin.cookie)).status).toBe(204);
      // 두 번째로 좋은 기록(low)이 대신 올라오지 않는다
      expect((await appleDaily(app)).entries).toEqual([]);
      const play = await app.trx.selectFrom('plays').select(['status', 'reject_reason', 'score']).where('id', '=', high).executeTakeFirstOrThrow();
      expect(play).toEqual({ status: 'rejected', reject_reason: 'admin', score: null });
      expect(await app.trx.selectFrom('best_alltime').select('play_id').where('play_id', '=', high).execute()).toEqual([]);

      const log = await app.trx
        .selectFrom('admin_actions')
        .select(['admin_user_id', 'action', 'target_user_id', 'play_id', 'detail'])
        .where('play_id', '=', high)
        .executeTakeFirstOrThrow();
      expect(log).toMatchObject({ admin_user_id: admin.id, action: 'remove_play', target_user_id: player.id, play_id: high });
      expect(parseDetail(log.detail)).toMatchObject({ gameId: 'apple-ten', removedDaily: 1, removedAllTime: 1 });

      // 이미 지운 판, 최고 기록이 아닌 판, 없는 판
      expect((await app.post(`/api/admin/plays/${high}/remove`, undefined, admin.cookie)).status).toBe(409);
      expect((await app.post(`/api/admin/plays/${low}/remove`, undefined, admin.cookie)).status).toBe(204);
      expect((await app.post('/api/admin/plays/999999999/remove', undefined, admin.cookie)).status).toBe(404);
    });
  });

  it('닉네임 초기화: 닉네임을 비우고 랭킹에는 "이름 없음". 이미 비었으면 409', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const player = await app.login({ nickname: '초기화대상' });
      await acceptedPlay(app, player, 3);

      expect((await app.post(`/api/admin/users/${player.id}/reset-nickname`, undefined, admin.cookie)).status).toBe(204);
      expect(await (await app.get('/api/me', player.cookie)).json()).toMatchObject({ user: { nickname: null } });
      expect((await appleDaily(app)).entries[0]).toMatchObject({ nickname: '이름 없음' });

      const log = await app.trx
        .selectFrom('admin_actions')
        .select(['action', 'detail'])
        .where('target_user_id', '=', player.id)
        .executeTakeFirstOrThrow();
      expect(log.action).toBe('reset_nickname');
      expect(parseDetail(log.detail)).toEqual({ nickname: '초기화대상' });

      expect((await app.post(`/api/admin/users/${player.id}/reset-nickname`, undefined, admin.cookie)).status).toBe(409);
      expect((await app.post('/api/admin/users/999999999/reset-nickname', undefined, admin.cookie)).status).toBe(404);
    });
  });
});
