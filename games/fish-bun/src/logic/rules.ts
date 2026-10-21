// 하루 장사 시뮬레이션: 굽기·화력·손님·판매·마감·정산. 화면(scene)과 서버(replayDay)가 같은 코드로 하루를 진행한다.
// 정수 연산, 시드 난수, 60틱 고정 간격만 쓴다 (CLAUDE.md §4-3). 근거: docs/design/261021-01-fish-bun.md §2~§4, §6
//
// 진행 규칙: 입력은 그 틱을 진행하기 전에 적용한다. 다시 돌릴 때는 입력의 틱까지 진행한 뒤 입력을 적용하고,
// 입력이 끝나면 마감(DAY_TICKS)까지 진행해 정산한다. 화면도 지금 틱(sim.tick)에 입력을 적용하고 그 틱을 기록한다.

import { SeededRandom } from '@magpie/shared';
import { KINDS, drawCustomer, drawGap, judgeSale, reputationChange, valueTenths, type CustomerKind, type Quality, type SaleResult } from './customers';
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

export * from './customers';
export * from './growth';

/** 하루 길이: 3분 */
export const DAY_TICKS = 10_800;
/** 게임 시계 1분 = 15틱. 10:00에 열고 22:00에 닫는다 */
export const TICKS_PER_GAME_MINUTE = 15;
export const OPEN_MINUTE = 10 * 60;
/** 마감 30초 전(21:30)부터 새 손님이 오지 않는다 */
export const LAST_ARRIVAL_TICK = DAY_TICKS - 30 * 60;
/** 반죽 한 번 재료비 */
export const DOUGH_COST = 50;
/** 하루를 시작할 때 돈이 이보다 적으면 이만큼 채운다 */
export const SUBSIDY_FLOOR = 500;
/** 카운터 자리 */
export const COUNTER_SEATS = 3;
/** 하루 입력 최대 개수 */
export const MAX_INPUTS = 6000;
/** 같은 빵틀을 다시 누를 수 있는 최소 간격 (0.1초) */
export const MIN_TAP_GAP = 6;
/** 손님이 떠난 뒤 다음 손님이 들어오기까지 최소 틱 */
export const WALK_IN_TICKS = 60;
/** 문을 열고 첫 손님이 오는 틱 범위 */
const FIRST_ARRIVAL: readonly [number, number] = [120, 240];

/** 화력 0~6000(= 0~100%). 시작 50%, 펌프를 누르고 있으면 초당 +40% */
export const HEAT_MAX = 6000;
export const HEAT_START = 3000;
export const HEAT_RISE = 40;
/** 익힘 구간. 매 틱 굽는 속도(cookSpeed)만큼 오른다. 화력 50%면 덜 익음 0~4초, 알맞음 4~6.5초 */
export const DONE_AT = 26_400;
export const BURN_AT = 42_900;
/** 황금 후보가 반짝이는 길이 (화력 50%에서 0.6초) */
export const GOLD_WINDOW = 3_960;
/** 하루 점수의 이론상 최고값 (넉넉한 상한) */
export const MAX_SCORE = 100_000_000;

/** 입력 동작 번호 */
export const OP = { tap: 0, pump: 1, sell: 2, trash: 3 } as const;

/** 입력 한 개: [틱, 동작, 값]. tap = 빵틀 번호, pump = 1(누름)/0(뗌), sell = 자리 × 2 + 덤(1), trash = 0 */
export type FishInput = [t: number, op: number, arg: number];

export type MoldPhase = 'empty' | 'bottom' | 'top';

/** 빵틀 한 칸. bottom·top은 각 면의 익힘 값 */
export interface Mold {
  phase: MoldPhase;
  bottom: number;
  top: number;
  /** 황금 후보인지 (부을 때 정한다) */
  candidate: boolean;
  /** 마지막으로 누른 틱 */
  lastTap: number;
}

/** 한 면의 익힘 단계 */
export type SideStage = 'raw' | 'good' | 'burnt';

export interface Customer {
  /** 온 순서 */
  id: number;
  kind: CustomerKind;
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
  /** 꺼낸 황금붕어빵 */
  golden: number;
  served: Record<SaleResult, number>;
  /** 기다리다 떠난 손님 (먼저 안 줘서 떠난 바쁜 직장인 포함) */
  left: number;
  maxCombo: number;
  /** 버린 탄 빵 */
  trashed: number;
  /** 마감 때 남아서 폐기한 빵 */
  wasted: number;
  /** 평판 변화 합 */
  repChange: number;
  /** 하루 시작 지원금 */
  subsidy: number;
  /** 온 손님 수 */
  customers: number;
}

