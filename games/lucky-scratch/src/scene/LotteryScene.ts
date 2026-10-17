// 복권 긁기 화면. 카드 그리기, 은박 긁기, 결과 연출, 구매·정산 패널, 시간 진행을 맡는다. 규칙 판정은 logic이 한다.
// 근거: docs/design/261016-02-lucky-scratch.md §3

import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '@magpie/shared';
import type { HudState, PlayResult } from '@magpie/shared/game-module';
import {
  BUY_OPTIONS,
  CELL_COUNT,
  MAX_TICKETS,
  MIN_SCRATCH_TICKS,
  PRIZE_TABLE,
  TICKET_PRICE,
  TIME_LIMIT_TICKS,
  buyBlock,
  buyTickets,
  createState,
  drawTicket,
  isBroke,
  isOver,
  scratchNext,
  type LotteryInput,
  type LotteryState,
  type Rank,
  type SymbolId,
  type Ticket,
} from '../logic/rules';
import { BRUSH_RADIUS, CARD_H, CARD_W, CELL, CELL_GAP, FONT, GRID_W, GRID_X, GRID_Y, LEGEND_COL_W, LEGEND_Y, TEX, type TextureSet } from './art';
import { hex, won } from './format';
import type { Sfx } from './sound';
import { RANK_COLORS } from './symbols';
import { Button, mix, type ScenePalette } from './ui';

/** 화면 배치. 가로면 카드 옆에 패널, 세로면 카드 아래에 패널 */
export type Layout = 'landscape' | 'portrait';

export interface LotterySceneOptions {
  seed: string;
  layout: Layout;
  palette: ScenePalette;
  textures: TextureSet;
  sfx: Sfx;
  onHud(state: HudState): void;
  onEnd(result: PlayResult<LotteryInput>): void;
}

const SIZES: Record<Layout, { width: number; height: number }> = {
  landscape: { width: 1560, height: 1000 },
  portrait: { width: 720, height: 1400 },
};

