// 성장형 게임 저장 통합 테스트. 개발 DB(-dev)의 되돌림 트랜잭션 안에서 시험용 가게 로직(growth-fixture)으로
// 저장 불러오기, 가게 행동, 하루 끝 검증과 저장 갱신, stale_save, 일시정지 시간 검사, 로비 진행 상황, 총합 랭킹 제외를 본다.

import { describe, expect, it } from 'vitest';
import type { FinishPlayResponse, GameSummary, RankingResponse, SaveSnapshot, StartPlayResponse } from '@magpie/shared';
import { defaultLogics } from '../src/plays/logics';
import { TEST_DAY_TICKS, upgradeCost, type TestShopInput, type TestShopState } from './growth-fixture';
import { GROWTH_TEST_GAME, canRunDb, playAppleGreedy, withTestApp, type TestApp, type TestUser } from './helpers';

const GAME = GROWTH_TEST_GAME;

/** 저장을 불러온다 */
async function load(ctx: TestApp, user: TestUser): Promise<SaveSnapshot<TestShopState>> {
  const res = await ctx.get(`/api/saves/${GAME}`, user.cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as SaveSnapshot<TestShopState>;
}

/** 하루를 연다 */
async function startDay(ctx: TestApp, user: TestUser): Promise<StartPlayResponse> {
  const res = await ctx.post('/api/plays', { gameId: GAME }, user.cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as StartPlayResponse;
}

/** earn 값들로 하루 입력을 만든다. 입력은 1초(60틱) 간격 */
function dayInputs(earns: number[]): TestShopInput[] {
  return earns.map((earn, i) => ({ t: (i + 1) * 60, earn }));
}

/** 하루를 끝낸다. 기본으로 게임 시간만큼 시계를 돌린다 */
async function finishDay(ctx: TestApp, user: TestUser, play: StartPlayResponse, inputs: TestShopInput[], score: number, seconds?: number) {
  const ticks = inputs.at(-1)?.t ?? 0;
  ctx.advance((seconds ?? ticks / 60 + 0.5) * 1000);
  const res = await ctx.post(`/api/plays/${play.playId}/finish`, { inputs, ticks, score }, user.cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as FinishPlayResponse;
}

describe.skipIf(!canRunDb)('성장형 저장 (개발 DB)', () => {
  it('불러오기: 비로그인 401, 닉네임 전 403, 미니게임 400. 처음이면 시작 상태로 만든다', async () => {
    await withTestApp(async (ctx) => {
      expect((await ctx.get(`/api/saves/${GAME}`)).status).toBe(401);
      expect((await ctx.get(`/api/saves/${GAME}`, (await ctx.login({ nickname: null })).cookie)).status).toBe(403);
      const user = await ctx.login();
      expect((await ctx.get('/api/saves/apple-ten', user.cookie)).status).toBe(400);
      expect((await ctx.get('/api/saves/nope', user.cookie)).status).toBe(400);

      expect(await load(ctx, user)).toEqual({ version: 1, state: { v: 1, day: 1, money: 0, level: 0 } });
      // 다시 불러와도 새로 만들지 않는다
      expect((await load(ctx, user)).version).toBe(1);
    });
  });

  it('하루 끝: 통과하면 같은 트랜잭션에서 저장을 다음 날로 바꾸고 최고 기록을 갱신한다', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const play = await startDay(ctx, user);
      expect(play.saveVersion).toBe(1);

      const result = await finishDay(ctx, user, play, dayInputs([3, 4, 5]), 12);
      expect(result).toMatchObject({ accepted: true, score: 12, best: { today: true, allTime: true } });
      const expected = { version: 2, state: { v: 1, day: 2, money: 12, level: 0 } };
      expect(result.accepted && result.save).toEqual(expected);
      expect(await load(ctx, user)).toEqual(expected);

      const row = await ctx.trx.selectFrom('plays').select(['save_version', 'status', 'score']).where('id', '=', play.playId).executeTakeFirstOrThrow();
      expect(row).toEqual({ save_version: 1, status: 'accepted', score: 12 });

      // 다음 날은 바뀐 저장 버전으로 연다
      expect((await startDay(ctx, user)).saveVersion).toBe(2);
    });
  });

  it('하루 끝 거절은 저장을 바꾸지 않는다 (점수 다름 mismatch, 형식 bad_input)', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const p1 = await startDay(ctx, user);
      expect(await finishDay(ctx, user, p1, dayInputs([3]), 999)).toEqual({ accepted: false, reason: 'mismatch' });
      const p2 = await startDay(ctx, user);
      expect(await finishDay(ctx, user, p2, [{ t: 60, earn: 99 }], 99)).toEqual({ accepted: false, reason: 'bad_input' });
      expect((await load(ctx, user)).version).toBe(1);
    });
  });

  it('가게 행동: 버전이 다르면 409와 최신 저장, 규칙 위반 400(reason), 형식 틀림 400, 통과하면 버전 +1과 행동 기록', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      // 강화 비용만큼 벌어 둔다
      const play = await startDay(ctx, user);
      await finishDay(ctx, user, play, dayInputs([10]), 10);

      const conflict = await ctx.post(`/api/saves/${GAME}/actions`, { version: 1, action: { op: 'upgrade' } }, user.cookie);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ error: { code: 'SAVE_CONFLICT' }, save: { version: 2, state: { money: 10 } } });

      const bad = await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'sell' } }, user.cookie);
      expect(bad.status).toBe(400);
      expect(await bad.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });

      const ok = await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'upgrade' } }, user.cookie);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ version: 3, state: { v: 1, day: 2, money: 10 - upgradeCost(0), level: 1 } });

      const poor = await ctx.post(`/api/saves/${GAME}/actions`, { version: 3, action: { op: 'upgrade' } }, user.cookie);
      expect(poor.status).toBe(400);
      expect(await poor.json()).toMatchObject({ error: { code: 'ACTION_REJECTED' }, reason: 'no_money' });

      const actions = await ctx.trx.selectFrom('save_actions').select(['version', 'game_id']).where('user_id', '=', user.id).execute();
      expect(actions).toEqual([{ version: 2, game_id: GAME }]);
      expect((await ctx.post(`/api/saves/apple-ten/actions`, { version: 1, action: {} }, user.cookie)).status).toBe(400);
      expect((await ctx.post(`/api/saves/${GAME}/actions`, { version: 1, action: { op: 'upgrade' } })).status).toBe(401);
    });
  });

  it('하루 도중 저장이 바뀌면(다른 탭에서 강화) 그날은 stale_save로 거절하고 저장은 그대로 둔다', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const first = await startDay(ctx, user);
      await finishDay(ctx, user, first, dayInputs([10]), 10);

      const day = await startDay(ctx, user);
      const upgraded = await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'upgrade' } }, user.cookie);
      expect(upgraded.status).toBe(200);

      expect(await finishDay(ctx, user, day, dayInputs([5]), 10)).toEqual({ accepted: false, reason: 'stale_save' });
      expect(await load(ctx, user)).toEqual({ version: 3, state: { v: 1, day: 2, money: 0, level: 1 } });
      const row = await ctx.trx.selectFrom('plays').select(['status', 'reject_reason']).where('id', '=', day.playId).executeTakeFirstOrThrow();
      expect(row).toEqual({ status: 'rejected', reject_reason: 'stale_save' });
    });
  });

  it('시간: 일시정지로 실제 시간이 길어도 통과, 게임 시간이 실제보다 길면 time', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const paused = await startDay(ctx, user);
      // 10초 하루를 30분 동안 멈췄다가 끝냈다
      expect(await finishDay(ctx, user, paused, dayInputs([1]), 1, 30 * 60)).toMatchObject({ accepted: true });

      const fast = await startDay(ctx, user);
      const inputs: TestShopInput[] = [{ t: TEST_DAY_TICKS, earn: 1 }];
      expect(await finishDay(ctx, user, fast, inputs, 1, 2)).toEqual({ accepted: false, reason: 'time' });
    });
  });

  it('로비 요약에 성장형 진행 상황(몇 일째)을 준다', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const before = (await (await ctx.get('/api/games/summary', user.cookie)).json()) as GameSummary[];
      expect(before.find((s) => s.gameId === GAME)?.progress).toBeUndefined();

      const play = await startDay(ctx, user);
      await finishDay(ctx, user, play, dayInputs([2]), 2);
      const after = (await (await ctx.get('/api/games/summary', user.cookie)).json()) as GameSummary[];
      expect(after.find((s) => s.gameId === GAME)?.progress).toEqual({ day: 2 });
      expect(after.find((s) => s.gameId === 'apple-ten')?.progress).toBeUndefined();
    });
  });

  it('총합 랭킹에서 성장형 게임은 빠지고, 게임별 랭킹에는 나온다', async () => {
    await withTestApp(async (ctx) => {
      const grower = await ctx.login();
      const play = await startDay(ctx, grower);
      await finishDay(ctx, grower, play, dayInputs([7]), 7);

      const minigamer = await ctx.login();
      const apple = (await (await ctx.post('/api/plays', { gameId: 'apple-ten' }, minigamer.cookie)).json()) as StartPlayResponse;
      const { inputs, score } = playAppleGreedy(apple.seed, 5);
      const ticks = inputs.at(-1)!.t + 30;
      ctx.advance((ticks / 60) * 1000 + 500);
      await ctx.post(`/api/plays/${apple.playId}/finish`, { inputs, ticks, score }, minigamer.cookie);

      const total = (await (await ctx.get('/api/rankings?target=total&period=daily&limit=100')).json()) as RankingResponse;
      expect(total.participants).toBe(1);
      expect(total.entries.map((e) => e.score)).toEqual([1000]);

      const growth = (await (await ctx.get(`/api/rankings?target=${GAME}&period=daily`)).json()) as RankingResponse;
      expect(growth.participants).toBe(1);
      expect(growth.entries[0]?.score).toBe(7);
    });
  });

  it('실제 붕어빵 가게 로직: 저장 → 하루 검증 → 다음 날 저장, 강화 규칙', async () => {
    await withTestApp(
      async (ctx) => {
        const user = await ctx.login();
        const first = (await (await ctx.get(`/api/saves/${GAME}`, user.cookie)).json()) as SaveSnapshot<{ day: number; money: number }>;
        expect(first).toMatchObject({ version: 1, state: { v: 1, day: 1, money: 1000, reputation: 0 } });

        // 빵틀 하나에 붓기만 하고 끝낸 하루: 재료비 50원, 하루 수익 −50원 → 점수 0
        const play = await startDay(ctx, user);
        ctx.advance(180_500);
        const res = await ctx.post(`/api/plays/${play.playId}/finish`, { inputs: [[30, 0, 0]], ticks: 10_800, score: 0 }, user.cookie);
        const body = (await res.json()) as FinishPlayResponse;
        expect(body).toMatchObject({ accepted: true, score: 0, save: { version: 2, state: { day: 2, money: 950 } } });

        // 빵틀 길들이기 1,500원: 돈이 모자라다
        const action = await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'upgrade', key: 'seasoning' } }, user.cookie);
        expect(action.status).toBe(400);
        expect(await action.json()).toMatchObject({ reason: 'no_money' });
        // 없는 강화는 형식 오류
        const bad = await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'upgrade', key: 'rocket' } }, user.cookie);
        expect(bad.status).toBe(400);
        expect(await bad.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
      },
      { logics: defaultLogics },
    );
  });

  it('탈퇴하면 저장과 가게 행동 기록도 지운다', async () => {
    await withTestApp(async (ctx) => {
      const user = await ctx.login();
      const other = await ctx.login();
      for (const u of [user, other]) {
        const play = await startDay(ctx, u);
        await finishDay(ctx, u, play, dayInputs([10]), 10);
        expect((await ctx.post(`/api/saves/${GAME}/actions`, { version: 2, action: { op: 'upgrade' } }, u.cookie)).status).toBe(200);
      }

      const nickname = (await ctx.trx.selectFrom('users').select('nickname').where('id', '=', user.id).executeTakeFirstOrThrow()).nickname;
      expect((await ctx.del('/api/me', { confirm: nickname }, user.cookie)).status).toBe(204);
      expect(await ctx.trx.selectFrom('game_saves').select('game_id').where('user_id', '=', user.id).execute()).toEqual([]);
      expect(await ctx.trx.selectFrom('save_actions').select('id').where('user_id', '=', user.id).execute()).toEqual([]);
      // 다른 유저의 저장은 그대로
      expect((await load(ctx, other)).version).toBe(3);
    });
  });
});