/** 강화로 정해지는 그날의 값 */
export interface DayParams {
  price: number;
  burnAt: number;
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
  shelf: Quality[];
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
}

export type InputResult = { ok: true } | { ok: false; reason: string };

/** 화력에 따른 굽는 속도: 화력 0이면 60(0.6배), 100%면 160(1.6배) */
export function cookSpeed(heat: number): number {
  return 60 + Math.floor(heat / 60);
}

/** 익힘 값의 단계 */
export function sideStage(points: number, burnAt: number): SideStage {
  return points < DONE_AT ? 'raw' : points < burnAt ? 'good' : 'burnt';
}

/** 윗면이 타기 시작하는 익힘 값. 황금 후보는 반짝임이 끝나면 바로 탄다 */
export function topBurnAt(mold: Mold, params: DayParams): number {
  return mold.candidate ? DONE_AT + GOLD_WINDOW : params.burnAt;
}

/** 지금 꺼내면 나올 품질: 두 면 중 나쁜 쪽, 둘 다 알맞고 황금 후보면 황금 */
export function takeQuality(mold: Mold, params: DayParams): Quality {
  const bottom = sideStage(mold.bottom, params.burnAt);
  const top = sideStage(mold.top, topBurnAt(mold, params));
  if (bottom === 'burnt' || top === 'burnt') return 'burnt';
  if (bottom === 'raw' || top === 'raw') return 'raw';
  return mold.candidate ? 'golden' : 'good';
}

/** 틱의 게임 시계(자정부터 분) */
export function gameMinute(tick: number): number {
  return OPEN_MINUTE + Math.floor(tick / TICKS_PER_GAME_MINUTE);
}

/** 빈 빵틀 */
function emptyMold(): Mold {
  return { phase: 'empty', bottom: 0, top: 0, candidate: false, lastTap: -MIN_TAP_GAP };
}

