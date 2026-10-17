import { describe, expect, it } from 'vitest';
import { COLS, ROWS } from '../src/logic';
import { APPLE_RADIUS, CELL, PAD, canvasSize, pickRect } from '../src/scene/pick';

/** 화면 칸 (dc, dr)의 사과 중심 좌표 */
const cx = (dc: number) => PAD + dc * CELL + CELL / 2;
const cy = cx;
/** 화면 칸 (dc, dr) 사과 중심에서 (ox, oy)만큼 떨어진 점 */
function at(dc: number, dr: number, ox = 0, oy = 0) {
  return { x: cx(dc) + ox, y: cy(dr) + oy };
}
/** 사과 사이 틈 (사과 상자 밖, 다음 칸 쪽으로 gapOffset만큼) */
const GAP = CELL - APPLE_RADIUS * 2;

describe('canvasSize', () => {
  it('가로 1688 × 1016, 세로 1016 × 1688', () => {
    expect(canvasSize('landscape')).toEqual({ width: 1688, height: 1016 });
    expect(canvasSize('portrait')).toEqual({ width: 1016, height: 1688 });
  });
});

describe('pickRect', () => {
  it('사과 오른쪽 아래를 눌러 시작해도 누른 사과가 들어간다', () => {
    // 예전 판정(중심이 사각형 안)이면 c1이 4가 되어 누른 사과가 빠졌다
    expect(pickRect(at(3, 2, 30, 30), at(5, 2, 30, 30), 'landscape')).toEqual({ c1: 3, r1: 2, c2: 5, r2: 2 });
  });

  it('가리키는 사과는 중심을 넘지 않아도 들어간다', () => {
    expect(pickRect(at(3, 2), at(5, 2, -30, 0), 'landscape')).toEqual({ c1: 3, r1: 2, c2: 5, r2: 2 });
  });

  it('사과 위쪽 절반으로 가로로 그어도 그 줄이 잡힌다', () => {
    // 예전 판정은 사각형이 사과 중심 높이를 덮지 않아 아무것도 잡지 않았다
    expect(pickRect(at(2, 4, 0, -25), at(6, 4, 0, -12), 'landscape')).toEqual({ c1: 2, r1: 4, c2: 6, r2: 4 });
  });

  it('끝 사과를 넘겨 틈에서 놓아도 다음 사과는 들어가지 않는다', () => {
    const end = at(5, 2, APPLE_RADIUS + GAP - 1, 0); // 다음 사과 상자 1px 앞
    expect(pickRect(at(3, 2), end, 'landscape')).toEqual({ c1: 3, r1: 2, c2: 5, r2: 2 });
  });

  it('다음 사과 상자에 닿으면 그 사과가 들어간다', () => {
    expect(pickRect(at(3, 2), at(6, 2, -APPLE_RADIUS, 0), 'landscape')).toEqual({ c1: 3, r1: 2, c2: 6, r2: 2 });
  });

  it('틈에서 시작하면 이웃 사과는 들어가지 않는다', () => {
    const start = at(2, 1, APPLE_RADIUS + 2, APPLE_RADIUS + 2); // 칸 (2,1) 오른쪽 아래 틈
    expect(pickRect(start, at(4, 3), 'landscape')).toEqual({ c1: 3, r1: 2, c2: 4, r2: 3 });
  });

  it('거꾸로(오른쪽 아래 → 왼쪽 위) 끌어도 같은 사각형', () => {
    const forward = pickRect(at(2, 1, -30, -30), at(6, 4, 30, 30), 'landscape');
    const backward = pickRect(at(6, 4, 30, 30), at(2, 1, -30, -30), 'landscape');
    expect(forward).toEqual({ c1: 2, r1: 1, c2: 6, r2: 4 });
    expect(backward).toEqual(forward);
  });

  it('사과를 누르기만 하면 그 사과 하나, 틈을 누르면 없음', () => {
    expect(pickRect(at(7, 3, 20, -20), at(7, 3, 20, -20), 'landscape')).toEqual({ c1: 7, r1: 3, c2: 7, r2: 3 });
    const gap = at(7, 3, APPLE_RADIUS + GAP / 2, 0);
    expect(pickRect(gap, gap, 'landscape')).toBeNull();
  });

  it('여백에서 시작해 판 안으로 끌면 가장자리 사과부터 들어간다', () => {
    expect(pickRect({ x: 5, y: 5 }, at(1, 1), 'landscape')).toEqual({ c1: 0, r1: 0, c2: 1, r2: 1 });
    expect(pickRect({ x: -500, y: -500 }, { x: 99999, y: 99999 }, 'landscape')).toEqual({ c1: 0, r1: 0, c2: COLS - 1, r2: ROWS - 1 });
  });

  it('세로 화면은 전치를 되돌려 로직 칸 좌표로 준다', () => {
    // 세로 화면 칸 (dc, dr) = 로직 칸 (r, c)
    expect(pickRect(at(2, 7), at(4, 8), 'portrait')).toEqual({ c1: 7, r1: 2, c2: 8, r2: 4 });
    expect(pickRect({ x: -500, y: -500 }, { x: 99999, y: 99999 }, 'portrait')).toEqual({ c1: 0, r1: 0, c2: COLS - 1, r2: ROWS - 1 });
  });
});
