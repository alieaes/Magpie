// 하루 장사 시뮬레이션: 굽기·화력·손님·판매·마감·정산. 화면(scene)과 서버(replayDay)가 같은 코드로 하루를 진행한다.
// 정수 연산, 시드 난수, 60틱 고정 간격만 쓴다 (CLAUDE.md §4-3). 근거: docs/design/261021-01-fish-bun.md §2~§4, §6
// 메뉴(팥·슈크림·피자): docs/design/261022-02-fish-bun-menu.md, 특별 손님·깨진 빵틀: docs/design/261022-03-fish-bun-special-customers.md
//
// 진행 규칙: 입력은 그 틱을 진행하기 전에 적용한다. 다시 돌릴 때는 입력의 틱까지 진행한 뒤 입력을 적용하고,
// 입력이 끝나면 마감(DAY_TICKS)까지 진행해 정산한다. 화면도 지금 틱(sim.tick)에 입력을 적용하고 그 틱을 기록한다.

import { SeededRandom } from '@magpie/shared';
import { KINDS, drawCustomer, drawGap, judgeSale, reputationChange, valueTenths, type CustomerKind, type Lang, type Quality, type SaleResult } from './customers';
import {
  applyReputation,
  breadPrice,
  burnBonus,
  goldenChance,
  heatFall,
  levelOf,
  moldCount,
  shelfCapacity,
  type ShopState,
} from './growth';
import { MENUS, openMenus, type Menu } from './menus';

export * from './customers';
export * from './growth';
export * from './menus';

/** 하루 길이: 3분 */
export const DAY_TICKS = 10_800;
/** 게임 시계 1분 = 15틱. 10:00에 열고 22:00에 닫는다 */
export const TICKS_PER_GAME_MINUTE = 15;
export const OPEN_MINUTE = 10 * 60;
/** 마감 10초 전(21:20)부터 새 손님이 오지 않는다. 그 전까지는 계속 온다 */
export const LAST_ARRIVAL_TICK = DAY_TICKS - 10 * 60;
/** 하루를 연 뒤 20초 동안은 바쁜 직장인(타임어택 손님)이 오지 않는다. 첫 빵이 구워지기 전에 기다림이 끝나지 않게 */
export const OFFICE_FREE_TICKS = 20 * 60;
/** 하루를 시작할 때 돈이 이보다 적으면 이만큼 채운다 */
export const SUBSIDY_FLOOR = 500;
/** 카운터 자리 */
export const COUNTER_SEATS = 3;
/** 하루 입력 최대 개수 */
export const MAX_INPUTS = 6000;
/** 같은 빵틀을 다시 누를 수 있는 최소 간격 (0.35초, 뒤집자마자 꺼내지는 오조작 방지) */
export const MIN_TAP_GAP = 21;
/** 손님이 떠난 뒤 다음 손님이 들어오기까지 최소 틱 */
export const WALK_IN_TICKS = 60;
/** 깨진 빵틀을 고치는 누름 횟수 */
export const REPAIR_HITS = 5;
/** 깨진 빵틀이 저절로 고쳐지는 틱 (20초) */
export const REPAIR_TICKS = 20 * 60;
/** 문을 열고 첫 손님이 오는 틱 범위 */
const FIRST_ARRIVAL: readonly [number, number] = [120, 240];

/** 화력 0~6000(= 0~100%). 시작 50%, 펌프를 누르고 있으면 초당 +40% */
export const HEAT_MAX = 6000;
export const HEAT_START = 3000;
export const HEAT_RISE = 40;
/** 황금 후보가 반짝이는 길이 (화력 50%에서 0.6초). 익힘 값은 매 틱 굽는 속도(cookSpeed)만큼 오르고, 구간은 메뉴마다 다르다(MENUS) */
export const GOLD_WINDOW = 3_960;
/** 하루 점수의 이론상 최고값 (넉넉한 상한) */
export const MAX_SCORE = 100_000_000;

/** 입력 동작 번호 */
export const OP = { tap: 0, pump: 1, sell: 2, trash: 3 } as const;

/**
 * 입력 한 개: [틱, 동작, 값].
 * - tap = 빵틀 번호 + 16 × 메뉴. 메뉴는 빈 틀에 부을 때만 쓰고(팥 0), 뒤집기·꺼내기는 빵틀 번호만
 * - pump = 1(누름)/0(뗌)
 * - sell = 8 × 메뉴 + 자리 × 2 + 덤(1). 팥은 메뉴를 넣기 전 값과 같다
 * - trash = 0
 */
