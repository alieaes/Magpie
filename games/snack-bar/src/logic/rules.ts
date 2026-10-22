// 하루 장사 시뮬레이션: 걷기·행동·쟁반 내기, 조리대, 손님(물·주문·식사·계산·기분), 마감·마감 정리, 정산.
// 화면(scene)과 서버(replayDay)가 같은 코드로 하루를 진행한다. 정수 연산, 시드 난수, 60틱 고정 간격만 쓴다 (CLAUDE.md §4-3).
// 근거: docs/design/261022-09-snack-bar.md §3~§7, §9, 성장은 docs/design/261022-10-snack-bar-growth.md
//
// 진행 규칙: 입력은 그 틱을 진행하기 전에 적용한다. 다시 돌릴 때는 입력의 틱까지 진행한 뒤 입력을 적용하고,
// 입력이 끝나면 하루가 닫힐 때까지 진행해 정산한다. 화면도 지금 틱(sim.tick)에 입력을 적용하고 그 틱을 기록한다.

import { SeededRandom } from '@magpie/shared';
import { newlyUnlocked, perksOf } from './characters';
import { DIRS, START, START_FACING, STATION_COUNT, TABLE_CELLS, TRASH_STATION, WATER_STATION, facedTarget, isWalkable, type Cell, type Dir } from './grid';
import { DONE_TICKS, drawGap, drawGroup, groupEat, groupPatience, type Guest } from './guests';
import { MENUS, gradeOf, menuPrice, openMenus, orderWeight, type Menu } from './menus';
import { levelOf, type ShopState, type StaffId } from './state';

export * from './characters';
export * from './grid';
export * from './growth';
export * from './guests';
export * from './menus';
export * from './state';

/** 게임 시계 1분 = 20틱. 09:00에 열고 21:00에 닫는다 */
export const TICKS_PER_GAME_MINUTE = 20;
export const OPEN_MINUTE = 9 * 60;
/** 21:00 (실제 4분) */
export const DAY_TICKS = 14_400;
/** 20:30(마감 30초 전)부터 새 손님이 오지 않는다 */
export const LAST_ARRIVAL_TICK = DAY_TICKS - 1_800;
/** 마감 정리는 21:00 뒤 최대 30초. 하루는 이보다 길어지지 않는다 */
export const MAX_TICKS = DAY_TICKS + 1_800;
/** 하루를 시작할 때 돈이 이보다 적으면 이만큼 채운다 */
export const SUBSIDY_FLOOR = 3_000;
/** 하루 입력 최대 개수 */
export const MAX_INPUTS = 8_000;
/** 행동·내기 하나에 걸리는 틱 (0.1초) */
export const ACT_TICKS = 6;
/** 한 칸 걷는 기본 틱 (0.15초) */
export const BASE_STEP = 9;
/** 테이블을 깨끗하게 하는 기본 닦기 횟수 */
export const BASE_WIPES = 3;
/** 기본 쟁반 칸 */
export const BASE_TRAY = 3;
/** 문을 열고 첫 무리가 오는 틱 범위 (3~5초) */
const FIRST_ARRIVAL: readonly [number, number] = [180, 300];
/** 손님이 기분 점수 이하가 되면 화나서 나간다 */
export const ANGRY_MOOD = -3;
/** 쟁반에서 물·단무지 세트를 나타내는 값 (메뉴는 0~4) */
export const WATER = 5;
/** 하루 점수의 이론상 최고값 (넉넉한 상한) */
export const MAX_SCORE = 100_000_000;
/** 처음 열린 테이블과, 강화로 열리는 순서 (T2·T3·T5·T6 → T1 → T4) */
export const TABLE_OPEN_ORDER: readonly number[] = [1, 2, 4, 5, 0, 3];

/** 입력 동작 번호 */
export const OP = { move: 0, act: 1, give: 2 } as const;

/** 입력 한 개: [틱, 동작, 값]. move = 방향(0 위 1 오른쪽 2 아래 3 왼쪽), act = 0, give = 쟁반 칸 번호 */
export type SnackInput = [t: number, op: number, arg: number];

/** 쟁반 칸 하나: 메뉴(0~4), 물·단무지(WATER), 빈 칸(null) */
export type TrayItem = number | null;

