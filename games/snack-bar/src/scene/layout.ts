// 화면 배치: 캔버스 크기와 장사 화면의 영역(위 정보 줄, 벽, 가게 격자, 쟁반 줄, 오늘 기록).
// 가로·세로 모두 가게 격자를 같은 방향(조리대 줄이 오른쪽)으로 그린다. 손님이 테이블 위·아래 의자에 앞모습·뒷모습으로 앉는 그림이 그대로 맞는다.
// 세로 배치 높이는 화면 비율에 맞춰 1240~1640이고, 늘거나 준 높이는 벽과 오늘 기록 줄이 받는다(CLAUDE.md §4-3).
// 근거: docs/design/261022-09-snack-bar.md §8-1

import { GRID_H, GRID_W } from '../logic/rules';

export type Layout = 'portrait' | 'landscape';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 세로 배치 기준 높이와 범위 */
export const PORTRAIT_BASE_H = 1400;
const PORTRAIT_MIN_H = 1240;
const PORTRAIT_MAX_H = 1640;
const SIZES: Record<Layout, { width: number; height: number }> = {
  portrait: { width: 720, height: PORTRAIT_BASE_H },
  landscape: { width: 1560, height: 1000 },
};

/** 배치에 맞는 캔버스 크기. 세로 배치는 너비 720에 높이를 무대 비율(높이 ÷ 너비)로 정하고 범위 안으로 자른다 */
export function canvasSize(layout: Layout, aspect?: number): { width: number; height: number } {
  const base = SIZES[layout];
  if (layout === 'landscape' || aspect === undefined || !Number.isFinite(aspect) || aspect <= 0) return base;
  const height = Math.round(Math.min(PORTRAIT_MAX_H, Math.max(PORTRAIT_MIN_H, base.width * aspect)));
  return { width: base.width, height };
}

/** 가게 격자의 화면 자리 */
export interface GridRect {
  x: number;
  y: number;
  /** 칸 너비·높이 */
  cw: number;
  ch: number;
}

/** 장사 화면의 영역 */
export interface DayGeometry {
  hud: Rect;
  /** 가게 위쪽 벽(메뉴판·창문) */
  wall: Rect;
  grid: GridRect;
  /** 쟁반 칸 줄 */
  tray: Rect;
  /** 오늘 기록(매출·손님·직원). 세로 배치에서 자리가 모자라면 없다 */
  info: Rect | null;
}

/** 장사 화면 배치 */
export function dayGeometry(layout: Layout, height = PORTRAIT_BASE_H): DayGeometry {
  if (layout === 'landscape') {
    const grid: GridRect = { x: 32, y: 176, cw: 112, ch: 104 };
    return {
      hud: { x: 0, y: 0, w: 1560, h: 96 },
      wall: { x: 32, y: 96, w: GRID_W * grid.cw, h: 80 },
      grid,
      tray: { x: 960, y: 120, w: 568, h: 300 },
      info: { x: 960, y: 452, w: 568, h: 452 },
    };
  }
  const cw = 90;
  const ch = 110;
  const hudH = 120;
  const trayH = 190;
  const fixed = hudH + GRID_H * ch + trayH + 16;
  const rest = Math.max(0, height - fixed);
  const wallH = Math.min(rest, 240);
  const infoH = rest - wallH;
  const gridY = hudH + wallH;
  const infoY = gridY + GRID_H * ch;
  return {
    hud: { x: 0, y: 0, w: 720, h: hudH },
    wall: { x: 0, y: hudH, w: 720, h: wallH },
    grid: { x: 0, y: gridY, cw, ch },
    tray: { x: 16, y: infoY + infoH, w: 688, h: trayH },
    info: infoH >= 72 ? { x: 16, y: infoY + 8, w: 688, h: infoH - 16 } : null,
  };
}

/** 격자 칸 가운데의 화면 좌표 */
export function cellCenter(grid: GridRect, x: number, y: number): { x: number; y: number } {
  return { x: grid.x + x * grid.cw + grid.cw / 2, y: grid.y + y * grid.ch + grid.ch / 2 };
}

/** 화면 좌표가 있는 격자 칸. 격자 밖이면 null */
export function cellAt(grid: GridRect, px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor((px - grid.x) / grid.cw);
  const y = Math.floor((py - grid.y) / grid.ch);
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H ? { x, y } : null;
}