export type FishInput = [t: number, op: number, arg: number];

/** tap 값에서 메뉴를 나누는 단위 (빵틀은 12칸까지) */
export const TAP_MENU_UNIT = 16;
/** sell 값에서 메뉴를 나누는 단위 (자리 × 2 + 덤은 6 미만) */
export const SELL_MENU_UNIT = 8;

/** 붓기 입력 값 */
export function tapArg(mold: number, menu: Menu = 0): number {
  return mold + TAP_MENU_UNIT * menu;
}

/** 판매 입력 값 */
export function sellArg(seat: number, extra: boolean, menu: Menu = 0): number {
  return SELL_MENU_UNIT * menu + seat * 2 + (extra ? 1 : 0);
}

export type MoldPhase = 'empty' | 'bottom' | 'top';

/** 빵틀 한 칸. bottom·top은 각 면의 익힘 값 */
export interface Mold {
  phase: MoldPhase;
  bottom: number;
  top: number;
  /** 부은 반죽(메뉴). 빈 틀이면 마지막으로 구운 메뉴 */
  menu: Menu;
  /** 황금 후보인지 (부을 때 정한다) */
  candidate: boolean;
  /** 마지막으로 누른 틱 */
  lastTap: number;
  /** 진상 손님이 깨뜨린 틀인지. 깨진 틀은 비어 있고, 누르면 고친다 */
  broken: boolean;
  /** 깨진 틀을 고치려고 누른 횟수 */
  hits: number;
  /** 깨진 틱 */
  brokenAt: number;
}

/** 한 면의 익힘 단계 */
export type SideStage = 'raw' | 'good' | 'burnt';

export interface Customer {
  /** 온 순서 */
  id: number;
  kind: CustomerKind;
  /** 주문한 메뉴 */
  menu: Menu;
  /** 관광객이 주문하는 말. 다른 손님은 null */
  lang: Lang | null;
  order: number;
  patience: number;
  waited: number;
}

/** 화면이 연출에 쓰는 사건. 서버 재계산은 모으지 않는다 */
export type DayEvent =
  | { type: 'arrive'; seat: number; customer: Customer }
  | { type: 'leave'; seat: number; customer: Customer; reason: 'timeout' | 'overtaken' | 'closing'; rep: number }
  | {
      type: 'sale';
      seat: number;
      customer: Customer;
      /** 준 빵의 메뉴. 주문한 메뉴와 다르면 불만 */
      menu: Menu;
      given: Quality[];
      extra: boolean;
      result: SaleResult;
      /** 빵 값(불만이면 절반) */
      paid: number;
      tip: number;
      bonus: number;
      combo: number;
      rep: number;
    }
  | { type: 'stage'; mold: number; side: 'bottom' | 'top'; stage: SideStage }
  | { type: 'shine'; mold: number }
  /** 진상 손님이 빵틀을 깼다. wasted면 굽던 빵이 버려졌다 */
  | { type: 'break'; mold: number; wasted: boolean }
  /** 깨진 틀을 한 번 두드렸다(hits). fixed면 고쳐졌다(5번 누르거나 20초가 지나서) */
  | { type: 'repair'; mold: number; hits: number; fixed: boolean }
  | { type: 'closed' };

/** 하루 기록 (정산 화면) */
export interface DayStats {
  /** 매출 (팁·콤보 보너스 포함) */
  revenue: number;
  /** 재료비 */
  doughCost: number;
  pours: number;
  /** 판 개수 (덤 포함) */
  sold: number;
  /** 메뉴별로 판 개수 (덤 포함). MENUS 순서 */
  soldBy: number[];
  /** 꺼낸 황금붕어빵 */
  golden: number;
  served: Record<SaleResult, number>;
  /** 기다리다 떠난 손님 (먼저 안 줘서 떠난 바쁜 직장인 포함) */
  left: number;
  maxCombo: number;
  /** 버린 탄 빵 */
  trashed: number;
  /** 폐기한 빵: 마감 때 남은 빵 + 빵틀이 깨져 버려진 빵 */
  wasted: number;
  /** 진상 손님이 깬 빵틀 수 */
  broken: number;
  /** 평판 변화 합 */
  repChange: number;
  /** 하루 시작 지원금 */
  subsidy: number;
  /** 온 손님 수 */
  customers: number;
}