export type TablePhase = 'locked' | 'empty' | 'water' | 'food' | 'eating' | 'done' | 'dirty';

/** 테이블 하나와 앉은 손님 무리 */
export interface Table {
  phase: TablePhase;
  /** 무리 번호 (온 순서) */
  group: number;
  guests: Guest[];
  /** 기분 점수: 앉을 때 0, 물 +1, 음식 다 받음 +1, 막대가 닳을 때마다 -1 */
  mood: number;
  /** 기다림 막대 한 번 (틱) */
  patience: number;
  /** 지금 막대에 남은 틱 */
  gauge: number;
  /** 식사·다 먹은 뒤 남은 틱 */
  timer: number;
  /** 무리의 식사 시간 */
  eat: number;
  /** 지금까지 닦은 횟수 */
  wipes: number;
  /** 낸 음식 그릇 수 (화나서 나가거나 마감 때 버려지는 수) */
  served: number;
}

/** 메뉴 조리대 하나 */
export interface Station {
  /** 이번 접시에 누른 횟수 (0이면 시작 전) */
  progress: number;
  /** 쟁반이 가득 차서 완성된 접시가 조리대에서 기다리는지 */
  ready: boolean;
}

/** 저장 상태·강화·직원으로 정해지는 그날의 값. 메뉴별 값은 MENUS 순서 */
export interface DayParams {
  level: number;
  /** 열린 메뉴 수 (떡볶이부터) */
  menus: number;
  grades: readonly number[];
  prices: readonly number[];
  taps: readonly number[];
  /** 열린 메뉴의 주문 비중 */
  weights: readonly number[];
  step: number;
  traySlots: number;
  waterSets: number;
  wipes: number;
  patiencePlus: number;
  tipPlus: number;
  expPlus: number;
  /** 열린 테이블 수 */
  tables: number;
  signLevel: number;
  character: StaffId;
}

/** 하루 기록 (정산 화면) */
export interface DayStats {
  /** 음식 값 */
  food: number;
  tips: number;
  /** 재료비 */
  cost: number;
  /** 조리를 시작한 접시 수 */
  cooked: number;
  /** 메뉴별 판(계산한) 그릇 수 */
  sold: number[];
  /** 계산한 손님: 최고(+3), 활짝(+2 이상), 보통(0~1), 찡그림(-1~-2) */
  guests: number;
  best: number;
  happy: number;
  normal: number;
  sad: number;
  /** 화나서 나간 손님 */
  angry: number;
  /** 온 무리, 자리가 없어 돌아간 무리 */
  groups: number;
  turnedAway: number;
  /** 대식가가 낀 무리를 계산한 수 */
  bigGroups: number;
  /** 테이블에 낸 물·단무지 */
  water: number;
  /** 깨끗하게 만든 테이블 */
  cleaned: number;
  /** 쓰레기통에 버린 접시 */
  discarded: number;
  /** 버려진 음식: 화나서·마감에 나간 손님에게 낸 것, 마감 때 쟁반·조리대에 남은 것 */
  wasted: number;
  /** 손님 서비스 점수 합 */
  service: number;
  /** 마감 때 음식을 받지 못하고 나간 손님 */
  closingLeft: number;
  /** 하루 시작 지원금 */
  subsidy: number;
}

/** 아무 일도 없었던 이유 (화면 말풍선) */
export type NothingReason = 'none' | 'noMoney' | 'trayFull' | 'locked';

/** 화면이 연출에 쓰는 사건. 서버 재계산은 모으지 않는다 */
export type DayEvent =
  | { type: 'arrive'; table: number; guests: Guest[] }
  | { type: 'turnedAway' }
  | { type: 'step'; from: Cell; to: Cell }
  | { type: 'cook'; station: number; progress: number; taps: number; paid: number }
  | { type: 'cooked'; station: number; slot: number }
  | { type: 'pickup'; station: number; slot: number }
  | { type: 'fill'; slots: number[] }
  | { type: 'serveWater'; table: number; slot: number }
  | { type: 'serve'; table: number; slot: number; menu: Menu; guest: number; done: boolean }
  | { type: 'refuse'; table: number; slot: number }
  | { type: 'discard'; slot: number; item: number }
  | { type: 'wipe'; table: number; wipes: number; clean: boolean }
  | { type: 'nothing'; reason: NothingReason }
  | { type: 'patience'; table: number; mood: number }
  | { type: 'angry'; table: number; guests: Guest[] }
  | { type: 'eat'; table: number }
  | { type: 'finish'; table: number }
  | { type: 'pay'; table: number; guests: Guest[]; food: number; tip: number; mood: number }
  | { type: 'closing' }
  | { type: 'leave'; table: number; guests: Guest[] }
  | { type: 'closed' };

