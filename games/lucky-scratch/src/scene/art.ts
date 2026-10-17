// 텍스처 굽기. SVG 그림(symbols.ts)과 캔버스 2D로 그린 카드·은박·효과 조각을 Phaser 텍스처로 만든다.
// 게임 화면이 뜨기 전에 한 번 굽는다(mount). 근거: docs/design/261016-02-lucky-scratch.md §3-2, §3-3, §3-6

import { PRIZE_TABLE, SYMBOL_COUNT, type SymbolId } from '../logic/rules';
import { hex, shortWon } from './format';
import { COIN_SVG, EMBLEM_SVG, RANK_COLORS, SYMBOL_SVGS, svgDocument } from './symbols';

/** 카드 크기와 칸 배치 (캔버스 픽셀) */
export const CARD_W = 640;
export const CARD_H = 920;
export const CELL = 166;
export const CELL_GAP = 12;
export const GRID_W = CELL * 3 + CELL_GAP * 2;
export const GRID_X = (CARD_W - GRID_W) / 2;
export const GRID_Y = 316;
export const LEGEND_Y = 168;
/** 당첨표 한 칸 너비 */
export const LEGEND_COL_W = (CARD_W - 56) / PRIZE_TABLE.length;
export const BRUSH_RADIUS = 34;
/** 칸 그림·당첨표 그림을 굽는 크기 */
export const SYMBOL_SIZE = 140;
export const SYMBOL_SMALL_SIZE = 60;
/** 동전 굽는 크기 */
export const COIN_SIZE = 56;

export const FONT = '"Pretendard Variable", Pretendard, sans-serif';

/** 텍스처 이름 */
export const TEX = {
  symbol: (s: SymbolId) => `ls-symbol-${s}`,
  symbolSmall: (s: SymbolId) => `ls-symbol-small-${s}`,
  coin: 'ls-coin',
  emblem: 'ls-emblem',
  cardBg: 'ls-card-bg',
  cardBack: 'ls-card-back',
  cell: 'ls-cell',
  foil: 'ls-foil',
  brush: 'ls-brush',
  flake: 'ls-flake',
  confetti: 'ls-confetti',
  sparkle: 'ls-sparkle',
  glow: 'ls-glow',
  stamp: 'ls-stamp',
  soundOn: 'ls-sound-on',
  soundOff: 'ls-sound-off',
} as const;

/** 구운 텍스처: 이름 → 캔버스 */
export type TextureSet = Map<string, HTMLCanvasElement>;

/** 빈 캔버스와 2D 문맥 */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** SVG를 size 픽셀 정사각형 캔버스로 굽는다 */
async function rasterize(body: string, size: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDocument(body, size))}`;
  await img.decode();
  const [c, ctx] = canvas(size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return c;
}

/** 둥근 사각형 경로 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 금색 세로 그라데이션 */
function goldGradient(ctx: CanvasRenderingContext2D, y1: number, y2: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y1, 0, y2);
  g.addColorStop(0, '#fff0a6');
  g.addColorStop(0.5, '#e8b23a');
  g.addColorStop(1, '#a8680f');
  return g;
}

/** 지폐처럼 가는 물결무늬를 깐다 */
function guilloche(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let k = 0; k < 26; k += 1) {
    ctx.beginPath();
    const base = (h / 26) * k + 10;
    for (let x = 0; x <= w; x += 6) {
      const y = base + Math.sin(x / 38 + k * 0.7) * 9 + Math.sin(x / 13 + k) * 2.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 복권 앞면 바탕: 남색 + 금 테두리 + 물결무늬 + 머리(문장·제목) + 당첨표 + 긁는 칸 자리.
 * 카드마다 같은 부분은 여기 다 구워서, 새 카드를 놓을 때 만들 객체를 줄인다(설계 §3-7)
 */
function drawCardBg(emblem: HTMLCanvasElement, symbols: HTMLCanvasElement[]): HTMLCanvasElement {
  const [c, ctx] = canvas(CARD_W, CARD_H);
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 30);
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#22356b');
  bg.addColorStop(0.55, '#162650');
  bg.addColorStop(1, '#0d1734');
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.clip();
  guilloche(ctx, CARD_W, CARD_H, 'rgba(232, 178, 58, 0.09)');
  // 왼쪽 위에서 비치는 빛
  const shine = ctx.createRadialGradient(120, 60, 10, 120, 60, 520);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();

  // 테두리: 바깥 금색 + 안쪽 가는 선
  roundRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, 27);
  ctx.lineWidth = 8;
  ctx.strokeStyle = goldGradient(ctx, 0, CARD_H);
  ctx.stroke();
  roundRect(ctx, 18, 18, CARD_W - 36, CARD_H - 36, 18);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(240, 200, 100, 0.55)';
  ctx.stroke();
  ctx.setLineDash([]);

  // 머리: 문장, 제목, 부제
  ctx.drawImage(emblem, 38, 34, 108, 108);
  ctx.fillStyle = goldGradient(ctx, 48, 100);
  ctx.font = `800 48px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('까치 즉석복권', 162, 92);
  ctx.fillStyle = '#f6e7c1';
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText('같은 그림 3개면 당첨!', 164, 130);

  // 당첨표: 그림 · 등수 · 금액
  roundRect(ctx, 28, LEGEND_Y - 6, CARD_W - 56, 132, 18);
  ctx.fillStyle = 'rgba(5, 10, 28, 0.45)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(232, 178, 58, 0.45)';
  ctx.stroke();
  ctx.textAlign = 'center';
  PRIZE_TABLE.forEach((tier, i) => {
    const cx = 28 + LEGEND_COL_W * (i + 0.5);
    ctx.drawImage(symbols[i]!, cx - SYMBOL_SMALL_SIZE / 2, LEGEND_Y + 2);
    ctx.fillStyle = hex(RANK_COLORS[i as SymbolId]);
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(`${tier.rank}등`, cx, LEGEND_Y + 84);
    ctx.fillStyle = '#f6e7c1';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(shortWon(tier.prize), cx, LEGEND_Y + 108);
  });
  ctx.textAlign = 'left';

  // 긁는 칸 자리: 안으로 들어간 판
  roundRect(ctx, GRID_X - 14, GRID_Y - 14, GRID_W + 28, GRID_W + 28, 24);
  const well = ctx.createLinearGradient(0, GRID_Y, 0, GRID_Y + GRID_W);
  well.addColorStop(0, '#070d22');
  well.addColorStop(1, '#0f1a3d');
  ctx.fillStyle = well;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldGradient(ctx, GRID_Y, GRID_Y + GRID_W);
  ctx.stroke();

  // 바닥줄 안내
  ctx.fillStyle = 'rgba(246, 231, 193, 0.75)';
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText('은박을 긁어 그림을 확인하세요', 40, CARD_H - 40);
  return c;
}