/** 강화와 평판 레벨로 정해지는 그날의 값. 메뉴별 값은 MENUS 순서 */
export interface DayParams {
  /** 그날 열린 메뉴 수 (팥부터) */
  menus: number;
  /** 메뉴별 빵 값 (알맞음) */
  prices: readonly number[];
  /** 메뉴별 알맞음 시작 익힘 값 */
  doneAt: readonly number[];
  /** 메뉴별 타기 시작하는 익힘 값 (빵틀 길들이기 포함) */
  burnAt: readonly number[];
  heatFall: number;
  goldChance: number;
  shelfCap: number;
  signLevel: number;
}

/** 하루 진행 상태 */
export interface DaySim {
  readonly seed: string;
  /** 그날 아침 상태 (지원금 포함) */
  readonly base: ShopState;
  /** 그날 아침 평판 레벨. 하루 동안 손님 표는 이것으로 정한다 */
  readonly repLevel: number;
  readonly params: DayParams;
  tick: number;
  money: number;
  heat: number;
  pumping: boolean;
  molds: Mold[];
  /** 진열대: 메뉴마다 꺼낸 순서대로. 판매는 그 메뉴의 앞쪽부터 나간다 */
  shelves: Quality[][];
  seats: (Customer | null)[];
  nextArrival: number;
  nextId: number;
  combo: number;
  stats: DayStats;
  closed: boolean;
  /** 연출용 사건. null이면 모으지 않는다(서버) */
  events: DayEvent[] | null;
  readonly customersRng: SeededRandom;
  readonly goldRng: SeededRandom;
  /** 진상 손님이 깰 빵틀을 고르는 난수 (손님 순서와 따로) */
  readonly troubleRng: SeededRandom;
}

export type InputResult = { ok: true } | { ok: false; reason: string };

/** 화력에 따른 굽는 속도: 화력 0이면 60(0.6배), 100%면 160(1.6배) */
export function cookSpeed(heat: number): number {
  return 60 + Math.floor(heat / 60);
}

/** 익힘 값의 단계 */
export function sideStage(points: number, doneAt: number, burnAt: number): SideStage {
  return points < doneAt ? 'raw' : points < burnAt ? 'good' : 'burnt';
}

/** 윗면이 타기 시작하는 익힘 값. 황금 후보는 반짝임이 끝나면 바로 탄다 */
export function topBurnAt(mold: Mold, params: DayParams): number {
  return mold.candidate ? params.doneAt[mold.menu]! + GOLD_WINDOW : params.burnAt[mold.menu]!;
}

/** 지금 꺼내면 나올 품질: 두 면 중 나쁜 쪽, 둘 다 알맞고 황금 후보면 황금 */
export function takeQuality(mold: Mold, params: DayParams): Quality {
  const doneAt = params.doneAt[mold.menu]!;
  const bottom = sideStage(mold.bottom, doneAt, params.burnAt[mold.menu]!);
  const top = sideStage(mold.top, doneAt, topBurnAt(mold, params));
  if (bottom === 'burnt' || top === 'burnt') return 'burnt';
  if (bottom === 'raw' || top === 'raw') return 'raw';
  return mold.candidate ? 'golden' : 'good';
}

/** 틱의 게임 시계(자정부터 분) */
export function gameMinute(tick: number): number {
  return OPEN_MINUTE + Math.floor(tick / TICKS_PER_GAME_MINUTE);
}

/** 진열대 빵 수 (메뉴 합) */
export function shelfCount(sim: DaySim): number {
  return sim.shelves.reduce((sum, list) => sum + list.length, 0);
}

/** 빈 빵틀 */
function emptyMold(): Mold {
  return { phase: 'empty', bottom: 0, top: 0, menu: 0, candidate: false, lastTap: -MIN_TAP_GAP, broken: false, hits: 0, brokenAt: 0 };
}

/** 빈 하루 기록 */
function emptyStats(subsidy: number): DayStats {
  return {
    revenue: 0,
    doughCost: 0,
    pours: 0,
    sold: 0,
    soldBy: MENUS.map(() => 0),
    golden: 0,
    served: { best: 0, good: 0, meh: 0, bad: 0 },
    left: 0,
    maxCombo: 0,
    trashed: 0,
    wasted: 0,
    broken: 0,
    repChange: 0,
    subsidy,
    customers: 0,
  };
}

