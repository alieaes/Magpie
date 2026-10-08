// 회원 탈퇴 통합 테스트. 개발 DB(-dev)의 되돌림 트랜잭션 안에서 실제 판을 만들고 탈퇴한다.

import { describe, expect, it } from 'vitest';
import type { RankingResponse, StartPlayResponse } from '@magpie/shared';
import { canRunDb, playAppleGreedy, withTestApp, type TestApp, type TestUser } from './helpers';

/** 사과게임 한 판을 통과시키고 판 번호를 돌려준다 */
async function acceptedPlay(app: TestApp, user: TestUser, moves: number): Promise<number> {
  const play = (await (await app.post('/api/plays', { gameId: 'apple-ten' }, user.cookie)).json()) as StartPlayResponse;
  const { inputs, score } = playAppleGreedy(play.seed, moves);
  const ticks = inputs.at(-1)!.t + 30;
  app.advance((ticks / 60) * 1000 + 500);
  await app.post(`/api/plays/${play.playId}/finish`, { inputs, ticks, score }, user.cookie);
  return play.playId;
}

/** 그 유저의 줄 개수를 표마다 센다 */
async function countRows(app: TestApp, userId: number, playIds: number[]) {
  const count = async (q: Promise<unknown[]>) => (await q).length;
  return {
    users: await count(app.trx.selectFrom('users').select('id').where('id', '=', userId).execute()),
    sessions: await count(app.trx.selectFrom('sessions').select('id_hash').where('user_id', '=', userId).execute()),
    plays: await count(app.trx.selectFrom('plays').select('id').where('user_id', '=', userId).execute()),
    replays:
      playIds.length === 0
        ? 0
        : await count(app.trx.selectFrom('play_replays').select('play_id').where('play_id', 'in', playIds).execute()),
    daily: await count(app.trx.selectFrom('best_daily').select('play_id').where('user_id', '=', userId).execute()),
    alltime: await count(app.trx.selectFrom('best_alltime').select('play_id').where('user_id', '=', userId).execute()),
  };
}

describe.skipIf(!canRunDb)('회원 탈퇴 (개발 DB)', () => {
  it('비로그인 401, 확인 문구가 다르면 400이고 아무것도 지우지 않는다', async () => {
    await withTestApp(async (app) => {
      expect((await app.del('/api/me', { confirm: '탈퇴' })).status).toBe(401);
      const user = await app.login({ nickname: '탈퇴할까' });
      const res = await app.del('/api/me', { confirm: '탈퇴' }, user.cookie);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'CONFIRM_MISMATCH' } });
      expect((await app.del('/api/me', { confirm: '' }, user.cookie)).status).toBe(400);
      expect((await countRows(app, user.id, [])).users).toBe(1);
    });
  });

  it('닉네임을 입력하면 유저·세션·판·입력 기록·최고 기록을 모두 지우고 랭킹에서 빠진다', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const user = await app.login({ nickname: '떠나는까치' });
      const other = await app.login();
      const playIds = [await acceptedPlay(app, user, 5), await acceptedPlay(app, user, 8)];
      const otherPlay = await acceptedPlay(app, other, 4);
      // 관리자가 닉네임을 초기화했다가 다시 정한 이력: 탈퇴하면 작업 기록에는 번호만 남는다
      await app.post(`/api/admin/users/${user.id}/reset-nickname`, undefined, admin.cookie);
      await app.trx.updateTable('users').set({ nickname: '떠나는까치' }).where('id', '=', user.id).execute();

      expect(await countRows(app, user.id, playIds)).toEqual({ users: 1, sessions: 1, plays: 2, replays: 2, daily: 1, alltime: 1 });

      const res = await app.del('/api/me', { confirm: '떠나는까치' }, user.cookie);
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i);

      expect(await countRows(app, user.id, playIds)).toEqual({ users: 0, sessions: 0, plays: 0, replays: 0, daily: 0, alltime: 0 });
      // 지워진 세션으로는 로그인 상태가 아니다
      expect(await (await app.get('/api/me', user.cookie)).json()).toMatchObject({ user: null });
      // 다른 유저의 기록은 그대로, 랭킹에는 그 유저만 남는다
      const ranking = (await (await app.get('/api/rankings?target=apple-ten&period=daily', admin.cookie)).json()) as RankingResponse;
      expect(ranking.entries.map((e) => e.userId)).toEqual([other.id]);
      expect(ranking.entries[0]?.playId).toBe(otherPlay);

      const log = await app.trx
        .selectFrom('admin_actions')
        .select(['target_user_id', 'detail'])
        .where('target_user_id', '=', user.id)
        .executeTakeFirstOrThrow();
      expect(log.target_user_id).toBe(user.id);
      const detail = typeof log.detail === 'string' ? JSON.parse(log.detail) : log.detail;
      expect(detail).toEqual({});
    });
  });

  it('닉네임 전이면 "탈퇴"를 입력한다', async () => {
    await withTestApp(async (app) => {
      const user = await app.login({ nickname: null });
      expect((await app.del('/api/me', { confirm: '탈퇴' }, user.cookie)).status).toBe(204);
      expect((await countRows(app, user.id, [])).users).toBe(0);
    });
  });
});
