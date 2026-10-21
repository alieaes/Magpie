import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@magpie/shared';
import {
  BURN_AT,
  DAY_TICKS,
  DONE_AT,
  DOUGH_COST,
  GOLD_WINDOW,
  HEAT_RISE,
  HEAT_START,
  LAST_ARRIVAL_TICK,
  MIN_TAP_GAP,
  OP,
  advance,
  applyInput,
  applyShopAction,
  burnBonus,
  createDay,
  fishBunLogic,
  goldenChance,
  initialShopState,
  judgeSale,
  levelOf,
  replayDay,
  settleDay,
  type Customer,
  type DaySim,
  type FishInput,
  type ShopState,
} from '../src/logic';

/** 화구를 끝까지 강화해 화력이 50%에 머무는 가게 (굽는 속도 110) */
function steadyShop(patch: Partial<ShopState> = {}): ShopState {
  const base = initialShopState();
  return { ...base, ...patch, upgrades: { ...base.upgrades, burner: 5, ...patch.upgrades } };
}

/** n틱 진행한다 */
function run(sim: DaySim, n: number): void {
  for (let i = 0; i < n; i += 1) advance(sim);
}

/** 성공해야 하는 입력 */
function must(sim: DaySim, op: number, arg: number): void {
  expect(applyInput(sim, op, arg)).toEqual({ ok: true });
}

/** 카운터에 손님을 바로 앉힌다 */
function seat(sim: DaySim, index: number, customer: Partial<Customer>): Customer {
  const c: Customer = { id: 100 + index, kind: 'regular', order: 1, patience: 1200, waited: 0, ...customer };
  sim.seats[index] = c;
  return c;
}

/** 첫 붓기가 황금 후보가 되는 시드를 찾는다 */
function goldenSeed(chance = goldenChance(0)): string {
  for (let i = 0; i < 5000; i += 1) {
    const seed = `golden-${i}`;
    if (new SeededRandom(`${seed}#gold`).int(0, 999) < chance) return seed;
  }
  throw new Error('황금 시드를 못 찾음');
}

/** 첫 붓기가 황금 후보가 아닌 시드 */
function plainSeed(): string {
  for (let i = 0; i < 100; i += 1) {
    const seed = `plain-${i}`;
    if (new SeededRandom(`${seed}#gold`).int(0, 999) >= goldenChance(0)) return seed;
  }
  throw new Error('보통 시드를 못 찾음');
}