/** 저장 상태와 시드로 하루를 연다. 돈이 모자라면 지원금으로 채운다. withEvents면 연출용 사건을 모은다 */
export function createDay(state: ShopState, seed: string, withEvents = false): DaySim {
  const subsidy = Math.max(0, SUBSIDY_FLOOR - state.money);
  const base: ShopState = { ...state, money: state.money + subsidy };
  const u = state.upgrades;
  const customersRng = new SeededRandom(`${seed}#customers`);
  const repLevel = levelOf(state.reputation);
  return {
    seed,
    base,
    repLevel,
    params: {
      menus: openMenus(repLevel),
      prices: MENUS.map((_, m) => breadPrice(m, u.recipe)),
      doneAt: MENUS.map((m) => m.doneAt),
      burnAt: MENUS.map((m) => m.burnAt + burnBonus(u.seasoning)),
      heatFall: heatFall(u.burner),
      goldChance: goldenChance(u.golden),
      shelfCap: shelfCapacity(u.shelf),
      signLevel: u.sign,
    },
    tick: 0,
    money: base.money,
    heat: HEAT_START,
    pumping: false,
    molds: Array.from({ length: moldCount(u.molds) }, emptyMold),
    shelves: MENUS.map(() => []),
    seats: Array.from({ length: COUNTER_SEATS }, () => null),
    nextArrival: customersRng.int(FIRST_ARRIVAL[0], FIRST_ARRIVAL[1]),
    nextId: 1,
    combo: 0,
    stats: emptyStats(subsidy),
    closed: false,
    events: withEvents ? [] : null,
    customersRng,
    goldRng: new SeededRandom(`${seed}#gold`),
    troubleRng: new SeededRandom(`${seed}#trouble`),
  };
}

/** 연출용 사건을 남긴다 */
function emit(sim: DaySim, event: DayEvent): void {
  sim.events?.push(event);
}

/** 손님을 내보낸다. 마감 때는 평판·콤보에 영향이 없다 */
function leave(sim: DaySim, seat: number, reason: 'timeout' | 'overtaken' | 'closing'): void {
  const customer = sim.seats[seat];
  if (!customer) return;
  sim.seats[seat] = null;
  let rep = 0;
  if (reason !== 'closing') {
    rep = reputationChange(reason === 'timeout' ? 'left' : 'bad', customer.kind);
    sim.stats.repChange += rep;
    sim.stats.left += 1;
    sim.combo = 0;
    sim.nextArrival = Math.max(sim.nextArrival, sim.tick + WALK_IN_TICKS);
  }
  emit(sim, { type: 'leave', seat, customer, reason, rep });
  // 진상 손님은 기다리다 떠나면 빵틀을 깬다
  if (reason === 'timeout' && customer.kind === 'rude') breakMold(sim);
}

/**
 * 진상 손님이 빵틀 하나를 깬다: 굽는 틀 중 하나(없으면 빈 틀 중 하나)를 troubleRng로 고른다. 굽던 빵은 폐기한다.
 * 이미 깨진 틀은 고르지 않고, 모두 깨졌으면 아무 일도 없다
 */
function breakMold(sim: DaySim): void {
  const intact = sim.molds.map((m, i) => ({ m, i })).filter(({ m }) => !m.broken);
  const baking = intact.filter(({ m }) => m.phase !== 'empty');
  const pool = baking.length > 0 ? baking : intact;
  if (pool.length === 0) return;
  const { m: mold, i } = pool[sim.troubleRng.int(0, pool.length - 1)]!;
  const wasted = mold.phase !== 'empty';
  if (wasted) sim.stats.wasted += 1;
  Object.assign(mold, { ...emptyMold(), menu: mold.menu, lastTap: mold.lastTap, broken: true, brokenAt: sim.tick });
  sim.stats.broken += 1;
  emit(sim, { type: 'break', mold: i, wasted });
}

/** 깨진 틀을 고친다 */
function fixMold(sim: DaySim, index: number, hits: number): void {
  const mold = sim.molds[index]!;
  mold.broken = false;
  mold.hits = 0;
  emit(sim, { type: 'repair', mold: index, hits, fixed: true });
}

