// 장사 화면: 시계(HUD), 손님 카운터, 진열대, 빵틀, 펌프·화력, 콤보를 그리고 누름을 받는다.
// 규칙 판정은 logic이 하고, 여기는 지금 상태(DaySim)를 그리고 사건(DayEvent)을 연출한다.
// 근거: docs/design/261021-01-fish-bun.md §3~§5, docs/design/261021-02-fish-bun-customers.md §3-3, docs/design/261022-02-fish-bun-menu.md §2~§4,
// docs/design/261022-03-fish-bun-special-customers.md §1, §4

import Phaser from 'phaser';
import {
  DAY_TICKS,
  GOLD_WINDOW,
  HEAT_MAX,
  LAST_ARRIVAL_TICK,
  MENUS,
  REPAIR_HITS,
  cookSpeed,
  gameMinute,
  guessesMenu,
  levelOf,
  quoteSale,
  type Customer,
  type CustomerKind,
  type DayEvent,
  type DaySim,
  type Menu,
  type MoldPhase,
} from '../logic/rules';
import { BUN_SCALE, BUN_W, CRACK_LEVELS, MENU_ICON, MOLD_H, MOLD_W, PERSON_H, SHELF_H, SHELF_W, TEX, type IconName } from './art';
import { dayGeometry, inRect, moldCells, type DayGeometry, type Layout, type Rect } from './layout';
import { pickLine, saleLineKey, type LineKey } from './lines';
import type { Face } from './people';
import type { Sfx } from './sound';
import { DOT, PIXEL_ART, disc, framedBox, meter, roundBox, vGradient } from './style';
import { Button, clockText, hex, jaTextStyle, mix, num, textStyle, titleStyle, won, type ScenePalette } from './ui';

/** 장사 화면이 장면에 알리는 누름 */
export interface DayHandlers {
  /** 빵틀을 눌렀다. 빈 틀이면 menu 반죽을 붓는다. 입력이 받아들여졌으면 true */
  tap(index: number, menu: Menu): boolean;
  pump(on: boolean): void;
  /** menu 빵을 판다 */
  sell(seat: number, extra: boolean, menu: Menu): void;
  trash(): void;
  pause(): void;
  /** 반죽을 골랐다 (배치를 바꿔 다시 그려도 유지하게 장면이 기억한다) */
  batter(menu: Menu): void;
}

/** 손님 성격 표시 아이콘 */
const TRAIT_ICON: Partial<Record<CustomerKind, IconName>> = {
  kid: 'plusOne',
  office: 'clock',
  elder: 'noBurnt',
  creator: 'camera',
  reviewer: 'star',
  riddler: 'question',
  tourist: 'globe',
  rude: 'bolt',
};

/** 거절 사유의 짧은 안내 */
const DENY_TEXT: Record<string, string> = {
  no_money: '반죽 살 돈이 모자라요',
  locked_menu: '아직 열리지 않은 메뉴예요',
  shelf_full: '진열대가 가득 찼어요',
  no_stock: '빵이 모자라요',
};

/** 손님 한 명의 모습 */
interface CustomerView {
  customer: Customer;
  root: Phaser.GameObjects.Container;
  person: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  count: Phaser.GameObjects.Text;
  line: Phaser.GameObjects.Text;
  patience: Phaser.GameObjects.Graphics;
  give: Button;
  extra: Button;
  waitShown: boolean;
  lineTimer: Phaser.Time.TimerEvent | null;
}

/** 메뉴를 알아맞혀야 하는 손님에게 줄 때 뜨는 메뉴 고르기 */
interface MenuChooser {
  seat: number;
  root: Phaser.GameObjects.Container;
}

/** 빵틀 한 칸의 모습 */
interface MoldView {
  cell: Rect;
  cx: number;
  cy: number;
  a: Phaser.GameObjects.Image;
  b: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  /** 메뉴 표시 (빵틀 왼쪽 위. 뒤집은 붕어빵은 겉모습이 같아서 이것으로 구분한다) */
  mark: Phaser.GameObjects.Image;
  /** 깨진 틀의 금과 고치기 안내 */
  crack: Phaser.GameObjects.Image;
  hint: Phaser.GameObjects.Text;
  phase: MoldPhase;
  puffAt: number;
}

/** 키운 말풍선에서 대사 아래 끝의 높이 (말풍선 중심 기준, 아래 테두리 52) */
const BUBBLE_TEXT_BOTTOM = 40;

