// 판 기록 통합 테스트. 개발 DB(-dev)에 붙어 되돌림 트랜잭션 안에서 앱에 실제 요청을 보낸다.
// 시계를 2000-01-02로 고정해 실제 데이터의 오늘 랭킹과 겹치지 않게 한다. DB 설정이 없으면 건너뛴다.

import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { FinishPlayRequest, StartPlayResponse } from '@magpie/shared';
import { createApp } from '../src/app';
import { cookieSettings } from '../src/auth/cookies';
import { createSession } from '../src/auth/session';
import { findOrCreateUser, setNickname } from '../src/auth/users';
import type { Database } from '../src/db/types';
import { abandonStalePlays, createPlayService } from '../src/plays/service';
import { createRankingService } from '../src/ranking/service';
import { canRunDb, devConfig, inRollback, playAppleGreedy } from './helpers';

const T0 = new Date('2000-01-02T03:00:00Z');
const DAY = 86_400_000;

interface Ctx {
  trx: Kysely<Database>;
  /** 시계를 앞으로 돌린다 */
  advance(ms: number): void;
  /** 유저를 만들고 세션 쿠키를 돌려준다. nickname이 null이면 닉네임 전 유저 */
  login(nickname?: string | null): Promise<string>;
  post(path: string, body: unknown, cookie?: string): Promise<Response>;
}

/** 되돌림 트랜잭션 안에서 시계를 고정한 앱을 만들어 테스트를 돌린다 */
function withApp(fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  const config = devConfig!;
  const cookieName = cookieSettings(config.SITE_URL).session;
  const origin = new URL(config.SITE_URL).origin;
  return inRollback(async (trx) => {
    let clock = T0.getTime();
    const now = () => new Date(clock);
    const ranking = createRankingService(trx, now);
    const plays = createPlayService(trx, { ranking, now });
    const app = createApp({ db: trx, config, ranking, plays, oidc: null });
    let seq = 0;
    await fn({
      trx,
      advance: (ms) => (clock += ms),
      async login(nickname = `판${Date.now() % 100000}${(seq += 1)}`) {
        const user = await findOrCreateUser(trx, `test-sub:${Date.now()}:${Math.random()}`);
        if (nickname !== null) await setNickname(trx, user.id, nickname);
        const { token } = await createSession(trx, user.id);
        return `${cookieName}=${token}`;
      },
      post: async (path, body, cookie) =>
        app.request(path, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify(body),
        }),
    });
  });
}

/** 판을 연다 */
async function start(ctx: Ctx, cookie: string): Promise<StartPlayResponse> {
  const res = await ctx.post('/api/plays', { gameId: 'apple-ten' }, cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as StartPlayResponse;
}

/** 시드로 n번 지우는 판을 만들고, 게임 시간만큼 시계를 돌린 뒤 끝 요청을 보낸다 */
async function playAndFinish(ctx: Ctx, cookie: string, play: StartPlayResponse, n: number, patch: Partial<FinishPlayRequest> = {}) {
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
    await withApp(async (ctx) => {
      expect((await ctx.post('/api/plays', { gameId: 'apple-ten' })).status).toBe(401);
      expect((await ctx.post('/api/plays', { gameId: 'apple-ten' }, await ctx.login(null))).status).toBe(403);
      const cookie = await ctx.login();
      expect((await ctx.post('/api/plays', { gameId: 'nope' }, cookie)).status).toBe(400);
      expect((await ctx.post('/api/plays', { gameId: 'fruit-merge' }, cookie)).status).toBe(400);
      expect((await ctx.post('/api/plays/1/finish', { inputs: [], ticks: 0, score: 0 })).status).toBe(401);
    });
  });

  it('통과한 판은 서버 점수로 저장하고, 더 좋을 때만 최고 기록을 바꾼다', async () => {
    await withApp(async (ctx) => {
      const cookie = await ctx.login();

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

  it('거절: 시간(time), 점수(mismatch), 형식(bad_input). 거절된 판도 입력 기록을 남긴다', async () => {
    await withApp(async (ctx) => {
      const cookie = await ctx.login();

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
    await withApp(async (ctx) => {
      const cookie = await ctx.login();
      const old = await start(ctx, cookie);
      const current = await start(ctx, cookie);
      expect(await readPlay(ctx.trx, old.playId)).toMatchObject({ status: 'rejected', reject_reason: 'abandoned' });

      const body = { inputs: [], ticks: 0, score: 0 };
      expect((await ctx.post(`/api/plays/${old.playId}/finish`, body, cookie)).status).toBe(409);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, await ctx.login())).status).toBe(403);
      expect((await ctx.post('/api/plays/999999999/finish', body, cookie)).status).toBe(404);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, { ticks: 0 }, cookie)).status).toBe(400);

      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, cookie)).status).toBe(200);
      expect((await ctx.post(`/api/plays/${current.playId}/finish`, body, cookie)).status).toBe(409);
    });
  });

  it('끝나지 않고 하루가 지난 판은 버린 판으로 정리한다', async () => {
    await withApp(async (ctx) => {
      const cookie = await ctx.login();
      const stale = await start(ctx, cookie);
      ctx.advance(DAY + 1000);
      expect(await abandonStalePlays(ctx.trx, new Date(T0.getTime() + DAY + 1000))).toBeGreaterThanOrEqual(1);
      expect(await readPlay(ctx.trx, stale.playId)).toMatchObject({ status: 'rejected', reject_reason: 'abandoned' });
    });
  });
});