/** 한 틱 진행한다: 화력 → 빵틀 익힘 → 손님 기다림 → 새 손님 → 마감 */
export function advance(sim: DaySim): void {
  if (sim.closed) return;
  const { params } = sim;
  sim.heat = sim.pumping ? Math.min(HEAT_MAX, sim.heat + HEAT_RISE) : Math.max(0, sim.heat - params.heatFall);
  const speed = cookSpeed(sim.heat);

  sim.molds.forEach((mold, i) => {
    if (mold.broken) {
      if (sim.tick - mold.brokenAt >= REPAIR_TICKS) fixMold(sim, i, mold.hits);
      return;
    }
    const doneAt = params.doneAt[mold.menu]!;
    if (mold.phase === 'bottom') {
      const burnAt = params.burnAt[mold.menu]!;
      const before = sideStage(mold.bottom, doneAt, burnAt);
      mold.bottom += speed;
      const after = sideStage(mold.bottom, doneAt, burnAt);
      if (after !== before) emit(sim, { type: 'stage', mold: i, side: 'bottom', stage: after });
    } else if (mold.phase === 'top') {
      const limit = topBurnAt(mold, params);
      const before = sideStage(mold.top, doneAt, limit);
      mold.top += speed;
      const after = sideStage(mold.top, doneAt, limit);
      if (after !== before) {
        emit(sim, mold.candidate && after === 'good' ? { type: 'shine', mold: i } : { type: 'stage', mold: i, side: 'top', stage: after });
      }
    }
  });

  sim.seats.forEach((customer, seat) => {
    if (!customer) return;
    customer.waited += 1;
    if (customer.waited >= customer.patience) leave(sim, seat, 'timeout');
  });

  if (sim.tick < LAST_ARRIVAL_TICK && sim.tick >= sim.nextArrival) {
    const seat = sim.seats.indexOf(null);
    if (seat >= 0) {
      // 뽑는 순서(손님 → 다음 간격)를 바꾸면 저장된 하루의 재계산이 달라진다
      const drawn = drawCustomer(sim.customersRng, sim.repLevel, params.menus);
      const { menu, lang, order } = drawn;
      // 뽑은 값(난수 순서)은 그대로 두고, 초반의 직장인만 동네 손님으로 바꾼다
      const kind: CustomerKind = drawn.kind === 'office' && sim.tick < OFFICE_FREE_TICKS ? 'regular' : drawn.kind;
      const customer: Customer = { id: sim.nextId, kind, menu, lang, order, patience: KINDS[kind].patience, waited: 0 };
      sim.nextId += 1;
      sim.seats[seat] = customer;
      sim.stats.customers += 1;
      sim.nextArrival = sim.tick + drawGap(sim.customersRng, sim.repLevel, params.signLevel);
      emit(sim, { type: 'arrive', seat, customer });
    }
  }

  sim.tick += 1;
  if (sim.tick >= DAY_TICKS) close(sim);
}

/** 마감: 남은 손님은 그냥 떠나고, 진열대·빵틀에 남은 빵은 폐기한다 */
function close(sim: DaySim): void {
  sim.seats.forEach((_, seat) => leave(sim, seat, 'closing'));
  sim.stats.wasted += shelfCount(sim) + sim.molds.filter((m) => m.phase !== 'empty').length;
  sim.pumping = false;
  sim.closed = true;
  emit(sim, { type: 'closed' });
}

/** 입력 하나를 지금 틱에 적용한다. 규칙에 안 맞으면 사유와 함께 실패하고 아무것도 바꾸지 않는다 */
export function applyInput(sim: DaySim, op: number, arg: number): InputResult {
  if (sim.closed) return { ok: false, reason: 'closed' };
  switch (op) {
    case OP.tap:
      return tap(sim, arg);
    case OP.pump:
      if ((arg !== 0 && arg !== 1) || (arg === 1) === sim.pumping) return { ok: false, reason: 'bad_pump' };
      sim.pumping = arg === 1;
      return { ok: true };
    case OP.sell: {
      const menu = Math.floor(arg / SELL_MENU_UNIT);
      const rest = arg % SELL_MENU_UNIT;
      return sell(sim, rest >> 1, (rest & 1) === 1, menu);
    }
    case OP.trash:
      return trash(sim);
    default:
      return { ok: false, reason: 'bad_op' };
  }
}

