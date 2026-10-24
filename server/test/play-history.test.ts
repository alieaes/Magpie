// 관리자 대시보드 플레이 이력 테스트: IP 읽기, 판의 IP, 비로그인 판 점수, 이력 조회(끝난 판·거절 사유·커서).
// DB 테스트는 개발 DB(-dev)의 되돌림 트랜잭션 안에서 돈다. 근거: docs/design/261024-02-admin-play-history.md

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { appleTenLogic } from '@magpie/game-apple-ten/logic';
import type { AdminGuestPlay, AdminMemberPlay, AdminPlaysResponse, StartPlayResponse } from '@magpie/shared';
import { clientIp } from '../src/lib/client-ip';
import { GROWTH_TEST_GAME, TEST_T0, canRunDb, playAppleGreedy, withTestApp, type TestApp, type TestUser } from './helpers';

// 문서용 예시 주소(RFC 5737)
const IP_A = '192.0.2.10';
const IP_B = '198.51.100.20';
const DAY_MS = 86_400_000;

/** clientIp를 그대로 돌려주는 시험용 앱 */
const ipApp = new Hono().get('/', (c) => c.text(clientIp(c) ?? 'null'));

/** CF-Connecting-IP를 붙인 헤더 */
const fromIp = (ip: string) => ({ 'cf-connecting-ip': ip });

/** 사과게임 판을 연다 */
async function startApple(app: TestApp, user: TestUser, ip?: string): Promise<StartPlayResponse> {
  const res = await app.post('/api/plays', { gameId: 'apple-ten' }, user.cookie, ip ? fromIp(ip) : {});
  expect(res.status).toBe(200);
  return (await res.json()) as StartPlayResponse;
}

/** 연 판을 끝낸다. score를 주면 그 점수로 보낸다(틀리면 mismatch로 거절) */
async function finishApple(app: TestApp, user: TestUser, play: StartPlayResponse, moves: number, score?: number): Promise<void> {
  const replay = playAppleGreedy(play.seed, moves);
  const ticks = replay.inputs.at(-1)!.t + 30;
  app.advance((ticks / 60) * 1000 + 500);
  const res = await app.post(`/api/plays/${play.playId}/finish`, { inputs: replay.inputs, ticks, score: score ?? replay.score }, user.cookie);
  expect(res.status).toBe(200);
}

/** 이력 한 묶음을 받는다 */
async function history(app: TestApp, admin: TestUser, query: string): Promise<AdminPlaysResponse> {
  const res = await app.get(`/api/admin/plays?${query}`, admin.cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as AdminPlaysResponse;
}

// 개발 DB의 실제 판(2026년~)보다 앞선 위치에서 읽어 이 테스트가 만든 판(2000년)만 보게 한다
const BEFORE_TEST_END = `${TEST_T0.getTime() + DAY_MS}_0`;

describe('IP 읽기', () => {
  it('CF-Connecting-IP를 먼저, 없으면 연결 주소. IPv4가 IPv6 꼴이면 줄인다. 둘 다 없으면 null', async () => {
    expect(await (await ipApp.request('/', { headers: fromIp(` ${IP_A} `) })).text()).toBe(IP_A);
    const socket = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });
    expect(await (await ipApp.request('/', {}, socket('::ffff:127.0.0.1'))).text()).toBe('127.0.0.1');
    expect(await (await ipApp.request('/', {}, socket('::1'))).text()).toBe('::1');
    expect(await (await ipApp.request('/', { headers: fromIp(IP_B) }, socket('127.0.0.1'))).text()).toBe(IP_B);
    expect(await (await ipApp.request('/')).text()).toBe('null');
  });
});