describe('굽기', () => {
  // 화력 50% → 속도 110: 알맞음은 240틱부터, 탐은 390틱부터
  const doneTick = Math.ceil(DONE_AT / 110);
  const burnTick = Math.ceil(BURN_AT / 110);

  /** 0번 빵틀에 붓고 bottomTicks 뒤 뒤집고 topTicks 뒤 꺼낸 품질 */
  function bake(bottomTicks: number, topTicks: number, shop = steadyShop(), seed = plainSeed()) {
    const sim = createDay(shop, seed);
    must(sim, OP.tap, 0);
    run(sim, bottomTicks);
    must(sim, OP.tap, 0);
    run(sim, topTicks);
    must(sim, OP.tap, 0);
    return sim.shelf[0];
  }

  it('붓기 → 뒤집기 → 꺼내기, 두 면 중 나쁜 쪽이 품질이다', () => {
    expect(doneTick).toBe(240);
    expect(burnTick).toBe(390);
    expect(bake(doneTick, doneTick)).toBe('good');
    expect(bake(doneTick - 1, doneTick)).toBe('raw');
    expect(bake(doneTick, doneTick - 1)).toBe('raw');
    expect(bake(burnTick - 1, burnTick - 1)).toBe('good');
    expect(bake(burnTick, doneTick)).toBe('burnt');
    expect(bake(doneTick, burnTick)).toBe('burnt');
    expect(bake(doneTick - 1, burnTick)).toBe('burnt');
  });

  it('부으면 재료비를 바로 내고, 돈이 모자라면 부을 수 없다', () => {
    const sim = createDay(steadyShop({ money: 600 }), plainSeed());
    must(sim, OP.tap, 0);
    expect(sim.money).toBe(600 - DOUGH_COST);
    expect(sim.stats.doughCost).toBe(DOUGH_COST);
    sim.money = DOUGH_COST - 1;
    expect(applyInput(sim, OP.tap, 1)).toEqual({ ok: false, reason: 'no_money' });
    expect(sim.molds[1]!.phase).toBe('empty');
  });

  it('같은 칸은 0.1초 안에 다시 누를 수 없고, 없는 칸은 실패', () => {
    const sim = createDay(steadyShop(), plainSeed());
    must(sim, OP.tap, 0);
    run(sim, MIN_TAP_GAP - 1);
    expect(applyInput(sim, OP.tap, 0)).toEqual({ ok: false, reason: 'too_fast' });
    run(sim, 1);
    must(sim, OP.tap, 0);
    expect(applyInput(sim, OP.tap, 6)).toEqual({ ok: false, reason: 'bad_mold' });
  });

  it('진열대가 가득 차면 꺼낼 수 없다', () => {
    const sim = createDay(steadyShop(), plainSeed());
    sim.shelf = Array.from({ length: 12 }, () => 'good' as const);
    must(sim, OP.tap, 0);
    run(sim, 10);
    must(sim, OP.tap, 0);
    run(sim, 10);
    expect(applyInput(sim, OP.tap, 0)).toEqual({ ok: false, reason: 'shelf_full' });
  });

  it('빵틀 길들이기는 알맞음 구간을 늘린다', () => {
    const shop = steadyShop({ upgrades: { ...initialShopState().upgrades, burner: 5, seasoning: 2 } });
    const longBurn = Math.ceil((BURN_AT + burnBonus(2)) / 110);
    expect(bake(burnTick, doneTick, shop)).toBe('good');
    expect(bake(longBurn, doneTick, shop)).toBe('burnt');
  });

  it('황금 후보는 윗면이 알맞음에 들어선 0.6초 안에 꺼내면 황금, 놓치면 바로 탄다', () => {
    const seed = goldenSeed();
    const window = Math.ceil((DONE_AT + GOLD_WINDOW) / 110) - doneTick;
    expect(window).toBe(36);
    expect(bake(doneTick, doneTick, steadyShop(), seed)).toBe('golden');
    expect(bake(doneTick, doneTick + window - 1, steadyShop(), seed)).toBe('golden');
    expect(bake(doneTick, doneTick + window, steadyShop(), seed)).toBe('burnt');
    // 아랫면이 덜 익었으면 황금이 아니다
    expect(bake(doneTick - 1, doneTick, steadyShop(), seed)).toBe('raw');
  });

  it('펌프를 누르고 있으면 화력이 오르고, 떼면 화구 단계만큼 내려간다', () => {
    const sim = createDay(initialShopState(), plainSeed());
    expect(applyInput(sim, OP.pump, 0)).toEqual({ ok: false, reason: 'bad_pump' });
    must(sim, OP.pump, 1);
    expect(applyInput(sim, OP.pump, 1)).toEqual({ ok: false, reason: 'bad_pump' });
    run(sim, 10);
    expect(sim.heat).toBe(HEAT_START + HEAT_RISE * 10);
    must(sim, OP.pump, 0);
    run(sim, 10);
    expect(sim.heat).toBe(HEAT_START + HEAT_RISE * 10 - 8 * 10);
  });
});