/** 하루 진행 상태 */
export interface DaySim {
  readonly seed: string;
  /** 그날 아침 상태 (지원금 포함) */
  readonly base: ShopState;
  readonly params: DayParams;
  tick: number;
  /** open: 영업 중, overtime: 21:00 뒤 마감 정리, closed: 끝 */
  phase: 'open' | 'overtime' | 'closed';
  money: number;
  pos: Cell;
  facing: Dir;
  /** 이 틱 전까지는 걷거나 일하는 중이라 다른 입력을 받지 않는다 */
  busyUntil: number;
  /** 마지막 걸음을 시작한 틱과 칸 (화면이 걸음 사이를 그린다) */
  stepFrom: Cell;
  stepAt: number;
  /** 마지막 행동·내기를 시작한 틱 (화면이 일하는 자세를 그린다) */
  actAt: number;
  tray: TrayItem[];
  stations: Station[];
  tables: Table[];
  nextArrival: number;
  nextGroup: number;
  stats: DayStats;
  /** 연출용 사건. null이면 모으지 않는다(서버) */
  events: DayEvent[] | null;
  readonly guestsRng: SeededRandom;
  readonly ordersRng: SeededRandom;
}

export type InputResult = { ok: true } | { ok: false; reason: string };

/** 틱의 게임 시계(자정부터 분) */
export function gameMinute(tick: number): number {
  return OPEN_MINUTE + Math.floor(tick / TICKS_PER_GAME_MINUTE);
}

/** 저장 상태로 그날의 값을 정한다. 강화와 직원 능력을 더하고 한계를 지킨다 */
export function dayParams(state: ShopState): DayParams {
  const u = state.upgrades;
  const perks = perksOf(state.character);
  const level = levelOf(state.exp);
  const menus = openMenus(level);
  const grades = state.sold.map(gradeOf);
  return {
    level,
    menus,
    grades,
    prices: MENUS.map((_, m) => menuPrice(m, grades[m] ?? 0)),
    taps: MENUS.map((m) => Math.max(2, m.taps - u.stove - perks.taps)),
    weights: grades.slice(0, menus).map(orderWeight),
    step: Math.max(4, BASE_STEP - u.shoes - perks.step),
    traySlots: Math.min(6, BASE_TRAY + u.tray + perks.tray),
    waterSets: Math.min(3, 1 + u.jug + perks.water),
    wipes: perks.wipes > 0 ? perks.wipes : BASE_WIPES,
    patiencePlus: 8 * u.interior + perks.patience,
    tipPlus: perks.tip,
    expPlus: perks.exp,
    tables: 4 + u.tables,
    signLevel: u.sign,
    character: state.character,
  };
}

/** 빈 하루 기록 */
function emptyStats(subsidy: number): DayStats {
  return {
    food: 0,
    tips: 0,
    cost: 0,
    cooked: 0,
    sold: MENUS.map(() => 0),
    guests: 0,
    best: 0,
    happy: 0,
    normal: 0,
    sad: 0,
    angry: 0,
    groups: 0,
    turnedAway: 0,
    bigGroups: 0,
    water: 0,
    cleaned: 0,
    discarded: 0,
    wasted: 0,
    service: 0,
    closingLeft: 0,
    subsidy,
  };
}

/** 빈 테이블 */
function emptyTable(phase: TablePhase): Table {
  return { phase, group: 0, guests: [], mood: 0, patience: 0, gauge: 0, timer: 0, eat: 0, wipes: 0, served: 0 };
}