/** 0~1로 자른다 */
function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export class DayView {
  private readonly scene: Phaser.Scene;
  private readonly palette: ScenePalette;
  private readonly sfx: Sfx;
  private readonly handlers: DayHandlers;
  private readonly g: DayGeometry;
  readonly root: Phaser.GameObjects.Container;
  /** 카운터 층: 하늘·차양 → 손님 → 카운터 판 → 버튼·기다림 막대 */
  private readonly backLayer: Phaser.GameObjects.Container;
  private readonly peopleLayer: Phaser.GameObjects.Container;
  private readonly boardLayer: Phaser.GameObjects.Container;
  private readonly uiLayer: Phaser.GameObjects.Container;
  private readonly fx: Phaser.GameObjects.Container;
  private readonly seatX: number[];
  private readonly boardTop: number;
  private readonly personScale: number;
  private readonly seats: (CustomerView | null)[] = [];
  private readonly molds: MoldView[] = [];
  private moldScale = 1;
  private sky!: Phaser.GameObjects.Graphics;
  private skyMinute = -1;
  private clock!: Phaser.GameObjects.Text;
  private dayLabel!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Graphics;
  private money!: Phaser.GameObjects.Text;
  private shownMoney = -1;
  /** 그날 열린 메뉴 수. 둘 이상이면 반죽 고르기·메뉴 표시를 보여 준다 */
  private readonly menus: number;
  /** 그날의 상태 (하루 동안 같은 객체가 바뀐다) */
  private readonly sim: DaySim;
  /** 열려 있는 메뉴 고르기 */
  private chooser: MenuChooser | null = null;
  /** 지금 고른 반죽 */
  private batter: Menu;
  private readonly batterButtons: Button[] = [];
  /** 진열대 빵 아이콘 (팥 → 슈크림 → 피자 순서로 모아 놓는다) */
  private shelfIcons: Phaser.GameObjects.Image[] = [];
  private shelfMarks: Phaser.GameObjects.Image[] = [];
  /** 진열대에서 메뉴마다 첫 아이콘의 순번 */
  private shelfStart: number[] = [];
  private shelfSlots!: Phaser.GameObjects.Graphics;
  private shelfKey = '';
  private trashButton!: Button;
  private burner!: Phaser.GameObjects.Image;
  private pumpHandle!: Phaser.GameObjects.Image;
  private pumpTween: Phaser.Tweens.Tween | null = null;
  private gauge!: Phaser.GameObjects.Graphics;
  private heatText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private shownCombo = 0;
  private info: Phaser.GameObjects.Text | null = null;
  private steam!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private frame = 0;
  /** 쓸어 넘기기 중인 손가락과 그 동작 */
  private swipe: { pointerId: number; phase: MoldPhase; visited: Set<number> } | null = null;
  /** 펌프를 누르고 있는 손가락 */
  private pumpPointer: number | null = null;
  private wasPumping = false;
  private closingShown = false;

  constructor(scene: Phaser.Scene, layout: Layout, palette: ScenePalette, sfx: Sfx, sim: DaySim, handlers: DayHandlers, batter: Menu = 0) {
    this.scene = scene;
    this.palette = palette;
    this.sfx = sfx;
    this.handlers = handlers;
    this.sim = sim;
    this.menus = sim.params.menus;
    this.batter = batter < this.menus ? batter : 0;
    this.g = dayGeometry(layout, this.menus, scene.scale.height);
    this.root = scene.add.container(0, 0);
    this.backLayer = scene.add.container(0, 0);
    this.peopleLayer = scene.add.container(0, 0);
    this.boardLayer = scene.add.container(0, 0);
    this.uiLayer = scene.add.container(0, 0);
    this.root.add([this.backLayer, this.peopleLayer, this.boardLayer, this.uiLayer]);
    this.fx = scene.add.container(0, 0).setDepth(50);
    const { counter } = this.g;
    const seatW = counter.w / 3;
    this.seatX = [0, 1, 2].map((i) => counter.x + seatW * (i + 0.5));
    this.boardTop = counter.y + counter.h - 150;
    this.personScale = layout === 'portrait' ? 0.95 : 1.1;

    this.buildCounter(sim);
    this.buildBoard();
    this.buildHud(sim);
    this.buildShelf();
    this.buildGrill(sim);
    this.buildBatter();
    this.buildPump();
    this.buildParticles();
    sim.seats.forEach((customer, seat) => {
      this.seats[seat] = customer ? this.createCustomer(seat, customer, false) : null;
    });
    this.render(sim);
  }

  /** 화면을 정리한다 */
  destroy(): void {
    this.closeChooser();
    this.pumpTween?.stop();
    for (const v of this.seats) v?.lineTimer?.remove();
    this.root.destroy();
    this.fx.destroy();
    this.steam.destroy();
    this.smoke.destroy();
    this.sparkles.destroy();
  }

  // ---------------------------------------------------------------- 만들기

  /** 시계·날짜·돈·멈춤 */
  private buildHud(sim: DaySim): void {
    const { hud } = this.g;
    const p = this.palette;
    const bg = this.scene.add.graphics();
    bg.fillStyle(p.surface, 1).fillRect(hud.x, hud.y, hud.w, hud.h);
    bg.lineStyle(2, p.border, 1).lineBetween(hud.x, hud.y + hud.h, hud.x + hud.w, hud.y + hud.h);
    this.dayLabel = this.scene.add.text(24, hud.y + 34, `${num(sim.base.day)}일째`, textStyle(30, p.textStrong, '800')).setOrigin(0, 0.5);
    this.clock = this.scene.add
      .text(24 + this.dayLabel.width + 14, hud.y + 34, '', textStyle(26, p.text, '700'))
      .setOrigin(0, 0.5);
    const rep = this.scene.add
      .text(0, hud.y + 34, `평판 Lv${levelOf(sim.base.reputation)}`, textStyle(22, p.text2, '700'))
      .setOrigin(0, 0.5);
    rep.setX(this.clock.x + 170);
    this.progress = this.scene.add.graphics();
    const coin = this.scene.add.image(hud.w - 250, hud.y + 34, TEX.coin).setScale(0.5);
    this.money = this.scene.add.text(hud.w - 226, hud.y + 34, '', textStyle(30, p.textStrong, '800')).setOrigin(0, 0.5);
    const pause = this.scene.add.image(hud.w - 46, hud.y + 36, TEX.icon('pause')).setScale(0.8).setInteractive({ useHandCursor: true });
    pause.on(Phaser.Input.Events.POINTER_DOWN, () => this.handlers.pause());
    this.root.add([bg, this.dayLabel, this.clock, rep, this.progress, coin, this.money, pause]);
  }

  /** 하늘·차양·카운터 판 */
  private buildCounter(sim: DaySim): void {
    const { counter } = this.g;
    this.sky = this.scene.add.graphics();
    const city = this.scene.add.graphics();
    // 멀리 보이는 골목 건물
    city.fillStyle(0x2c3550, 0.22);
    const widths = [90, 70, 110, 80, 100, 60, 120, 90];
    let x = counter.x - 10;
    const right = counter.x + counter.w;
    for (let i = 0; x < right; i += 1) {
      const w = widths[i % widths.length]!;
      const h = 120 + ((i * 53) % 110);
      const left = Math.max(x, counter.x);
      city.fillRect(left, this.boardTop - h, Math.min(x + w - 8, right) - left, h);
      x += w;
    }
    city.fillStyle(0xffe9a8, 0.25);
    for (let wx = counter.x + 20; wx < right - 14; wx += 46) {
      for (let wy = this.boardTop - 100; wy < this.boardTop - 20; wy += 34) city.fillRect(wx, wy, 14, 16);
    }
    // 차양: 빨강·크림 줄무늬와 물결 끝
    const awning = this.scene.add.graphics();
    const stripe = 48;
    for (let i = 0; i * stripe < counter.w; i += 1) {
      const color = i % 2 === 0 ? 0xd9363e : 0xfff1dc;
      awning.fillStyle(color, 1).fillRect(counter.x + i * stripe, counter.y, stripe, 40);
      disc(awning, counter.x + i * stripe + stripe / 2, counter.y + 40, stripe / 2, color);
    }
    awning.fillStyle(0x000000, 0.12).fillRect(counter.x, counter.y, counter.w, 6);
    this.backLayer.add([this.sky, city, awning]);
    this.renderSky(sim);
  }

  /** 카운터 판(손님 앞). 손님 그림보다 앞에 그린다 */
  private buildBoard(): void {
    const { counter } = this.g;
    const board = this.scene.add.graphics();
    const top = this.boardTop;
    board.fillStyle(0x8a5a2b, 1).fillRect(counter.x, top, counter.w, counter.y + counter.h - top);
    board.fillStyle(0xb57a3c, 1).fillRect(counter.x, top, counter.w, 18);
    board.fillStyle(0x6b4220, 1).fillRect(counter.x, top + 18, counter.w, 6);
    board.lineStyle(2, 0x6b4220, 0.5);
    for (let y = top + 44; y < counter.y + counter.h; y += 30) board.lineBetween(counter.x, y, counter.x + counter.w, y);
    this.boardLayer.add(board);
  }

  /** 진열대와 탄 빵 버리기 */
  private buildShelf(): void {
    const { shelf, trash } = this.g;
    const tray = this.scene.add.graphics();
    framedBox(tray, shelf.x, shelf.y, shelf.w, shelf.h, 18, 0xc9ced6, 0x6f7680, 6);
    roundBox(tray, shelf.x + 12, shelf.y + 10, shelf.w - 24, 8, 4, 0xffffff, 0.35);
    this.shelfSlots = this.scene.add.graphics();
    this.root.add([tray, this.shelfSlots]);
    this.trashButton = new Button(this.scene, {
      x: trash.x + trash.w / 2,
      y: trash.y + trash.h / 2,
      width: trash.w,
      height: trash.h,
      label: '탄 빵',
      sub: '버리기',
      style: 'warm',
      palette: this.palette,
      fontSize: 24,
      onPress: () => this.handlers.trash(),
    });
    this.root.add(this.trashButton);
  }

  /** 화구와 빵틀 */
  private buildGrill(sim: DaySim): void {
    const { grill } = this.g;
    const plate = this.scene.add.graphics();
    roundBox(plate, grill.x - 8, grill.y - 8, grill.w + 16, grill.h + 16, 26, 0x2a2420);
    roundBox(plate, grill.x, grill.y, grill.w, grill.h, 20, 0x3a322c);
    this.burner = this.scene.add
      .image(grill.x + grill.w / 2, grill.y + grill.h * 0.7, TEX.glow)
      .setDisplaySize(grill.w * 1.1, grill.h * 0.9)
      .setTint(0xff6a1f)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add([plate, this.burner]);
    const { cells, scale } = moldCells(grill, sim.molds.length, MOLD_W, MOLD_H);
    this.moldScale = scale;
    cells.forEach((cell) => {
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      const base = this.scene.add.image(cx, cy, TEX.mold).setScale(scale);
      const glow = this.scene.add.image(cx, cy, TEX.glow).setScale((scale * MOLD_W) / 120).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      const bunScale = scale * BUN_SCALE;
      const a = this.scene.add.image(cx, cy - 2 * scale, TEX.batter('raw')).setScale(bunScale).setVisible(false);
      const b = this.scene.add.image(cx, cy - 2 * scale, TEX.batter('good')).setScale(bunScale).setVisible(false);
      const mark = this.scene.add
        .image(cx - (MOLD_W / 2 - 20) * scale, cy - (MOLD_H / 2 - 18) * scale, TEX.icon(MENU_ICON[0]!))
        .setScale(0.42 * scale)
        .setVisible(false);
      const crack = this.scene.add.image(cx, cy, TEX.crack(CRACK_LEVELS)).setScale(scale).setVisible(false);
      const hint = this.scene.add
        .text(cx, cy + (MOLD_H / 2 - 22) * scale, '', { ...textStyle(22, 0xffffff, '800'), stroke: '#1b1d20', strokeThickness: 6 })
        .setOrigin(0.5)
        .setVisible(false);
      this.root.add([base, glow, a, b, mark, crack, hint]);
      this.molds.push({ cell, cx, cy, a, b, glow, mark, crack, hint, phase: 'empty', puffAt: 0 });
    });
    // 지금 상태를 바로 맞춘다(배치를 바꿔 다시 그릴 때 등장 연출 없이)
    sim.molds.forEach((m, i) => (this.molds[i]!.phase = m.phase));
  }

  /** 반죽 고르기 버튼 (메뉴가 둘 이상 열린 날만). 고른 반죽이 빈 틀에 부어진다 */
  private buildBatter(): void {
    const area = this.g.batter;
    if (!area) return;
    const gap = 12;
    const w = (area.w - gap * (this.menus - 1)) / this.menus;
    for (let m = 0; m < this.menus; m += 1) {
      const button = new Button(this.scene, {
        x: area.x + m * (w + gap) + w / 2,
        y: area.y + area.h / 2,
        width: w,
        height: area.h,
        label: MENUS[m]!.name,
        sub: `반죽 ${won(MENUS[m]!.cost)}`,
        style: m === this.batter ? 'primary' : 'secondary',
        palette: this.palette,
        fontSize: 24,
        onPress: () => this.selectBatter(m),
      });
      button.add(this.scene.add.image(-w / 2 + 36, 0, TEX.icon(MENU_ICON[m]!)).setScale(0.6));
      this.batterButtons.push(button);
      this.root.add(button);
    }
  }

  /** 반죽을 고른다 */
  private selectBatter(menu: Menu): void {
    if (menu === this.batter) return;
    this.batter = menu;
    this.sfx.click();
    this.batterButtons.forEach((b, m) => b.setStyle(m === menu ? 'primary' : 'secondary'));
    this.handlers.batter(menu);
  }

  /** 펌프·화력 계기·콤보·(가로) 오늘 기록 */
  private buildPump(): void {
    const { pump, gauge, combo, info } = this.g;
    const p = this.palette;
    const panel = this.scene.add.graphics();
    for (const r of [pump, gauge, combo, ...(info ? [info] : [])]) framedBox(panel, r.x, r.y, r.w, r.h, 20, p.surface, p.border, 2);
    const scale = Math.min(1, (pump.h - 40) / 200) * 0.95;
    const px = pump.x + 54;
    const py = pump.y + pump.h / 2 + 6;
    const body = this.scene.add.image(px, py + 16 * scale, TEX.pumpBody).setScale(scale);
    this.pumpHandle = this.scene.add.image(px, py - 92 * scale, TEX.pumpHandle).setScale(scale);
    const label = this.scene.add.text(pump.x + 140, pump.y + pump.h / 2 - 28, '펌프', textStyle(28, p.textStrong, '800')).setOrigin(0.5);
    const hint = this.scene.add
      .text(pump.x + 140, pump.y + pump.h / 2 + 22, '누르고\n있기', textStyle(18, p.text2, '600'))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(2);
    this.gauge = this.scene.add.graphics();
    const flame = this.scene.add.image(gauge.x + 36, gauge.y + 40, TEX.icon('flame')).setScale(0.6);
    this.heatText = this.scene.add.text(gauge.x + 64, gauge.y + 40, '', textStyle(22, p.textStrong, '800')).setOrigin(0, 0.5);
    const comboLabel = this.scene.add.text(combo.x + combo.w / 2, combo.y + 30, '콤보', textStyle(20, p.text2, '700')).setOrigin(0.5);
    this.comboText = this.scene.add.text(combo.x + combo.w / 2, combo.y + combo.h / 2 + 14, '0', titleStyle(52, p.textStrong)).setOrigin(0.5);
    this.root.add([panel, body, this.pumpHandle, label, hint, this.gauge, flame, this.heatText, comboLabel, this.comboText]);
    if (info) {
      this.info = this.scene.add.text(info.x + 24, info.y + info.h / 2, '', textStyle(22, p.text, '600')).setOrigin(0, 0.5).setLineSpacing(8);
      this.root.add(this.info);
    }
  }

  /** 김·연기·반짝이 */
  private buildParticles(): void {
    this.steam = this.scene.add
      .particles(0, 0, TEX.steam, {
        lifespan: { min: 700, max: 1200 },
        speedY: { min: -70, max: -40 },
        speedX: { min: -12, max: 12 },
        // 도트 조각은 처음부터 제 크기라 덜 키운다
        scale: PIXEL_ART ? { start: 0.75, end: 1.25 } : { start: 0.35, end: 0.9 },
        alpha: { start: 0.5, end: 0 },
        emitting: false,
      })
      .setDepth(30);
    this.smoke = this.scene.add
      .particles(0, 0, TEX.smoke, {
        lifespan: { min: 900, max: 1500 },
        speedY: { min: -80, max: -50 },
        speedX: { min: -16, max: 16 },
        scale: PIXEL_ART ? { start: 0.75, end: 1.5 } : { start: 0.4, end: 1.1 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(30);
    this.sparkles = this.scene.add
      .particles(0, 0, TEX.sparkle, {
        lifespan: { min: 400, max: 800 },
        speed: { min: 60, max: 220 },
        scale: PIXEL_ART ? { start: 1, end: 0.5 } : { start: 1, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(55);
  }

  // ---------------------------------------------------------------- 손님

  /** 자리에 손님을 세운다. animate면 걸어 들어온다 */
  private createCustomer(seat: number, customer: Customer, animate: boolean): CustomerView {
    const x = this.seatX[seat]!;
    const s = this.personScale;
    const personY = this.boardTop + 40 - (PERSON_H * s) / 2;
    const person = this.scene.add.image(0, personY, TEX.person(customer.kind, customer.id % 2, 'normal')).setScale(s);
    const bubbleY = this.g.counter.y + 120;
    const bubble = this.scene.add.container(0, bubbleY);
    const bubbleBg = this.scene.add.graphics();
    const guesses = guessesMenu(customer.kind);
    // 대사를 먼저 만들어 줄 수를 잰다. 일본어는 띄어쓰기가 없어서 글자 단위로 줄을 바꾼다
    const lineText = pickLine(customer.kind, 'order', { count: customer.order, menu: guesses || this.menus > 1 ? customer.menu : null, lang: customer.lang });
    const lineStyle = customer.lang === 'ja' ? jaTextStyle(19, 0x5a4636) : textStyle(19, 0x5a4636, '700');
    const line = this.scene.add
      .text(0, 0, lineText, { ...lineStyle, align: 'center', wordWrap: { width: 196, useAdvancedWrap: customer.lang === 'ja' } })
      .setOrigin(0.5);
    // 대사가 두 줄을 넘거나 단서 대사(메뉴를 돌려 말하는 손님)면 말풍선을 위로 키워 대사 아래 끝을 맞춘다. 꼬리 위치는 같다
    const tall = guesses || line.getWrappedText(lineText).length > 2;
    const lineY = tall ? BUBBLE_TEXT_BOTTOM - line.height / 2 : 26;
    const rowY = tall ? BUBBLE_TEXT_BOTTOM - line.height - 26 : -18;
    const top = tall ? rowY - 30 : -52;
    line.setY(lineY);
    if (PIXEL_ART) {
      // 도트 말풍선: 어두운 테두리 상자 + 계단 꼬리
      framedBox(bubbleBg, -104, top, 208, 52 - top, 22, 0xffffff, 0x3a2a1a);
      for (let i = 0; i < 4; i += 1) {
        bubbleBg.fillStyle(0x3a2a1a, 1).fillRect(-16 + i * DOT, 48 + i * DOT, 32 - i * 2 * DOT, DOT);
        if (i < 3) bubbleBg.fillStyle(0xffffff, 1).fillRect(-12 + i * DOT, 48 + i * DOT, 24 - i * 2 * DOT, DOT);
      }
    } else {
      bubbleBg.fillStyle(0xffffff, 1).fillRoundedRect(-104, top + 2, 208, 48 - top, 22);
      bubbleBg.fillTriangle(-12, 48, 12, 48, 0, 64);
      bubbleBg.lineStyle(3, 0x3a2a1a, 0.18).strokeRoundedRect(-104, top + 2, 208, 48 - top, 22);
    }
    // 말풍선 윗줄: [성격 아이콘] [메뉴 아이콘] 개수. 메뉴가 하나뿐인 날은 메뉴 아이콘을 빼서 지금과 같다.
    // 메뉴를 알아맞혀야 하는 손님은 메뉴 아이콘 대신 "?"(수수께끼 손님은 성격 아이콘이 곧 "?"라 하나만)
    const trait = TRAIT_ICON[customer.kind];
    const menuIcon: IconName | null = guesses ? (customer.kind === 'tourist' ? 'question' : null) : this.menus > 1 ? MENU_ICON[customer.menu]! : null;
    const countX = trait && menuIcon ? 40 : trait || menuIcon ? 18 : 0;
    const count = this.scene.add.text(countX, rowY, `${customer.order}개`, textStyle(40, 0x3a2410, '900')).setOrigin(0.5);
    bubble.add([bubbleBg, count, line]);
    // 메뉴 아이콘은 성격 아이콘보다 크게 해서 둘이 섞여 보이지 않게 한다
    if (trait) bubble.add(this.scene.add.image(menuIcon ? -80 : -60, rowY, TEX.icon(trait)).setScale(menuIcon ? 0.45 : 0.55));
    if (menuIcon) bubble.add(this.scene.add.image(trait ? -30 : -46, rowY, TEX.icon(menuIcon)).setScale(0.8));
    const root = this.scene.add.container(x, 0, [person, bubble]);
    this.peopleLayer.add(root);

    const patience = this.scene.add.graphics();
    const give = new Button(this.scene, {
      x: x - 34,
      y: this.boardTop + 96,
      width: 140,
      height: 72,
      label: `${customer.order}개 주기`,
      sub: '',
      style: 'warm',
      palette: this.palette,
      fontSize: 24,
      onPress: () => (guesses ? this.requestChooser(seat, false) : this.handlers.sell(seat, false, customer.menu)),
      onDenied: () => this.denied(x - 34, this.boardTop + 70, 'no_stock'),
    });
    const extra = new Button(this.scene, {
      x: x + 72,
      y: this.boardTop + 96,
      width: 64,
      height: 72,
      label: '+1',
      sub: '덤',
      style: 'warm',
      palette: this.palette,
      fontSize: 26,
      onPress: () => (guesses ? this.requestChooser(seat, true) : this.handlers.sell(seat, true, customer.menu)),
      onDenied: () => this.denied(x + 72, this.boardTop + 70, 'no_stock'),
    });
    this.uiLayer.add([patience, give, extra]);
    const view: CustomerView = { customer, root, person, bubble, count, line, patience, give, extra, waitShown: false, lineTimer: null };
    // 메뉴를 돌려 말한 대사는 단서라서 지우지 않는다
    if (!guesses) view.lineTimer = this.scene.time.delayedCall(2200, () => this.fadeLine(view));
    if (animate) {
      root.setX(x + (seat === 0 ? -260 : 260)).setAlpha(0);
      this.scene.tweens.add({ targets: root, x, alpha: 1, duration: 360, ease: 'Cubic.easeOut' });
      bubble.setScale(0.4);
      this.scene.tweens.add({ targets: bubble, scale: 1, duration: 260, delay: 220, ease: 'Back.easeOut' });
    }
    return view;
  }

  /**
   * 메뉴 고르기를 다음 틈에 연다. 같은 누름을 장면도 받아서(pointerDown) "밖을 눌렀다"며 바로 닫지 않게,
   * 장면이 그 누름을 다 본 뒤에 연다
   */
  private requestChooser(seat: number, extra: boolean): void {
    this.scene.time.delayedCall(0, () => this.openChooser(seat, extra));
  }

  /** 메뉴 고르기를 연다: 그 손님 위에 열린 메뉴 버튼. 고르면 그 메뉴로 판다. 다른 곳을 누르면 닫힌다 */
  private openChooser(seat: number, extra: boolean): void {
    const view = this.seats[seat];
    if (!view) return;
    this.closeChooser();
    const count = view.customer.order + (extra ? 1 : 0);
    const { counter } = this.g;
    const w = 112;
    const h = 70;
    const gap = 8;
    const total = this.menus * w + (this.menus - 1) * gap;
    const left = Math.min(Math.max(this.seatX[seat]! - total / 2, counter.x + 12), counter.x + counter.w - total - 12);
    const y = this.boardTop + 4;
    const root = this.scene.add.container(0, 0);
    root.add(framedBox(this.scene.add.graphics(), left - 10, y - h / 2 - 10, total + 20, h + 20, 16, this.palette.surface, 0x3a2a1a, 3));
    for (let m = 0; m < this.menus; m += 1) {
      const stock = this.sim.shelves[m]!.length;
      const bx = left + m * (w + gap) + w / 2;
      const button = new Button(this.scene, {
        x: bx,
        y,
        width: w,
        height: h,
        label: MENUS[m]!.name,
        sub: `${stock}개`,
        style: 'warm',
        palette: this.palette,
        fontSize: 22,
        onPress: () => {
          this.handlers.sell(seat, extra, m);
          // 버튼이 자기 누름 처리 중에 사라지지 않게 다음 틈에 닫는다
          this.scene.time.delayedCall(0, () => this.closeChooser());
        },
        onDenied: () => this.denied(bx, y - 50, 'no_stock'),
      });
      button.add(this.scene.add.image(-w / 2 + 22, -h * 0.14, TEX.icon(MENU_ICON[m]!)).setScale(0.42));
      button.setEnabled(stock >= count);
      root.add(button);
    }
    this.fx.add(root);
    this.chooser = { seat, root };
    this.sfx.click();
  }

  /** 메뉴 고르기를 닫는다 */
  private closeChooser(): void {
    this.chooser?.root.destroy();
    this.chooser = null;
  }

  /** 대사를 흐리게 지운다 */
  private fadeLine(view: CustomerView): void {
    view.lineTimer = null;
    this.scene.tweens.add({ targets: view.line, alpha: 0, duration: 300 });
  }

  /** 대사를 바꿔 잠깐 보여 준다 */
  private say(view: CustomerView, text: string, hold = 1600): void {
    view.lineTimer?.remove();
    this.scene.tweens.killTweensOf(view.line);
    view.line.setText(text).setAlpha(1);
    view.lineTimer = this.scene.time.delayedCall(hold, () => this.fadeLine(view));
  }

  /** 손님을 자리에서 내보낸다: 표정·대사를 보여 준 뒤 걸어 나간다 */
  private dismiss(seat: number, face: Face, line: string | null, delay: number): void {
    const view = this.seats[seat];
    if (!view) return;
    this.seats[seat] = null;
    if (this.chooser?.seat === seat) this.closeChooser();
    view.give.destroy();
    view.extra.destroy();
    view.patience.destroy();
    view.person.setTexture(TEX.person(view.customer.kind, view.customer.id % 2, face));
    if (line) {
      view.count.setVisible(false);
      view.lineTimer?.remove();
      this.scene.tweens.killTweensOf(view.line);
      view.line.setText(line).setAlpha(1).setY(0).setFontSize(22);
    } else {
      view.bubble.setVisible(false);
    }
    this.scene.tweens.add({
      targets: view.root,
      x: view.root.x + (seat === 2 ? 280 : -280),
      alpha: 0,
      delay,
      duration: 420,
      ease: 'Cubic.easeIn',
      onComplete: () => view.root.destroy(),
    });
  }

  // ---------------------------------------------------------------- 사건 연출

  /** 로직이 남긴 사건을 연출한다 */
  handleEvents(events: DayEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'arrive':
          this.seats[e.seat]?.root.destroy();
          this.seats[e.seat] = this.createCustomer(e.seat, e.customer, true);
          this.sfx.bell();
          break;
        case 'leave': {
          if (e.reason === 'closing') {
            this.dismiss(e.seat, 'normal', null, 0);
            break;
          }
          const key: LineKey = e.reason === 'overtaken' ? 'overtaken' : 'leave';
          this.dismiss(e.seat, 'angry', pickLine(e.customer.kind, key, { menu: e.customer.menu, lang: e.customer.lang }), 700);
          this.sfx.angry();
          this.floatText(this.seatX[e.seat]!, this.boardTop - 40, `평판 ${e.rep}`, 0xe5414a, 26);
          break;
        }
        case 'sale':
          this.onSale(e);
          break;
        case 'stage': {
          const m = this.molds[e.mold];
          if (!m) break;
          if (e.stage === 'burnt') {
            this.sfx.burn();
            this.smoke.explode(4, m.cx, m.cy - 10);
          } else if (e.stage === 'good') {
            this.steam.explode(3, m.cx, m.cy - 10);
            this.scene.tweens.add({ targets: [m.a, m.b], scaleX: m.a.scaleX * 1.06, scaleY: m.a.scaleY * 1.06, duration: 120, yoyo: true });
          }
          break;
        }
        case 'shine': {
          const m = this.molds[e.mold];
          if (!m) break;
          this.sfx.shine();
          this.sparkles.explode(10, m.cx, m.cy);
          break;
        }
        case 'break': {
          const m = this.molds[e.mold];
          if (!m) break;
          this.sfx.crash();
          this.scene.cameras.main.shake(240, 0.008);
          this.smoke.explode(8, m.cx, m.cy);
          this.sparkles.explode(6, m.cx, m.cy);
          this.bang(m.cx, m.cy - 20);
          break;
        }
        case 'repair': {
          const m = this.molds[e.mold];
          if (!m) break;
          this.sfx.hammer(e.fixed);
          if (e.fixed) {
            this.steam.explode(5, m.cx, m.cy);
            this.floatText(m.cx, m.cy - 30, '다 고쳤어요', 0x2e9e5b, 24);
          } else {
            this.scene.tweens.add({ targets: m.crack, x: m.cx + 5, duration: 40, yoyo: true, repeat: 1 });
          }
          break;
        }
        case 'closed':
          this.showClosing();
          break;
      }
    }
  }

  /** 판매 연출: 빵이 손님에게 날아가고, 표정·대사·받은 돈·콤보 */
  private onSale(e: Extract<DayEvent, { type: 'sale' }>): void {
    const x = this.seatX[e.seat]!;
    const view = this.seats[e.seat];
    // 진열대에서 그 메뉴의 앞쪽 빵이 손님에게 날아간다 (진열대 아이콘은 아직 팔기 전 모습이다)
    const start = this.shelfStart[e.menu] ?? 0;
    e.given.forEach((q, i) => {
      const from = this.shelfIcons[start + i];
      const icon = this.scene.add.image(from?.x ?? this.g.shelf.x + 40, from?.y ?? this.g.shelf.y + 50, TEX.shelf(q)).setScale(from?.scale ?? 1);
      this.fx.add(icon);
      this.scene.tweens.add({
        targets: icon,
        x: x + (i - (e.given.length - 1) / 2) * 24,
        y: this.boardTop - 10,
        scale: 1.1,
        duration: 320,
        delay: i * 40,
        ease: 'Cubic.easeOut',
        onComplete: () => this.scene.tweens.add({ targets: icon, alpha: 0, duration: 200, onComplete: () => icon.destroy() }),
      });
    });
    const face: Face = e.result === 'best' || e.result === 'good' ? 'happy' : e.result === 'bad' ? 'angry' : 'normal';
    const wrongMenu = e.menu !== e.customer.menu;
    const key = saleLineKey(e.customer.kind, e.result, e.given, e.extra, wrongMenu);
    const line = pickLine(e.customer.kind, key, { count: e.customer.order, menu: e.customer.menu, lang: e.customer.lang });
    if (view) this.dismiss(e.seat, face, line, 900);
    const total = e.paid + e.tip + e.bonus;
    this.floatText(x, this.boardTop - 70, `+${won(total)}`, 0xf2b632, 34);
    if (e.result === 'bad') this.sfx.angry();
    else this.sfx.sale(e.combo);
    if (e.combo >= 1) {
      this.floatText(x, this.boardTop - 120, `콤보 ${e.combo}!`, 0xff8a3d, 30, 120);
    }
    if (e.result === 'best') this.sparkles.explode(12, x, this.boardTop - 120);
    if (e.rep !== 0) this.floatText(x, this.boardTop - 20, `평판 ${e.rep > 0 ? '+' : ''}${e.rep}`, e.rep > 0 ? 0x2e9e5b : 0xe5414a, 22, 200);
  }

  /** 마감 알림 */
  private showClosing(): void {
    if (this.closingShown) return;
    this.closingShown = true;
    const { width, height } = this.scene.scale;
    const text = this.scene.add.text(width / 2, height / 2, '마감!', titleStyle(96, 0xffffff)).setOrigin(0.5).setStroke('#3a2410', 12).setScale(0.3);
    this.fx.add(text);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.sfx.fanfare();
  }

  /** 빵틀이 깨질 때 "쾅!" */
  private bang(x: number, y: number): void {
    const t = this.scene.add.text(x, y, '쾅!', titleStyle(64, 0xffe14d)).setOrigin(0.5).setStroke('#3a2410', 10).setScale(0.4);
    this.fx.add(t);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: y - 40, delay: 700, duration: 400, onComplete: () => t.destroy() });
  }

  /** 떠오르며 사라지는 글자 */
  private floatText(x: number, y: number, text: string, color: number, size: number, delay = 0): void {
    const t = this.scene.add.text(x, y, text, textStyle(size, color, '900')).setOrigin(0.5).setStroke('#ffffff', 6).setAlpha(0);
    this.fx.add(t);
    this.scene.tweens.add({ targets: t, y: y - 60, alpha: { from: 1, to: 0 }, delay, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** 안 되는 동작의 안내 */
  denied(x: number, y: number, reason: string): void {
    const text = DENY_TEXT[reason];
    if (!text) return;
    this.sfx.deny();
    this.floatText(x, y, text, 0xe5414a, 24);
  }

  /** 빵틀에서 안 되는 동작: 칸이 흔들리고 안내 */
  deniedMold(index: number, reason: string): void {
    const m = this.molds[index];
    if (!m) return;
    this.scene.tweens.add({ targets: [m.a, m.b], x: m.cx + 6, duration: 50, yoyo: true, repeat: 2 });
    this.denied(m.cx, m.cy - 40, reason);
  }

  // ---------------------------------------------------------------- 그리기

  /** 지금 상태를 그린다 (매 프레임) */
  render(sim: DaySim): void {
    this.frame += 1;
    this.renderHud(sim);
    this.renderSky(sim);
    this.renderMolds(sim);
    this.renderShelf(sim);
    this.renderCustomers(sim);
    this.renderPump(sim);
  }

  /** 시계·진행 막대·돈 */
  private renderHud(sim: DaySim): void {
    const { hud } = this.g;
    const minute = gameMinute(Math.min(sim.tick, DAY_TICKS - 1));
    // 마감 30초 전부터는 시계와 진행 막대가 주황색이 된다 (새 손님이 오지 않는다)
    const closing = sim.tick >= LAST_ARRIVAL_TICK;
    const clock = clockText(minute);
    if (this.clock.text !== clock) this.clock.setText(clock).setColor(hex(closing ? 0xe0731f : this.palette.text));
    meter(this.progress.clear(), 24, hud.y + 68, hud.w - 48, 12, sim.tick / DAY_TICKS, this.palette.surfaceHover, closing ? 0xe0731f : this.palette.accent);
    if (sim.money !== this.shownMoney) {
      this.shownMoney = sim.money;
      this.money.setText(won(sim.money));
    }
    if (this.info) {
      const s = sim.stats;
      const served = s.served.best + s.served.good + s.served.meh + s.served.bad;
      this.info.setText(`오늘 매출 ${won(s.revenue)}   재료비 ${won(s.doughCost)}\n손님 ${served}명 · 떠난 손님 ${s.left}명 · 황금 ${s.golden}개`);
    }
  }

  /** 시간에 따라 하늘색이 바뀐다: 아침 → 한낮 → 노을 → 밤 */
  private renderSky(sim: DaySim): void {
    const minute = gameMinute(Math.min(sim.tick, DAY_TICKS - 1));
    if (minute === this.skyMinute) return;
    this.skyMinute = minute;
    const keys: [number, number, number][] = [
      [10 * 60, 0x9fd8ff, 0xe6f6ff],
      [14 * 60, 0x6fbff5, 0xd2efff],
      [17 * 60 + 30, 0xff9a5c, 0xffd9a0],
      [19 * 60 + 30, 0x5a4a8a, 0xf08a6a],
      [22 * 60, 0x1b2348, 0x3a3f74],
    ];
    let top = keys[0]![1];
    let bottom = keys[0]![2];
    for (let i = 0; i < keys.length - 1; i += 1) {
      const [m1, t1, b1] = keys[i]!;
      const [m2, t2, b2] = keys[i + 1]!;
      if (minute >= m1 && minute <= m2) {
        const t = (minute - m1) / (m2 - m1);
        top = mix(t1, t2, t);
        bottom = mix(b1, b2, t);
      }
    }
    const { counter } = this.g;
    vGradient(this.sky.clear(), counter.x, counter.y, counter.w, this.boardTop - counter.y + 20, top, bottom, 8);
  }

  /** 빵틀: 익힘에 따라 두 그림을 섞어 색이 서서히 바뀐다 */
  private renderMolds(sim: DaySim): void {
    const params = sim.params;
    sim.molds.forEach((m, i) => {
      const v = this.molds[i];
      if (!v) return;
      if (m.broken) {
        // 깨진 틀: 금(고칠수록 줄어든다)과 남은 누름 횟수. 깨질 때의 연출은 break 사건이 한다
        v.phase = m.phase;
        v.a.setVisible(false);
        v.b.setVisible(false);
        v.glow.setVisible(false);
        v.mark.setVisible(false);
        const level = CRACK_LEVELS - Math.floor((m.hits * CRACK_LEVELS) / REPAIR_HITS);
        const key = TEX.crack(Math.max(1, level));
        if (v.crack.texture.key !== key) v.crack.setTexture(key);
        v.crack.setVisible(true);
        const hint = `${REPAIR_HITS - m.hits}번 눌러 고치기`;
        if (v.hint.text !== hint) v.hint.setText(hint);
        v.hint.setVisible(true);
        return;
      }
      v.crack.setVisible(false);
      v.hint.setVisible(false);
      if (m.phase !== v.phase) this.onPhaseChange(v, v.phase, m.phase, sim, m.menu);
      v.phase = m.phase;
      if (m.phase === 'empty') {
        v.a.setVisible(false);
        v.b.setVisible(false);
        v.glow.setVisible(false);
        v.mark.setVisible(false);
        return;
      }
      if (this.menus > 1) {
        const markKey = TEX.icon(MENU_ICON[m.menu]!);
        if (v.mark.texture.key !== markKey) v.mark.setTexture(markKey);
        v.mark.setVisible(true);
      }
      // 메뉴마다 알맞음·탐 구간이 다르다
      const doneAt = params.doneAt[m.menu]!;
      const burnAt = params.burnAt[m.menu]!;
      let aKey: string;
      let bKey: string | null = null;
      let mixT = 0;
      let shining = false;
      let puff: 'steam' | 'smoke' | null = null;
      if (m.phase === 'bottom') {
        if (m.bottom < doneAt) {
          aKey = TEX.batter('raw', m.menu);
          bKey = TEX.batter('good', m.menu);
          mixT = m.bottom / doneAt;
        } else if (m.bottom < burnAt) {
          aKey = TEX.batter('good', m.menu);
          bKey = TEX.batter('burnt', m.menu);
          mixT = clamp01((m.bottom - doneAt) / (burnAt - doneAt)) ** 2;
          puff = 'steam';
        } else {
          aKey = TEX.batter('burnt', m.menu);
          puff = 'smoke';
        }
      } else if (m.candidate) {
        // 황금 후보: 모양만 다르고 색은 보통 빵처럼 익다가, 반짝이는 동안에만 금색이 된다(미리 꺼내지 않게)
        const limit = doneAt + GOLD_WINDOW;
        if (m.top < doneAt) {
          aKey = TEX.candidate('raw');
          bKey = TEX.candidate('good');
          mixT = m.top / doneAt;
        } else if (m.top < limit) {
          aKey = TEX.fish('golden');
          shining = true;
        } else {
          aKey = TEX.candidate('burnt');
          puff = 'smoke';
        }
      } else {
        if (m.top < doneAt) {
          aKey = TEX.fish('raw');
          bKey = TEX.fish('good');
          mixT = m.top / doneAt;
        } else if (m.top < burnAt) {
          aKey = TEX.fish('good');
          bKey = TEX.fish('burnt');
          mixT = clamp01((m.top - doneAt) / (burnAt - doneAt)) ** 2;
          puff = 'steam';
        } else {
          aKey = TEX.fish('burnt');
          puff = 'smoke';
        }
      }
      if (v.a.texture.key !== aKey) v.a.setTexture(aKey);
      v.a.setVisible(true);
      if (bKey) {
        if (v.b.texture.key !== bKey) v.b.setTexture(bKey);
        v.b.setVisible(true).setAlpha(mixT);
      } else v.b.setVisible(false);
      v.glow.setVisible(shining);
      if (shining) v.glow.setAlpha(0.55 + 0.35 * Math.abs(((this.frame % 30) - 15) / 15));
      if (puff && this.frame >= v.puffAt) {
        v.puffAt = this.frame + (puff === 'smoke' ? 10 : 22);
        (puff === 'smoke' ? this.smoke : this.steam).explode(1, v.cx + (Math.random() - 0.5) * 60 * this.moldScale, v.cy - 20 * this.moldScale);
      }
    });
  }

  /** 빵틀 단계가 바뀔 때의 짧은 연출 (붓기·뒤집기·꺼내기). menu는 그 틀의 반죽(꺼냈으면 방금 꺼낸 메뉴) */
  private onPhaseChange(v: MoldView, from: MoldPhase, to: MoldPhase, sim: DaySim, menu: Menu): void {
    const scale = this.moldScale * BUN_SCALE;
    if (from === 'empty' && to === 'bottom') {
      this.sfx.pour();
      v.a.setScale(scale * 0.3);
      this.scene.tweens.add({ targets: v.a, scale, duration: 200, ease: 'Back.easeOut' });
    } else if (from === 'bottom' && to === 'top') {
      this.sfx.flip();
      for (const img of [v.a, v.b]) {
        img.setScale(scale, 0);
        this.scene.tweens.add({ targets: img, scaleY: scale, duration: 160, ease: 'Cubic.easeOut' });
      }
    } else if (from === 'top' && to === 'empty') {
      const list = sim.shelves[menu] ?? [];
      const q = list.at(-1) ?? 'good';
      this.sfx.take(q === 'golden');
      const fly = this.scene.add.image(v.cx, v.cy, TEX.fish(q === 'golden' ? 'golden' : q)).setScale(scale);
      this.fx.add(fly);
      // 진열대는 메뉴별로 모아 놓으므로, 앞 메뉴들의 빵 수만큼 뒤가 그 메뉴의 끝이다
      const before = sim.shelves.slice(0, menu).reduce((sum, l) => sum + l.length, 0);
      const target = this.shelfSlot(before + list.length - 1, sim.params.shelfCap);
      this.scene.tweens.add({
        targets: fly,
        x: target.x,
        y: target.y,
        scale: target.scale * (SHELF_W / BUN_W) * 1.2,
        duration: 260,
        ease: 'Cubic.easeIn',
        onComplete: () => fly.destroy(),
      });
      if (q === 'golden') this.sparkles.explode(14, v.cx, v.cy);
    }
  }

  /** 진열대 칸의 위치와 아이콘 크기 */
  private shelfSlot(index: number, capacity: number): { x: number; y: number; scale: number } {
    const { shelf } = this.g;
    const rows = capacity <= 12 ? 1 : 2;
    const perRow = Math.ceil(capacity / rows);
    const slotW = (shelf.w - 32) / perRow;
    const slotH = (shelf.h - 20) / rows;
    const scale = Math.min((slotW * 0.96) / SHELF_W, (slotH * 0.9) / SHELF_H, 1.2);
    const r = Math.floor(index / perRow);
    const c = index % perRow;
    return { x: shelf.x + 16 + slotW * (c + 0.5), y: shelf.y + 10 + slotH * (r + 0.5), scale };
  }

  /** 진열대: 바뀌었을 때만 아이콘을 다시 놓는다. 메뉴별로 모아(팥 → 슈크림 → 피자) 놓고, 메뉴마다 왼쪽이 먼저 나가는 빵 */
  private renderShelf(sim: DaySim): void {
    const cap = sim.params.shelfCap;
    const key = `${cap}|${sim.shelves.map((l) => l.join(',')).join('/')}`;
    if (key === this.shelfKey) return;
    this.shelfKey = key;
    for (const icon of [...this.shelfIcons, ...this.shelfMarks]) icon.destroy();
    this.shelfIcons = [];
    this.shelfMarks = [];
    const g = this.shelfSlots.clear();
    for (let i = 0; i < cap; i += 1) {
      const s = this.shelfSlot(i, cap);
      const sw = SHELF_W * s.scale * 0.8;
      const sh = SHELF_H * s.scale * 0.5;
      if (PIXEL_ART) roundBox(g, s.x - sw / 2, s.y + 4 - sh / 2, sw, sh, 6, 0x9aa1ab, 0.35);
      else g.fillStyle(0x9aa1ab, 0.35).fillEllipse(s.x, s.y + 4, sw, sh);
    }
    this.shelfStart = [];
    sim.shelves.forEach((list, menu) => {
      this.shelfStart[menu] = this.shelfIcons.length;
      for (const q of list) {
        const s = this.shelfSlot(this.shelfIcons.length, cap);
        const icon = this.scene.add.image(s.x, s.y, TEX.shelf(q)).setScale(s.scale);
        this.root.add(icon);
        this.shelfIcons.push(icon);
        if (this.menus > 1) {
          const mark = this.scene.add.image(s.x - SHELF_W * s.scale * 0.3, s.y - SHELF_H * s.scale * 0.3, TEX.icon(MENU_ICON[menu]!)).setScale(0.45 * s.scale);
          this.root.add(mark);
          this.shelfMarks.push(mark);
        }
      }
    });
    this.trashButton.setEnabled(sim.shelves.some((list) => list.includes('burnt')));
  }

  /** 손님: 기다림 막대, 버튼 상태, 오래 기다리면 대사 */
  private renderCustomers(sim: DaySim): void {
    sim.seats.forEach((customer, seat) => {
      const view = this.seats[seat];
      if (!customer || !view) return;
      const left = 1 - customer.waited / customer.patience;
      const x = this.seatX[seat]!;
      const w = 172;
      const color = left > 0.5 ? 0x3fbf6f : left > 0.25 ? 0xf2b632 : 0xe5414a;
      meter(view.patience.clear(), x - w / 2, this.boardTop + 32, w, 16, left, 0x5a3a1c, color);
      if (!view.waitShown && left < 0.3) {
        view.waitShown = true;
        // 메뉴를 돌려 말한 손님은 단서 대사를 지우지 않는다
        if (!guessesMenu(customer.kind)) this.say(view, pickLine(customer.kind, 'wait', { lang: customer.lang }));
      }
      if (guessesMenu(customer.kind)) {
        // 무엇을 줄지는 메뉴 고르기에서 정한다: 열린 메뉴 중 하나라도 넉넉하면 켠다
        const most = Math.max(...sim.shelves.slice(0, this.menus).map((l) => l.length));
        view.give.setEnabled(most >= customer.order);
        view.extra.setEnabled(most >= customer.order + 1);
        view.give.setText(`${customer.order}개 주기`, most >= customer.order ? '메뉴 고르기' : '빵 부족');
        view.extra.setPulse(false);
        return;
      }
      // 주문한 메뉴의 빵만 준다
      const stock = sim.shelves[customer.menu]!.length;
      const enough = stock >= customer.order;
      view.give.setEnabled(enough);
      view.extra.setEnabled(stock >= customer.order + 1);
      if (enough) {
        const q = quoteSale(sim, customer, false);
        view.give.setText(`${customer.order}개 주기`, won(q.paid + q.tip + q.bonus));
      } else {
        const what = this.menus > 1 ? MENUS[customer.menu]!.name : '빵';
        view.give.setText(`${customer.order}개 주기`, `${what} ${customer.order - stock}개 부족`);
      }
      view.extra.setPulse(customer.kind === 'kid' && view.extra.isEnabled());
    });
  }

  /** 펌프 손잡이·화구 불빛·화력 계기·콤보 */
  private renderPump(sim: DaySim): void {
    if (sim.pumping !== this.wasPumping) {
      this.wasPumping = sim.pumping;
      this.sfx.setPumping(sim.pumping);
      this.pumpTween?.stop();
      this.pumpTween = null;
      const base = this.pumpHandle.getData('y0') ?? this.pumpHandle.y;
      this.pumpHandle.setData('y0', base);
      this.pumpHandle.setY(base);
      if (sim.pumping) {
        this.pumpTween = this.scene.tweens.add({ targets: this.pumpHandle, y: base + 40 * this.pumpHandle.scale, duration: 170, yoyo: true, repeat: -1 });
      }
    }
    const heat = sim.heat / HEAT_MAX;
    this.burner.setAlpha(0.18 + 0.6 * heat);
    const { gauge } = this.g;
    const x = gauge.x + 24;
    const w = gauge.w - 48;
    const y = gauge.y + gauge.h - 52;
    const color = heat < 0.3 ? 0x5aa5e8 : heat < 0.7 ? 0xf2a03d : 0xe5414a;
    meter(this.gauge.clear(), x, y, w, 28, heat, this.palette.surfaceHover, color);
    const speed = cookSpeed(sim.heat) / 100;
    const label = `화력 ${Math.round(heat * 100)}% · 굽는 속도 ×${speed.toFixed(1)}`;
    if (this.heatText.text !== label) this.heatText.setText(label);
    this.sfx.setSizzle(sim.molds.filter((m) => m.phase !== 'empty').length);
    if (sim.combo !== this.shownCombo) {
      this.shownCombo = sim.combo;
      this.comboText.setText(String(sim.combo)).setColor(hex(sim.combo > 0 ? 0xff8a3d : this.palette.textStrong));
      if (sim.combo > 0) this.scene.tweens.add({ targets: this.comboText, scale: { from: 1.4, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
  }

  // ---------------------------------------------------------------- 누름

  /** 빵틀 칸 찾기: 칸 사이 틈은 가까운 칸으로 친다 */
  private moldAt(x: number, y: number): number {
    return this.molds.findIndex((m) => inRect({ x: m.cell.x - 7, y: m.cell.y - 7, w: m.cell.w + 14, h: m.cell.h + 14 }, x, y));
  }

  /** 누름 시작. 다른 버튼 위를 누른 것이면 over에 그 버튼이 있다 */
  pointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], sim: DaySim): void {
    // 메뉴 고르기 밖을 누르면 닫는다
    const chooser = this.chooser;
    if (chooser && !over.some((o) => chooser.root.exists(o))) this.closeChooser();
    if (over.length > 0) return;
    if (inRect(this.g.pump, p.x, p.y)) {
      if (this.pumpPointer === null) {
        this.pumpPointer = p.id;
        this.handlers.pump(true);
      }
      return;
    }
    const i = this.moldAt(p.x, p.y);
    if (i < 0) return;
    const mold = sim.molds[i]!;
    // 깨진 틀은 하나씩 눌러 고친다(쓸어 넘기기 없음)
    if (mold.broken) {
      this.handlers.tap(i, this.batter);
      return;
    }
    this.swipe = { pointerId: p.id, phase: mold.phase, visited: new Set([i]) };
    this.handlers.tap(i, this.batter);
  }

  /** 쓸어 넘기기: 처음 누른 칸과 같은 동작이 가능한 칸에만 한다 */
  pointerMove(p: Phaser.Input.Pointer, sim: DaySim): void {
    const s = this.swipe;
    if (!s || s.pointerId !== p.id || !p.isDown) return;
    const i = this.moldAt(p.x, p.y);
    if (i < 0 || s.visited.has(i)) return;
    if (sim.molds[i]!.phase !== s.phase || sim.molds[i]!.broken) return;
    s.visited.add(i);
    this.handlers.tap(i, this.batter);
  }

  /** 누름 끝: 펌프를 누르던 손가락이면 펌프를 뗀다 */
  pointerUp(p: Phaser.Input.Pointer): void {
    if (this.swipe?.pointerId === p.id) this.swipe = null;
    if (this.pumpPointer === p.id) {
      this.pumpPointer = null;
      this.handlers.pump(false);
    }
  }

  /** 펌프를 놓은 것으로 친다 (멈춤·화면 가림) */
  releaseAll(): void {
    this.swipe = null;
    if (this.pumpPointer !== null) {
      this.pumpPointer = null;
      this.handlers.pump(false);
    }
  }
}