/** 빵틀 탭: 깨진 틀이면 고치기, 빈 틀이면 붓기(값의 메뉴로), 아랫면 굽는 중이면 뒤집기, 윗면 굽는 중이면 꺼내기 */
function tap(sim: DaySim, arg: number): InputResult {
  const index = arg % TAP_MENU_UNIT;
  const menu = Math.floor(arg / TAP_MENU_UNIT);
  const mold = sim.molds[index];
  if (!mold) return { ok: false, reason: 'bad_mold' };
  if (menu >= MENUS.length || (menu > 0 && (mold.phase !== 'empty' || mold.broken))) return { ok: false, reason: 'bad_menu' };
  if (sim.tick - mold.lastTap < MIN_TAP_GAP) return { ok: false, reason: 'too_fast' };
  if (mold.broken) {
    mold.hits += 1;
    mold.lastTap = sim.tick;
    if (mold.hits >= REPAIR_HITS) fixMold(sim, index, mold.hits);
    else emit(sim, { type: 'repair', mold: index, hits: mold.hits, fixed: false });
    return { ok: true };
  }
  if (mold.phase === 'empty') {
    if (menu >= sim.params.menus) return { ok: false, reason: 'locked_menu' };
    const cost = MENUS[menu]!.cost;
    // 돈이 바닥나 굽는 틀도 진열대 빵도 없으면 더 벌 길이 없다: 이때는 팥 반죽 한 번을 거저 준다
    const stuck = menu === 0 && sim.money < cost && shelfCount(sim) === 0 && sim.molds.every((m) => m.phase === 'empty');
    if (sim.money < cost && !stuck) return { ok: false, reason: 'no_money' };
    const paid = stuck ? 0 : cost;
    sim.money -= paid;
    sim.stats.doughCost += paid;
    sim.stats.pours += 1;
    mold.phase = 'bottom';
    mold.bottom = 0;
    mold.top = 0;
    mold.menu = menu;
    mold.candidate = sim.goldRng.int(0, 999) < sim.params.goldChance;
  } else if (mold.phase === 'bottom') {
    mold.phase = 'top';
  } else {
    if (shelfCount(sim) >= sim.params.shelfCap) return { ok: false, reason: 'shelf_full' };
    const quality = takeQuality(mold, sim.params);
    sim.shelves[mold.menu]!.push(quality);
    if (quality === 'golden') sim.stats.golden += 1;
    // 빈 틀도 마지막 메뉴를 기억한다(화면이 꺼낸 빵을 진열대로 날린다)
    Object.assign(mold, { ...emptyMold(), menu: mold.menu });
  }
  mold.lastTap = sim.tick;
  return { ok: true };
}

/** 이 자리 손님에게 menu 빵을 팔면 받을 돈과 결과. 주문과 다른 메뉴면 불만. 화면이 버튼에 미리 보여 주는 데도 쓴다 */
export function quoteSale(sim: DaySim, customer: Customer, extra: boolean, combo = sim.combo, menu: Menu = customer.menu) {
  const count = customer.order + (extra ? 1 : 0);
  const given = (sim.shelves[menu] ?? []).slice(0, count);
  const result = menu === customer.menu ? judgeSale(customer.kind, given, extra) : 'bad';
  const price = sim.params.prices[menu] ?? 0;
  // 덤으로 준 빵(마지막 한 개)은 값을 받지 않는다
  const base = given.slice(0, customer.order).reduce((sum, q) => sum + Math.floor((price * valueTenths(q, customer.kind)) / 10), 0);
  const allGood = given.every((q) => q === 'good' || q === 'golden');
  const paid = result === 'bad' ? Math.floor(base / 2) : base;
  // 수수께끼를 맞히면(메뉴가 맞고 불만이 아니면) 팁 30%. 그 밖의 팁은 최고 또는 어르신(모두 알맞음 이상) 20%
  const solved = customer.kind === 'riddler' && result !== 'bad';
  const tipTenths = solved ? 3 : result === 'best' || (result !== 'bad' && customer.kind === 'elder' && allGood) ? 2 : 0;
  const tip = Math.floor((base * tipTenths) / 10);
  const comboUp = extra && (result === 'best' || result === 'good');
  const nextCombo = comboUp ? combo + 1 : 0;
  const bonus = comboUp ? Math.floor(((paid + tip) * Math.min(nextCombo, 10)) / 10) : 0;
  return { given, result, paid, tip, bonus, combo: nextCombo, solved };
}