/** 저장 상태와 시드로 하루를 연다. 돈이 모자라면 지원금으로 채운다. withEvents면 연출용 사건을 모은다 */
export function createDay(state: ShopState, seed: string, withEvents = false): DaySim {
  const subsidy = Math.max(0, SUBSIDY_FLOOR - state.money);
  const base: ShopState = { ...state, money: state.money + subsidy };
  const params = dayParams(base);
  const open = new Set(TABLE_OPEN_ORDER.slice(0, params.tables));
  const guestsRng = new SeededRandom(`${seed}#guests`);
  return {
    seed,
    base,
    params,
    tick: 0,
    phase: 'open',
    money: base.money,
    pos: { ...START },
    facing: START_FACING,
    busyUntil: 0,
    stepFrom: { ...START },
    stepAt: -BASE_STEP,
    actAt: -ACT_TICKS,
    tray: Array.from({ length: params.traySlots }, () => null),
    stations: MENUS.map(() => ({ progress: 0, ready: false })),
    tables: TABLE_CELLS.map((_, i) => emptyTable(open.has(i) ? 'empty' : 'locked')),
    nextArrival: guestsRng.int(FIRST_ARRIVAL[0], FIRST_ARRIVAL[1]),
    nextGroup: 1,
    stats: emptyStats(subsidy),
    events: withEvents ? [] : null,
    guestsRng,
    ordersRng: new SeededRandom(`${seed}#orders`),
  };
}

/** 연출용 사건을 남긴다 */
function emit(sim: DaySim, event: DayEvent): void {
  sim.events?.push(event);
}

/** 쟁반의 첫 빈 칸. 없으면 -1 */
export function freeSlot(sim: DaySim): number {
  return sim.tray.indexOf(null);
}

/** 지금 걷거나 일하는 중인지 */
export function isBusy(sim: DaySim): boolean {
  return sim.tick < sim.busyUntil;
}

/** 한 틱 진행한다: 테이블(기다림·식사·계산) → 새 손님 → 틱 +1 → 마감·마감 정리 */
export function advance(sim: DaySim): void {
  if (sim.phase === 'closed') return;
  sim.tables.forEach((table, i) => {
    switch (table.phase) {
      case 'water':
      case 'food':
        table.gauge -= 1;
        if (table.gauge <= 0) {
          table.mood -= 1;
          if (table.mood <= ANGRY_MOOD) {
            angry(sim, i);
          } else {
            table.gauge = table.patience;
            emit(sim, { type: 'patience', table: i, mood: table.mood });
          }
        }
        break;
      case 'eating':
        table.timer -= 1;
        if (table.timer <= 0) {
          table.phase = 'done';
          table.timer = DONE_TICKS;
          emit(sim, { type: 'finish', table: i });
        }
        break;
      case 'done':
        table.timer -= 1;
        if (table.timer <= 0) pay(sim, i);
        break;
      default:
        break;
    }
  });

  if (sim.phase === 'open' && sim.tick < LAST_ARRIVAL_TICK && sim.tick >= sim.nextArrival) arrive(sim);

  sim.tick += 1;
  if (sim.phase === 'open' && sim.tick >= DAY_TICKS) startOvertime(sim);
  if (sim.phase === 'overtime' && (sim.tick >= MAX_TICKS || !sim.tables.some((t) => t.phase === 'eating' || t.phase === 'done' || t.phase === 'dirty'))) {
    close(sim);
  }
}

/**
 * 새 무리가 온다. 뽑는 순서: 무리(guests.ts) → 앉을 테이블(빈 테이블이 있을 때만) → 다음 간격.
 * 순서를 바꾸면 저장된 하루의 재계산이 달라진다
 */
function arrive(sim: DaySim): void {
  const { params } = sim;
  const guests = drawGroup(sim.guestsRng, sim.ordersRng, params.level, params.weights);
  const free = sim.tables.map((t, i) => (t.phase === 'empty' ? i : -1)).filter((i) => i >= 0);
  if (free.length === 0) {
    sim.stats.turnedAway += 1;
    emit(sim, { type: 'turnedAway' });
  } else {
    const index = free[sim.guestsRng.int(0, free.length - 1)]!;
    const patience = groupPatience(guests, params.patiencePlus);
    sim.tables[index] = {
      phase: 'water',
      group: sim.nextGroup,
      guests,
      mood: 0,
      patience,
      gauge: patience,
      timer: 0,
      eat: groupEat(guests),
      wipes: 0,
      served: 0,
    };
    sim.nextGroup += 1;
    sim.stats.groups += 1;
    emit(sim, { type: 'arrive', table: index, guests });
  }
  sim.nextArrival = sim.tick + drawGap(sim.guestsRng, params.level, params.signLevel);
}

