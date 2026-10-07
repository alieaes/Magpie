// 사과게임 규칙. 서버도 이 코드로 판을 다시 돌려 점수를 확인한다.
// 결정성 규칙(CLAUDE.md §4-3): 시드 난수와 정수 연산만 쓴다. Math.random, 실제 시각, 초월함수를 쓰지 않는다.
// 근거: docs/design/261006-09-apple-ten.md

import { SeededRandom, TICKS_PER_SECOND } from '@magpie/shared';

/** 가로 칸 수 */
export const COLS = 17;
/** 세로 칸 수 */
export const ROWS = 10;
/** 사과 개수 = 최고 점수 */
export const CELL_COUNT = COLS * ROWS;
export const MAX_SCORE = CELL_COUNT;
/** 묶어야 하는 합 */
export const TARGET_SUM = 10;
/** 제한 시간 120초 */
export const TIME_LIMIT_TICKS = 120 * TICKS_PER_SECOND;
/** 한 번에 최소 2개가 지워지므로(사과 하나는 9가 최대) 기록은 최대 85개 */
export const MAX_INPUTS = Math.floor(CELL_COUNT / 2);

/** 판. 칸마다 1~9, 지워진 칸은 0. 인덱스 = r × COLS + c */
export type Board = Uint8Array;

/** 칸 좌표 사각형. 양 끝 포함, c1 ≤ c2, r1 ≤ r2 */
export interface CellRect {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

/** 입력 기록 한 줄: 사과가 실제로 지워진 선택과 그 틱 */
export interface AppleInput extends CellRect {
  t: number;
}

export type ReplayResult = { ok: true; score: number; ticks: number } | { ok: false; reason: string; index: number };

/** 칸 좌표를 판 인덱스로 바꾼다 */
export function cellIndex(c: number, r: number): number {
  return r * COLS + c;
}

/** 시드로 판을 만든다. 칸마다 1~9를 고르게 뽑는다 (원작처럼 다 풀 수 있는 판을 보장하지 않는다) */
export function createBoard(seed: string): Board {
  const rng = new SeededRandom(seed);
  const board = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i += 1) board[i] = rng.int(1, 9);
  return board;
}

/** 사각형이 판 안에 있고 순서가 맞는지 확인한다 */
export function isValidRect(rect: CellRect): boolean {
  const { c1, r1, c2, r2 } = rect;
  return (
    Number.isInteger(c1) &&
    Number.isInteger(r1) &&
    Number.isInteger(c2) &&
    Number.isInteger(r2) &&
    c1 >= 0 &&
    r1 >= 0 &&
    c1 <= c2 &&
    r1 <= r2 &&
    c2 < COLS &&
    r2 < ROWS
  );
}

/** 사각형 안 사과의 합. 지워진 칸은 0으로 친다 */
export function rectSum(board: Board, rect: CellRect): number {
  let sum = 0;
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) sum += board[cellIndex(c, r)] ?? 0;
  }
  return sum;
}

/** 합이 정확히 10이면 사각형 안 사과를 지우고 지운 개수를 돌려준다. 아니면 판을 그대로 두고 0 */
export function trySelect(board: Board, rect: CellRect): number {
  if (!isValidRect(rect) || rectSum(board, rect) !== TARGET_SUM) return 0;
  let removed = 0;
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const i = cellIndex(c, r);
      if (board[i] !== 0) {
        board[i] = 0;
        removed += 1;
      }
    }
  }
  return removed;
}

/**
 * 입력 기록을 처음부터 다시 적용해 점수를 낸다. 서버의 점수 확인이 이 함수를 쓴다.
 * 틱이 줄어들거나 제한 시간을 넘거나, 사과를 지우지 못하는 선택이 있으면 실패한다.
 */
export function replay(seed: string, inputs: readonly AppleInput[]): ReplayResult {
  if (inputs.length > MAX_INPUTS) return { ok: false, reason: 'too_many_inputs', index: MAX_INPUTS };
  const board = createBoard(seed);
  let score = 0;
  let lastTick = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    if (!Number.isInteger(input.t) || input.t < lastTick || input.t > TIME_LIMIT_TICKS) {
      return { ok: false, reason: 'bad_tick', index: i };
    }
    if (!isValidRect(input)) return { ok: false, reason: 'bad_rect', index: i };
    const removed = trySelect(board, input);
    if (removed === 0) return { ok: false, reason: 'no_match', index: i };
    score += removed;
    lastTick = input.t;
  }
  return { ok: true, score, ticks: lastTick };
}
