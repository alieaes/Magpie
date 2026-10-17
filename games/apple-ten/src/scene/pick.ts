// 판 칸 배치와 드래그 → 칸 사각형 계산. Phaser를 쓰지 않아 테스트에서 바로 부른다.
// 근거: docs/design/261017-01-apple-ten-feel.md §2

import { COLS, ROWS, type CellRect } from '../logic/rules';

/** 판 방향. 세로 화면에서는 판을 전치해서(가로·세로를 맞바꿔) 10 × 17로 그린다 */
export type Orientation = 'landscape' | 'portrait';

/** 화면 위 점 (캔버스 좌표) */
export interface Point {
  x: number;
  y: number;
}

// 캔버스를 크게 잡고 화면에 맞춰 줄인다. 고해상도 화면에서도 흐려지지 않게 하기 위해서다
/** 칸 한 변 (캔버스 px) */
export const CELL = 96;
/** 판 둘레 여백 (캔버스 px) */
export const PAD = 28;
/** 사과 반지름. 그림과 선택 판정(사과 상자 = 중심 ± 반지름)이 같이 쓴다 */
export const APPLE_RADIUS = 38;

/** 판 방향에 맞는 화면 가로·세로 칸 수 */
function displayGrid(orientation: Orientation): { cols: number; rows: number } {
  return orientation === 'landscape' ? { cols: COLS, rows: ROWS } : { cols: ROWS, rows: COLS };
}

/** 판 방향에 맞는 캔버스 크기 */
export function canvasSize(orientation: Orientation): { width: number; height: number } {
  const { cols, rows } = displayGrid(orientation);
  return { width: cols * CELL + PAD * 2, height: rows * CELL + PAD * 2 };
}

/** 한 축에서 구간 [lo, hi]에 사과 상자가 걸치는 칸 번호 범위. 없으면 null */
function spanOnAxis(lo: number, hi: number, count: number): [number, number] | null {
  // 칸 i의 사과 상자: 중심 PAD + i·CELL + CELL/2 에서 ± APPLE_RADIUS
  const first = Math.max(0, Math.ceil((lo - PAD - CELL / 2 - APPLE_RADIUS) / CELL));
  const last = Math.min(count - 1, Math.floor((hi - PAD - CELL / 2 + APPLE_RADIUS) / CELL));
  return first <= last ? [first, last] : null;
}

/**
 * 누른 점(a) ~ 지금 점(b) 사각형에 사과 상자가 조금이라도 걸치는 칸들을 로직 칸 좌표 사각형으로 돌려준다.
 * 누른 사과와 가리키는 사과는 사과 위 어디서든 들어가고, 사과 사이 틈은 어느 사과에도 속하지 않는다.
 * 하나도 없으면 null. 세로 화면이면 전치를 되돌린다
 */
export function pickRect(a: Point, b: Point, orientation: Orientation): CellRect | null {
  const { cols, rows } = displayGrid(orientation);
  const x = spanOnAxis(Math.min(a.x, b.x), Math.max(a.x, b.x), cols);
  const y = spanOnAxis(Math.min(a.y, b.y), Math.max(a.y, b.y), rows);
  if (!x || !y) return null;
  const [dc1, dc2] = x;
  const [dr1, dr2] = y;
  return orientation === 'landscape'
    ? { c1: dc1, r1: dr1, c2: dc2, r2: dr2 }
    : { c1: dr1, r1: dc1, c2: dr2, r2: dc2 };
}
