// 도트 화면 그리기 도구: 계단형 모서리 상자, 테두리 상자, 칸 단위 원, 색 띠 그라데이션, 칸 막대.
// 붕어빵 가게와 같은 규칙이지만 게임끼리 독립이라 코드는 이 게임에 따로 둔다(CLAUDE.md §4-3).
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §4

import type Phaser from 'phaser';

/** 화면 도트 한 칸 (캔버스 px). 그림의 DOT과 같다 */
export const UI_DOT = 4;

/** 두 색을 섞는다. t = 0이면 a, 1이면 b */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 도트 칸에 맞춘다 */
export function snap(v: number): number {
  return Math.round(v / UI_DOT) * UI_DOT;
}

/** 모서리를 계단 0~2칸으로 깎은 상자를 채운다 (반지름이 클수록 많이 깎는다) */
export function roundBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1): Phaser.GameObjects.Graphics {
  const s = UI_DOT;
  const [px, py, pw, ph] = [snap(x), snap(y), snap(w), snap(h)];
  const steps = r >= 14 && pw >= 6 * s && ph >= 6 * s ? 2 : r >= 5 && pw >= 3 * s && ph >= 3 * s ? 1 : 0;
  g.fillStyle(color, alpha);
  if (steps === 0) return g.fillRect(px, py, pw, ph);
  if (steps === 1) return g.fillRect(px + s, py, pw - 2 * s, ph).fillRect(px, py + s, pw, ph - 2 * s);
  return g
    .fillRect(px + 2 * s, py, pw - 4 * s, ph)
    .fillRect(px + s, py + s, pw - 2 * s, ph - 2 * s)
    .fillRect(px, py + 2 * s, pw, ph - 4 * s);
}

/** 테두리 있는 상자: 테두리색 상자 위에 한 칸 안쪽 채움 상자 */
export function framedBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number, fill: number, border: number): Phaser.GameObjects.Graphics {
  roundBox(g, x, y, w, h, r, border);
  return roundBox(g, x + UI_DOT, y + UI_DOT, w - 2 * UI_DOT, h - 2 * UI_DOT, Math.max(0, r - UI_DOT), fill);
}

/** 칸 단위 계단 원 */
export function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1): Phaser.GameObjects.Graphics {
  g.fillStyle(color, alpha);
  const x0 = snap(cx);
  const y0 = snap(cy);
  for (let dy = -snap(r); dy < snap(r); dy += UI_DOT) {
    const mid = dy + UI_DOT / 2;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - mid * mid)) / UI_DOT) * UI_DOT;
    if (half > 0) g.fillRect(x0 - half, y0 + dy, half * 2, UI_DOT);
  }
  return g;
}

/** 위아래 bands단 색 띠 */
export function vGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, bands = 8): Phaser.GameObjects.Graphics {
  const bandH = Math.ceil(h / bands / UI_DOT) * UI_DOT;
  for (let i = 0; i < bands; i += 1) {
    const by = y + i * bandH;
    if (by >= y + h) break;
    g.fillStyle(mix(top, bottom, i / (bands - 1)), 1).fillRect(x, by, w, Math.min(bandH, y + h - by));
  }
  return g;
}

/** 채워지는 각진 막대 + 칸 구분 줄 */
export function meter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, back: number, front: number): Phaser.GameObjects.Graphics {
  const t = Math.min(1, Math.max(0, ratio));
  roundBox(g, x, y, w, h, h >= 16 ? 5 : 0, back);
  const fw = snap(Math.max(t > 0 ? UI_DOT * 2 : 0, w * t));
  if (fw <= 0) return g;
  roundBox(g, x, y, fw, h, h >= 16 ? 5 : 0, front);
  g.fillStyle(0xffffff, 0.3).fillRect(snap(x) + UI_DOT, snap(y), Math.max(0, fw - 2 * UI_DOT), UI_DOT);
  g.fillStyle(0x000000, 0.18);
  for (let sx = snap(x) + UI_DOT * 6; sx < snap(x) + fw - UI_DOT; sx += UI_DOT * 6) g.fillRect(sx, snap(y), UI_DOT / 2, snap(h));
  return g;
}

/** 칸 수가 정해진 막대 (기다림 막대 10칸 등): filled칸을 front로, 나머지를 back으로 */
export function cells(g: Phaser.GameObjects.Graphics, x: number, y: number, count: number, filled: number, cell: number, gap: number, back: number, front: number): Phaser.GameObjects.Graphics {
  for (let i = 0; i < count; i += 1) {
    g.fillStyle(i < filled ? front : back, 1).fillRect(snap(x + i * (cell + gap)), snap(y), cell, cell);
  }
  return g;
}

/** 계단 삼각형 말풍선 꼬리 (아래를 가리킴) */
export function tail(g: Phaser.GameObjects.Graphics, cx: number, y: number, color: number): Phaser.GameObjects.Graphics {
  g.fillStyle(color, 1);
  for (let i = 0; i < 3; i += 1) g.fillRect(snap(cx) - (3 - i) * UI_DOT, snap(y) + i * UI_DOT, (3 - i) * 2 * UI_DOT, UI_DOT);
  return g;
}
