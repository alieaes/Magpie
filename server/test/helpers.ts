// 서버 테스트 공용 도구. DB 통합 테스트는 개발 DB(-dev)에 붙어 트랜잭션 안에서 돌리고 항상 되돌린다.

import type { Kysely } from 'kysely';
import { COLS, ROWS, createBoard, rectSum, trySelect, type AppleInput, type CellRect } from '@magpie/game-apple-ten/logic';
import { loadConfig, loadEnvFile, type Config } from '../src/config';
import { createDb } from '../src/db';
import type { Database } from '../src/db/types';

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
