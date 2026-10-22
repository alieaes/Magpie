// 장사 화면: 위 정보 줄, 벽(메뉴판·창문), 가게 격자(바닥·테이블·손님·조리대·직원), 쟁반 칸 줄, 오늘 기록.
// 걷기·행동·내기는 장면(SnackBarScene)이 로직에 넣고, 이 화면은 그리기와 조작(탭해서 걷기, 키보드, 쟁반 칸)만 맡는다.
// 근거: docs/design/261022-09-snack-bar.md §4~§8, 그림은 docs/design/261022-12-snack-bar-pixel-art.md

import Phaser from 'phaser';
import {
  ACT_TICKS,
  DAY_TICKS,
  GRADE_NAMES,
  LAST_ARRIVAL_TICK,
  MENUS,
  STAFF,
  STATION_COUNT,
  STATION_X,
  TABLE_CELLS,
  TRASH_STATION,
  WATER,
  WATER_STATION,
  facedTarget,
  findPath,
  gameMinute,
  isWalkable,
  routeTo,
  targetAt,
  type DayEvent,
  type DaySim,
  type Dir,
  type Guest,
  type Table,
  type Target,
} from '../logic/rules';
import { cellAt, cellCenter, dayGeometry, type DayGeometry, type Layout } from './layout';
import type { Sfx } from './sound';
import { MENU_ART, dishKey, dishMiniKey, ensureGuest, ensureStaff, iconKey, propKey, stationKey, trayKey, traySlotOffsets, STAFF_TRAY_Y, type Facing, type GuestFace } from './sprites';
import { cells, framedBox, meter, roundBox, tail, vGradient } from './style';
import { Button, clockText, mix, num, textStyle, titleStyle, won, type ScenePalette } from './ui';

/** 장면이 넘기는 조작. 받아들여지면 true */
export interface DayHandlers {
  move(dir: Dir): boolean;
  act(): boolean;
  give(slot: number): boolean;
  pause(): void;
}

const FACING: readonly Facing[] = ['up', 'right', 'down', 'left'];
/** 아무 일 없음의 안내 */
const NOTHING_TEXT: Record<string, string> = { noMoney: '돈이 모자라요', trayFull: '쟁반이 가득해요', locked: '아직 못 만들어요' };
/** 깊이: 바닥 < 테이블·사람(화면 y) < 말풍선 < 효과 < 위 정보 줄 */
const DEPTH = { floor: 0, bubble: 3000, fx: 3500, hud: 4000 } as const;

/** 테이블 한 곳의 그림 */
interface TableArt {
  table: Phaser.GameObjects.Image;
  chairs: Phaser.GameObjects.Image[];
  guests: Phaser.GameObjects.Image[];
  dishes: Phaser.GameObjects.Image[];
  bubble: Phaser.GameObjects.Container;
  bubbleKey: string;
  patience: Phaser.GameObjects.Graphics;
  arrivedAt: number;
}

/** 쟁반 칸 하나 */
interface SlotArt {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  dish: Phaser.GameObjects.Image;
  caption: Phaser.GameObjects.Text;
  rect: { x: number; y: number; w: number; h: number };
}

export class DayView {
  private readonly scene: Phaser.Scene;
  private readonly layout: Layout;
  private readonly g: DayGeometry;
  private readonly palette: ScenePalette;
  private readonly sfx: Sfx;
  private readonly handlers: DayHandlers;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly tables: TableArt[] = [];
  private readonly stationGauges: Phaser.GameObjects.Graphics;
  private readonly staff: Phaser.GameObjects.Image;
  private readonly tray: Phaser.GameObjects.Container;
  private readonly trayDishes: Phaser.GameObjects.Image[] = [];
  private readonly focus: Phaser.GameObjects.Graphics;
  private readonly slots: SlotArt[] = [];
  private readonly hud: { day: Phaser.GameObjects.Text; clock: Phaser.GameObjects.Text; money: Phaser.GameObjects.Text; level: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics };
  private readonly info: { food: Phaser.GameObjects.Text; guests: Phaser.GameObjects.Text } | null;
  private readonly keys: Partial<Record<string, Phaser.Input.Keyboard.Key>> = {};
  /** 탭해서 걷는 길과 마지막에 바라볼 방향 */
  private path: Dir[] = [];
  private finalFace: Dir | null = null;
  /** 걷는 중·일하는 중에 누른 조작 하나를 미뤄 둔다 */
  private pending: (() => boolean) | null = null;
  private pendingAt = 0;
  /** 키보드로 누르고 있는 방향 */
  private heldDir: Dir | null = null;
  private closingShown = false;
  private renderTick = 0;