/** 기분이 -3이 되어 화나서 나간다: 돈을 내지 않고, 낸 음식은 버려지고, 테이블은 더러워지지 않는다(원작과 같다) */
function angry(sim: DaySim, index: number): void {
  const table = sim.tables[index]!;
  sim.stats.angry += table.guests.length;
  sim.stats.service += ANGRY_MOOD * table.guests.length;
  sim.stats.wasted += table.served;
  emit(sim, { type: 'angry', table: index, guests: table.guests });
  sim.tables[index] = emptyTable('empty');
}

/** 다 먹고 계산한다: 나갈 때 기분 +1, 음식 값 + 팁(최고 20%, +2면 10%, 직원 능력은 +2 이상에 더함). 테이블은 더러워진다 */
function pay(sim: DaySim, index: number): void {
  const table = sim.tables[index]!;
  const { params, stats } = sim;
  const mood = table.mood + 1;
  const food = table.guests.reduce((s, g) => s + params.prices[g.menu]! * g.count, 0);
  const tipPercent = (mood >= 3 ? 20 : mood === 2 ? 10 : 0) + (mood >= 2 ? params.tipPlus : 0);
  const tip = Math.floor((food * tipPercent) / 100);
  sim.money += food + tip;
  stats.food += food;
  stats.tips += tip;
  for (const g of table.guests) {
    stats.sold[g.menu]! += g.count;
    stats.guests += 1;
    stats.service += mood;
    if (mood >= 3) stats.best += 1;
    if (mood >= 2) stats.happy += 1;
    else if (mood >= 0) stats.normal += 1;
    else stats.sad += 1;
  }
  if (table.guests.some((g) => g.big)) stats.bigGroups += 1;
  emit(sim, { type: 'pay', table: index, guests: table.guests, food, tip, mood });
  sim.tables[index] = { ...emptyTable('dirty'), group: table.group };
}

/** 21:00: 음식을 다 받지 못한 손님은 그냥 나간다(돈·기분 변화 없음). 먹는 손님은 마저 먹는다 */
function startOvertime(sim: DaySim): void {
  sim.phase = 'overtime';
  emit(sim, { type: 'closing' });
  sim.tables.forEach((table, i) => {
    if (table.phase !== 'water' && table.phase !== 'food') return;
    sim.stats.closingLeft += table.guests.length;
    sim.stats.wasted += table.served;
    emit(sim, { type: 'leave', table: i, guests: table.guests });
    sim.tables[i] = emptyTable('empty');
  });
}

/** 하루를 닫는다: 쟁반·조리대에 남은 음식(재료비를 낸 것)은 버려진다 */
function close(sim: DaySim): void {
  sim.stats.wasted += sim.tray.filter((item) => item !== null && item !== WATER).length;
  sim.stats.wasted += sim.stations.filter((s) => s.ready || s.progress > 0).length;
  sim.phase = 'closed';
  emit(sim, { type: 'closed' });
}

/** 입력 하나를 지금 틱에 적용한다. 규칙에 안 맞으면 사유와 함께 실패하고 아무것도 바꾸지 않는다 */
export function applyInput(sim: DaySim, op: number, arg: number): InputResult {
  if (sim.phase === 'closed') return { ok: false, reason: 'closed' };
  switch (op) {
    case OP.move:
      if (!Number.isInteger(arg) || arg < 0 || arg > 3) return { ok: false, reason: 'bad_dir' };
      if (isBusy(sim)) return { ok: false, reason: 'busy' };
      move(sim, arg as Dir);
      return { ok: true };
    case OP.act:
      if (arg !== 0) return { ok: false, reason: 'bad_arg' };
      if (isBusy(sim)) return { ok: false, reason: 'busy' };
      act(sim);
      return { ok: true };
    case OP.give:
      if (!Number.isInteger(arg) || arg < 0 || arg >= sim.tray.length || sim.tray[arg] === null) return { ok: false, reason: 'bad_slot' };
      if (isBusy(sim)) return { ok: false, reason: 'busy' };
      give(sim, arg);
      return { ok: true };
    default:
      return { ok: false, reason: 'bad_op' };
  }
}