/** 복권 뒷면(쌓인 복권): 남색 + 무늬 + 가운데 문장 */
function drawCardBack(emblem: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvas(CARD_W, CARD_H);
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 30);
  ctx.fillStyle = '#14214a';
  ctx.fill();
  ctx.save();
  ctx.clip();
  guilloche(ctx, CARD_W, CARD_H, 'rgba(232, 178, 58, 0.12)');
  ctx.restore();
  roundRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, 27);
  ctx.lineWidth = 8;
  ctx.strokeStyle = goldGradient(ctx, 0, CARD_H);
  ctx.stroke();
  ctx.drawImage(emblem, CARD_W / 2 - 90, CARD_H / 2 - 90, 180, 180);
  return c;
}

/** 드러난 칸 바탕: 크림색 + 안쪽 그림자 */
function drawCell(): HTMLCanvasElement {
  const [c, ctx] = canvas(CELL, CELL);
  roundRect(ctx, 0, 0, CELL, CELL, 18);
  const g = ctx.createRadialGradient(CELL / 2, CELL / 2, 20, CELL / 2, CELL / 2, CELL * 0.75);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(1, '#efe2c4');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(120, 90, 40, 0.18)';
  roundRect(ctx, -3, -3, CELL + 6, CELL + 6, 22);
  ctx.stroke();
  ctx.restore();
  return c;
}