  constructor(scene: Phaser.Scene, layout: Layout, height: number, palette: ScenePalette, sfx: Sfx, sim: DaySim, handlers: DayHandlers) {
    this.scene = scene;
    this.layout = layout;
    this.g = dayGeometry(layout, height);
    this.palette = palette;
    this.sfx = sfx;
    this.handlers = handlers;
    const { g } = this;
    const width = scene.scale.width;

    // 바탕
    this.keep(scene.add.rectangle(0, 0, width, scene.scale.height, palette.bg).setOrigin(0).setDepth(-10));
    // 창밖 하늘은 벽 타일(-4)과 창문 틀(-3) 사이
    this.sky = this.keep(scene.add.graphics().setDepth(-3.5));
    this.menuLines = MENUS.slice(0, sim.params.menus).map((m, i) => `${m.name} ${num(sim.params.prices[i] ?? m.price)}`);
    this.buildWall();
    this.buildFloor();

    // 조리대 줄
    for (let s = 0; s < STATION_COUNT; s += 1) this.buildStation(sim, s);
    this.stationGauges = this.keep(scene.add.graphics().setDepth(DEPTH.bubble - 10));

    // 테이블·의자·손님
    TABLE_CELLS.forEach((_, i) => this.tables.push(this.buildTable(i)));

    // 문
    const door = cellCenter(g.grid, 0, 6);
    this.keep(scene.add.image(door.x, door.y + g.grid.ch / 2, propKey('door')).setOrigin(0.5, 1).setDepth(door.y));

    // 직원과 머리 위 쟁반
    this.staff = this.keep(scene.add.image(0, 0, ensureStaff(scene, sim.params.character, 'down', 'stand')).setOrigin(0.5, 1));
    this.tray = this.keep(scene.add.container(0, 0));
    this.focus = this.keep(scene.add.graphics().setDepth(DEPTH.bubble - 20));

    this.hud = this.buildHud(sim);
    this.buildTrayBar(sim);
    this.info = this.buildInfo(sim);
    this.bindKeys();
    this.render(sim, 0);
  }

  /** 지운다 */
  destroy(): void {
    // 키를 놓아 준다: 잡아 둔 방향키·스페이스가 셸 화면(닉네임 입력 등)을 막지 않게
    const kb = this.scene.input.keyboard;
    for (const key of Object.values(this.keys)) if (key) kb?.removeKey(key, true, true);
    for (const o of this.objects) o.destroy();
  }

  /** 누르고 있던 조작을 모두 놓는다 (멈춤·마감) */
  releaseAll(): void {
    this.heldDir = null;
    this.path = [];
    this.finalFace = null;
    this.pending = null;
  }

  /** 화면 오브젝트를 기억했다가 같이 지운다 */
  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  // ---------------------------------------------------------------- 만들기

  /** 벽: 나무 벽 타일, 메뉴판(메뉴 이름·등급), 창문(밖 하늘색은 시간에 따라) */
  private buildWall(): void {
    const { scene, g } = this;
    const { wall } = g;
    if (wall.h <= 0) return;
    this.keep(scene.add.tileSprite(wall.x, wall.y, wall.w, wall.h, propKey('wall')).setOrigin(0).setDepth(-4));
    const boardW = Math.min(wall.w * 0.5, 420);
    const board = this.keep(scene.add.image(wall.x + wall.w * 0.3, wall.y + wall.h - 8, propKey('menuBoard')).setOrigin(0.5, 1).setDepth(-3));
    board.setScale(Math.min(boardW / board.width, (wall.h - 16) / board.height));
    this.writeMenuBoard(board);
    const win = this.keep(scene.add.image(wall.x + wall.w * 0.78, wall.y + wall.h - 12, propKey('window')).setOrigin(0.5, 1).setDepth(-3));
    win.setScale(Math.min(1.5, (wall.h - 20) / win.height));
    this.windowRect = { x: win.x - win.displayWidth / 2 + 8, y: win.y - win.displayHeight + 8, w: win.displayWidth - 16, h: win.displayHeight - 16 };
  }
  private windowRect: { x: number; y: number; w: number; h: number } | null = null;
  /** 메뉴판에 적을 그날의 메뉴 (이름·값). 장면을 만들 때 정한다 */
  private menuLines: string[] = [];

  /** 메뉴판 글자: 열린 메뉴 이름과 값. 메뉴판이 작으면(가로 화면의 낮은 벽) 적지 않는다 */
  private writeMenuBoard(board: Phaser.GameObjects.Image): void {
    const h = board.displayHeight;
    if (h < 90 || this.menuLines.length === 0) return;
    const w = board.displayWidth;
    // 메뉴판 위쪽 띠(빨강) 아래 흰 면에 세 줄씩 두 칸
    const top = board.y - h + h * 0.34;
    const rows = 3;
    const lineH = (h * 0.58) / rows;
    this.menuLines.forEach((line, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = board.x - w / 2 + w * 0.07 + col * (w * 0.47);
      this.keep(this.scene.add.text(x, top + row * lineH + lineH / 2, line, textStyle(22, 0x2c1c22)).setOrigin(0, 0.5).setDepth(-2));
    });
  }

  /** 바닥: 체크무늬 타일 두 장을 묶은 텍스처를 격자 전체에 깐다 */
  private buildFloor(): void {
    const { scene, g } = this;
    const key = 'snack:floorChecker';
    if (!scene.textures.exists(key)) {
      const a = scene.textures.get(propKey('floorA')).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
      const b = scene.textures.get(propKey('floorB')).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
      const tex = scene.textures.createCanvas(key, a.width * 2, a.height * 2)!;
      const ctx = tex.context;
      ctx.drawImage(a, 0, 0);
      ctx.drawImage(b, a.width, 0);
      ctx.drawImage(b, 0, a.height);
      ctx.drawImage(a, a.width, a.height);
      tex.refresh();
    }
    const { grid } = g;
    this.keep(scene.add.tileSprite(grid.x, grid.y, 7 * grid.cw, 7 * grid.ch, key).setOrigin(0).setDepth(DEPTH.floor));
    // 조리대 뒤 벽 (x = 7 줄)
    this.keep(scene.add.rectangle(grid.x + STATION_X * grid.cw, grid.y, grid.cw, 7 * grid.ch, 0x6b4a36).setOrigin(0).setDepth(DEPTH.floor));
  }

