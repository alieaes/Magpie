// 사과게임 화면. 판 그리기, 드래그 선택, 시간 진행만 맡는다. 규칙 판정은 logic이 한다.
// 근거: docs/design/261006-09-apple-ten.md §3

import Phaser from 'phaser';
import { TICKS_PER_SECOND } from '@magpie/shared';
import type { HudState, PlayResult } from '@magpie/shared/game-module';
import {
  COLS,
  ROWS,
  TIME_LIMIT_TICKS,
  cellIndex,
  createBoard,
  trySelect,
  type AppleInput,
  type Board,
  type CellRect,
} from '../logic';

/** 판 방향. 세로 화면에서는 판을 전치해서(가로·세로를 맞바꿔) 10 × 17로 그린다 */
export type Orientation = 'landscape' | 'portrait';

/** 셸의 CSS 변수에서 읽어 오는 색 (라이트·다크에 따라 다르다) */
export interface ScenePalette {
  tray: number;
  trayBorder: number;
  accent: number;
}

export interface AppleSceneOptions {
  seed: string;
  orientation: Orientation;
  palette: ScenePalette;
  onHud(state: HudState): void;
  onEnd(result: PlayResult<AppleInput>): void;
}

// 캔버스를 크게 잡고 화면에 맞춰 줄인다. 고해상도 화면에서도 흐려지지 않게 하기 위해서다
const CELL = 96;
const PAD = 28;
const APPLE_RADIUS = 38;
const APPLE_COLOR = 0xd9564a;
const LEAF_COLOR = 0x5e9b4f;
const APPLE_TEXTURE = 'apple';
const NUMBER_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Pretendard Variable", Pretendard, sans-serif',
  fontSize: '42px',
  fontStyle: '700',
  color: '#ffffff',
};
// 상단 막대 갱신 간격 (6틱 = 0.1초)
const HUD_EVERY_TICKS = 6;

/** 판 방향에 맞는 캔버스 크기 */
export function canvasSize(orientation: Orientation): { width: number; height: number } {
  const cols = orientation === 'landscape' ? COLS : ROWS;
  const rows = orientation === 'landscape' ? ROWS : COLS;
  return { width: cols * CELL + PAD * 2, height: rows * CELL + PAD * 2 };
}

/** 사각형 테두리를 점선으로 그린다 */
function strokeDashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const dash = 14;
  const gap = 9;
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < length; d += dash + gap) {
      const end = Math.min(d + dash, length);
      g.lineBetween(x1 + ((x2 - x1) * d) / length, y1 + ((y2 - y1) * d) / length, x1 + ((x2 - x1) * end) / length, y1 + ((y2 - y1) * end) / length);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}

export class AppleScene extends Phaser.Scene {
  private readonly opts: AppleSceneOptions;
  private orientation: Orientation;
  private board: Board | null = null;
  /** 로직 칸 인덱스마다 사과 그림. 지워지면 null */
  private apples: (Phaser.GameObjects.Container | null)[] = [];
  private rings: Phaser.GameObjects.Graphics[] = [];
  private tray!: Phaser.GameObjects.Graphics;
  private selection!: Phaser.GameObjects.Graphics;
  private dragStart: { x: number; y: number } | null = null;
  private highlighted: number[] = [];
  private readonly inputs: AppleInput[] = [];
  private score = 0;
  private tick = 0;
  private startedAt = 0;
  private ended = false;

  constructor(opts: AppleSceneOptions) {
    super('apple-ten');
    this.opts = opts;
    this.orientation = opts.orientation;
  }

