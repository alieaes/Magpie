// 성장형 게임 저장 통합 테스트. 개발 DB(-dev)의 되돌림 트랜잭션 안에서 시험용 가게 로직(growth-fixture)으로
// 저장 불러오기, 가게 행동, 하루 끝 검증과 저장 갱신, stale_save, 일시정지 시간 검사, 로비 진행 상황,
// 총합 랭킹 제외와 전체 랭킹만 있는 것(일간 없음), 관리자 게임 랭킹 초기화를 본다.

import { describe, expect, it } from 'vitest';
import type { FinishPlayResponse, GameSummary, RankingResponse, SaveSnapshot, StartPlayResponse } from '@magpie/shared';
import { defaultLogics } from '../src/plays/logics';
import { TEST_DAY_TICKS, upgradeCost, type TestShopInput, type TestShopState } from './growth-fixture';
import { GROWTH_TEST_GAME, canRunDb, parseDetail, playAppleGreedy, withTestApp, type TestApp, type TestUser } from './helpers';

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

/** 시험 가게의 전체 랭킹을 받는다 */
async function growthRanking(ctx: TestApp): Promise<RankingResponse> {
  return (await (await ctx.get(`/api/rankings?target=${GAME}&limit=100`)).json()) as RankingResponse;
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
      // 성장형은 일간 기록이 없다: best_daily에 쓰지 않고, 순위는 전체 순위로 준다
      expect(result).toMatchObject({ accepted: true, score: 12, best: { today: false, allTime: true }, rank: { today: null } });
      expect(result.accepted && result.rank.allTime).toBeGreaterThanOrEqual(1);
      expect(await ctx.trx.selectFrom('best_daily').select('play_id').where('play_id', '=', play.playId).execute()).toEqual([]);
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

  it('총합 랭킹에서 성장형 게임은 빠지고, 게임별 랭킹에는 전체 랭킹으로만 나온다', async () => {
    await withTestApp(async (ctx) => {
      // 개발 DB에 쌓인 실제 기록과 섞이지 않게 비우고 시작한다 (되돌림 트랜잭션이라 남지 않는다)
      await ctx.trx.deleteFrom('best_alltime').where('game_id', '=', GAME).execute();
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

      // 기간을 빼면 전체(역대), 일간은 없다
      const growth = (await (await ctx.get(`/api/rankings?target=${GAME}`)).json()) as RankingResponse;
      expect(growth).toMatchObject({ period: 'alltime', participants: 1 });
      expect(growth.entries[0]?.score).toBe(7);
      expect(growth.day).toBeUndefined();
      expect((await ctx.get(`/api/rankings?target=${GAME}&period=daily`)).status).toBe(400);
      expect((await ctx.get(`/api/rankings?target=${GAME}&period=alltime`)).status).toBe(200);
      // 미니게임·총합은 기간을 빼면 지금처럼 일간
      expect(((await (await ctx.get('/api/rankings?target=apple-ten')).json()) as RankingResponse).period).toBe('daily');
      expect(((await (await ctx.get('/api/rankings')).json()) as RankingResponse).period).toBe('daily');
    });
  });

  it('로비 요약: 성장형은 오늘 1위 대신 전체 1위를 준다', async () => {
    await withTestApp(async (ctx) => {
      await ctx.trx.deleteFrom('best_alltime').where('game_id', '=', GAME).execute();
      const first = await ctx.login({ nickname: '요약일등' });
      await finishDay(ctx, first, await startDay(ctx, first), dayInputs([9]), 9);
      const second = await ctx.login();
      await finishDay(ctx, second, await startDay(ctx, second), dayInputs([4]), 4);

      const summaries = (await (await ctx.get('/api/games/summary', second.cookie)).json()) as GameSummary[];
      expect(summaries.find((s) => s.gameId === GAME)).toMatchObject({
        todayTop: null,
        allTimeTop: { nickname: '요약일등', score: 9 },
        myTodayBest: null,
        myAllTimeBest: 4,
      });
      expect(summaries.find((s) => s.gameId === 'apple-ten')?.allTimeTop).toBeUndefined();
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

  // 게임 랭킹 초기화(관리자)는 그 게임의 전체 랭킹 줄을 통째로 지운다. 같은 게임의 기록을 쓰는 다른 파일과 병렬로 돌면
  // 되돌림 트랜잭션끼리 잠금이 엇갈려 교착이 나므로, 성장형 시험 게임을 쓰는 이 파일에 모아 차례로 돌린다
  it('게임 랭킹 초기화: 관리자만, 없는 게임 404, 미니게임 400, 비어 있으면 409', async () => {
    await withTestApp(async (ctx) => {
      const path = `/api/admin/games/${GAME}/reset-ranking`;
      expect((await ctx.post(path)).status).toBe(401);
      expect((await ctx.post(path, undefined, (await ctx.login()).cookie)).status).toBe(403);

      const admin = await ctx.login({ admin: true });
      expect((await ctx.post('/api/admin/games/nope/reset-ranking', undefined, admin.cookie)).status).toBe(404);
      expect((await ctx.post('/api/admin/games/apple-ten/reset-ranking', undefined, admin.cookie)).status).toBe(400);
      await ctx.trx.deleteFrom('best_alltime').where('game_id', '=', GAME).execute();
      expect((await ctx.post(path, undefined, admin.cookie)).status).toBe(409);
    });
  });

  it('게임 랭킹 초기화: 전체 랭킹만 비우고 저장·판 기록·다른 게임은 그대로, 작업 기록을 남긴다. 다음 하루부터 다시 쌓인다', async () => {
    await withTestApp(async (ctx) => {
      await ctx.trx.deleteFrom('best_alltime').where('game_id', '=', GAME).execute();
      const admin = await ctx.login({ admin: true });
      const grower = await ctx.login();
      const other = await ctx.login();
      const day = await finishDay(ctx, grower, await startDay(ctx, grower), dayInputs([8]), 8);
      await finishDay(ctx, other, await startDay(ctx, other), dayInputs([5]), 5);
      const apple = (await (await ctx.post('/api/plays', { gameId: 'apple-ten' }, grower.cookie)).json()) as StartPlayResponse;
      const { inputs, score } = playAppleGreedy(apple.seed, 3);
      const ticks = inputs.at(-1)!.t + 30;
      ctx.advance((ticks / 60) * 1000 + 500);
      expect(await (await ctx.post(`/api/plays/${apple.playId}/finish`, { inputs, ticks, score }, grower.cookie)).json()).toMatchObject({ accepted: true });
      expect((await growthRanking(ctx)).participants).toBe(2);

      expect((await ctx.post(`/api/admin/games/${GAME}/reset-ranking`, undefined, admin.cookie)).status).toBe(204);
      expect(await growthRanking(ctx)).toMatchObject({ participants: 0, entries: [] });

      // 가게 저장·판 기록·사과게임 기록은 그대로
      expect((await load(ctx, grower)).version).toBe(day.accepted ? day.save?.version : undefined);
      const plays = await ctx.trx.selectFrom('plays').select('status').where('user_id', '=', grower.id).where('game_id', '=', GAME).execute();
      expect(plays).toEqual([{ status: 'accepted' }]);
      expect(await ctx.trx.selectFrom('best_alltime').select('game_id').where('user_id', '=', grower.id).execute()).toEqual([{ game_id: 'apple-ten' }]);

      const log = await ctx.trx
        .selectFrom('admin_actions')
        .select(['action', 'target_user_id', 'play_id', 'detail'])
        .where('admin_user_id', '=', admin.id)
        .executeTakeFirstOrThrow();
      expect(log).toMatchObject({ action: 'reset_ranking', target_user_id: null, play_id: null });
      expect(parseDetail(log.detail)).toEqual({ gameId: GAME, removed: 2 });

      // 초기화 뒤 끝낸 하루는 예전 최고(8)보다 낮아도 새 랭킹의 1위로 들어간다
      const next = await finishDay(ctx, grower, await startDay(ctx, grower), dayInputs([3]), 3);
      expect(next).toMatchObject({ best: { allTime: true }, rank: { allTime: 1 } });
      expect((await growthRanking(ctx)).entries).toMatchObject([{ rank: 1, score: 3 }]);
    });
  });
  it('체험한 하루 이어받기: 기록 없는 계정이면 첫 하루로 저장하되 랭킹에는 넣지 않는다', async () => {
    await withTestApp(async (ctx) => {
      const body = (inputs: TestShopInput[], score: number) => ({ gameId: GAME, seed: 'trial-seed', inputs, ticks: inputs.at(-1)?.t ?? 0, score });
      expect((await ctx.post('/api/plays/adopt-trial', body(dayInputs([3, 4, 5]), 12))).status).toBe(401);
      expect((await ctx.post('/api/plays/adopt-trial', body(dayInputs([3]), 3), (await ctx.login({ nickname: null })).cookie)).status).toBe(403);

      const user = await ctx.login();
      // 조작된 점수·입력은 이어받지 않고 저장도 그대로
      let res = await ctx.post('/api/plays/adopt-trial', body(dayInputs([3, 4, 5]), 999), user.cookie);
      expect(await res.json()).toEqual({ adopted: false, reason: 'mismatch' });
      res = await ctx.post('/api/plays/adopt-trial', body([{ t: 60, earn: 99 }], 99), user.cookie);
      expect(await res.json()).toEqual({ adopted: false, reason: 'bad_input' });
      expect((await load(ctx, user)).version).toBe(1);

      res = await ctx.post('/api/plays/adopt-trial', body(dayInputs([3, 4, 5]), 12), user.cookie);
      const expected = { version: 2, state: { v: 1, day: 2, money: 12, level: 0 } };
      expect(await res.json()).toEqual({ adopted: true, save: expected });
      expect(await load(ctx, user)).toEqual(expected);
      expect(await ctx.trx.selectFrom('best_alltime').select('play_id').where('user_id', '=', user.id).execute()).toEqual([]);
      expect(await ctx.trx.selectFrom('plays').select(['status', 'score']).where('user_id', '=', user.id).execute()).toEqual([{ status: 'accepted', score: 12 }]);

      // 이미 기록이 있으면 두 번째는 이어받지 않는다
      res = await ctx.post('/api/plays/adopt-trial', body(dayInputs([3]), 3), user.cookie);
      expect(await res.json()).toEqual({ adopted: false, reason: 'has_record' });
      expect((await load(ctx, user)).version).toBe(2);
    });
  });
});
