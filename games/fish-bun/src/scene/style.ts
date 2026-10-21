// 그림체 설정과 도트 그리기 도구. 그림(art.ts)과 화면(ui.ts, DayView.ts, screens.ts)이 같이 쓴다.
// ART_STYLE을 'smooth'로 바꾸면 도트로 바꾸기 전 매끈한 SVG 그림으로 돌아간다(백업). 바꾸기 전 전체 모습은 태그 fish-bun-svg-art.
// 근거: docs/design/261022-01-fish-bun-pixel-art.md

import type Phaser from 'phaser';

export type ArtStyle = 'pixel' | 'smooth';

/** 그림체. pixel = 도트(지금), smooth = 도트로 바꾸기 전 SVG 그림(백업) */
export const ART_STYLE: ArtStyle = 'pixel';

/** 도트로 그리는지 */
export const PIXEL_ART = ART_STYLE === 'pixel';

/** 도트 한 칸 (캔버스 px). 세로 화면 720px 기준 가로 180칸 */
export const DOT = 4;

/** 두 색을 섞는다. t = 0이면 a, 1이면 b */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 도트 칸에 맞춘다 */
function snap(v: number): number {
  return PIXEL_ART ? Math.round(v / DOT) * DOT : v;
}

/**
 * 모서리를 깎은 상자를 채운다. 매끈하면 둥근 사각형, 도트면 반지름에 따라 계단 0~2칸으로 깎는다
 */
export function roundBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1): Phaser.GameObjects.Graphics {
  if (!PIXEL_ART) return g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, r);
  const s = DOT;
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

/**
 * 테두리 있는 상자. 매끈하면 둥근 사각형 + 선, 도트면 테두리색 상자 위에 한 칸 안쪽 채움 상자
 */
export function framedBox(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: number,
  border: number,
  lineWidth = 2,
): Phaser.GameObjects.Graphics {
  if (!PIXEL_ART) return g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, r).lineStyle(lineWidth, border, 1).strokeRoundedRect(x, y, w, h, r);
  roundBox(g, x, y, w, h, r, border);
  return roundBox(g, x + DOT, y + DOT, w - 2 * DOT, h - 2 * DOT, Math.max(0, r - DOT), fill);
}

/** 원. 도트면 칸 단위 계단 원 */
export function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1): Phaser.GameObjects.Graphics {
  if (!PIXEL_ART) return g.fillStyle(color, alpha).fillCircle(cx, cy, r);
  g.fillStyle(color, alpha);
  const x0 = snap(cx);
  const y0 = snap(cy);
  for (let dy = -snap(r); dy < snap(r); dy += DOT) {
    const mid = dy + DOT / 2;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - mid * mid)) / DOT) * DOT;
    if (half > 0) g.fillRect(x0 - half, y0 + dy, half * 2, DOT);
  }
  return g;
}

/** 위아래 그라데이션. 도트면 bands단 색 띠 */
export function vGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, bands = 8): Phaser.GameObjects.Graphics {
  if (!PIXEL_ART) return g.fillGradientStyle(top, top, bottom, bottom, 1).fillRect(x, y, w, h);
  const bandH = Math.ceil(h / bands / DOT) * DOT;
  for (let i = 0; i < bands; i += 1) {
    const by = y + i * bandH;
    if (by >= y + h) break;
    g.fillStyle(mix(top, bottom, i / (bands - 1)), 1).fillRect(x, by, w, Math.min(bandH, y + h - by));
  }
  return g;
}

/** 채워지는 막대. 도트면 각진 막대에 칸 구분 줄 */
export function meter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, back: number, front: number): Phaser.GameObjects.Graphics {
  const t = Math.min(1, Math.max(0, ratio));
  if (!PIXEL_ART) {
    return g.fillStyle(back, 1).fillRoundedRect(x, y, w, h, h / 2).fillStyle(front, 1).fillRoundedRect(x, y, Math.max(h, w * t), h, h / 2);
  }
  roundBox(g, x, y, w, h, h >= 16 ? 5 : 0, back);
  const fw = snap(Math.max(t > 0 ? DOT * 2 : 0, w * t));
  if (fw <= 0) return g;
  roundBox(g, x, y, fw, h, h >= 16 ? 5 : 0, front);
  g.fillStyle(0xffffff, 0.3).fillRect(snap(x) + DOT, snap(y), Math.max(0, fw - 2 * DOT), DOT);
  // 칸 구분
  g.fillStyle(0x000000, 0.18);
  for (let sx = snap(x) + DOT * 6; sx < snap(x) + fw - DOT; sx += DOT * 6) g.fillRect(sx, snap(y), DOT / 2, snap(h));
  return g;
}