  /** 판을 만들고 그린 뒤 시간을 잰다 */
  create(): void {
    this.board = createBoard(this.opts.seed);
    this.makeAppleTexture();
    this.tray = this.add.graphics();

    for (let i = 0; i < this.board.length; i += 1) {
      const ring = this.add.graphics();
      ring.lineStyle(6, this.opts.palette.accent, 1).strokeCircle(0, 4, APPLE_RADIUS + 6).setVisible(false);
      const body = this.add.image(0, 0, APPLE_TEXTURE);
      const label = this.add.text(0, 6, String(this.board[i]), NUMBER_STYLE).setOrigin(0.5);
      this.rings.push(ring);
      this.apples.push(this.add.container(0, 0, [ring, body, label]));
    }
    this.selection = this.add.graphics().setDepth(10);
    this.layout();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.onUp(p));

    this.startedAt = performance.now();
    this.emitHud();
  }

  /** 실제로 흐른 시간으로 틱을 센다. 제한 시간이 되면 판을 끝낸다 */
  override update(): void {
    if (this.ended || !this.board) return;
    const elapsed = performance.now() - this.startedAt;
    const tick = Math.min(TIME_LIMIT_TICKS, Math.floor((elapsed * TICKS_PER_SECOND) / 1000));
    if (tick === this.tick) return;
    this.tick = tick;
    if (tick >= TIME_LIMIT_TICKS) this.finish();
    else if (tick % HUD_EVERY_TICKS === 0) this.emitHud();
  }

  /** 지금 판을 끝낸다. 제한 시간, "끝내기" 버튼, 화면 가림에서 부른다 */
  finish(): void {
    if (this.ended || !this.board) return;
    this.ended = true;
    this.clearSelection();
    this.emitHud();
    this.opts.onEnd({ seed: this.opts.seed, inputs: [...this.inputs], ticks: this.tick, score: this.score });
  }

  /** 화면 방향을 바꾼다. 판이 아직 안 만들어졌으면 만들 때 반영된다 */
  setOrientation(orientation: Orientation): void {
    if (orientation === this.orientation) return;
    this.orientation = orientation;
    if (!this.board) return;
    const { width, height } = canvasSize(orientation);
    this.scale.setGameSize(width, height);
    this.clearSelection();
    this.layout();
  }

  /** 사과 바탕 그림(빨간 원 + 잎)을 한 번 만들어 둔다 */
  private makeAppleTexture(): void {
    if (this.textures.exists(APPLE_TEXTURE)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(APPLE_COLOR, 1).fillCircle(CELL / 2, CELL / 2 + 4, APPLE_RADIUS);
    g.fillStyle(LEAF_COLOR, 1).fillEllipse(CELL / 2 + 13, CELL / 2 - APPLE_RADIUS + 1, 24, 12);
    g.generateTexture(APPLE_TEXTURE, CELL, CELL);
    g.destroy();
  }

  /** 판 방향에 맞춰 판 바탕과 사과 위치를 다시 잡는다 */
  private layout(): void {
    const { width, height } = canvasSize(this.orientation);
    const { tray, trayBorder } = this.opts.palette;
    this.tray.clear();
    this.tray.fillStyle(tray, 1).fillRoundedRect(PAD / 2, PAD / 2, width - PAD, height - PAD, 24);
    this.tray.lineStyle(2, trayBorder, 1).strokeRoundedRect(PAD / 2, PAD / 2, width - PAD, height - PAD, 24);
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const apple = this.apples[cellIndex(c, r)];
        if (!apple) continue;
        const [dc, dr] = this.orientation === 'landscape' ? [c, r] : [r, c];
        apple.setPosition(PAD + dc * CELL + CELL / 2, PAD + dr * CELL + CELL / 2);
      }
    }
  }

  /** 화면 사각형 안에 중심이 들어오는 칸들을 로직 칸 좌표 사각형으로 바꾼다. 하나도 없으면 null */
  private cellsIn(a: { x: number; y: number }, b: { x: number; y: number }): CellRect | null {
    const displayCols = this.orientation === 'landscape' ? COLS : ROWS;
    const displayRows = this.orientation === 'landscape' ? ROWS : COLS;
    const toIndex = (v: number) => (v - PAD - CELL / 2) / CELL;
    const dc1 = Math.max(0, Math.ceil(toIndex(Math.min(a.x, b.x))));
    const dc2 = Math.min(displayCols - 1, Math.floor(toIndex(Math.max(a.x, b.x))));
    const dr1 = Math.max(0, Math.ceil(toIndex(Math.min(a.y, b.y))));
    const dr2 = Math.min(displayRows - 1, Math.floor(toIndex(Math.max(a.y, b.y))));
    if (dc1 > dc2 || dr1 > dr2) return null;
    return this.orientation === 'landscape'
      ? { c1: dc1, r1: dr1, c2: dc2, r2: dr2 }
      : { c1: dr1, r1: dc1, c2: dr2, r2: dc2 };
  }

  /** 드래그 시작 */
  private onDown(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    this.dragStart = { x: p.x, y: p.y };
  }

  /** 드래그 중: 사각형과 그 안의 사과 테두리를 그린다. 합계는 보여주지 않는다(원작과 같음) */
  private onMove(p: Phaser.Input.Pointer): void {
    if (this.ended || !this.dragStart || !p.isDown) return;
    const { x, y } = this.dragStart;
    this.selection.clear();
    this.selection.fillStyle(this.opts.palette.accent, 0.1).fillRect(Math.min(x, p.x), Math.min(y, p.y), Math.abs(p.x - x), Math.abs(p.y - y));
    this.selection.lineStyle(4, this.opts.palette.accent, 1);
    strokeDashedRect(this.selection, Math.min(x, p.x), Math.min(y, p.y), Math.abs(p.x - x), Math.abs(p.y - y));
    this.setHighlight(this.cellsIn(this.dragStart, p));
  }

  /** 드래그 끝: 합이 10이면 사과를 지우고 입력을 기록한다 */
  private onUp(p: Phaser.Input.Pointer): void {
    const start = this.dragStart;
    this.clearSelection();
    if (this.ended || !start || !this.board) return;
    const rect = this.cellsIn(start, p);
    if (!rect) return;
    const targets = this.indicesIn(rect).filter((i) => this.board![i] !== 0);
    const removed = trySelect(this.board, rect);
    if (removed === 0) return;
    this.inputs.push({ t: this.tick, ...rect });
    this.score += removed;
    for (const i of targets) this.popApple(i);
    this.emitHud();
  }

  /** 사각형 안 칸들의 로직 인덱스 */
  private indicesIn(rect: CellRect): number[] {
    const out: number[] = [];
    for (let r = rect.r1; r <= rect.r2; r += 1) for (let c = rect.c1; c <= rect.c2; c += 1) out.push(cellIndex(c, r));
    return out;
  }

  /** 선택 중인 사과에 테두리를 켠다 */
  private setHighlight(rect: CellRect | null): void {
    for (const i of this.highlighted) this.rings[i]?.setVisible(false);
    this.highlighted = rect ? this.indicesIn(rect).filter((i) => this.apples[i]) : [];
    for (const i of this.highlighted) this.rings[i]?.setVisible(true);
  }

  /** 선택 사각형과 테두리를 지운다 */
  private clearSelection(): void {
    this.dragStart = null;
    this.selection?.clear();
    this.setHighlight(null);
  }

  /** 지워진 사과가 살짝 튀어 오르며 사라진다 */
  private popApple(i: number): void {
    const apple = this.apples[i];
    if (!apple) return;
    this.apples[i] = null;
    this.tweens.add({
      targets: apple,
      y: apple.y - 18,
      scale: 1.2,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => apple.destroy(),
    });
  }

  /** 상단 점수·시간 막대를 갱신한다 */
  private emitHud(): void {
    this.opts.onHud({ score: this.score, timeLeftTicks: TIME_LIMIT_TICKS - this.tick, timeLimitTicks: TIME_LIMIT_TICKS });
  }
}
