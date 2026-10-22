// 화면 배치: 캔버스 크기와 장사 화면의 영역. 게임 영역이 세로로 길면 세로 배치(휴대폰), 아니면 가로 배치(PC).
// 세로 배치는 손님을 위, 빵틀을 엄지가 닿는 아래, 펌프를 왼쪽 아래에 둔다. 근거: docs/design/261021-01-fish-bun.md §5-1

export type Layout = 'portrait' | 'landscape';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIZES: Record<Layout, { width: number; height: number }> = {
  portrait: { width: 720, height: 1400 },
  landscape: { width: 1560, height: 1000 },
};

/** 배치에 맞는 캔버스 크기 */
export function canvasSize(layout: Layout): { width: number; height: number } {
  return SIZES[layout];
}

/** 장사 화면의 영역 */
export interface DayGeometry {
  hud: Rect;
  counter: Rect;
  shelf: Rect;
  trash: Rect;
  grill: Rect;
  pump: Rect;
  gauge: Rect;
  combo: Rect;
  /** 가로 배치만: 오늘 매출·손님 같은 작은 기록 */
  info: Rect | null;
  /** 반죽 고르기 버튼 줄 (메뉴가 둘 이상 열린 날만, 빵틀 판 위쪽) */
  batter: Rect | null;
}

/** 반죽 고르기 줄의 높이 */
const BATTER_H = 72;

/** 장사 화면 배치. 메뉴가 둘 이상 열린 날은 빵틀 판 위쪽을 반죽 고르기 줄로 쓴다 */
export function dayGeometry(layout: Layout, menus = 1): DayGeometry {
  const g = baseGeometry(layout);
  if (menus <= 1) return g;
  const { grill } = g;
  return {
    ...g,
    batter: { x: grill.x, y: grill.y, w: grill.w, h: BATTER_H },
    grill: { x: grill.x, y: grill.y + BATTER_H + 12, w: grill.w, h: grill.h - BATTER_H - 12 },
  };
}

/** 메뉴가 하나일 때의 배치 */
function baseGeometry(layout: Layout): DayGeometry {
  if (layout === 'portrait') {
    return {
      hud: { x: 0, y: 0, w: 720, h: 100 },
      counter: { x: 0, y: 100, w: 720, h: 476 },
      shelf: { x: 20, y: 590, w: 552, h: 104 },
      trash: { x: 584, y: 590, w: 116, h: 104 },
      grill: { x: 20, y: 708, w: 680, h: 536 },
      pump: { x: 20, y: 1258, w: 196, h: 130 },
      gauge: { x: 230, y: 1258, w: 310, h: 130 },
      combo: { x: 554, y: 1258, w: 146, h: 130 },
      info: null,
      batter: null,
    };
  }
  return {
    hud: { x: 0, y: 0, w: 1560, h: 96 },
    grill: { x: 24, y: 110, w: 740, h: 660 },
    pump: { x: 24, y: 786, w: 196, h: 198 },
    gauge: { x: 234, y: 786, w: 360, h: 198 },
    combo: { x: 608, y: 786, w: 156, h: 198 },
    counter: { x: 788, y: 110, w: 748, h: 560 },
    shelf: { x: 788, y: 686, w: 604, h: 120 },
    trash: { x: 1404, y: 686, w: 132, h: 120 },
    info: { x: 788, y: 822, w: 748, h: 162 },
    batter: null,
  };
}

/** 빵틀 칸 배치: 6칸까지는 2열(칸을 크게), 그보다 많으면 3열 */
export function moldCells(grill: Rect, count: number, moldW: number, moldH: number): { cells: Rect[]; scale: number } {
  const cols = count <= 6 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gap = 14;
  const cellW = (grill.w - gap * (cols - 1)) / cols;
  const cellH = (grill.h - gap * (rows - 1)) / rows;
  const scale = Math.min(cellW / moldW, cellH / moldH);
  const cells: Rect[] = [];
  for (let i = 0; i < count; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    cells.push({ x: grill.x + c * (cellW + gap), y: grill.y + r * (cellH + gap), w: cellW, h: cellH });
  }
  return { cells, scale };
}

/** 점이 사각형 안인지 */
export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
