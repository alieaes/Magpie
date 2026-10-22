// 도트 격자 도구: 문자 격자를 만들고 겹치고 뒤집고, 색 칸(RGBA)으로 바꾼다. Phaser를 모르는 순수 코드
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §1, 시안 draft-sprites.py의 g·blank·stamp·put·rect·flip·render

import { OUTLINE, PALETTE } from './palette';

/** 문자 격자. grid[y][x]가 팔레트 글자, '.'은 투명 */
export type Grid = string[][];
/** 점 하나 (x, y) */
export type Pt = readonly [number, number];

/** 문자열 줄들을 격자로 (줄 길이가 모두 같아야 한다) */
export function g(rows: readonly string[]): Grid {
  const w = rows[0]?.length ?? 0;
  for (const r of rows) {
    if (r.length !== w) throw new Error(`격자 줄 길이가 다르다: ${r.length} != ${w} (${r})`);
  }
  return rows.map((r) => [...r]);
}

/** 빈(투명) 격자 */
export function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string>(w).fill('.'));
}

/** 격자 복사 */
export function clone(src: Grid): Grid {
  return src.map((r) => [...r]);
}

/** 격자 너비 */
export function width(src: Grid): number {
  return src[0]?.length ?? 0;
}

/** src를 dst의 (x, y)에 겹친다. '.'은 건너뛴다. remap으로 글자를 바꾸고, mask면 dst가 칠해진 칸에만 */
export function stamp(dst: Grid, src: Grid, x: number, y: number, remap?: Readonly<Record<string, string>>, mask = false): Grid {
  src.forEach((row, j) => {
    row.forEach((ch, i) => {
      if (ch === '.') return;
      const line = dst[y + j];
      if (!line || x + i < 0 || x + i >= line.length) return;
      if (mask && line[x + i] === '.') return;
      line[x + i] = remap?.[ch] ?? ch;
    });
  });
  return dst;
}

/** src를 dst에 겹치되, src 바깥 한 칸에 먼저 먹색 윤곽을 두른다(그림 안에 놓는 물건이 바탕에 묻히지 않게) */
export function stampOutlined(dst: Grid, src: Grid, x: number, y: number, remap?: Readonly<Record<string, string>>): Grid {
  const sw = width(src);
  const solid = (i: number, j: number) => j >= 0 && j < src.length && i >= 0 && i < sw && src[j]![i] !== '.';
  const ring: Pt[] = [];
  for (let j = -1; j <= src.length; j += 1) {
    for (let i = -1; i <= sw; i += 1) {
      if (!solid(i, j) && (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1))) ring.push([x + i, y + j]);
    }
  }
  put(dst, ring, 'E');
  return stamp(dst, src, x, y, remap);
}

/** 점들을 한 글자로 칠한다. mask면 이미 칠해진 칸에만 */
export function put(dst: Grid, pts: readonly Pt[], ch: string, mask = false): Grid {
  for (const [x, y] of pts) {
    const line = dst[y];
    if (!line || x < 0 || x >= line.length) continue;
    if (mask && line[x] === '.') continue;
    line[x] = ch;
  }
  return dst;
}

/** (x0, y0) ~ (x1, y1) 네모 안의 점들 (양 끝 포함) */
export function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pts: Pt[] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) pts.push([x, y]);
  return pts;
}

/** 좌우 뒤집기 */
export function flipX(src: Grid): Grid {
  return src.map((r) => [...r].reverse());
}

/** 칠해진 칸의 글자를 바꾼다 (같은 격자에 색 표만 바꾸기) */
export function recolor(src: Grid, remap: Readonly<Record<string, string>>): Grid {
  return src.map((r) => r.map((ch) => remap[ch] ?? ch));
}

/** 격자에 쓰인 색 글자들 ('.' 제외) */
export function colorsOf(src: Grid): Set<string> {
  const set = new Set<string>();
  for (const r of src) for (const ch of r) if (ch !== '.') set.add(ch);
  return set;
}

/** 색 칸으로 바꾼 그림. 한 칸 = 도트 하나 */
export interface Pixels {
  w: number;
  h: number;
  /** RGBA, 줄 우선 */
  data: Uint8ClampedArray;
}

/** 격자를 색 칸으로 바꾼다. outline이면 바깥에 한 칸 테두리를 두른다(크기가 위아래좌우 1칸씩 커진다) */
export function toPixels(grid: Grid, outline = true): Pixels {
  const pad = outline ? 1 : 0;
  const gw = width(grid);
  const gh = grid.length;
  const w = gw + pad * 2;
  const h = gh + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch === '.') return;
      const c = PALETTE[ch];
      if (!c) throw new Error(`팔레트에 없는 글자: '${ch}'`);
      const i = ((y + pad) * w + x + pad) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    });
  });
  if (outline) {
    // 불투명한 칸과 위아래좌우로 맞닿은 투명한 칸을 테두리 색으로 칠한다(안쪽 구멍도 같은 규칙)
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! > 0;
    const edge: number[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * w + x) * 4);
      }
    }
    for (const i of edge) {
      data[i] = OUTLINE[0];
      data[i + 1] = OUTLINE[1];
      data[i + 2] = OUTLINE[2];
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}
