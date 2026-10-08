// 판 기록 통합 테스트. 개발 DB(-dev)에 붙어 되돌림 트랜잭션 안에서 앱에 실제 요청을 보낸다.
// 시계는 TEST_T0(2000-01-02)로 고정해 실제 데이터의 오늘 랭킹과 겹치지 않게 한다. DB 설정이 없으면 건너뛴다.

import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { findGame, type FinishPlayRequest, type GameMeta, type StartPlayResponse } from '@magpie/shared';
import type { Database } from '../src/db/types';
import { updateBests } from '../src/plays/bests';
import { abandonStalePlays } from '../src/plays/service';
import { TEST_T0, canRunDb, playAppleGreedy, withTestApp, type TestApp } from './helpers';

const DAY = 86_400_000;

/** 판을 연다 */
async function start(ctx: TestApp, cookie: string): Promise<StartPlayResponse> {
  const res = await ctx.post('/api/plays', { gameId: 'apple-ten' }, cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as StartPlayResponse;
}

/** 시드로 n번 지우는 판을 만들고, 게임 시간만큼 시계를 돌린 뒤 끝 요청을 보낸다 */
async function playAndFinish(ctx: TestApp, cookie: string, play: StartPlayResponse, n: number, patch: Partial<FinishPlayRequest> = {}) {
  const { inputs, score } = playAppleGreedy(play.seed, n);
  const ticks = (inputs.at(-1)?.t ?? 0) + 30;
  ctx.advance((ticks / 60) * 1000 + 800);
  const body = { inputs, ticks, score, ...patch };
  const res = await ctx.post(`/api/plays/${play.playId}/finish`, body, cookie);
  return { res, score, inputs };
}

/** 판 한 줄을 읽는다 */
function readPlay(trx: Kysely<Database>, playId: number) {
  return trx
    .selectFrom('plays')
    .select(['status', 'reject_reason', 'score', 'client_score', 'ended_at'])
    .where('id', '=', playId)
    .executeTakeFirstOrThrow();
}

describe.skipIf(!canRunDb)('판 기록 (개발 DB)', () => {
  it('비로그인 401, 닉네임 전 403, 없는 게임·준비 중 게임 400', async () => {
    await withTestApp(async (ctx) => {
      expect((await ctx.post('/api/plays', { gameId: 'apple-ten' })).status).toBe(401);
      expect((await ctx.post('/api/plays', { gameId: 'apple-ten' }, (await ctx.login({ nickname: null })).cookie)).status).toBe(403);
      const cookie = (await ctx.login()).cookie;
      expect((await ctx.post('/api/plays', { gameId: 'nope' }, cookie)).status).toBe(400);
      expect((await ctx.post('/api/plays', { gameId: 'fruit-merge' }, cookie)).status).toBe(400);
      expect((await ctx.post('/api/plays/1/finish', { inputs: [], ticks: 0, score: 0 })).status).toBe(401);
    });
  });

  it('통과한 판은 서버 점수로 저장하고, 더 좋을 때만 최고 기록을 바꾼다', async () => {
    await withTestApp(async (ctx) => {
      const cookie = (await ctx.login()).cookie;

      const first = await start(ctx, cookie);
      expect(first.seed).toMatch(/^[0-9a-f]{32}$/);
      const a = await playAndFinish(ctx, cookie, first, 15);
      expect(await a.res.json()).toEqual({
        accepted: true,
        score: a.score,
        best: { today: true, allTime: true },
        rank: { today: 1 },
      });
      const row = await readPlay(ctx.trx, first.playId);
      expect(row).toMatchObject({ status: 'accepted', reject_reason: null, score: a.score, client_score: a.score });
      expect(row.ended_at).not.toBeNull();
      const replay = await ctx.trx.selectFrom('play_replays').select('data').where('play_id', '=', first.playId).executeTakeFirstOrThrow();
      expect(JSON.parse(gunzipSync(replay.data).toString('utf8'))).toEqual(a.inputs);

      // 더 낮은 점수: 기록은 남지만 최고 기록은 그대로
      const second = await start(ctx, cookie);
      const b = await playAndFinish(ctx, cookie, second, 3);
      expect(b.score).toBeLessThan(a.score);
      expect(await b.res.json()).toMatchObject({ accepted: true, score: b.score, best: { today: false, allTime: false } });

      const daily = await ctx.trx
        .selectFrom('best_daily')
        .select(['score', 'play_id'])
        .where('play_id', 'in', [first.playId, second.playId])
        .execute();
      expect(daily).toEqual([{ score: a.score, play_id: first.playId }]);
    });
  });

  it('최고 기록 갱신: 더 좋을 때만 점수·판·달성 시각을 같이 바꾸고, 동점이면 먼저 달성한 기록을 둔다', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const game = findGame('apple-ten')!;
      let at = TEST_T0.getTime();
      /** 점수 하나로 판을 넣고 최고 기록 갱신을 부른다 */
      async function submit(score: number, meta: GameMeta = game) {
        at += 60_000;
        const achievedAt = new Date(at);
        const play = await ctx.trx
          .insertInto('plays')
          .values({ user_id: user.id, game_id: meta.id, seed: 't', score, status: 'accepted', started_at: achievedAt, ended_at: achievedAt })
          .executeTakeFirstOrThrow();
        const playId = Number(play.insertId);
        return { playId, achievedAt, change: await updateBests(ctx.trx, { userId: user.id, game: meta, score, achievedAt, playId }) };
      }
      /** 역대 최고 기록 줄 */
      const best = () =>
        ctx.trx.selectFrom('best_alltime').select(['score', 'play_id', 'achieved_at']).where('user_id', '=', user.id).executeTakeFirstOrThrow();

      const first = await submit(100);
      expect(first.change).toEqual({ today: true, allTime: true });
      expect((await submit(100)).change).toEqual({ today: false, allTime: false });
      expect((await submit(90)).change).toEqual({ today: false, allTime: false });
      expect(await best()).toEqual({ score: 100, play_id: first.playId, achieved_at: first.achievedAt });

      const higher = await submit(120);
      expect(higher.change).toEqual({ today: true, allTime: true });
      expect(await best()).toEqual({ score: 120, play_id: higher.playId, achieved_at: higher.achievedAt });

      // 낮을수록 좋은 게임은 반대로
      await ctx.trx.deleteFrom('best_alltime').where('user_id', '=', user.id).execute();
      const asc: GameMeta = { ...game, sort: 'asc' };
      await submit(50, asc);
      expect((await submit(60, asc)).change.allTime).toBe(false);
      const lower = await submit(40, asc);
      expect(lower.change.allTime).toBe(true);
      expect((await best()).score).toBe(40);
    });
  });

  it('거절: 시간(time), 점수(mismatch), 형식(bad_input). 거절된 판도 입력 기록을 남긴다', async () => {
    await withTestApp(async (ctx) => {
      const cookie = (await ctx.login()).cookie;

      // 시계를 돌리지 않고 120초 판을 냈다
      const p1 = await start(ctx, cookie);
      const r1 = await ctx.post(`/api/plays/${p1.playId}/finish`, { inputs: [], ticks: 7200, score: 0 }, cookie);
      expect(await r1.json()).toEqual({ accepted: false, reason: 'time' });

      const p2 = await start(ctx, cookie);
      const r2 = await playAndFinish(ctx, cookie, p2, 5, { score: 999 });
      expect(await r2.res.json()).toEqual({ accepted: false, reason: 'mismatch' });

      const p3 = await start(ctx, cookie);
      const r3 = await ctx.post(`/api/plays/${p3.playId}/finish`, { inputs: [{ x: 1 }], ticks: 0, score: 0 }, cookie);
      expect(await r3.json()).toEqual({ accepted: false, reason: 'bad_input' });

      expect(await readPlay(ctx.trx, p1.playId)).toMatchObject({ status: 'rejected', reject_reason: 'time', score: null });
      expect(await readPlay(ctx.trx, p2.playId)).toMatchObject({ status: 'rejected', reject_reason: 'mismatch', client_score: 999 });
      expect(await readPlay(ctx.trx, p3.playId)).toMatchObject({ status: 'rejected', reject_reason: 'bad_input' });
      const replays = await ctx.trx.selectFrom('play_replays').select('play_id').where('play_id', 'in', [p1.playId, p2.playId, p3.playId]).execute();
      expect(replays).toHaveLength(3);
      const bests = await ctx.trx.selectFrom('best_alltime').select('play_id').where('play_id', 'in', [p1.playId, p2.playId, p3.playId]).execute();
      expect(bests).toEqual([]);
    });
  });

  it('새 판을 열면 이전 판은 버려지고, 끝난 판은 409, 남의 판은 403, 없는 판은 404', async () => {
    await withTestApp(async (ctx) => {
      const cookie = (await ctx.login()).cookie;
      const old = await start(ctx, cookie);
      const current = await start(ctx, cookie);
      expect(await readPlay(ctx.trx, old.playId)).toMatchObject({ status: 'rejected', reject_reason: 'abandoned' });

      const body = { inputs: [], ticks: 0, score: 0 };
      expect((await ctx.post(`/api/plays/${old.playId}/finish`, body, cookie)).status).toBe(409);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, (await ctx.login()).cookie)).status).toBe(403);
      expect((await ctx.post('/api/plays/999999999/finish', body, cookie)).status).toBe(404);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, { ticks: 0 }, cookie)).status).toBe(400);

      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, cookie)).status).toBe(200);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, cookie)).status).toBe(409);
    });
  });

  it('끝나지 않고 하루가 지난 판은 버린 판으로 정리한다', async () => {
    await withTestApp(async (ctx) => {
      const cookie = (await ctx.login()).cookie;
      const stale = await start(ctx, cookie);
      ctx.advance(DAY + 1000);
      expect(await abandonStalePlays(ctx.trx, new Date(TEST_T0.getTime() + DAY + 1000))).toBeGreaterThanOrEqual(1);
      expect(await readPlay(ctx.trx, stale.playId)).toMatchObject({ status: 'rejected', reject_reason: 'abandoned' });
    });
  });
});