/** 은박: 칸마다 은색 그라데이션 + 잔무늬 + 돋을새김 물음표. 칸 사이는 비운다 */
function drawFoil(): HTMLCanvasElement {
  const [c, ctx] = canvas(GRID_W, GRID_W);
  for (let i = 0; i < 9; i += 1) {
    const x = (i % 3) * (CELL + CELL_GAP);
    const y = Math.floor(i / 3) * (CELL + CELL_GAP);
    ctx.save();
    roundRect(ctx, x, y, CELL, CELL, 18);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
    g.addColorStop(0, '#f4f6f9');
    g.addColorStop(0.35, '#b9c0ca');
    g.addColorStop(0.55, '#e9edf2');
    g.addColorStop(0.8, '#9ea6b2');
    g.addColorStop(1, '#cfd5dd');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, CELL, CELL);
    // 비스듬한 잔줄
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    for (let d = -CELL; d < CELL * 2; d += 7) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d - CELL, y + CELL);
      ctx.stroke();
    }
    // 반짝이는 점
    for (let k = 0; k < 140; k += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(90,98,112,0.35)';
      ctx.fillRect(x + Math.random() * CELL, y + Math.random() * CELL, 1.6, 1.6);
    }
    // 돋을새김 물음표
    ctx.font = `800 92px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(70, 78, 92, 0.32)';
    ctx.fillText('?', x + CELL / 2 + 2, y + CELL / 2 + 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText('?', x + CELL / 2 - 1, y + CELL / 2 + 2);
    ctx.restore();
    // 테두리 광택
    roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 17);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.stroke();
  }
  return c;
}

/** 붓: 가장자리가 거친 원. 이 모양으로 은박을 지운다 */
function drawBrush(): HTMLCanvasElement {
  const size = BRUSH_RADIUS * 2 + 8;
  const [c, ctx] = canvas(size, size);
  const mid = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mid, mid, BRUSH_RADIUS - 6, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 70; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = BRUSH_RADIUS - 8 + Math.random() * 8;
    ctx.beginPath();
    ctx.arc(mid + Math.cos(a) * r, mid + Math.sin(a) * r, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** 은박 부스러기 */
function drawFlake(): HTMLCanvasElement {
  const [c, ctx] = canvas(14, 12);
  ctx.beginPath();
  ctx.moveTo(1, 4);
  ctx.lineTo(8, 0);
  ctx.lineTo(13, 6);
  ctx.lineTo(6, 11);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 14, 12);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#8e97a4');
  ctx.fillStyle = g;
  ctx.fill();
  return c;
}

/** 색종이 조각(흰색. 뿌릴 때 색을 입힌다) */
function drawConfetti(): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 9);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 0, 0, 16, 9, 2);
  ctx.fill();
  return c;
}

/** 네 갈래 반짝임 */
function drawSparkle(): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 64);
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.quadraticCurveTo(35, 29, 62, 32);
  ctx.quadraticCurveTo(35, 35, 32, 62);
  ctx.quadraticCurveTo(29, 35, 2, 32);
  ctx.quadraticCurveTo(29, 29, 32, 2);
  ctx.fill();
  return c;
}

/** 부드러운 빛 덩어리 */
function drawGlow(): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

/** 꽝 도장: 빨간 이중 테두리 + "꽝". 잉크가 덜 묻은 자리를 군데군데 뺀다 */
function drawStamp(): HTMLCanvasElement {
  const size = 240;
  const [c, ctx] = canvas(size, size);
  const mid = size / 2;
  ctx.strokeStyle = '#d8323f';
  ctx.fillStyle = '#d8323f';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(mid, mid, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(mid, mid, 88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `900 112px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('꽝', mid, mid + 6);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i += 1) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** 소리 켜짐·꺼짐 아이콘 (스피커 + 물결 / ×) */
function soundIcon(on: boolean): string {
  const body = '<path d="M20 48 H40 L66 26 V102 L40 80 H20 Z" fill="#ffffff" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/>';
  const waves = '<path d="M80 48 Q90 64 80 80 M92 36 Q110 64 92 92" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>';
  const cross = '<path d="M82 50 L108 76 M108 50 L82 76" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>';
  return body + (on ? waves : cross);
}

/** 화면에 쓰는 텍스처를 모두 굽는다 */
export async function buildTextures(): Promise<TextureSet> {
  const set: TextureSet = new Map();
  // 칸(약 130px)과 당첨표(약 58px)에 쓸 크기로 따로 굽는다. 크게 구워 많이 줄이면 테두리가 거칠어진다
  const ids = Array.from({ length: SYMBOL_COUNT }, (_, s) => s as SymbolId);
  const [large, small] = await Promise.all([
    Promise.all(ids.map((s) => rasterize(SYMBOL_SVGS[s], SYMBOL_SIZE))),
    Promise.all(ids.map((s) => rasterize(SYMBOL_SVGS[s], SYMBOL_SMALL_SIZE))),
  ]);
  ids.forEach((s) => {
    set.set(TEX.symbol(s), large[s]!);
    set.set(TEX.symbolSmall(s), small[s]!);
  });
  const [coin, emblem, soundOn, soundOff] = await Promise.all([
    rasterize(COIN_SVG, COIN_SIZE),
    rasterize(EMBLEM_SVG, 256),
    rasterize(soundIcon(true), 96),
    rasterize(soundIcon(false), 96),
  ]);
  set.set(TEX.coin, coin);
  set.set(TEX.emblem, emblem);
  set.set(TEX.soundOn, soundOn);
  set.set(TEX.soundOff, soundOff);
  set.set(TEX.cardBg, drawCardBg(emblem, small));
  set.set(TEX.cardBack, drawCardBack(emblem));
  set.set(TEX.cell, drawCell());
  set.set(TEX.foil, drawFoil());
  set.set(TEX.brush, drawBrush());
  set.set(TEX.flake, drawFlake());
  set.set(TEX.confetti, drawConfetti());
  set.set(TEX.sparkle, drawSparkle());
  set.set(TEX.glow, drawGlow());
  set.set(TEX.stamp, drawStamp());
  return set;
}