  /** 조리대 하나: 메뉴(잠기면 덮개와 "LvN부터"), 물·단무지 통, 쓰레기통. 메뉴는 등급 글자 */
  private buildStation(sim: DaySim, s: number): void {
    const { scene, g } = this;
    const c = cellCenter(g.grid, STATION_X, s);
    const locked = s < MENUS.length && s >= sim.params.menus;
    const key = s === WATER_STATION ? stationKey('water') : s === TRASH_STATION ? stationKey('trash') : locked ? stationKey('locked') : stationKey(MENU_ART[s]!);
    const img = this.keep(scene.add.image(c.x, c.y + g.grid.ch / 2 - 4, key).setOrigin(0.5, 1).setDepth(c.y));
    img.setScale(Math.min(1, (g.grid.cw - 4) / img.width));
    if (s < MENUS.length) {
      const label = locked ? `Lv${MENUS[s]!.level}` : GRADE_NAMES[sim.params.grades[s] ?? 0]!;
      const tag = this.keep(scene.add.text(c.x + g.grid.cw / 2 - 6, c.y - g.grid.ch / 2 + 4, label, textStyle(22, 0xffffff)).setOrigin(1, 0).setDepth(c.y + 1));
      tag.setStroke('#2c1c22', 6);
    }
  }

  /** 테이블 하나: 위·아래 의자, 손님 자리, 놓인 접시, 머리 위 말풍선 */
  private buildTable(i: number): TableArt {
    const { scene, g } = this;
    const cell = TABLE_CELLS[i]!;
    const c = cellCenter(g.grid, cell.x, cell.y);
    const up = cellCenter(g.grid, cell.x, cell.y - 1);
    const down = cellCenter(g.grid, cell.x, cell.y + 1);
    const chairs = [
      this.keep(scene.add.image(up.x, up.y + g.grid.ch * 0.3, propKey('chair')).setOrigin(0.5, 1).setDepth(up.y)),
      this.keep(scene.add.image(down.x, down.y + g.grid.ch * 0.15, propKey('chair')).setOrigin(0.5, 1).setDepth(down.y - 20)),
    ];
    const table = this.keep(scene.add.image(c.x, c.y + g.grid.ch * 0.35, propKey('table')).setOrigin(0.5, 1).setDepth(c.y));
    const guests = [
      this.keep(scene.add.image(up.x, c.y - g.grid.ch * 0.18, propKey('chair')).setOrigin(0.5, 1).setDepth(c.y - 1).setVisible(false)),
      this.keep(scene.add.image(down.x, down.y + g.grid.ch * 0.2, propKey('chair')).setOrigin(0.5, 1).setDepth(down.y).setVisible(false)),
    ];
    const bubble = this.keep(scene.add.container(c.x, up.y - g.grid.ch * 0.45).setDepth(DEPTH.bubble));
    const patience = this.keep(scene.add.graphics().setDepth(DEPTH.bubble + 1));
    return { table, chairs, guests, dishes: [], bubble, bubbleKey: '', patience, arrivedAt: -1000 };
  }