/** 배치에 맞는 캔버스 크기 */
export function canvasSize(layout: Layout): { width: number; height: number } {
  return SIZES[layout];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 배치별 카드 중심과 패널 영역 */
function geometry(layout: Layout): { cardX: number; cardY: number; panel: Rect } {
  if (layout === 'landscape') return { cardX: 40 + CARD_W / 2, cardY: 40 + CARD_H / 2, panel: { x: 740, y: 40, w: 780, h: 920 } };
  return { cardX: 40 + CARD_W / 2, cardY: 24 + CARD_H / 2, panel: { x: 40, y: 984, w: 640, h: 396 } };
}

// 쌓인 복권 한 장마다 어긋나는 거리, 최대 보여 줄 장수
const STACK_OFFSET = 7;
const STACK_MAX = 4;
// 칸 하나를 몇 × 몇 점으로 나눠 긁힌 정도를 세는지, 몇 %가 긁히면 칸이 벗겨지는지
const COVER_GRID = 10;
const COVER_REVEAL = 0.5;
// 붓 판정 반지름: 보이는 붓보다 조금 작게 세서, 칸이 덜 긁혔는데 벗겨지는 일이 없게 한다
const COVER_RADIUS = BRUSH_RADIUS - 2;
// "한 번에 긁기"가 은박을 다 쓸어 내는 시간(ms)
const SWEEP_MS = 560;
// 상단 막대 갱신 간격 (6틱 = 0.1초)
const HUD_EVERY_TICKS = 6;
const CONFETTI_COLORS = [0xf2b632, 0xec4f5c, 0x3fb4ea, 0x4cb85a, 0xa46bf5, 0xffffff];
// 결과에서 당첨이 아닌 그림을 어둡게 누르는 색
const DIM_TINT = 0x8c8c8c;

/** 지금 화면에 놓인 복권 한 장 */
interface CardView {
  ticket: Ticket;
  root: Phaser.GameObjects.Container;
  foil: Phaser.GameObjects.RenderTexture;
  symbols: Phaser.GameObjects.Image[];
  legend: Phaser.GameObjects.Graphics[];
  /** 칸마다 긁힌 점 표시 */
  coverage: Uint8Array[];
  covered: number[];
  revealed: boolean[];
  revealedCount: number;
}

/** 구매·정산 패널의 바뀌는 부분 */
interface PanelView {
  root: Phaser.GameObjects.Container;
  money: Phaser.GameObjects.Text;
  tickets: Phaser.GameObjects.Text;
  buy: Button[];
  sweep: Button;
  settle: Button;
  stats: Phaser.GameObjects.Text | null;
  chips: Phaser.GameObjects.Container;
  sound: Phaser.GameObjects.Image;
}

type Phase = 'scratching' | 'resolved' | 'empty' | 'ending';

export class LotteryScene extends Phaser.Scene {
  private readonly opts: LotterySceneOptions;
  private layout: Layout;
  private readonly state: LotteryState = createState();
  private readonly inputs: LotteryInput[] = [];
  private tick = 0;
  private startedAt = 0;
  private ended = false;
  private lastScratchTick = -MIN_SCRATCH_TICKS;
  private phase: Phase = 'scratching';
  private card: CardView | null = null;
  private backs: Phaser.GameObjects.Image[] = [];
  private panel: PanelView | null = null;
  private message: Phaser.GameObjects.Container | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;
  private stroke: { x: number; y: number } | null = null;
  private sweep: { points: { x: number; y: number }[]; done: number; startedAt: number } | null = null;
  private pendingResolve = false;
  private advanceTimer: Phaser.Time.TimerEvent | null = null;
  private flakes!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private displayMoney = 0;
  private moneyTween: Phaser.Tweens.Tween | null = null;
  private wins = 0;
  private bestRank: Rank = 0;
  private readonly recent: Rank[] = [];

  constructor(opts: LotterySceneOptions) {
    super('lucky-scratch');
    this.opts = opts;
    this.layout = opts.layout;
  }

  /** 텍스처를 올리고 첫 복권을 놓은 뒤 시간을 잰다 */
  create(): void {
    for (const [key, source] of this.opts.textures) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, source);
    }
    this.flakes = this.add
      .particles(0, 0, TEX.flake, {
        lifespan: { min: 380, max: 760 },
        speed: { min: 60, max: 240 },
        angle: { min: 200, max: 340 },
        gravityY: 1100,
        rotate: { min: 0, max: 360 },
        scale: { min: 0.7, max: 1.5 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(40);
    this.sparkles = this.add
      .particles(0, 0, TEX.sparkle, {
        lifespan: { min: 500, max: 900 },
        speed: { min: 80, max: 300 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(45);

    this.buildPanel();
    this.dealCard(false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.onDown(p, over));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.onUp());
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => this.onUp());
    this.input.keyboard?.addCapture('SPACE');
    this.input.keyboard?.on('keydown-SPACE', () => this.sweepOrNext());

    this.startedAt = performance.now();
    this.emitHud();
  }

  /** 실제로 흐른 시간으로 틱을 센다. 제한 시간이 되면 판을 끝낸다 */
  override update(): void {
    if (this.ended) return;
    const elapsed = performance.now() - this.startedAt;
    const tick = Math.min(TIME_LIMIT_TICKS, Math.floor((elapsed * TICKS_PER_SECOND) / 1000));
    if (tick !== this.tick) {
      this.tick = tick;
      if (tick >= TIME_LIMIT_TICKS) {
        this.finish();
        return;
      }
      if (tick % HUD_EVERY_TICKS === 0) this.emitHud();
    }
    if (this.sweep) this.stepSweep();
    if (this.pendingResolve && this.tick - this.lastScratchTick >= MIN_SCRATCH_TICKS) this.resolve();
  }

  /** 지금 판을 끝낸다(정산). 제한 시간, 셸의 "끝내기", 화면 가림, 파산에서 부른다. 긁지 않은 복권은 무효 */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.stroke = null;
    this.sweep = null;
    this.opts.sfx.scratchEnd();
    this.advanceTimer?.remove();
    this.closeDialog();
    this.input.enabled = false;
    this.emitHud();
    this.opts.onEnd({ seed: this.opts.seed, inputs: [...this.inputs], ticks: this.tick, score: this.state.money });
  }

  /** 배치를 바꾼다(영역이 가로·세로로 바뀌었을 때) */
  setLayout(layout: Layout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    if (!this.panel) return;
    const { width, height } = canvasSize(layout);
    this.scale.setGameSize(width, height);
    this.stroke = null;
    const g = geometry(layout);
    if (this.card) {
      this.tweens.killTweensOf(this.card.root);
      this.card.root.setPosition(g.cardX, g.cardY).setScale(1).setAngle(0).setAlpha(1);
    }
    this.updateBacks();
    this.panel.root.destroy();
    this.buildPanel();
    this.closeDialog();
    if (this.phase === 'empty') this.showEmptyMessage();
  }

  // ---------------------------------------------------------------- 카드

  /** 다음 복권을 쌓인 데서 꺼내 놓는다 */
  private dealCard(animate = true): void {
    const g = geometry(this.layout);
    const ticket = drawTicket(this.opts.seed, this.state.scratched);
    this.card = this.createCard(ticket, g.cardX, g.cardY);
    this.phase = 'scratching';
    this.hideMessage();
    if (animate) {
      const root = this.card.root;
      root.setPosition(g.cardX + STACK_OFFSET * 2, g.cardY + STACK_OFFSET * 2).setScale(0.97);
      this.tweens.add({ targets: root, x: g.cardX, y: g.cardY, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    }
    this.updateBacks();
    this.refreshPanel();
  }

  /** 복권 한 장을 만든다: 앞면 바탕, 당첨표, 9칸 그림, 은박, 일련번호 */
  private createCard(ticket: Ticket, x: number, y: number): CardView {
    const ox = -CARD_W / 2;
    const oy = -CARD_H / 2;
    const root = this.add.container(x, y).setDepth(10);
    root.add(this.add.image(ox, oy, TEX.cardBg).setOrigin(0));

    // 당첨표 그림·글자는 바탕에 구워져 있다. 여기서는 당첨 때 켤 강조 테두리만 만든다
    const legend = PRIZE_TABLE.map((_, i) => {
      const color = RANK_COLORS[i as SymbolId];
      const cx = ox + 28 + LEGEND_COL_W * (i + 0.5);
      const highlight = this.add.graphics().setAlpha(0);
      highlight.fillStyle(color, 0.3).fillRoundedRect(cx - LEGEND_COL_W / 2 + 5, oy + LEGEND_Y - 1, LEGEND_COL_W - 10, 118, 14);
      highlight.lineStyle(3, color, 1).strokeRoundedRect(cx - LEGEND_COL_W / 2 + 5, oy + LEGEND_Y - 1, LEGEND_COL_W - 10, 118, 14);
      root.add(highlight);
      return highlight;
    });

    const symbols = ticket.symbols.map((s, i) => {
      const { x: cx, y: cy } = this.cellCenter(i);
      root.add(this.add.image(ox + cx, oy + cy, TEX.cell));
      const img = this.add.image(ox + cx, oy + cy, TEX.symbol(s));
      root.add(img);
      return img;
    });

    const foil = this.add.renderTexture(ox + GRID_X, oy + GRID_Y, GRID_W, GRID_W).setOrigin(0);
    foil.stamp(TEX.foil, undefined, 0, 0, { originX: 0, originY: 0 });
    foil.render();
    root.add(foil);

    const serial = `No. ${this.opts.seed.slice(0, 4).toUpperCase()}-${String(ticket.index + 1).padStart(4, '0')}`;
    root.add(
      this.add
        .text(ox + CARD_W - 40, oy + CARD_H - 47, serial, { fontFamily: FONT, fontSize: '19px', fontStyle: '600', color: '#d9c48f' })
        .setOrigin(1, 0.5),
    );

    return {
      ticket,
      root,
      foil,
      symbols,
      legend,
      coverage: Array.from({ length: CELL_COUNT }, () => new Uint8Array(COVER_GRID * COVER_GRID)),
      covered: new Array<number>(CELL_COUNT).fill(0),
      revealed: new Array<boolean>(CELL_COUNT).fill(false),
      revealedCount: 0,
    };
  }

  /** 칸 i의 중심 (카드 왼쪽 위 기준) */
  private cellCenter(i: number): { x: number; y: number } {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return { x: GRID_X + col * (CELL + CELL_GAP) + CELL / 2, y: GRID_Y + row * (CELL + CELL_GAP) + CELL / 2 };
  }

  /** 카드 안 좌표(왼쪽 위 기준)를 화면 좌표로 */
  private cardToWorld(card: CardView, x: number, y: number): { x: number; y: number } {
    const s = card.root.scale;
    return { x: card.root.x + (x - CARD_W / 2) * s, y: card.root.y + (y - CARD_H / 2) * s };
  }

  /** 화면 좌표를 카드 안 좌표(왼쪽 위 기준)로 */
  private worldToCard(card: CardView, x: number, y: number): { x: number; y: number } {
    const s = card.root.scale;
    return { x: (x - card.root.x) / s + CARD_W / 2, y: (y - card.root.y) / s + CARD_H / 2 };
  }

  /** 쌓인 복권(뒷면)을 남은 장수만큼 카드 뒤에 보여 준다 */
  private updateBacks(): void {
    const g = geometry(this.layout);
    const behind = this.phase === 'empty' || this.phase === 'ending' ? this.state.tickets : Math.max(0, this.state.tickets - 1);
    const count = Math.min(STACK_MAX, behind);
    while (this.backs.length > count) this.backs.pop()!.destroy();
    while (this.backs.length < count) this.backs.push(this.add.image(0, 0, TEX.cardBack).setDepth(5));
    this.backs.forEach((img, k) => {
      const d = STACK_OFFSET * (count - k);
      img.setPosition(g.cardX + d, g.cardY + d).setDepth(5 + k);
    });
  }

  /** 다 긁은 카드를 옆으로 날려 보낸다 */
  private discardCard(): void {
    const card = this.card;
    if (!card) return;
    this.card = null;
    this.tweens.killTweensOf(card.root);
    card.root.setDepth(30);
    this.tweens.add({
      targets: card.root,
      x: card.root.x - CARD_W * 0.9,
      y: card.root.y - 80,
      angle: -16,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeIn',
      onComplete: () => card.root.destroy(),
    });
  }

  // ---------------------------------------------------------------- 긁기

  /** 누름: 결과를 보는 중이면 다음 장, 긁는 중이면 그 자리부터 바로 긁는다 */
  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    this.opts.sfx.unlock();
    if (this.ended || this.dialog || over.length > 0 || !this.card) return;
    const local = this.worldToCard(this.card, p.x, p.y);
    const inCard = local.x >= 0 && local.x <= CARD_W && local.y >= 0 && local.y <= CARD_H;
    if (!inCard) return;
    if (this.phase === 'resolved') {
      this.advance();
      return;
    }
    if (this.phase !== 'scratching' || this.sweep || this.pendingResolve) return;
    this.stroke = local;
    this.scratchSegment(local, local);
  }

  /** 끌기: 지난 위치와 지금 위치 사이를 촘촘히 긁는다 */
  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.stroke || !this.card || !p.isDown || this.phase !== 'scratching') return;
    const local = this.worldToCard(this.card, p.x, p.y);
    this.scratchSegment(this.stroke, local);
    this.stroke = local;
  }

  /** 뗌 */
  private onUp(): void {
    this.stroke = null;
    if (!this.sweep) this.opts.sfx.scratchEnd();
  }

  /** a에서 b까지(카드 안 좌표) 붓을 찍는다. 10px마다 찍어서 빠르게 그어도 끊기지 않는다 */
  private scratchSegment(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const card = this.card;
    if (!card) return;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / 10));
    let touched = false;
    for (let k = 1; k <= steps; k += 1) {
      const x = a.x + ((b.x - a.x) * k) / steps - GRID_X;
      const y = a.y + ((b.y - a.y) * k) / steps - GRID_Y;
      if (x < -BRUSH_RADIUS || y < -BRUSH_RADIUS || x > GRID_W + BRUSH_RADIUS || y > GRID_W + BRUSH_RADIUS) continue;
      card.foil.stamp(TEX.brush, undefined, x, y, { blendMode: Phaser.BlendModes.ERASE });
      this.markCoverage(card, x, y);
      touched = true;
    }
    if (!touched) return;
    card.foil.render();
    this.opts.sfx.scratch(dist);
    if (Math.random() < 0.35 + dist / 30) {
      const w = this.cardToWorld(card, b.x, b.y);
      this.flakes.emitParticleAt(w.x, w.y, 1 + Math.floor(Math.random() * 3));
    }
  }

  /** 붓이 지나간 자리(은박 안 좌표)를 칸별 점수판에 표시하고, 절반쯤 긁힌 칸은 벗긴다 */
  private markCoverage(card: CardView, gx: number, gy: number): void {
    const step = CELL / COVER_GRID;
    const r2 = COVER_RADIUS * COVER_RADIUS;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (card.revealed[i]) continue;
      const x0 = (i % 3) * (CELL + CELL_GAP);
      const y0 = Math.floor(i / 3) * (CELL + CELL_GAP);
      if (gx + COVER_RADIUS < x0 || gx - COVER_RADIUS > x0 + CELL || gy + COVER_RADIUS < y0 || gy - COVER_RADIUS > y0 + CELL) continue;
      const cov = card.coverage[i]!;
      for (let sy = 0; sy < COVER_GRID; sy += 1) {
        const dy = y0 + (sy + 0.5) * step - gy;
        if (dy * dy > r2) continue;
        for (let sx = 0; sx < COVER_GRID; sx += 1) {
          const dx = x0 + (sx + 0.5) * step - gx;
          const idx = sy * COVER_GRID + sx;
          if (dx * dx + dy * dy <= r2 && cov[idx] === 0) {
            cov[idx] = 1;
            card.covered[i]! += 1;
          }
        }
      }
      if (card.covered[i]! >= COVER_GRID * COVER_GRID * COVER_REVEAL) this.revealCell(card, i);
    }
  }

  /** 칸 은박을 마저 벗긴다: 빛이 번쩍, 부스러기, 그림이 톡 튀어나온다 */
  private revealCell(card: CardView, i: number): void {
    card.revealed[i] = true;
    card.revealedCount += 1;
    const x0 = (i % 3) * (CELL + CELL_GAP);
    const y0 = Math.floor(i / 3) * (CELL + CELL_GAP);
    card.foil.clear(x0 - 2, y0 - 2, CELL + 4, CELL + 4);
    card.foil.render();

    const c = this.cellCenter(i);
    const w = this.cardToWorld(card, c.x, c.y);
    const flash = this.add.image(w.x, w.y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setAlpha(0.75).setDepth(35);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.1, duration: 220, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
    this.flakes.emitParticleAt(w.x, w.y, 8);
    const symbol = card.symbols[i]!;
    symbol.setScale(0.82);
    this.tweens.add({ targets: symbol, scale: 1, duration: 240, ease: 'Back.easeOut' });
    this.opts.sfx.peel();

    if (card.revealedCount === CELL_COUNT) this.tryResolve();
  }

  /** "한 번에 긁기" 또는 (결과를 보는 중이면) 다음 장 */
  private sweepOrNext(): void {
    this.opts.sfx.unlock();
    if (this.ended || this.dialog) return;
    if (this.phase === 'resolved') this.advance();
    else if (this.phase === 'scratching' && !this.sweep && !this.pendingResolve) this.startSweep();
  }

  /** 은박 위를 지그재그로 쓸어 내는 길을 만든다 */
  private startSweep(): void {
    const rows = 7;
    const points: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r += 1) {
      const y = ((r + 0.5) * GRID_W) / rows;
      const leftToRight = r % 2 === 0;
      for (let x = -10; x <= GRID_W + 10; x += 14) points.push({ x: leftToRight ? x : GRID_W - x, y });
    }
    this.stroke = null;
    this.sweep = { points, done: 0, startedAt: performance.now() };
  }

  /** 쓸어 내기를 시간에 맞춰 진행한다. 끝나면 남은 칸을 모두 벗긴다 */
  private stepSweep(): void {
    const card = this.card;
    const sweep = this.sweep;
    if (!card || !sweep) return;
    const progress = Math.min(1, (performance.now() - sweep.startedAt) / SWEEP_MS);
    const target = Math.floor(progress * sweep.points.length);
    for (; sweep.done < target; sweep.done += 1) {
      const pt = sweep.points[sweep.done]!;
      card.foil.stamp(TEX.brush, undefined, pt.x, pt.y, { blendMode: Phaser.BlendModes.ERASE });
      this.markCoverage(card, pt.x, pt.y);
      if (sweep.done % 6 === 0) {
        const w = this.cardToWorld(card, pt.x + GRID_X, pt.y + GRID_Y);
        this.flakes.emitParticleAt(w.x, w.y, 2);
      }
      if (this.card !== card) return;
    }
    card.foil.render();
    this.opts.sfx.scratch(40);
    if (progress >= 1) {
      this.sweep = null;
      this.opts.sfx.scratchEnd();
      for (let i = 0; i < CELL_COUNT; i += 1) if (!card.revealed[i]) this.revealCell(card, i);
    }
  }

  // ---------------------------------------------------------------- 결과

  /** 9칸이 다 드러났다. 직전 긁기와 0.25초가 안 지났으면 기다렸다 낸다(로직의 긁기 간격 규칙) */
  private tryResolve(): void {
    if (this.phase !== 'scratching') return;
    if (this.tick - this.lastScratchTick < MIN_SCRATCH_TICKS) {
      this.pendingResolve = true;
      return;
    }
    this.resolve();
  }

  /** 복권 한 장을 다 긁었다: 로직에 반영하고 기록을 남긴 뒤 결과를 보여 준다 */
  private resolve(): void {
    const card = this.card;
    this.pendingResolve = false;
    if (!card || this.ended) return;
    this.stroke = null;
    this.sweep = null;
    this.opts.sfx.scratchEnd();
    const ticket = scratchNext(this.state, this.opts.seed);
    if (!ticket) return;
    this.inputs.push({ t: this.tick, op: 'scratch' });
    this.lastScratchTick = this.tick;
    this.phase = 'resolved';
    if (ticket.rank !== 0) {
      this.wins += 1;
      this.bestRank = this.bestRank === 0 ? ticket.rank : (Math.min(this.bestRank, ticket.rank) as Rank);
    }
    this.recent.unshift(ticket.rank);
    if (this.recent.length > 10) this.recent.pop();
    this.emitHud();
    const duration = this.playResult(card, ticket);
    this.refreshPanel();
    this.advanceTimer = this.time.delayedCall(duration, () => this.advance());
  }

  /** 결과 연출. 다음 장으로 넘어가기까지의 시간(ms)을 돌려준다 */
  private playResult(card: CardView, ticket: Ticket): number {
    const ox = -CARD_W / 2;
    const oy = -CARD_H / 2;
    if (ticket.rank === 0) {
      // 투명도를 낮추면 크림색 칸에서 그림이 바래 보여서, 어둡게 눌러 준다
      for (const s of card.symbols) s.setTint(DIM_TINT);
      const stamp = this.add
        .image(ox + GRID_X + GRID_W / 2, oy + GRID_Y + GRID_W / 2, TEX.stamp)
        .setScale(2)
        .setAlpha(0)
        .setAngle(-14);
      card.root.add(stamp);
      this.tweens.add({
        targets: stamp,
        scale: 1.2,
        alpha: 0.92,
        duration: 150,
        ease: 'Quad.easeIn',
        onComplete: () => this.cameras.main.shake(90, 0.003),
      });
      this.opts.sfx.lose();
      return 900;
    }

    const color = RANK_COLORS[(ticket.rank - 1) as SymbolId];
    const winSet = new Set(ticket.winCells);
    card.symbols.forEach((s, i) => {
      if (!winSet.has(i)) s.setTint(DIM_TINT);
    });
    const centers = ticket.winCells.map((i) => this.cellCenter(i));
    for (const [k, c] of centers.entries()) {
      const glow = this.add.image(ox + c.x, oy + c.y, TEX.glow).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0);
      const frame = this.add.graphics();
      frame.lineStyle(8, color, 1).strokeRoundedRect(ox + c.x - CELL / 2 + 2, oy + c.y - CELL / 2 + 2, CELL - 4, CELL - 4, 18);
      card.root.addAt([glow, frame], card.root.getIndex(card.foil) + 1);
      this.tweens.add({ targets: glow, alpha: 0.85, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 60 });
      const symbol = card.symbols[ticket.winCells[k]!]!;
      card.root.bringToTop(symbol);
      this.tweens.add({ targets: symbol, scale: 1.16, duration: 200, yoyo: true, repeat: 2, ease: 'Sine.easeInOut', delay: k * 80 });
    }
    const legend = card.legend[ticket.rank - 1]!;
    this.tweens.add({ targets: legend, alpha: 1, duration: 200 });
    this.tweens.add({ targets: legend, alpha: 0.45, duration: 420, yoyo: true, repeat: -1, delay: 200 });

    this.showBanner(card, ticket, color);
    const coinCount = ticket.rank === 5 ? 3 : ticket.rank === 4 ? 6 : ticket.rank === 3 ? 10 : 18;
    this.flyCoins(centers.map((c) => this.cardToWorld(card, c.x, c.y)), coinCount, this.state.money);

    if (ticket.rank >= 4) this.opts.sfx.winSmall();
    else if (ticket.rank === 3) this.opts.sfx.winMedium();
    else this.opts.sfx.winBig();

    if (ticket.rank <= 3) {
      for (const c of centers) {
        const w = this.cardToWorld(card, c.x, c.y);
        this.sparkles.emitParticleAt(w.x, w.y, 7);
      }
    }
    if (ticket.rank <= 2) {
      this.cameras.main.flash(320, 255, 214, 110);
      this.cameras.main.shake(420, 0.007);
      this.confetti();
      return 2800;
    }
    return ticket.rank === 3 ? 1700 : 1150;
  }

  /** 카드 머리 위에 걸리는 당첨 띠 */
  private showBanner(card: CardView, ticket: Ticket, color: number): void {
    const oy = -CARD_H / 2;
    const banner = this.add.container(0, oy + 88);
    const w = 600;
    const h = 136;
    const g = this.add.graphics();
    const dark = mix(color, 0x000000, 0.45);
    // 띠 꼬리
    g.fillStyle(dark, 1);
    g.fillTriangle(-w / 2 - 30, -h / 2 + 20, -w / 2 + 20, -h / 2 + 20, -w / 2 + 20, h / 2 + 10);
    g.fillTriangle(w / 2 + 30, -h / 2 + 20, w / 2 - 20, -h / 2 + 20, w / 2 - 20, h / 2 + 10);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(5, 0xfff3c4, 1).strokeRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 14);
    const big = ticket.rank <= 2;
    const title = this.add
      .text(0, -22, big ? `대박! ${ticket.rank}등 당첨` : `${ticket.rank}등 당첨!`, {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: '900',
        color: '#ffffff',
        stroke: hex(dark),
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    const amount = this.add
      .text(0, 36, `+${won(ticket.prize)}`, { fontFamily: FONT, fontSize: '40px', fontStyle: '800', color: '#fff3b0', stroke: hex(dark), strokeThickness: 8 })
      .setOrigin(0.5);
    banner.add([g, title, amount]);
    card.root.add(banner);
    banner.setScale(0.6, 0);
    this.tweens.add({ targets: banner, scaleX: 1, scaleY: 1, duration: 280, ease: 'Back.easeOut' });
  }

  /** 동전이 당첨 칸에서 소지금으로 날아가고, 내려앉을 때마다 소지금이 올라간다 */
  private flyCoins(from: { x: number; y: number }[], count: number, finalMoney: number): void {
    const panel = this.panel;
    if (!panel) return;
    const target = panel.money.getWorldTransformMatrix();
    const tx = target.tx + panel.money.width * 0.25;
    const ty = target.ty + panel.money.height * 0.5;
    const start = this.displayMoney;
    this.moneyTween?.stop();
    this.moneyTween = null;
    let landed = 0;
    for (let k = 0; k < count; k += 1) {
      const src = from[k % from.length]!;
      const coin = this.add.image(src.x, src.y, TEX.coin).setDepth(60).setScale(0.6);
      const cx = (src.x + tx) / 2 + (Math.random() - 0.5) * 200;
      const cy = Math.min(src.y, ty) - 160 - Math.random() * 120;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 520 + Math.random() * 160,
        delay: k * 45,
        ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const u = 1 - t;
          coin.setPosition(u * u * src.x + 2 * u * t * cx + t * t * tx, u * u * src.y + 2 * u * t * cy + t * t * ty);
          coin.setScale(0.6 + 0.5 * Math.sin(t * Math.PI));
        },
        onComplete: () => {
          coin.destroy();
          landed += 1;
          this.opts.sfx.coin(landed);
          this.setDisplayMoney(Math.round(start + ((finalMoney - start) * landed) / count));
          this.bump(panel.money);
        },
      });
    }
  }

  /** 색종이가 화면 위에서 쏟아진다 */
  private confetti(): void {
    const { width } = canvasSize(this.layout);
    const emitter = this.add
      .particles(0, -30, TEX.confetti, {
        x: { min: 0, max: width },
        lifespan: 3200,
        speedY: { min: 260, max: 620 },
        speedX: { min: -180, max: 180 },
        gravityY: 260,
        rotate: { min: 0, max: 360 },
        scaleX: { min: 0.7, max: 1.6 },
        scaleY: { min: 0.7, max: 1.3 },
        tint: CONFETTI_COLORS,
        emitting: false,
      })
      .setDepth(70);
    emitter.explode(180);
    this.time.delayedCall(3600, () => emitter.destroy());
  }

  /** 결과를 다 봤다: 다음 장, 또는 살지 정산할지 고르기, 또는 끝 */
  private advance(): void {
    if (this.phase !== 'resolved' || this.ended) return;
    this.advanceTimer?.remove();
    this.advanceTimer = null;
    this.discardCard();
    if (this.state.tickets > 0) {
      this.dealCard();
      return;
    }
    if (isOver(this.state)) {
      this.phase = 'ending';
      this.updateBacks();
      this.refreshPanel();
      this.showMessage(
        isBroke(this.state) ? '복권을 살 돈이 없어요' : `${MAX_TICKETS}장을 다 긁었어요`,
        `소지금 ${won(this.state.money)}으로 정산할게요`,
      );
      this.time.delayedCall(1500, () => this.finish());
      return;
    }
    this.phase = 'empty';
    this.updateBacks();
    this.refreshPanel();
    this.showEmptyMessage();
  }

  // ---------------------------------------------------------------- 구매·정산

  /** count장을 산다 */
  private buy(count: number): void {
    if (this.ended || this.phase === 'ending') return;
    if (buyBlock(this.state, count) !== null) {
      this.opts.sfx.deny();
      return;
    }
    buyTickets(this.state, count);
    this.inputs.push({ t: this.tick, op: 'buy', count });
    this.opts.sfx.buy();
    this.animateMoneyTo(this.state.money);
    if (this.panel) this.floatText(this.panel.money, `-${won(count * TICKET_PRICE)}`, 0xd9564a);
    this.emitHud();
    if (this.phase === 'empty') this.dealCard();
    else {
      this.updateBacks();
      this.refreshPanel();
    }
  }

  /** 정산: 남은 복권이 있으면 한 번 묻는다 */
  private settle(): void {
    if (this.ended || this.phase === 'ending') return;
    const left = this.state.tickets;
    if (left > 0) this.openConfirm(left);
    else this.finish();
  }

  /** "남은 복권 N장은 무효가 돼요" 확인 창 */
  private openConfirm(left: number): void {
    this.closeDialog();
    const { width, height } = canvasSize(this.layout);
    const { palette } = this.opts;
    const root = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, width, height, palette.bg, 0.6).setOrigin(0).setInteractive();
    const bw = Math.min(600, width - 60);
    const bh = 300;
    const box = this.add.graphics();
    box.fillStyle(palette.surface, 1).fillRoundedRect(width / 2 - bw / 2, height / 2 - bh / 2, bw, bh, 28);
    box.lineStyle(2, palette.border, 1).strokeRoundedRect(width / 2 - bw / 2, height / 2 - bh / 2, bw, bh, 28);
    const title = this.add
      .text(width / 2, height / 2 - 82, '지금 정산할까요?', { fontFamily: FONT, fontSize: '36px', fontStyle: '800', color: hex(palette.textStrong) })
      .setOrigin(0.5);
    const body = this.add
      .text(width / 2, height / 2 - 26, `긁지 않은 복권 ${left}장은 무효가 돼요.`, { fontFamily: FONT, fontSize: '26px', fontStyle: '500', color: hex(palette.text) })
      .setOrigin(0.5);
    const half = (bw - 60) / 2;
    const keep = new Button(this, {
      x: width / 2 - half / 2 - 10,
      y: height / 2 + 74,
      width: half,
      height: 84,
      label: '계속 긁기',
      style: 'secondary',
      palette,
      fontSize: 28,
      onPress: () => {
        this.opts.sfx.click();
        this.closeDialog();
      },
    });
    const done = new Button(this, {
      x: width / 2 + half / 2 + 10,
      y: height / 2 + 74,
      width: half,
      height: 84,
      label: '정산하기',
      style: 'primary',
      palette,
      fontSize: 28,
      onPress: () => {
        this.opts.sfx.click();
        this.finish();
      },
    });
    root.add([dim, box, title, body, keep, done]);
    this.dialog = root;
    this.stroke = null;
    this.opts.sfx.scratchEnd();
  }

  /** 확인 창을 닫는다 */
  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }

  // ---------------------------------------------------------------- 패널

  /** 구매·정산 패널을 만든다. 배치(가로·세로)에 따라 모양이 다르다 */
  private buildPanel(): void {
    const { palette, sfx } = this.opts;
    const { panel: area } = geometry(this.layout);
    const wide = this.layout === 'landscape';
    const root = this.add.container(0, 0).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(palette.surface, 1).fillRoundedRect(area.x, area.y, area.w, area.h, 28);
    bg.lineStyle(2, palette.border, 1).strokeRoundedRect(area.x, area.y, area.w, area.h, 28);
    root.add(bg);

    const gold = palette.dark ? 0xf2c14e : 0xb7791f;
    const label = (x: number, y: number, text: string, size: number) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '600', color: hex(palette.text2) });

    const left = area.x + (wide ? 48 : 30);
    const right = area.x + area.w - (wide ? 48 : 30);
    let money: Phaser.GameObjects.Text;
    let tickets: Phaser.GameObjects.Text;
    let soundX: number;
    let soundY: number;
    if (wide) {
      root.add(label(left, area.y + 52, '소지금', 28));
      money = this.add.text(left, area.y + 92, '', { fontFamily: FONT, fontSize: '84px', fontStyle: '800', color: hex(gold) });
      root.add(label(left, area.y + 222, '남은 복권', 28));
      tickets = this.add.text(left + 140, area.y + 210, '', { fontFamily: FONT, fontSize: '44px', fontStyle: '800', color: hex(palette.textStrong) });
      soundX = right - 20;
      soundY = area.y + 70;
    } else {
      root.add(label(left, area.y + 22, '소지금', 22));
      money = this.add.text(left, area.y + 50, '', { fontFamily: FONT, fontSize: '56px', fontStyle: '800', color: hex(gold) });
      root.add(label(right - 70, area.y + 22, '남은 복권', 22).setOrigin(1, 0));
      tickets = this.add
        .text(right - 70, area.y + 54, '', { fontFamily: FONT, fontSize: '44px', fontStyle: '800', color: hex(palette.textStrong) })
        .setOrigin(1, 0);
      soundX = right - 20;
      soundY = area.y + 56;
    }
    root.add([money, tickets]);

    // 소리 켜기·끄기
    const soundBg = this.add.circle(soundX, soundY, 34, palette.surfaceHover);
    const sound = this.add
      .image(soundX, soundY, sfx.muted ? TEX.soundOff : TEX.soundOn)
      .setScale(0.52)
      .setTint(palette.text2)
      .setInteractive({ useHandCursor: true });
    sound.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      const muted = sfx.toggleMute();
      sound.setTexture(muted ? TEX.soundOff : TEX.soundOn);
      sfx.click();
    });
    root.add([soundBg, sound]);

    // 구매 버튼
    const buyTop = wide ? area.y + 360 : area.y + 136;
    if (wide) {
      root.add(this.add.text(left, area.y + 300, '복권 사기', { fontFamily: FONT, fontSize: '30px', fontStyle: '800', color: hex(palette.textStrong) }));
      root.add(label(left + 140, area.y + 306, `한 장 ${won(TICKET_PRICE)}`, 24));
    }
    const buyH = wide ? 112 : 96;
    const gap = wide ? 18 : 16;
    const innerW = right - left;
    const buyW = (innerW - gap * (BUY_OPTIONS.length - 1)) / BUY_OPTIONS.length;
    const buy = BUY_OPTIONS.map((count, k) => {
      const b = new Button(this, {
        x: left + buyW / 2 + k * (buyW + gap),
        y: buyTop + buyH / 2,
        width: buyW,
        height: buyH,
        label: `${count}장`,
        sub: won(count * TICKET_PRICE),
        style: 'buy',
        palette,
        fontSize: wide ? 34 : 30,
        onPress: () => this.buy(count),
        onDenied: () => sfx.deny(),
      });
      root.add(b);
      return b;
    });

    // 한 번에 긁기 / 정산하기
    const actTop = buyTop + buyH + (wide ? 30 : 16);
    const actH = wide ? 100 : 86;
    let sweep: Button;
    let settle: Button;
    if (wide) {
      sweep = new Button(this, {
        x: left + innerW / 2,
        y: actTop + actH / 2,
        width: innerW,
        height: actH,
        label: '한 번에 긁기',
        sub: '스페이스',
        style: 'primary',
        palette,
        fontSize: 34,
        onPress: () => this.sweepOrNext(),
      });
      settle = new Button(this, {
        x: left + innerW / 2,
        y: actTop + actH + 18 + 44,
        width: innerW,
        height: 88,
        label: '정산하기',
        style: 'secondary',
        palette,
        fontSize: 30,
        onPress: () => {
          sfx.click();
          this.settle();
        },
      });
    } else {
      const sweepW = innerW * 0.62;
      sweep = new Button(this, {
        x: left + sweepW / 2,
        y: actTop + actH / 2,
        width: sweepW,
        height: actH,
        label: '한 번에 긁기',
        style: 'primary',
        palette,
        fontSize: 30,
        onPress: () => this.sweepOrNext(),
      });
      const settleW = innerW - sweepW - gap;
      settle = new Button(this, {
        x: right - settleW / 2,
        y: actTop + actH / 2,
        width: settleW,
        height: actH,
        label: '정산하기',
        style: 'secondary',
        palette,
        fontSize: 28,
        onPress: () => {
          sfx.click();
          this.settle();
        },
      });
    }
    root.add([sweep, settle]);

    // 기록과 최근 결과
    const stats = wide
      ? this.add.text(left, area.y + 772, '', { fontFamily: FONT, fontSize: '24px', fontStyle: '500', color: hex(palette.text2) })
      : null;
    if (stats) root.add(stats);
    const chips = this.add.container(left, wide ? area.y + 832 : actTop + actH + 18);
    root.add(chips);

    this.panel = { root, money, tickets, buy, sweep, settle, stats, chips, sound };
    this.setDisplayMoney(this.displayMoney);
    this.refreshPanel();
  }

  /** 패널의 숫자·버튼 상태를 지금 상태에 맞춘다 */
  private refreshPanel(): void {
    const panel = this.panel;
    if (!panel) return;
    const { palette } = this.opts;
    panel.tickets.setText(`${this.state.tickets}장`);
    const active = !this.ended && this.phase !== 'ending';
    BUY_OPTIONS.forEach((count, k) => {
      const b = panel.buy[k]!;
      b.setEnabled(active && buyBlock(this.state, count) === null);
      b.setPulse(this.phase === 'empty' && buyBlock(this.state, count) === null);
    });
    panel.sweep.setEnabled(active && (this.phase === 'scratching' || this.phase === 'resolved'));
    panel.sweep.setText(this.phase === 'resolved' ? '다음 복권' : '한 번에 긁기');
    panel.settle.setEnabled(active);
    panel.settle.setPulse(this.phase === 'empty');
    if (panel.stats) {
      const best = this.bestRank === 0 ? '' : ` · 최고 ${this.bestRank}등`;
      panel.stats.setText(`긁은 복권 ${this.state.scratched}장 · 당첨 ${this.wins}회${best}`);
    }

    panel.chips.removeAll(true);
    const chipW = this.layout === 'landscape' ? 64 : 56;
    const chipH = this.layout === 'landscape' ? 44 : 40;
    const max = this.layout === 'landscape' ? 10 : 10;
    this.recent.slice(0, max).forEach((rank, k) => {
      const color = rank === 0 ? palette.text2 : RANK_COLORS[(rank - 1) as SymbolId];
      const x = k * (chipW + 8);
      const g = this.add.graphics();
      g.fillStyle(color, rank === 0 ? 0.12 : 0.2).fillRoundedRect(x, 0, chipW, chipH, chipH / 2);
      if (rank !== 0) g.lineStyle(2, color, 1).strokeRoundedRect(x, 0, chipW, chipH, chipH / 2);
      const t = this.add
        .text(x + chipW / 2, chipH / 2, rank === 0 ? '꽝' : `${rank}등`, {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: '800',
          color: hex(rank === 0 ? palette.text2 : mix(color, palette.dark ? 0xffffff : 0x000000, 0.15)),
        })
        .setOrigin(0.5);
      g.setAlpha(1 - k * 0.07);
      t.setAlpha(1 - k * 0.07);
      panel.chips.add([g, t]);
    });
  }

  /** 패널의 소지금 숫자를 바꾼다 */
  private setDisplayMoney(value: number): void {
    this.displayMoney = value;
    this.panel?.money.setText(won(value));
  }

  /** 소지금 숫자를 value까지 굴린다 */
  private animateMoneyTo(value: number): void {
    this.moneyTween?.stop();
    const from = this.displayMoney;
    this.moneyTween = this.tweens.addCounter({
      from,
      to: value,
      duration: 320,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => this.setDisplayMoney(Math.round(tw.getValue() ?? value)),
      onComplete: () => this.setDisplayMoney(value),
    });
  }

  /** 글자를 살짝 튀게 한다 */
  private bump(target: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(target);
    target.setScale(1.08);
    this.tweens.add({ targets: target, scale: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  /** 글자 옆에 잠깐 떠올랐다 사라지는 문구. 패널 밖으로 나가지 않게 오른쪽 끝을 넘지 않는다 */
  private floatText(anchor: Phaser.GameObjects.Text, text: string, color: number): void {
    const m = anchor.getWorldTransformMatrix();
    const { panel } = geometry(this.layout);
    const t = this.add
      .text(0, m.ty + anchor.height * 0.3, text, { fontFamily: FONT, fontSize: '30px', fontStyle: '800', color: hex(color) })
      .setDepth(65);
    t.setX(Math.min(m.tx + anchor.width + 16, panel.x + panel.w - t.width - 24));
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- 안내

  /** 복권을 다 긁었을 때 카드 자리에 띄우는 안내 */
  private showEmptyMessage(): void {
    this.showMessage('복권을 다 긁었어요', '더 사서 긁거나, 정산해서 기록을 남기세요');
  }

  /** 카드 자리에 빈 카드 테두리와 안내 문구를 띄운다 */
  private showMessage(title: string, body: string): void {
    this.hideMessage();
    const { palette } = this.opts;
    const g = geometry(this.layout);
    const root = this.add.container(g.cardX, g.cardY).setDepth(8);
    const frame = this.add.graphics();
    frame.fillStyle(palette.surface, 0.6).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 30);
    frame.lineStyle(4, palette.border, 1);
    // 점선 테두리
    const dash = 18;
    const gapLen = 12;
    const edges: [number, number, number, number][] = [
      [-CARD_W / 2 + 30, -CARD_H / 2, CARD_W / 2 - 30, -CARD_H / 2],
      [CARD_W / 2, -CARD_H / 2 + 30, CARD_W / 2, CARD_H / 2 - 30],
      [CARD_W / 2 - 30, CARD_H / 2, -CARD_W / 2 + 30, CARD_H / 2],
      [-CARD_W / 2, CARD_H / 2 - 30, -CARD_W / 2, -CARD_H / 2 + 30],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let d = 0; d < len; d += dash + gapLen) {
        const e = Math.min(d + dash, len);
        frame.lineBetween(x1 + ((x2 - x1) * d) / len, y1 + ((y2 - y1) * d) / len, x1 + ((x2 - x1) * e) / len, y1 + ((y2 - y1) * e) / len);
      }
    }
    const titleText = this.add
      .text(0, -30, title, { fontFamily: FONT, fontSize: '42px', fontStyle: '800', color: hex(palette.textStrong), align: 'center' })
      .setOrigin(0.5);
    const bodyText = this.add
      .text(0, 34, body, { fontFamily: FONT, fontSize: '26px', fontStyle: '500', color: hex(palette.text2), align: 'center', wordWrap: { width: CARD_W - 100 } })
      .setOrigin(0.5);
    root.add([frame, titleText, bodyText]);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 200 });
    this.message = root;
  }

  /** 안내를 내린다 */
  private hideMessage(): void {
    this.message?.destroy();
    this.message = null;
  }

  /** 상단 소지금·시간 막대를 갱신한다 */
  private emitHud(): void {
    this.opts.onHud({ score: this.state.money, timeLeftTicks: TIME_LIMIT_TICKS - this.tick, timeLimitTicks: TIME_LIMIT_TICKS });
  }
}