describe('손님과 판매', () => {
  it('손님은 시드대로 온다. 자리가 없으면 기다렸다가, 마감 30초 전부터는 오지 않는다', () => {
    const a = createDay(initialShopState(), 'arrivals');
    const b = createDay(initialShopState(), 'arrivals');
    run(a, 3000);
    run(b, 3000);
    expect(a.seats).toEqual(b.seats);
    expect(a.stats.customers).toBeGreaterThan(0);

    const late = createDay(initialShopState(), 'late');
    run(late, LAST_ARRIVAL_TICK);
    late.seats = [null, null, null];
    const before = late.stats.customers;
    run(late, DAY_TICKS - LAST_ARRIVAL_TICK - 1);
    expect(late.stats.customers).toBe(before);
  });

  it('기다림이 다 되면 떠난다: 평판 −2, 콤보 0', () => {
    const sim = createDay(initialShopState(), 'patience');
    sim.nextArrival = DAY_TICKS;
    seat(sim, 0, { patience: 5 });
    sim.combo = 3;
    run(sim, 5);
    expect(sim.seats[0]).toBeNull();
    expect(sim.stats.repChange).toBe(-2);
    expect(sim.stats.left).toBe(1);
    expect(sim.combo).toBe(0);
  });

  it('판매: 손님이 없으면 no_customer, 빵이 모자라면 no_stock', () => {
    const sim = createDay(initialShopState(), 'sell');
    expect(applyInput(sim, OP.sell, 0)).toEqual({ ok: false, reason: 'no_customer' });
    seat(sim, 1, { order: 2 });
    sim.shelf = ['good'];
    expect(applyInput(sim, OP.sell, 1 * 2)).toEqual({ ok: false, reason: 'no_stock' });
    sim.shelf = ['good', 'good'];
    expect(applyInput(sim, OP.sell, 1 * 2 + 1)).toEqual({ ok: false, reason: 'no_stock' });
  });

  it('판매 금액: 품질 배율, 덤은 값을 받지 않고, 덤으로 만족하면 콤보 보너스', () => {
    const sim = createDay(initialShopState(), 'money');
    const startMoney = sim.money;
    seat(sim, 0, { order: 2 });
    sim.shelf = ['good', 'raw'];
    must(sim, OP.sell, 0);
    // 120 + 60, 점수 −1 → 아쉬움
    expect(sim.money - startMoney).toBe(180);
    expect(sim.stats.served.meh).toBe(1);
    expect(sim.combo).toBe(0);

    seat(sim, 1, { order: 1 });
    sim.shelf = ['good', 'good'];
    must(sim, OP.sell, 1 * 2 + 1);
    // 덤 → 만족, 콤보 1: 120 + 10%
    expect(sim.money - startMoney).toBe(180 + 132);
    expect(sim.combo).toBe(1);
    expect(sim.stats.sold).toBe(4);

    seat(sim, 2, { order: 1 });
    sim.shelf = ['golden', 'good'];
    must(sim, OP.sell, 2 * 2 + 1);
    // 황금 360 + 최고 팁 72 = 432, 콤보 2 → +20%
    expect(sim.money - startMoney).toBe(180 + 132 + 432 + 86);
    expect(sim.stats.served.best).toBe(1);
    expect(sim.stats.maxCombo).toBe(2);
  });

  it('손님 성격: 꼬마는 덤이 없으면 아쉬움, 어르신은 탄 빵이면 불만, 먹방은 품질을 안 따진다', () => {
    expect(judgeSale('kid', ['good'], false)).toBe('meh');
    expect(judgeSale('kid', ['good', 'good'], true)).toBe('good');
    expect(judgeSale('elder', ['golden', 'golden', 'burnt'], false)).toBe('bad');
    expect(judgeSale('regular', ['burnt', 'raw'], false)).toBe('bad');
    expect(judgeSale('creator', ['burnt', 'raw', 'raw'], false)).toBe('good');
    expect(judgeSale('regular', ['golden'], false)).toBe('best');
  });

  it('불만이면 절반만 내고 평판 −3, 리뷰어는 평판 변화가 3배', () => {
    const sim = createDay(initialShopState(), 'angry');
    const startMoney = sim.money;
    seat(sim, 0, { order: 2 });
    sim.shelf = ['burnt', 'burnt'];
    must(sim, OP.sell, 0);
    expect(sim.money - startMoney).toBe(Math.floor((36 + 36) / 2));
    expect(sim.stats.repChange).toBe(-3);
    seat(sim, 1, { kind: 'reviewer', order: 1 });
    sim.shelf = ['good'];
    must(sim, OP.sell, 2);
    expect(sim.stats.repChange).toBe(-3 + 6);
  });

  it('바쁜 직장인보다 나중에 온 손님에게 먼저 팔면 직장인이 떠난다', () => {
    const sim = createDay(initialShopState(), 'office');
    seat(sim, 0, { id: 1, kind: 'office', order: 1 });
    seat(sim, 1, { id: 2, kind: 'regular', order: 1 });
    sim.shelf = ['good', 'good'];
    must(sim, OP.sell, 1 * 2);
    expect(sim.seats[0]).toBeNull();
    expect(sim.stats.left).toBe(1);
    expect(sim.stats.repChange).toBe(-3 + 2);
    // 먼저 온 손님에게 파는 것은 괜찮다
    seat(sim, 0, { id: 3, kind: 'regular', order: 1 });
    seat(sim, 1, { id: 4, kind: 'office', order: 1 });
    sim.shelf = ['good'];
    must(sim, OP.sell, 0);
    expect(sim.seats[1]).not.toBeNull();
  });

  it('탄 빵 버리기', () => {
    const sim = createDay(initialShopState(), 'trash');
    sim.shelf = ['good', 'burnt', 'raw', 'burnt'];
    must(sim, OP.trash, 0);
    expect(sim.shelf).toEqual(['good', 'raw']);
    expect(sim.stats.trashed).toBe(2);
  });
});