/** 걷기: 그 방향을 바라보고, 앞 칸이 통로면 한 칸 걷는다(걸음 틱 동안 다른 입력을 받지 않음). 막혀 있으면 바라보기만 */
function move(sim: DaySim, dir: Dir): void {
  sim.facing = dir;
  const [dx, dy] = DIRS[dir]!;
  const to = { x: sim.pos.x + dx, y: sim.pos.y + dy };
  if (!isWalkable(to.x, to.y)) return;
  sim.stepFrom = sim.pos;
  sim.stepAt = sim.tick;
  sim.pos = to;
  sim.busyUntil = sim.tick + sim.params.step;
  emit(sim, { type: 'step', from: sim.stepFrom, to });
}

/** 아무 일 없음 (말풍선만) */
function nothing(sim: DaySim, reason: NothingReason): void {
  emit(sim, { type: 'nothing', reason });
}

/** 행동: 바라보는 대상에 한 번 — 조리대 연타(또는 기다리는 접시 가져오기), 물통에서 물·단무지 담기, 더러운 테이블 닦기 */
function act(sim: DaySim): void {
  sim.busyUntil = sim.tick + ACT_TICKS;
  sim.actAt = sim.tick;
  const target = facedTarget(sim.pos, sim.facing);
  if (!target) return nothing(sim, 'none');
  if (target.kind === 'table') {
    const table = sim.tables[target.index]!;
    if (table.phase !== 'dirty') return nothing(sim, 'none');
    table.wipes += 1;
    const clean = table.wipes >= sim.params.wipes;
    if (clean) {
      sim.tables[target.index] = emptyTable('empty');
      sim.stats.cleaned += 1;
    }
    emit(sim, { type: 'wipe', table: target.index, wipes: table.wipes, clean });
    return;
  }
  const s = target.index;
  if (s === WATER_STATION) {
    const slots: number[] = [];
    for (let i = 0; i < sim.tray.length && slots.length < sim.params.waterSets; i += 1) {
      if (sim.tray[i] === null) {
        sim.tray[i] = WATER;
        slots.push(i);
      }
    }
    if (slots.length === 0) return nothing(sim, 'trayFull');
    emit(sim, { type: 'fill', slots });
    return;
  }
  if (s === TRASH_STATION || s >= STATION_COUNT) return nothing(sim, 'none');
  if (s >= sim.params.menus) return nothing(sim, 'locked');
  const station = sim.stations[s]!;
  if (station.ready) {
    const slot = freeSlot(sim);
    if (slot < 0) return nothing(sim, 'trayFull');
    sim.tray[slot] = s;
    station.ready = false;
    emit(sim, { type: 'pickup', station: s, slot });
    return;
  }
  let paid = 0;
  if (station.progress === 0) {
    const cost = MENUS[s]!.cost;
    if (sim.money < cost) return nothing(sim, 'noMoney');
    sim.money -= cost;
    sim.stats.cost += cost;
    sim.stats.cooked += 1;
    paid = cost;
  }
  station.progress += 1;
  const taps = sim.params.taps[s]!;
  emit(sim, { type: 'cook', station: s, progress: station.progress, taps, paid });
  if (station.progress < taps) return;
  station.progress = 0;
  const slot = freeSlot(sim);
  if (slot >= 0) sim.tray[slot] = s;
  else station.ready = true;
  emit(sim, { type: 'cooked', station: s, slot });
}