  /** 위 정보 줄: 날짜·게임 시계·하루 진행 막대·돈·레벨·[II] */
  private buildHud(sim: DaySim) {
    const { scene, g, palette: p } = this;
    const { hud } = g;
    const bgG = this.keep(scene.add.graphics().setDepth(DEPTH.hud));
    framedBox(bgG, hud.x + 8, hud.y + 8, hud.w - 16, hud.h - 16, 16, p.surface, p.border);
    const portrait = this.layout === 'portrait';
    const day = this.keep(scene.add.text(hud.x + 32, hud.y + (portrait ? 36 : hud.h / 2), `${sim.base.day}일째`, titleStyle(32, p.textStrong)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
    const clock = this.keep(scene.add.text(day.x + day.width + 20, day.y, '', textStyle(26, p.text)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
    const bar = this.keep(scene.add.graphics().setDepth(DEPTH.hud));
    const money = this.keep(scene.add.text(portrait ? hud.x + 32 : hud.w - 330, portrait ? hud.y + 84 : hud.h / 2, '', textStyle(26, p.textStrong)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
    const level = this.keep(scene.add.text(portrait ? hud.w - 140 : hud.w - 150, portrait ? hud.y + 84 : hud.h / 2, `Lv${sim.params.level}`, textStyle(26, p.accent)).setOrigin(1, 0.5).setDepth(DEPTH.hud));
    const pause = new Button(scene, { x: hud.w - 64, y: portrait ? hud.y + 60 : hud.h / 2, width: 72, height: 72, label: 'II', style: 'secondary', palette: p, fontSize: 26, onPress: () => this.handlers.pause() });
    this.keep(pause.setDepth(DEPTH.hud));
    return { day, clock, money, level, bar };
  }

  /** 쟁반 칸 줄: 칸마다 접시 그림·번호, 바라보는 대상에 따라 "주기"·"버리기" */
  private buildTrayBar(sim: DaySim): void {
    const { scene, g, palette: p } = this;
    const { tray } = g;
    const n = sim.tray.length;
    const title = this.keep(scene.add.text(tray.x + 8, tray.y + 4, '쟁반', textStyle(22, p.text2)).setOrigin(0, 0).setDepth(DEPTH.hud));
    const top = title.y + 36;
    const landscape = this.layout === 'landscape';
    const perRow = landscape ? 3 : n;
    const gap = 12;
    const w = Math.min(160, (tray.w - gap * (perRow - 1)) / perRow);
    const h = landscape ? Math.min(118, (tray.h - 44 - gap) / 2) : tray.h - 48;
    const rowW = perRow * w + (perRow - 1) * gap;
    for (let i = 0; i < n; i += 1) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = tray.x + (tray.w - rowW) / 2 + col * (w + gap);
      const y = top + row * (h + gap);
      const bg = scene.add.graphics();
      const dish = scene.add.image(w / 2, h * 0.44, dishMiniKey('water')).setScale(2).setVisible(false);
      const number = scene.add.text(12, 8, String(i + 1), textStyle(22, p.text2)).setOrigin(0, 0);
      const caption = scene.add.text(w / 2, h - 10, '', textStyle(22, p.accent)).setOrigin(0.5, 1);
      const root = scene.add.container(x, y, [bg, dish, number, caption]).setDepth(DEPTH.hud).setSize(w, h);
      root.setInteractive(new Phaser.Geom.Rectangle(w / 2, h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      root.on(Phaser.Input.Events.POINTER_DOWN, () => this.request(() => this.handlers.give(i)));
      this.keep(root);
      this.slots.push({ root, bg, dish, caption, rect: { x, y, w, h } });
    }
  }

  /** 오늘 기록: 오늘 매출·손님, 오늘의 직원과 능력 */
  private buildInfo(sim: DaySim) {
    const { scene, g, palette: p } = this;
    const { info } = g;
    if (!info) return null;
    const bgG = this.keep(scene.add.graphics().setDepth(DEPTH.hud - 1));
    framedBox(bgG, info.x, info.y, info.w, info.h, 16, p.surface, p.border);
    const staff = STAFF[sim.params.character];
    const landscape = this.layout === 'landscape';
    const food = this.keep(scene.add.text(info.x + 24, info.y + 32, '', textStyle(26, p.textStrong)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
    const guests = this.keep(scene.add.text(info.x + 24, info.y + (landscape ? 80 : 32), '', textStyle(22, p.text)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
    if (!landscape) guests.setPosition(info.x + info.w - 24, info.y + 32).setOrigin(1, 0.5);
    if (landscape || info.h >= 120) {
      const y = landscape ? info.y + 150 : info.y + 80;
      const face = this.keep(scene.add.image(info.x + 60, y + 40, ensureStaff(scene, sim.params.character, 'down', 'stand', { face: 'happy' })).setOrigin(0.5, 1).setDepth(DEPTH.hud));
      face.setScale(landscape ? 1.2 : 0.7);
      this.keep(scene.add.text(info.x + 120, y, `오늘의 직원 ${staff.name}`, textStyle(22, p.textStrong)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
      this.keep(scene.add.text(info.x + 120, y + 34, staff.ability, textStyle(22, p.text2)).setOrigin(0, 0.5).setDepth(DEPTH.hud));
      if (landscape) {
        this.keep(
          scene.add
            .text(info.x + 24, info.y + info.h - 24, '방향키 걷기 · 스페이스 행동 · 숫자키 쟁반 내기\n화면을 눌러도 걷고, 앞에 선 곳을 또 누르면 행동해요', { ...textStyle(22, p.text2), lineSpacing: 10 })
            .setOrigin(0, 1)
            .setDepth(DEPTH.hud),
        );
      }
    }
    return { food, guests };
  }

  /** 키보드: 방향키 걷기(누르고 있으면 계속), 스페이스 행동, 숫자키 쟁반 내기, Esc 멈춤 */
  private bindKeys(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const dirs: [number, Dir][] = [
      [K.UP, 0],
      [K.RIGHT, 1],
      [K.DOWN, 2],
      [K.LEFT, 3],
    ];
    for (const [code, dir] of dirs) {
      const key = kb.addKey(code, true, false);
      this.keys[`d${dir}`] = key;
      key.on('down', () => {
        this.path = [];
        this.finalFace = null;
        this.heldDir = dir;
        this.request(() => this.handlers.move(dir));
      });
      key.on('up', () => {
        if (this.heldDir === dir) this.heldDir = null;
      });
    }
    const space = kb.addKey(K.SPACE, true, false);
    space.on('down', (_k: unknown, e: KeyboardEvent) => {
      if (!e?.repeat) this.request(() => this.handlers.act());
    });
    this.keys.space = space;
    const numbers = [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX];
    numbers.forEach((code, slot) => {
      const key = kb.addKey(code, true, false);
      key.on('down', (_k: unknown, e: KeyboardEvent) => {
        if (!e?.repeat) this.request(() => this.handlers.give(slot));
      });
      this.keys[`n${slot}`] = key;
    });
    const esc = kb.addKey(K.ESC, true, false);
    esc.on('down', () => this.handlers.pause());
    this.keys.esc = esc;
  }

  // ---------------------------------------------------------------- 조작

  /** 조작 하나: 지금 할 수 있으면 바로, 걷는 중·일하는 중이면 하나만 미뤄 둔다(0.3초 안에 처리) */
  private request(fn: () => boolean): void {
    if (fn()) return;
    this.pending = fn;
    this.pendingAt = this.renderTick;
  }

  /** 화면을 눌렀다: 바닥이면 거기까지 걷고, 테이블·조리대면 바라보는 칸까지 걸어가고, 이미 바라보고 있으면 행동 */
  pointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], sim: DaySim): void {
    if (over.length > 0) return;
    const cell = cellAt(this.g.grid, p.worldX, p.worldY);
    if (!cell) return;
    const target = this.targetFor(cell.x, cell.y);
    if (target) {
      const faced = facedTarget(sim.pos, sim.facing);
      if (faced && faced.kind === target.kind && faced.index === target.index && this.path.length === 0) {
        this.request(() => this.handlers.act());
        return;
      }
      const route = routeTo(sim.pos, target);
      if (!route) return;
      this.heldDir = null;
      this.path = route.path;
      this.finalFace = route.dir;
      return;
    }
    if (!isWalkable(cell.x, cell.y)) return;
    const path = findPath(sim.pos, cell);
    if (!path) return;
    this.heldDir = null;
    this.path = path;
    this.finalFace = null;
  }

  /** 누른 칸의 대상. 테이블 위·아래 의자를 눌러도 그 테이블로 친다 */
  private targetFor(x: number, y: number): Target | null {
    const direct = targetAt(x, y);
    if (direct) return direct;
    if (x % 2 === 1 && y !== 3) {
      const table = TABLE_CELLS.findIndex((c) => c.x === x && Math.abs(c.y - y) === 1);
      if (table >= 0) return { kind: 'table', index: table };
    }
    return null;
  }

  /** 매 프레임: 미뤄 둔 조작 → 누르고 있는 방향 → 탭해서 걷는 길 순서로 다음 걸음을 넣는다 */
  update(sim: DaySim): void {
    if (sim.tick < sim.busyUntil) return;
    if (this.pending) {
      const fn = this.pending;
      this.pending = null;
      if (this.renderTick - this.pendingAt <= 18 && fn()) return;
    }
    const held = this.heldDir;
    if (held !== null && this.keys[`d${held}`]?.isDown) {
      this.handlers.move(held);
      return;
    }
    if (this.path.length > 0) {
      const dir = this.path.shift()!;
      if (!this.handlers.move(dir)) this.path = [];
      return;
    }
    if (this.finalFace !== null) {
      const dir = this.finalFace;
      this.finalFace = null;
      if (sim.facing !== dir) this.handlers.move(dir);
    }
  }

  // ---------------------------------------------------------------- 그리기

  /** 매 프레임 그린다. frac은 지금 틱 안에서 흐른 몫(0~1, 걸음 사이를 부드럽게) */
  render(sim: DaySim, frac: number): void {
    const t = sim.tick + frac;
    this.renderTick = sim.tick;
    this.drawSky(sim);
    this.drawHud(sim);
    this.drawTables(sim, t);
    this.drawStations(sim);
    this.drawStaff(sim, t);
    this.drawFocus(sim);
    this.drawTray(sim);
    if (this.info) {
      this.info.food.setText(`오늘 매출 ${won(sim.stats.food + sim.stats.tips)}`);
      this.info.guests.setText(`손님 ${sim.stats.guests}명${sim.stats.angry > 0 ? ` · 화남 ${sim.stats.angry}` : ''}${sim.stats.turnedAway > 0 ? ` · 돌아감 ${sim.stats.turnedAway}` : ''}`);
    }
    if (sim.phase === 'overtime' && !this.closingShown) this.showBanner('21:00 마감! 남은 테이블을 치워요');
  }

  /** 창밖 하늘: 아침 → 낮 → 노을 → 밤 */
  private drawSky(sim: DaySim): void {
    const r = this.windowRect;
    const g = this.sky.clear();
    if (!r) return;
    const p = Math.min(1, sim.tick / DAY_TICKS);
    const stops: [number, number, number][] = [
      [0, 0x9fd8f5, 0xe8f6ff],
      [0.55, 0x7cc4f0, 0xd6f0ff],
      [0.8, 0xf2a46a, 0xfbd7a1],
      [1, 0x2b3466, 0x5a4e86],
    ];
    let i = 0;
    while (i < stops.length - 2 && p > stops[i + 1]![0]) i += 1;
    const [p0, t0, b0] = stops[i]!;
    const [p1, t1, b1] = stops[i + 1]!;
    const k = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
    vGradient(g, r.x, r.y, r.w, r.h, mix(t0, t1, k), mix(b0, b1, k), 6);
  }

  /** 위 정보 줄 */
  private drawHud(sim: DaySim): void {
    const { hud, palette: p, g } = this;
    const minute = Math.min(gameMinute(sim.tick), 21 * 60);
    const late = sim.tick >= LAST_ARRIVAL_TICK;
    hud.clock.setText(sim.phase === 'overtime' ? '마감 정리' : clockText(minute)).setColor(late ? '#e07a2e' : `#${p.text.toString(16).padStart(6, '0')}`);
    hud.money.setText(won(sim.money));
    const portrait = this.layout === 'portrait';
    const x = portrait ? hud.clock.x + hud.clock.width + 16 : hud.clock.x + 220;
    const w = portrait ? g.hud.w - 120 - x : 420;
    meter(hud.bar.clear(), x, hud.clock.y - 12, Math.max(80, w), 24, Math.min(1, sim.tick / DAY_TICKS), p.surfaceHover, late ? 0xe07a2e : p.accent);
  }

  /** 테이블: 그림(깨끗·더러움·잠김), 손님 얼굴·자세, 놓인 접시, 말풍선(물·주문·기다림 막대) */
  private drawTables(sim: DaySim, t: number): void {
    const { scene } = this;
    sim.tables.forEach((table, i) => {
      const art = this.tables[i]!;
      art.table.setTexture(propKey(table.phase === 'locked' ? 'tableLocked' : table.phase === 'dirty' ? 'tableDirty' : 'table'));
      const seated = table.phase === 'water' || table.phase === 'food' || table.phase === 'eating' || table.phase === 'done';
      const face: GuestFace = table.mood >= 2 ? 'happy' : table.mood <= -1 ? 'angry' : 'normal';
      art.guests.forEach((img, slot) => {
        const guest = seated ? table.guests[slot] : undefined;
        if (!guest) {
          img.setVisible(false);
          return;
        }
        const pose = table.phase === 'eating' ? (Math.floor(t / 12) % 2 === 0 ? 'eatA' : 'eatB') : 'sit';
        const key = ensureGuest(scene, guest.look, face, slot === 0 ? 'front' : 'back', { cloth: guest.cloth, big: guest.big, pose });
        if (img.texture.key !== key) img.setTexture(key);
        const appear = Math.min(1, (sim.tick - art.arrivedAt) / 20);
        img.setVisible(true).setAlpha(appear);
      });
      this.drawDishes(art, table);
      this.drawBubble(art, table, i);
    });
  }

  /** 테이블 위 접시: 물·단무지(음식 기다림부터), 받은 음식, 다 먹으면 빈 그릇 */
  private drawDishes(art: TableArt, table: Table): void {
    const want: string[] = [];
    if (table.phase === 'food' || table.phase === 'eating' || table.phase === 'done') want.push(dishKey('water'));
    for (const g of table.guests) {
      const got = table.phase === 'food' ? g.count - g.left : table.phase === 'eating' ? g.count : 0;
      for (let k = 0; k < got; k += 1) want.push(dishKey(MENU_ART[g.menu]!));
      if (table.phase === 'done') want.push(dishKey('empty'));
    }
    while (art.dishes.length < want.length) {
      art.dishes.push(this.keep(this.scene.add.image(0, 0, want[art.dishes.length]!).setOrigin(0.5, 1)));
    }
    const { x } = art.table;
    const top = art.table.y - art.table.displayHeight * 0.55;
    art.dishes.forEach((img, k) => {
      if (k >= want.length) {
        img.setVisible(false);
        return;
      }
      const span = Math.min(want.length, 4);
      const dx = (k % 4) * 26 - ((span - 1) * 26) / 2;
      img.setTexture(want[k]!).setVisible(true).setPosition(x + dx, top + Math.floor(k / 4) * 14).setDepth(art.table.depth + 0.5);
    });
  }

  /** 머리 위 말풍선: 물 기다림이면 물컵, 음식 기다림이면 남은 메뉴·그릇 수. 아래에 기다림 막대 10칸 */
  private drawBubble(art: TableArt, table: Table, index: number): void {
    const waiting = table.phase === 'water' || table.phase === 'food';
    const key = waiting ? `${table.phase}:${table.guests.map((g) => `${g.menu}x${g.left}`).join(',')}:${table.group}` : '';
    if (key !== art.bubbleKey) {
      art.bubbleKey = key;
      art.bubble.removeAll(true);
      if (waiting) this.fillBubble(art.bubble, table);
    }
    const g = art.patience.clear();
    if (!waiting) return;
    const filled = Math.ceil((table.gauge * 10) / table.patience);
    const color = filled >= 6 ? 0x5fbf5a : filled >= 3 ? 0xf2b632 : 0xe0453a;
    const w = 10 * 8 + 9 * 2;
    cells(g, art.bubble.x - w / 2, art.bubble.y + 30, 10, filled, 8, 2, 0x3a2e2e, color);
    if (table.mood <= -1) {
      const blink = Math.floor(this.renderTick / 20) % 2 === 0;
      if (blink) g.fillStyle(0xe0453a, 1).fillRect(art.bubble.x + w / 2 + 6, art.bubble.y + 26, 8, 16);
    }
    void index;
  }

  /** 말풍선 안을 채운다 */
  private fillBubble(bubble: Phaser.GameObjects.Container, table: Table): void {
    const { scene } = this;
    const items: { key: string; count: number }[] =
      table.phase === 'water'
        ? [{ key: iconKey('cup'), count: 1 }]
        : table.guests.filter((g) => g.left > 0).map((g) => ({ key: dishMiniKey(MENU_ART[g.menu]!), count: g.left }));
    const itemW = 52;
    const w = Math.max(64, items.length * itemW + 16);
    const bg = scene.add.graphics();
    framedBox(bg, -w / 2, -26, w, 52, 8, 0xfffaf0, 0x2c1c22);
    tail(bg, 0, 25, 0x2c1c22);
    tail(bg, 0, 21, 0xfffaf0);
    bubble.add(bg);
    items.forEach((it, k) => {
      const x = -w / 2 + 8 + k * itemW + itemW / 2;
      bubble.add(scene.add.image(x - (it.count > 1 ? 8 : 0), 0, it.key).setScale(1.4));
      if (it.count > 1) bubble.add(scene.add.text(x + 14, 6, `${it.count}`, textStyle(22, 0x2c1c22)).setOrigin(0.5));
    });
    bubble.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: bubble, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
  }

  /** 조리대 게이지: 누른 횟수 / 연타 수. 완성된 접시가 기다리면 반짝 */
  private drawStations(sim: DaySim): void {
    const g = this.stationGauges.clear();
    const { grid } = this.g;
    sim.stations.forEach((st, s) => {
      if (s >= sim.params.menus) return;
      const c = cellCenter(grid, STATION_X, s);
      const taps = sim.params.taps[s]!;
      if (st.progress > 0) meter(g, c.x - 36, c.y - grid.ch / 2 + 8, 72, 14, st.progress / taps, 0x3a2e2e, 0xf2b632);
      if (st.ready && Math.floor(this.renderTick / 15) % 2 === 0) roundBox(g, c.x - 36, c.y - grid.ch / 2 + 6, 72, 18, 5, 0x5fbf5a);
    });
  }

  /** 직원: 걸음 사이를 부드럽게, 걷기 두 장 + 통통, 일하는 자세, 쟁반을 들면 두 팔 올림, 3초마다 깜빡 */
  private drawStaff(sim: DaySim, t: number): void {
    const { scene, g } = this;
    const step = sim.params.step;
    const walking = t < sim.stepAt + step;
    const k = walking ? Math.min(1, Math.max(0, (t - sim.stepAt) / step)) : 1;
    const from = cellCenter(g.grid, sim.stepFrom.x, sim.stepFrom.y);
    const to = cellCenter(g.grid, sim.pos.x, sim.pos.y);
    const x = from.x + (to.x - from.x) * k;
    const yBase = from.y + (to.y - from.y) * k + g.grid.ch * 0.42;
    const working = sim.tick < sim.actAt + ACT_TICKS;
    const pose = walking ? (Math.floor(((t - sim.stepAt) * 2) / step) % 2 === 0 ? 'walkA' : 'walkB') : working ? 'work' : 'stand';
    const carry = sim.tray.some((item) => item !== null);
    const blink = !walking && Math.floor(t) % 180 < 8;
    const key = ensureStaff(scene, sim.params.character, FACING[sim.facing]!, pose, { carry, face: blink ? 'blink' : 'normal' });
    if (this.staff.texture.key !== key) this.staff.setTexture(key);
    const bob = walking && pose === 'walkA' ? -4 : 0;
    this.staff.setPosition(Math.round(x), Math.round(yBase + bob)).setDepth(yBase);
    // 머리 위 쟁반
    this.tray.setVisible(carry);
    if (carry) {
      const top = this.staff.y - this.staff.displayHeight + STAFF_TRAY_Y;
      this.drawHeadTray(sim, this.staff.x, top);
      this.tray.setDepth(yBase + 1);
    }
  }

  /** 머리 위 쟁반과 접시 (칸 순서대로) */
  private drawHeadTray(sim: DaySim, x: number, bottom: number): void {
    const { scene } = this;
    const slots = sim.tray.length;
    if (this.tray.length === 0) {
      this.tray.add(scene.add.image(0, 0, trayKey(slots)).setOrigin(0.5, 1));
      for (let i = 0; i < slots; i += 1) {
        const img = scene.add.image(0, 0, dishMiniKey('water')).setOrigin(0, 1).setVisible(false);
        this.trayDishes.push(img);
        this.tray.add(img);
      }
    }
    const base = this.tray.getAt(0) as Phaser.GameObjects.Image;
    const offsets = traySlotOffsets(slots);
    const left = -base.width / 2;
    const topY = -base.height;
    sim.tray.forEach((item, i) => {
      const img = this.trayDishes[i]!;
      const o = offsets[i]!;
      if (item === null) {
        img.setVisible(false);
        return;
      }
      img.setTexture(item === WATER ? dishMiniKey('water') : dishMiniKey(MENU_ART[item]!)).setPosition(left + o.x, topY + o.y).setVisible(true);
    });
    this.tray.setPosition(x, bottom);
  }

  /** 바라보는 대상의 테두리를 깜빡여 보여 준다 */
  private drawFocus(sim: DaySim): void {
    const g = this.focus.clear();
    if (sim.tick < sim.stepAt + sim.params.step) return;
    const target = facedTarget(sim.pos, sim.facing);
    if (!target) return;
    const cell = target.kind === 'table' ? TABLE_CELLS[target.index]! : { x: STATION_X, y: target.index };
    const c = cellCenter(this.g.grid, cell.x, cell.y);
    const { cw, ch } = this.g.grid;
    const on = Math.floor(this.renderTick / 20) % 2 === 0;
    g.lineStyle(4, 0xfff3b0, on ? 0.95 : 0.5).strokeRect(c.x - cw / 2 + 4, c.y - ch / 2 + 4, cw - 8, ch - 8);
  }

  /** 쟁반 칸 줄: 접시 그림과 "주기"·"버리기" */
  private drawTray(sim: DaySim): void {
    const p = this.palette;
    const target = facedTarget(sim.pos, sim.facing);
    let caption = '';
    if (target?.kind === 'station' && target.index === TRASH_STATION) caption = '버리기';
    else if (target?.kind === 'table') {
      const phase = sim.tables[target.index]!.phase;
      if (phase === 'water' || phase === 'food') caption = '주기';
    }
    this.slots.forEach((slot, i) => {
      const item = sim.tray[i] ?? null;
      const { w, h } = slot.rect;
      const g = slot.bg.clear();
      framedBox(g, 0, 0, w, h, 12, item === null ? p.surfaceHover : p.surface, item !== null && caption ? p.accent : p.border);
      if (item === null) {
        slot.dish.setVisible(false);
        slot.caption.setText('');
        return;
      }
      slot.dish.setTexture(item === WATER ? dishMiniKey('water') : dishMiniKey(MENU_ART[item]!)).setVisible(true);
      slot.caption.setText(caption);
    });
  }

  // ---------------------------------------------------------------- 사건

  /** 로직이 남긴 사건을 소리·연출로 */
  handleEvents(events: DayEvent[], sim: DaySim): void {
    for (const e of events) {
      switch (e.type) {
        case 'arrive':
          this.sfx.bell();
          this.tables[e.table]!.arrivedAt = sim.tick;
          break;
        case 'turnedAway': {
          const door = cellCenter(this.g.grid, 0, 5);
          this.floatText(door.x + 20, door.y, '자리가 없네…', 0xffffff);
          break;
        }
        case 'cook':
          this.sfx.cook(e.station);
          this.puff(STATION_X, e.station);
          break;
        case 'cooked':
          this.sfx.done();
          this.sparkle(STATION_X, e.station);
          if (e.slot >= 0) this.fly(e.station, e.slot, dishMiniKey(MENU_ART[e.station]!));
          break;
        case 'pickup':
          this.sfx.serve();
          this.fly(e.station, e.slot, dishMiniKey(MENU_ART[e.station]!));
          break;
        case 'fill':
          this.sfx.pour();
          for (const slot of e.slots) this.fly(WATER_STATION, slot, dishMiniKey('water'));
          break;
        case 'serveWater':
        case 'serve':
          this.sfx.serve();
          break;
        case 'refuse': {
          this.sfx.refuse();
          const art = this.tables[e.table]!;
          for (const img of art.guests) if (img.visible) this.scene.tweens.add({ targets: img, x: img.x + 6, duration: 60, yoyo: true, repeat: 2 });
          this.floatText(art.table.x, art.table.y - 120, '안 시켰어요', 0xffffff);
          break;
        }
        case 'discard':
          this.sfx.clatter();
          break;
        case 'wipe': {
          this.sfx.wipe(e.clean);
          const cell = TABLE_CELLS[e.table]!;
          if (e.clean) this.sparkle(cell.x, cell.y);
          break;
        }
        case 'nothing': {
          const text = NOTHING_TEXT[e.reason];
          this.sfx.deny();
          if (text) this.floatText(this.staff.x, this.staff.y - this.staff.displayHeight - 30, text, 0xffffff);
          break;
        }
        case 'patience': {
          const art = this.tables[e.table]!;
          this.scene.tweens.add({ targets: art.bubble, scale: 1.15, duration: 90, yoyo: true });
          break;
        }
        case 'angry':
          this.sfx.angry();
          this.ghosts(e.table, e.guests, 'angry');
          this.floatText(this.tables[e.table]!.table.x, this.tables[e.table]!.table.y - 120, '화나서 나갔어요', 0xffb0a8);
          break;
        case 'finish': {
          const art = this.tables[e.table]!;
          if (sim.tables[e.table]!.mood >= 1) this.heart(art.table.x, art.table.y - 130);
          break;
        }
        case 'pay': {
          this.sfx.coin(e.mood >= 3);
          this.ghosts(e.table, e.guests, e.mood >= 2 ? 'happy' : 'normal');
          const art = this.tables[e.table]!;
          this.floatText(art.table.x, art.table.y - 110, `+${won(e.food + e.tip)}`, 0xffe27a, 30);
          break;
        }
        case 'leave':
          this.ghosts(e.table, e.guests, 'normal');
          break;
        default:
          break;
      }
    }
  }

  /** 떠나는 손님: 지금 얼굴로 잠깐 남았다가 위로 사라진다 */
  private ghosts(table: number, guests: Guest[], face: GuestFace): void {
    const art = this.tables[table]!;
    guests.forEach((g, slot) => {
      const base = art.guests[slot];
      if (!base) return;
      const img = this.scene.add.image(base.x, base.y, ensureGuest(this.scene, g.look, face, slot === 0 ? 'front' : 'back', { cloth: g.cloth, big: g.big })).setOrigin(0.5, 1).setDepth(base.depth);
      this.scene.tweens.add({ targets: img, y: img.y - 24, alpha: 0, duration: 600, delay: 150, onComplete: () => img.destroy() });
    });
  }

  /** 위로 떠오르며 사라지는 글자 */
  private floatText(x: number, y: number, text: string, color: number, size = 24): void {
    const label = this.scene.add.text(x, y, text, textStyle(size, color)).setOrigin(0.5).setDepth(DEPTH.fx);
    label.setStroke('#2c1c22', 6);
    this.scene.tweens.add({ targets: label, y: y - 40, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }

  /** 칸 위 반짝 */
  private sparkle(x: number, y: number): void {
    const c = cellCenter(this.g.grid, x, y);
    const img = this.scene.add.image(c.x, c.y - 30, iconKey('sparkle')).setDepth(DEPTH.fx).setScale(0.5);
    this.scene.tweens.add({ targets: img, scale: 1.6, alpha: 0, duration: 450, onComplete: () => img.destroy() });
  }

  /** 조리대 김 */
  private puff(x: number, y: number): void {
    const c = cellCenter(this.g.grid, x, y);
    const img = this.scene.add.image(c.x + (Math.random() * 20 - 10), c.y - 30, iconKey('steam')).setDepth(DEPTH.fx).setAlpha(0.9);
    this.scene.tweens.add({ targets: img, y: img.y - 26, alpha: 0, duration: 500, onComplete: () => img.destroy() });
  }

  /** 하트 */
  private heart(x: number, y: number): void {
    const img = this.scene.add.image(x, y, iconKey('heart')).setDepth(DEPTH.fx).setScale(1.5);
    this.scene.tweens.add({ targets: img, y: y - 30, alpha: 0, duration: 900, onComplete: () => img.destroy() });
  }

  /** 접시가 조리대에서 쟁반 칸으로 폴짝 날아간다 */
  private fly(station: number, slot: number, key: string): void {
    const from = cellCenter(this.g.grid, STATION_X, station);
    const s = this.slots[slot];
    if (!s) return;
    const img = this.scene.add.image(from.x, from.y - 20, key).setDepth(DEPTH.fx).setScale(1.5);
    this.scene.tweens.add({ targets: img, x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h * 0.44, scale: 2, duration: 260, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  /** 가운데 큰 안내 */
  showBanner(text: string): void {
    this.closingShown = true;
    const { width } = this.scene.scale;
    const y = this.g.grid.y + this.g.grid.ch * 3.5;
    const label = this.scene.add.text(width / 2 - (this.layout === 'landscape' ? 300 : 0), y, text, titleStyle(this.layout === 'landscape' ? 44 : 34, 0xffffff)).setOrigin(0.5).setDepth(DEPTH.fx);
    label.setStroke('#2c1c22', 10);
    this.scene.tweens.add({ targets: label, alpha: 0, delay: 1800, duration: 500, onComplete: () => label.destroy() });
  }
}