/** 빈 하루 기록 */
function emptyStats(subsidy: number): DayStats {
  return {
    revenue: 0,
    doughCost: 0,
    pours: 0,
    sold: 0,
    golden: 0,
    served: { best: 0, good: 0, meh: 0, bad: 0 },
    left: 0,
    maxCombo: 0,
    trashed: 0,
    wasted: 0,
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
  return {
    seed,
    base,
    repLevel: levelOf(state.reputation),
    params: {
      price: breadPrice(u.recipe),
      burnAt: BURN_AT + burnBonus(u.seasoning),
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
    shelf: [],
    seats: Array.from({ length: COUNTER_SEATS }, () => null),
    nextArrival: customersRng.int(FIRST_ARRIVAL[0], FIRST_ARRIVAL[1]),
    nextId: 1,
    combo: 0,
    stats: emptyStats(subsidy),
    closed: false,
    events: withEvents ? [] : null,
    customersRng,
    goldRng: new SeededRandom(`${seed}#gold`),
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
}

/** 한 틱 진행한다: 화력 → 빵틀 익힘 → 손님 기다림 → 새 손님 → 마감 */
export function advance(sim: DaySim): void {
  if (sim.closed) return;
  const { params } = sim;
  sim.heat = sim.pumping ? Math.min(HEAT_MAX, sim.heat + HEAT_RISE) : Math.max(0, sim.heat - params.heatFall);
  const speed = cookSpeed(sim.heat);

  sim.molds.forEach((mold, i) => {
    if (mold.phase === 'bottom') {
      const before = sideStage(mold.bottom, params.burnAt);
      mold.bottom += speed;
      const after = sideStage(mold.bottom, params.burnAt);
      if (after !== before) emit(sim, { type: 'stage', mold: i, side: 'bottom', stage: after });
    } else if (mold.phase === 'top') {
      const limit = topBurnAt(mold, params);
      const before = sideStage(mold.top, limit);
      mold.top += speed;
      const after = sideStage(mold.top, limit);
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
      const { kind, order } = drawCustomer(sim.customersRng, sim.repLevel);
      const customer: Customer = { id: sim.nextId, kind, order, patience: KINDS[kind].patience, waited: 0 };
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
  sim.stats.wasted = sim.shelf.length + sim.molds.filter((m) => m.phase !== 'empty').length;
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
    case OP.sell:
      return sell(sim, arg >> 1, (arg & 1) === 1);
    case OP.trash:
      return trash(sim);
    default:
      return { ok: false, reason: 'bad_op' };
  }
}

/** 빵틀 탭: 빈 틀이면 붓기, 아랫면 굽는 중이면 뒤집기, 윗면 굽는 중이면 꺼내기 */
function tap(sim: DaySim, index: number): InputResult {
  const mold = sim.molds[index];
  if (!mold) return { ok: false, reason: 'bad_mold' };
  if (sim.tick - mold.lastTap < MIN_TAP_GAP) return { ok: false, reason: 'too_fast' };
  if (mold.phase === 'empty') {
    if (sim.money < DOUGH_COST) return { ok: false, reason: 'no_money' };
    sim.money -= DOUGH_COST;
    sim.stats.doughCost += DOUGH_COST;
    sim.stats.pours += 1;
    mold.phase = 'bottom';
    mold.bottom = 0;
    mold.top = 0;
    mold.candidate = sim.goldRng.int(0, 999) < sim.params.goldChance;
  } else if (mold.phase === 'bottom') {
    mold.phase = 'top';
  } else {
    if (sim.shelf.length >= sim.params.shelfCap) return { ok: false, reason: 'shelf_full' };
    const quality = takeQuality(mold, sim.params);
    sim.shelf.push(quality);
    if (quality === 'golden') sim.stats.golden += 1;
    Object.assign(mold, emptyMold());
  }
  mold.lastTap = sim.tick;
  return { ok: true };
}

/** 이 자리 손님에게 팔면 받을 돈과 결과. 화면이 버튼에 미리 보여 주는 데도 쓴다 */
export function quoteSale(sim: DaySim, customer: Customer, extra: boolean, combo = sim.combo) {
  const count = customer.order + (extra ? 1 : 0);
  const given = sim.shelf.slice(0, count);
  const result = judgeSale(customer.kind, given, extra);
  // 덤으로 준 빵(마지막 한 개)은 값을 받지 않는다
  const base = given.slice(0, customer.order).reduce((sum, q) => sum + Math.floor((sim.params.price * valueTenths(q, customer.kind)) / 10), 0);
  const allGood = given.every((q) => q === 'good' || q === 'golden');
  const paid = result === 'bad' ? Math.floor(base / 2) : base;
  const tip = result === 'best' || (result !== 'bad' && customer.kind === 'elder' && allGood) ? Math.floor(base / 5) : 0;
  const comboUp = extra && (result === 'best' || result === 'good');
  const nextCombo = comboUp ? combo + 1 : 0;
  const bonus = comboUp ? Math.floor(((paid + tip) * Math.min(nextCombo, 10)) / 10) : 0;
  return { given, result, paid, tip, bonus, combo: nextCombo };
}

/** 판매: 진열대 앞에서부터 주문 개수(덤이면 +1)만큼 준다 */
function sell(sim: DaySim, seat: number, extra: boolean): InputResult {
  const customer = sim.seats[seat];
  if (!customer) return { ok: false, reason: 'no_customer' };
  const count = customer.order + (extra ? 1 : 0);
  if (sim.shelf.length < count) return { ok: false, reason: 'no_stock' };

  // 바쁜 직장인: 먼저 온 직장인이 기다리는데 나중에 온 손님에게 팔면 떠난다(불만)
  sim.seats.forEach((other, s) => {
    if (other && s !== seat && other.kind === 'office' && other.id < customer.id) leave(sim, s, 'overtaken');
  });

  const quote = quoteSale(sim, customer, extra);
  sim.shelf.splice(0, count);
  sim.combo = quote.combo;
  sim.stats.maxCombo = Math.max(sim.stats.maxCombo, sim.combo);
  const total = quote.paid + quote.tip + quote.bonus;
  sim.money += total;
  sim.stats.revenue += total;
  sim.stats.sold += count;
  sim.stats.served[quote.result] += 1;
  const rep = reputationChange(quote.result, customer.kind);
  sim.stats.repChange += rep;
  sim.seats[seat] = null;
  sim.nextArrival = Math.max(sim.nextArrival, sim.tick + WALK_IN_TICKS);
  emit(sim, {
    type: 'sale',
    seat,
    customer,
    given: quote.given,
    extra,
    result: quote.result,
    paid: quote.paid,
    tip: quote.tip,
    bonus: quote.bonus,
    combo: quote.combo,
    rep,
  });
  return { ok: true };
}

/** 진열대의 탄 빵을 모두 버린다 */
function trash(sim: DaySim): InputResult {
  const kept = sim.shelf.filter((q) => q !== 'burnt');
  sim.stats.trashed += sim.shelf.length - kept.length;
  sim.shelf = kept;
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