/** 내기: 쟁반 칸의 접시를 바라보는 대상에게 — 기다리는 테이블에 물·음식, 쓰레기통이면 버리기. 안 시킨 것이면 손님이 받지 않는다 */
function give(sim: DaySim, slot: number): void {
  sim.busyUntil = sim.tick + ACT_TICKS;
  sim.actAt = sim.tick;
  const item = sim.tray[slot]!;
  const target = facedTarget(sim.pos, sim.facing);
  if (!target) return nothing(sim, 'none');
  if (target.kind === 'station') {
    if (target.index !== TRASH_STATION) return nothing(sim, 'none');
    sim.tray[slot] = null;
    if (item !== WATER) sim.stats.discarded += 1;
    emit(sim, { type: 'discard', slot, item });
    return;
  }
  const table = sim.tables[target.index]!;
  if (table.phase === 'water' && item === WATER) {
    sim.tray[slot] = null;
    table.phase = 'food';
    table.mood += 1;
    table.gauge = table.patience;
    sim.stats.water += 1;
    emit(sim, { type: 'serveWater', table: target.index, slot });
    return;
  }
  if (table.phase === 'food' && item !== WATER) {
    const guest = table.guests.findIndex((g) => g.menu === item && g.left > 0);
    if (guest >= 0) {
      table.guests[guest]!.left -= 1;
      table.served += 1;
      sim.tray[slot] = null;
      const done = table.guests.every((g) => g.left === 0);
      if (done) {
        table.mood += 1;
        table.phase = 'eating';
        table.timer = table.eat;
      }
      emit(sim, { type: 'serve', table: target.index, slot, menu: item as Menu, guest, done });
      if (done) emit(sim, { type: 'eat', table: target.index });
      return;
    }
  }
  if (table.phase === 'water' || table.phase === 'food') {
    emit(sim, { type: 'refuse', table: target.index, slot });
    return;
  }
  nothing(sim, 'none');
}

/** 정산 결과 */
export interface DayOutcome {
  /** 하루 점수 = 하루 수익(음식 값 + 팁 - 재료비), 0 미만이면 0 */
  score: number;
  /** 하루 수익 (음수일 수 있다) */
  profit: number;
  /** 오늘 얻은 경험치 */
  exp: number;
  levelBefore: number;
  levelAfter: number;
  /** 오늘 새로 열린 직원 */
  newStaff: StaffId[];
  nextState: ShopState;
}

/** 하루 경험치: 판 그릇 수 + 서비스 점수 합 (음수면 0), 직원 능력 % 더함 */
export function dayExp(sim: DaySim): number {
  const dishes = sim.stats.sold.reduce((a, b) => a + b, 0);
  const raw = Math.max(0, dishes + sim.stats.service);
  return Math.floor((raw * (100 + sim.params.expPlus)) / 100);
}

/** 닫힌 하루를 정산한다: 하루 수익, 경험치(레벨은 내려가지 않음), 메뉴별 판매, 누적 기록, 새로 열린 직원 */
export function settleDay(sim: DaySim): DayOutcome {
  const { base, stats } = sim;
  const profit = stats.food + stats.tips - stats.cost;
  const exp = dayExp(sim);
  const next: ShopState = {
    ...base,
    day: base.day + 1,
    money: sim.money,
    exp: base.exp + exp,
    sold: base.sold.map((n, m) => n + (stats.sold[m] ?? 0)),
    upgrades: { ...base.upgrades },
    unlocked: [...base.unlocked],
    stats: {
      guests: base.stats.guests + stats.guests,
      best: base.stats.best + stats.best,
      angry: base.stats.angry + stats.angry,
      water: base.stats.water + stats.water,
      cleaned: base.stats.cleaned + stats.cleaned,
      bigGroups: base.stats.bigGroups + stats.bigGroups,
      revenue: base.stats.revenue + stats.food + stats.tips,
      bestProfit: Math.max(base.stats.bestProfit, profit),
    },
  };
  const newStaff = newlyUnlocked(next);
  next.unlocked.push(...newStaff);
  return { score: Math.max(0, profit), profit, exp, levelBefore: levelOf(base.exp), levelAfter: levelOf(next.exp), newStaff, nextState: next };
}

/** 하루를 처음부터 다시 돌린다. 서버 재계산과 테스트가 쓴다 */
export function replayDay(
  seed: string,
  inputs: readonly SnackInput[],
  state: ShopState,
): ({ ok: true; ticks: number; sim: DaySim } & DayOutcome) | { ok: false; reason: string; index: number } {
  const sim = createDay(state, seed);
  for (let i = 0; i < inputs.length; i += 1) {
    const [t, op, arg] = inputs[i]!;
    if (!Number.isInteger(t) || t < sim.tick || t >= MAX_TICKS) return { ok: false, reason: 'bad_tick', index: i };
    while (sim.tick < t && sim.phase !== 'closed') advance(sim);
    const result = applyInput(sim, op, arg);
    if (!result.ok) return { ok: false, reason: result.reason, index: i };
  }
  while (sim.phase !== 'closed') advance(sim);
  return { ok: true, ticks: inputs.at(-1)?.[0] ?? 0, sim, ...settleDay(sim) };
}