describe('마감과 정산', () => {
  it('마감 때 남은 손님은 평판 변화 없이 떠나고, 남은 빵은 폐기한다. 마감 뒤 입력은 실패', () => {
    const sim = createDay(initialShopState(), 'close');
    run(sim, DAY_TICKS - 1);
    seat(sim, 2, {});
    sim.shelf = ['good', 'good'];
    sim.molds[0]!.phase = 'bottom';
    const rep = sim.stats.repChange;
    run(sim, 1);
    expect(sim.closed).toBe(true);
    expect(sim.seats).toEqual([null, null, null]);
    expect(sim.stats.repChange).toBe(rep);
    expect(sim.stats.wasted).toBe(3);
    expect(applyInput(sim, OP.tap, 1)).toEqual({ ok: false, reason: 'closed' });
  });

  it('지원금: 하루를 시작할 때 돈이 500원 미만이면 500원으로 채운다', () => {
    const sim = createDay(steadyShop({ money: 120 }), 'subsidy');
    expect(sim.money).toBe(500);
    expect(sim.stats.subsidy).toBe(380);
    expect(createDay(steadyShop({ money: 900 }), 'subsidy').stats.subsidy).toBe(0);
  });

  it('정산: 하루 수익 = 매출 − 재료비(음수면 점수 0), 평판 레벨은 내려가지 않는다', () => {
    const shop = steadyShop({ reputation: 85, day: 4 });
    const sim = createDay(shop, 'settle');
    sim.stats.revenue = 300;
    sim.stats.doughCost = 500;
    sim.stats.repChange = -40;
    sim.money = 777;
    const outcome = settleDay(sim);
    expect(outcome.profit).toBe(-200);
    expect(outcome.score).toBe(0);
    expect(outcome.nextState.day).toBe(5);
    expect(outcome.nextState.money).toBe(777);
    expect(levelOf(85)).toBe(3);
    expect(outcome.nextState.reputation).toBe(80);
    expect(outcome.nextState.stats.bestProfit).toBe(0);
  });
});