/** 판매: 진열대의 menu 빵을 앞에서부터 주문 개수(덤이면 +1)만큼 준다 */
function sell(sim: DaySim, seat: number, extra: boolean, menu: Menu): InputResult {
  if (menu >= MENUS.length) return { ok: false, reason: 'bad_menu' };
  const customer = sim.seats[seat];
  if (!customer) return { ok: false, reason: 'no_customer' };
  const count = customer.order + (extra ? 1 : 0);
  if (sim.shelves[menu]!.length < count) return { ok: false, reason: 'no_stock' };

  // 바쁜 직장인: 먼저 온 직장인이 기다리는데 나중에 온 손님에게 팔면 떠난다(불만)
  sim.seats.forEach((other, s) => {
    if (other && s !== seat && other.kind === 'office' && other.id < customer.id) leave(sim, s, 'overtaken');
  });

  const quote = quoteSale(sim, customer, extra, sim.combo, menu);
  sim.shelves[menu]!.splice(0, count);
  sim.combo = quote.combo;
  sim.stats.maxCombo = Math.max(sim.stats.maxCombo, sim.combo);
  const total = quote.paid + quote.tip + quote.bonus;
  sim.money += total;
  sim.stats.revenue += total;
  sim.stats.sold += count;
  sim.stats.soldBy[menu]! += count;
  sim.stats.served[quote.result] += 1;
  // 수수께끼를 맞히면 평판 +1 더
  const rep = reputationChange(quote.result, customer.kind) + (quote.solved ? 1 : 0);
  sim.stats.repChange += rep;
  sim.seats[seat] = null;
  sim.nextArrival = Math.max(sim.nextArrival, sim.tick + WALK_IN_TICKS);
  emit(sim, {
    type: 'sale',
    seat,
    customer,
    menu,
    given: quote.given,
    extra,
    result: quote.result,
    paid: quote.paid,
    tip: quote.tip,
    bonus: quote.bonus,
    combo: quote.combo,
    rep,
  });
  // 진상 손님은 불만이면 빵틀을 깬다
  if (customer.kind === 'rude' && quote.result === 'bad') breakMold(sim);
  return { ok: true };
}

/** 진열대의 탄 빵을 메뉴 상관없이 모두 버린다 */
function trash(sim: DaySim): InputResult {
  sim.shelves = sim.shelves.map((list) => {
    const kept = list.filter((q) => q !== 'burnt');
    sim.stats.trashed += list.length - kept.length;
    return kept;
  });
  return { ok: true };
}

/** 정산 결과 */
export interface DayOutcome {
  /** 하루 점수 = 하루 수익(매출 − 재료비), 0 미만이면 0 */
  score: number;
  /** 하루 수익 (음수일 수 있다) */
  profit: number;
  nextState: ShopState;
}

/** 마감한 하루를 정산한다: 하루 수익, 평판(레벨은 내려가지 않음), 누적 기록 */
export function settleDay(sim: DaySim): DayOutcome {
  const { base, stats } = sim;
  const profit = stats.revenue - stats.doughCost;
  const nextState: ShopState = {
    ...base,
    day: base.day + 1,
    money: sim.money,
    reputation: applyReputation(base.reputation, stats.repChange),
    upgrades: { ...base.upgrades },
    stats: {
      revenue: base.stats.revenue + stats.revenue,
      sold: base.stats.sold + stats.sold,
      golden: base.stats.golden + stats.golden,
      bestProfit: Math.max(base.stats.bestProfit, profit),
      maxCombo: Math.max(base.stats.maxCombo, stats.maxCombo),
    },
  };
  return { score: Math.max(0, profit), profit, nextState };
}

/** 하루를 처음부터 다시 돌린다. 서버 재계산과 테스트가 쓴다 */
export function replayDay(
  seed: string,
  inputs: readonly FishInput[],
  state: ShopState,
): { ok: true; score: number; ticks: number; nextState: ShopState; sim: DaySim } | { ok: false; reason: string; index: number } {
  const sim = createDay(state, seed);
  for (let i = 0; i < inputs.length; i += 1) {
    const [t, op, arg] = inputs[i]!;
    if (!Number.isInteger(t) || t < sim.tick || t >= DAY_TICKS) return { ok: false, reason: 'bad_tick', index: i };
    while (sim.tick < t) advance(sim);
    const result = applyInput(sim, op, arg);
    if (!result.ok) return { ok: false, reason: result.reason, index: i };
  }
  while (!sim.closed) advance(sim);
  const { score, nextState } = settleDay(sim);
  return { ok: true, score, ticks: inputs.at(-1)?.[0] ?? 0, nextState, sim };
}
