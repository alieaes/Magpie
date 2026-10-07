import { describe, expect, it } from 'vitest';
import {
  CELL_COUNT,
  COLS,
  ROWS,
  TIME_LIMIT_TICKS,
  cellIndex,
  createBoard,
  rectSum,
  replay,
  trySelect,
  type AppleInput,
  type Board,
  type CellRect,
} from '../src/logic';

/** 판에서 합이 10인 사각형을 하나 찾는다 (작은 것부터). 없으면 null */
function findMatch(board: Board): CellRect | null {
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

/** 찾을 수 있는 만큼 지워가며 입력 기록을 만든다 (틱은 1초 간격) */
function playGreedy(seed: string, limit = 85): { inputs: AppleInput[]; score: number } {
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

describe('createBoard', () => {
  it('17 × 10 칸에 1~9만 들어간다', () => {
    const board = createBoard('a');
    expect(board.length).toBe(CELL_COUNT);
    for (const v of board) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('같은 시드면 같은 판, 다르면 다른 판', () => {
    expect(Array.from(createBoard('seed-1'))).toEqual(Array.from(createBoard('seed-1')));
    expect(Array.from(createBoard('seed-1'))).not.toEqual(Array.from(createBoard('seed-2')));
  });
});

describe('trySelect', () => {
  /** 원하는 값으로 채운 판 */
  function boardOf(values: Record<string, number>): Board {
    const board = new Uint8Array(CELL_COUNT).fill(9);
    for (const [key, v] of Object.entries(values)) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      board[cellIndex(c, r)] = v;
    }
    return board;
  }

  it('합이 10이면 지우고 지운 개수를 준다', () => {
    const board = boardOf({ '0,0': 3, '1,0': 7 });
    expect(trySelect(board, { c1: 0, r1: 0, c2: 1, r2: 0 })).toBe(2);
    expect(board[cellIndex(0, 0)]).toBe(0);
    expect(board[cellIndex(1, 0)]).toBe(0);
  });

  it('합이 10이 아니면 판을 건드리지 않는다', () => {
    const board = boardOf({ '0,0': 3, '1,0': 6 });
    const before = Array.from(board);
    expect(trySelect(board, { c1: 0, r1: 0, c2: 1, r2: 0 })).toBe(0);
    expect(Array.from(board)).toEqual(before);
  });

  it('지워진 칸은 0으로 치고 개수에 넣지 않는다', () => {
    const board = boardOf({ '0,0': 0, '1,0': 4, '0,1': 6, '1,1': 0 });
    expect(trySelect(board, { c1: 0, r1: 0, c2: 1, r2: 1 })).toBe(2);
  });

  it('판 밖이거나 순서가 뒤집힌 사각형은 0', () => {
    const board = boardOf({ '0,0': 3, '1,0': 7 });
    expect(trySelect(board, { c1: 1, r1: 0, c2: 0, r2: 0 })).toBe(0);
    expect(trySelect(board, { c1: 16, r1: 0, c2: 17, r2: 0 })).toBe(0);
    expect(trySelect(board, { c1: -1, r1: 0, c2: 1, r2: 0 })).toBe(0);
  });
});

describe('replay', () => {
  it('플레이하며 쌓은 점수와 재계산 점수가 같다', () => {
    for (const seed of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      const { inputs, score } = playGreedy(seed);
      expect(score).toBeGreaterThan(0);
      expect(replay(seed, inputs)).toEqual({ ok: true, score, ticks: inputs.at(-1)!.t });
    }
  });

  it('입력이 없으면 0점', () => {
    expect(replay('empty', [])).toEqual({ ok: true, score: 0, ticks: 0 });
  });

  it('다른 시드로 재생하면 실패하거나 점수가 다르다', () => {
    const { inputs, score } = playGreedy('real', 10);
    const other = replay('fake', inputs);
    expect(other.ok && other.score === score).toBe(false);
  });

  it('틱이 줄어들면 실패', () => {
    const { inputs } = playGreedy('tick', 3);
    inputs[2] = { ...inputs[2]!, t: inputs[1]!.t - 1 };
    expect(replay('tick', inputs)).toMatchObject({ ok: false, reason: 'bad_tick', index: 2 });
  });

  it('제한 시간을 넘긴 틱은 실패', () => {
    const { inputs } = playGreedy('late', 1);
    inputs[0] = { ...inputs[0]!, t: TIME_LIMIT_TICKS + 1 };
    expect(replay('late', inputs)).toMatchObject({ ok: false, reason: 'bad_tick' });
  });

  it('사과를 지우지 못하는 선택이 섞이면 실패', () => {
    const { inputs } = playGreedy('dup', 2);
    // 이미 지운 사각형을 한 번 더 선택 → 합이 0이라 지워지는 게 없다
    inputs.push({ ...inputs[0]!, t: inputs[1]!.t + 1 });
    expect(replay('dup', inputs)).toMatchObject({ ok: false, reason: 'no_match', index: 2 });
  });

  it('판 밖 좌표는 실패', () => {
    expect(replay('x', [{ t: 1, c1: 0, r1: 0, c2: COLS, r2: 0 }])).toMatchObject({ ok: false, reason: 'bad_rect' });
  });

  it('기록이 85개를 넘으면 실패', () => {
    const many = Array.from({ length: 86 }, (_, i) => ({ t: i, c1: 0, r1: 0, c2: 0, r2: 0 }));
    expect(replay('many', many)).toMatchObject({ ok: false, reason: 'too_many_inputs' });
  });
});