describe('다시 돌리기 (replayDay)', () => {
  const inputs: FishInput[] = [
    [10, OP.pump, 1],
    [10, OP.tap, 0],
    [12, OP.tap, 1],
    [70, OP.pump, 0],
    [300, OP.tap, 0],
    [302, OP.tap, 1],
    [560, OP.tap, 0],
    [561, OP.tap, 1],
  ];

  it('같은 시드·상태·입력이면 같은 결과', () => {
    const a = replayDay('replay', inputs, initialShopState());
    const b = replayDay('replay', inputs, initialShopState());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.score).toBe(b.score);
    expect(a.nextState).toEqual(b.nextState);
    expect(a.ticks).toBe(561);
    expect(a.nextState.day).toBe(2);
    expect(a.sim.stats.pours).toBe(2);
  });

  it('틱이 줄어들거나 하루를 넘거나 규칙에 안 맞는 입력이면 실패', () => {
    expect(replayDay('r', [[20, OP.tap, 0], [10, OP.tap, 1]], initialShopState())).toMatchObject({ ok: false, reason: 'bad_tick', index: 1 });
    expect(replayDay('r', [[DAY_TICKS, OP.tap, 0]], initialShopState())).toMatchObject({ ok: false, reason: 'bad_tick', index: 0 });
    expect(replayDay('r', [[0, 9, 0]], initialShopState())).toMatchObject({ ok: false, reason: 'bad_op' });
    expect(replayDay('r', [[0, OP.sell, 0]], initialShopState())).toMatchObject({ ok: false, reason: 'no_customer' });
  });

  it('서버 로직(fishBunLogic): 입력 형식·저장 형식·가게 행동', () => {
    expect(fishBunLogic.inputSchema.safeParse(inputs).success).toBe(true);
    expect(fishBunLogic.inputSchema.safeParse([[0, 'tap', 0]]).success).toBe(false);
    expect(fishBunLogic.inputSchema.safeParse([[0, 7, 0]]).success).toBe(false);
    expect(fishBunLogic.stateSchema.parse(initialShopState())).toEqual(initialShopState());
    expect(fishBunLogic.actionSchema.safeParse({ op: 'upgrade', key: 'golden' }).success).toBe(true);
    expect(fishBunLogic.actionSchema.safeParse({ op: 'upgrade', key: 'rocket' }).success).toBe(false);
    const day = fishBunLogic.replayDay('replay', inputs, initialShopState());
    expect(day.ok && 'nextState' in day && !('sim' in day)).toBe(true);
  });
});

describe('강화', () => {
  it('돈 부족·평판 부족·최대 단계는 실패, 사면 돈이 줄고 단계가 오른다', () => {
    const state = initialShopState();
    expect(applyShopAction({ ...state, money: 100 }, { op: 'upgrade', key: 'seasoning' })).toEqual({ ok: false, reason: 'no_money' });
    expect(applyShopAction({ ...state, money: 99999 }, { op: 'upgrade', key: 'molds' })).toEqual({ ok: false, reason: 'locked' });
    const bought = applyShopAction({ ...state, money: 5000, reputation: 30 }, { op: 'upgrade', key: 'molds' });
    expect(bought).toMatchObject({ ok: true, state: { money: 2000, upgrades: { molds: 1 } } });
    const maxed = { ...state, money: 99999, upgrades: { ...state.upgrades, shelf: 3 } };
    expect(applyShopAction(maxed, { op: 'upgrade', key: 'shelf' })).toEqual({ ok: false, reason: 'max_level' });
  });

  it('강화가 그날 값에 반영된다', () => {
    const state = initialShopState();
    const up = createDay({ ...state, upgrades: { molds: 2, seasoning: 0, burner: 0, recipe: 2, golden: 5, shelf: 1, sign: 0 } }, 's');
    expect(up.molds).toHaveLength(12);
    expect(up.params.price).toBe(160);
    expect(up.params.goldChance).toBe(150);
    expect(up.params.shelfCap).toBe(16);
  });
});