describe.skipIf(!canRunDb)('플레이 이력 (개발 DB)', () => {
  it('판을 열면 IP를 적는다. 체험 이어받기도', async () => {
    await withTestApp(async (app) => {
      const user = await app.login();
      const play = await startApple(app, user, IP_A);
      expect(await app.trx.selectFrom('plays').select('ip').where('id', '=', play.playId).executeTakeFirstOrThrow()).toEqual({ ip: IP_A });

      const grower = await app.login();
      const trial = { gameId: GROWTH_TEST_GAME, seed: 'trial-seed', inputs: [{ t: 60, earn: 3 }], ticks: 60, score: 3 };
      const res = await app.post('/api/plays/adopt-trial', trial, grower.cookie, fromIp(IP_B));
      expect(await res.json()).toMatchObject({ adopted: true });
      expect(await app.trx.selectFrom('plays').select('ip').where('user_id', '=', grower.id).execute()).toEqual([{ ip: IP_B }]);
    });
  });

  it('비로그인 판 점수: 로그인 없이 204, 없는·준비 중 게임과 범위 밖 점수 400, 같은 IP 31번째 429', async () => {
    await withTestApp(async (app) => {
      const send = (body: unknown, ip = IP_A) => app.post('/api/plays/practice', body, undefined, fromIp(ip));
      expect((await send({ gameId: 'apple-ten', score: 42 })).status).toBe(204);
      const row = await app.trx
        .selectFrom('practice_plays')
        .select(['game_id', 'score', 'ip', 'created_at'])
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ game_id: 'apple-ten', score: 42, ip: IP_A, created_at: TEST_T0 });

      expect((await send({ gameId: 'nope', score: 1 })).status).toBe(400);
      expect((await send({ gameId: 'fruit-merge', score: 1 })).status).toBe(400);
      expect((await send({ gameId: 'apple-ten', score: -1 })).status).toBe(400);
      expect((await send({ gameId: 'apple-ten', score: appleTenLogic.maxScore + 1 })).status).toBe(400);
      expect((await send({ gameId: 'apple-ten', score: 1.5 })).status).toBe(400);

      // 위에서 받은 1번 + 29번 = 30번까지 받고 31번째는 막는다. 다른 IP는 따로 센다
      for (let i = 0; i < 29; i += 1) expect((await send({ gameId: 'apple-ten', score: i })).status).toBe(204);
      expect((await send({ gameId: 'apple-ten', score: 1 })).status).toBe(429);
      expect((await send({ gameId: 'apple-ten', score: 1 }, IP_B)).status).toBe(204);
    });
  });

  it('이력 API: 비로그인 401, 일반 유저 403, 틀린 게임·구분·커서 400', async () => {
    await withTestApp(async (app) => {
      expect((await app.get('/api/admin/plays?gameId=apple-ten&who=member')).status).toBe(401);
      const user = await app.login();
      expect((await app.get('/api/admin/plays?gameId=apple-ten&who=member', user.cookie)).status).toBe(403);
      const admin = await app.login({ admin: true });
      expect((await app.get('/api/admin/plays?gameId=nope&who=member', admin.cookie)).status).toBe(400);
      expect((await app.get('/api/admin/plays?gameId=fruit-merge&who=guest', admin.cookie)).status).toBe(400);
      expect((await app.get('/api/admin/plays?gameId=apple-ten&who=all', admin.cookie)).status).toBe(400);
      expect((await app.get('/api/admin/plays?gameId=apple-ten&who=member&cursor=12', admin.cookie)).status).toBe(400);
      expect((await app.get('/api/admin/plays?gameId=apple-ten&who=guest&cursor=1_2', admin.cookie)).status).toBe(400);
    });
  });

  it('로그인 판: 끝난 판만 최근에 끝난 순, 통과는 점수·거절은 사유, 지금 닉네임과 IP', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const aliceName = `이력${Date.now() % 100000}`;
      const alice = await app.login({ nickname: aliceName });
      const bob = await app.login();

      const first = await startApple(app, alice, IP_A);
      await finishApple(app, alice, first, 3);
      const rejected = await startApple(app, bob, IP_B);
      await finishApple(app, bob, rejected, 3, 999);
      // 그 뒤 닉네임이 초기화되면 지금 닉네임(없음)으로 나온다
      await app.trx.updateTable('users').set({ nickname: null }).where('id', '=', bob.id).execute();
      // 안 끝내고 새로 열면 앞 판은 버려진다(끝난 시각 없음)
      const abandoned = await startApple(app, alice, IP_A);
      const last = await startApple(app, alice, IP_A);
      await finishApple(app, alice, last, 5);

      const page = await history(app, admin, `gameId=apple-ten&who=member&cursor=${BEFORE_TEST_END}`);
      expect(page.who).toBe('member');
      const items = page.items as AdminMemberPlay[];
      expect(items.map((p) => p.playId)).toEqual([last.playId, rejected.playId, first.playId]);
      expect(items.some((p) => p.playId === abandoned.playId)).toBe(false);
      expect(items[0]).toMatchObject({ nickname: aliceName, ip: IP_A, rejectReason: null, score: playAppleGreedy(last.seed, 5).score });
      expect(items[1]).toMatchObject({ nickname: null, ip: IP_B, score: null, rejectReason: 'mismatch' });
      expect(new Date(items[0]!.at) > new Date(items[1]!.at)).toBe(true);
      expect(page.nextCursor).toBeNull();
    });
  });

  it('로그인 판 커서: 50개씩, 같은 시각은 판 번호로 갈라 겹치거나 빠지지 않는다', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const user = await app.login();
      // 55판을 직접 넣는다. 둘씩 같은 끝난 시각
      const ids: number[] = [];
      for (let i = 0; i < 55; i += 1) {
        const endedAt = new Date(TEST_T0.getTime() - Math.floor(i / 2) * 1000);
        const r = await app.trx
          .insertInto('plays')
          .values({ user_id: user.id, game_id: 'apple-ten', seed: `s${i}`, status: 'accepted', score: i, started_at: endedAt, ended_at: endedAt, ip: IP_A })
          .executeTakeFirstOrThrow();
        ids.push(Number(r.insertId));
      }
      const expected = ids
        .map((id, i) => ({ id, t: TEST_T0.getTime() - Math.floor(i / 2) * 1000 }))
        .sort((a, b) => b.t - a.t || b.id - a.id)
        .map((p) => p.id);

      const one = await history(app, admin, `gameId=apple-ten&who=member&cursor=${BEFORE_TEST_END}`);
      expect(one.items).toHaveLength(50);
      expect(one.nextCursor).not.toBeNull();
      const two = await history(app, admin, `gameId=apple-ten&who=member&cursor=${one.nextCursor}`);
      const got = [...one.items, ...two.items].map((p) => (p as AdminMemberPlay).playId).filter((id) => ids.includes(id));
      expect(got).toEqual(expected);
    });
  });

  it('비로그인 판: 받은 순(최근 먼저), 50개씩', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      // 횟수 제한을 피해 직접 넣는다. 다른 테스트·개발 데이터와 가르려고 IP_B로만 넣는다
      for (let i = 0; i < 55; i += 1) {
        await app.trx.insertInto('practice_plays').values({ game_id: GROWTH_TEST_GAME, score: i, ip: IP_B, created_at: TEST_T0 }).execute();
      }
      const one = await history(app, admin, `gameId=${GROWTH_TEST_GAME}&who=guest`);
      expect(one.who).toBe('guest');
      expect(one.items).toHaveLength(50);
      expect((one.items as AdminGuestPlay[]).map((p) => p.score)).toEqual(Array.from({ length: 50 }, (_, i) => 54 - i));
      expect(one.items[0]).toMatchObject({ ip: IP_B, at: TEST_T0.toISOString() });
      const two = await history(app, admin, `gameId=${GROWTH_TEST_GAME}&who=guest&cursor=${one.nextCursor}`);
      const rest = (two.items as AdminGuestPlay[]).filter((p) => p.ip === IP_B && p.at === TEST_T0.toISOString()).map((p) => p.score);
      expect(rest).toEqual([4, 3, 2, 1, 0]);
    });
  });
});
