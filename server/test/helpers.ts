// 서버 테스트 공용 도구. DB 통합 테스트는 개발 DB(-dev)에 붙어 트랜잭션 안에서 돌리고 항상 되돌린다.

import type { Kysely } from 'kysely';
import { COLS, ROWS, appleTenLogic, createBoard, rectSum, trySelect, type AppleInput, type CellRect } from '@magpie/game-apple-ten/logic';
import { luckyScratchLogic } from '@magpie/game-lucky-scratch/logic';
import { findGame } from '@magpie/shared';
import { createApp } from '../src/app';
import { cookieSettings } from '../src/auth/cookies';
import { createSession } from '../src/auth/session';
import { findOrCreateUser, setNickname } from '../src/auth/users';
import { loadConfig, loadEnvFile, type Config } from '../src/config';
import { createDb } from '../src/db';
import type { Database } from '../src/db/types';
import { createLogicRegistry, type LogicRegistry } from '../src/plays/logics';
import { createPlayService } from '../src/plays/service';
import { createRankingService } from '../src/ranking/service';
import { createSaveService } from '../src/saves/service';
import { createVisitService } from '../src/visits/service';
import { testShopLogic } from './growth-fixture';

loadEnvFile();

/** .env의 설정. 없거나 잘못됐으면 null */
export const devConfig: Config | null = (() => {
  try {
    return loadConfig();
  } catch {
    return null;
  }
})();

/** DB 통합 테스트를 돌릴 수 있는지: 설정이 있고 개발 DB(-dev)일 때만 */
export const canRunDb = devConfig !== null && devConfig.DB_NAME.endsWith('-dev');

const ROLLBACK = new Error('rollback');

/** 트랜잭션 안에서 테스트를 돌리고 항상 되돌린다 */
export async function inRollback(fn: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
  const db = createDb(devConfig!);
  try {
    await db.transaction().execute(async (trx) => {
      await fn(trx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await db.destroy();
  }
}

/** 테스트 앱의 시계 시작점. 실제 데이터의 오늘 랭킹과 겹치지 않는 날이다 (KST 2000-01-02 12:00) */
export const TEST_T0 = new Date('2000-01-02T03:00:00Z');

/** 성장형 시험에 쓰는 게임 id. 게임 목록의 성장형 게임 자리에 시험용 로직을 끼운다 */
export const GROWTH_TEST_GAME = 'fish-bun';

/** 테스트 앱의 로직 등록부: 실제 미니게임 로직 + 성장형 자리에 시험용 가게 로직(준비 중이어도 기록할 수 있게) */
export const testLogics = createLogicRegistry(
  { 'apple-ten': appleTenLogic, 'lucky-scratch': luckyScratchLogic, [GROWTH_TEST_GAME]: testShopLogic },
  (gameId) => gameId === GROWTH_TEST_GAME || findGame(gameId)?.status === 'playable',
);

/** 테스트 유저: 번호와 세션 쿠키 헤더 값 */
export interface TestUser {
  id: number;
  cookie: string;
}

/** 되돌림 트랜잭션 안에서 만든 앱과 도구 */
export interface TestApp {
  trx: Kysely<Database>;
  /** 시계를 앞으로 돌린다 */
  advance(ms: number): void;
  /** 유저를 만들고 세션을 연다. nickname이 null이면 닉네임 전 유저, admin이면 관리자 */
  login(options?: { nickname?: string | null; admin?: boolean }): Promise<TestUser>;
  get(path: string, cookie?: string): Promise<Response>;
  post(path: string, body?: unknown, cookie?: string): Promise<Response>;
  del(path: string, body?: unknown, cookie?: string): Promise<Response>;
}

/**
 * 되돌림 트랜잭션 안에서 시계를 TEST_T0로 고정한 앱을 만들어 테스트를 돌린다.
 * logics를 주면 그 로직 등록부를 쓴다(기본은 성장형 자리에 시험용 가게 로직을 끼운 testLogics)
 */
export function withTestApp(fn: (app: TestApp) => Promise<void>, { logics = testLogics }: { logics?: LogicRegistry } = {}): Promise<void> {
  const config = devConfig!;
  const cookieName = cookieSettings(config.SITE_URL).session;
  const origin = new URL(config.SITE_URL).origin;
  return inRollback(async (trx) => {
    let clock = TEST_T0.getTime();
    const now = () => new Date(clock);
    const ranking = createRankingService(trx, now);
    const plays = createPlayService(trx, { ranking, now, logics });
    const saves = createSaveService(trx, { logics, now });
    const visits = createVisitService(trx, now);
    const app = createApp({ db: trx, config, ranking, logics, plays, saves, visits, oidc: null });
    let seq = 0;
    /** 우리 사이트에서 온 것처럼(Origin) JSON 본문 요청을 보낸다 */
    const send = (method: string, path: string, body: unknown, cookie: string | undefined) =>
      app.request(path, {
        method,
        headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? null : JSON.stringify(body),
      });
    await fn({
      trx,
      advance: (ms) => (clock += ms),
      async login({ nickname = `테스트${Date.now() % 100000}${(seq += 1)}`, admin = false } = {}) {
        const user = await findOrCreateUser(trx, `test-sub:${Date.now()}:${Math.random()}`);
        if (nickname !== null) await setNickname(trx, user.id, nickname);
        if (admin) await trx.updateTable('users').set({ role: 'admin' }).where('id', '=', user.id).execute();
        const { token } = await createSession(trx, user.id);
        return { id: user.id, cookie: `${cookieName}=${token}` };
      },
      get: async (path, cookie) => app.request(path, { headers: cookie ? { cookie } : {} }),
      post: async (path, body, cookie) => send('POST', path, body, cookie),
      del: async (path, body, cookie) => send('DELETE', path, body, cookie),
    });
  });
}

/** 관리자 작업 기록의 detail을 객체로 읽는다. 드라이버가 이미 풀었으면 그대로 */
export function parseDetail(detail: unknown): unknown {
  return typeof detail === 'string' ? JSON.parse(detail) : detail;
}

/** 사과게임 판에서 합이 10인 사각형을 하나 찾는다 (작은 것부터). 없으면 null */
function findMatch(board: Uint8Array): CellRect | null {
  for (let h = 1; h <= ROWS; h += 1) {
    for (let w = 1; w <= COLS; w += 1) {
      for (let r1 = 0; r1 + h - 1 < ROWS; r1 += 1) {
        for (let c1 = 0; c1 + w - 1 < COLS; c1 += 1) {
          const rect = { c1, r1, c2: c1 + w - 1, r2: r1 + h - 1 };
          if (rectSum(board, rect) === 10) return rect;
        }
      }
    }
  }
  return null;
}

/** 사과게임을 찾는 대로 지워 가며 입력 기록을 만든다. 입력은 1초(60틱) 간격 */
export function playAppleGreedy(seed: string, limit: number): { inputs: AppleInput[]; score: number } {
  const board = createBoard(seed);
  const inputs: AppleInput[] = [];
  let score = 0;
  for (let i = 0; i < limit; i += 1) {
    const rect = findMatch(board);
    if (!rect) break;
    score += trySelect(board, rect);
    inputs.push({ t: (i + 1) * 60, ...rect });
  }
  return { inputs, score };
}
