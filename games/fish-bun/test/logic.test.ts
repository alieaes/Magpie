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
  KINDS,
  LAST_ARRIVAL_TICK,
  OFFICE_FREE_TICKS,
  MENUS,
  MIN_TAP_GAP,
  REPAIR_HITS,
  REPAIR_TICKS,
  OP,
  advance,
  applyInput,
  applyShopAction,
  burnBonus,
  createDay,
  drawCustomer,
  fishBunLogic,
  goldenChance,
  initialShopState,
  judgeSale,
  levelOf,
  openMenus,
  replayDay,
  sellArg,
  settleDay,
  shelfCount,
  tapArg,
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
  const c: Customer = { id: 100 + index, kind: 'regular', menu: 0, lang: null, order: 1, patience: 1200, waited: 0, ...customer };
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
    return sim.shelves[0]![0];
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
    sim.shelves[0] = Array.from({ length: 12 }, () => 'good' as const);
    must(sim, OP.tap, 0);
    run(sim, MIN_TAP_GAP);
    must(sim, OP.tap, 0);
    run(sim, MIN_TAP_GAP);
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
  it('손님은 시드대로 온다. 자리가 없으면 기다렸다가, 마감 10초 전부터는 오지 않는다', () => {
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
    sim.shelves[0] = ['good'];
    expect(applyInput(sim, OP.sell, 1 * 2)).toEqual({ ok: false, reason: 'no_stock' });
    sim.shelves[0] = ['good', 'good'];
    expect(applyInput(sim, OP.sell, 1 * 2 + 1)).toEqual({ ok: false, reason: 'no_stock' });
  });

  it('판매 금액: 품질 배율, 덤은 값을 받지 않고, 덤으로 만족하면 콤보 보너스', () => {
    const sim = createDay(initialShopState(), 'money');
    const startMoney = sim.money;
    seat(sim, 0, { order: 2 });
    sim.shelves[0] = ['good', 'raw'];
    must(sim, OP.sell, 0);
    // 120 + 60, 점수 −1 → 아쉬움
    expect(sim.money - startMoney).toBe(180);
    expect(sim.stats.served.meh).toBe(1);
    expect(sim.combo).toBe(0);

    seat(sim, 1, { order: 1 });
    sim.shelves[0] = ['good', 'good'];
    must(sim, OP.sell, 1 * 2 + 1);
    // 덤 → 만족, 콤보 1: 120 + 10%
    expect(sim.money - startMoney).toBe(180 + 132);
    expect(sim.combo).toBe(1);
    expect(sim.stats.sold).toBe(4);

    seat(sim, 2, { order: 1 });
    sim.shelves[0] = ['golden', 'good'];
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
    sim.shelves[0] = ['burnt', 'burnt'];
    must(sim, OP.sell, 0);
    expect(sim.money - startMoney).toBe(Math.floor((36 + 36) / 2));
    expect(sim.stats.repChange).toBe(-3);
    seat(sim, 1, { kind: 'reviewer', order: 1 });
    sim.shelves[0] = ['good'];
    must(sim, OP.sell, 2);
    expect(sim.stats.repChange).toBe(-3 + 6);
  });

  it('바쁜 직장인보다 나중에 온 손님에게 먼저 팔면 직장인이 떠난다', () => {
    const sim = createDay(initialShopState(), 'office');
    seat(sim, 0, { id: 1, kind: 'office', order: 1 });
    seat(sim, 1, { id: 2, kind: 'regular', order: 1 });
    sim.shelves[0] = ['good', 'good'];
    must(sim, OP.sell, 1 * 2);
    expect(sim.seats[0]).toBeNull();
    expect(sim.stats.left).toBe(1);
    expect(sim.stats.repChange).toBe(-3 + 2);
    // 먼저 온 손님에게 파는 것은 괜찮다
    seat(sim, 0, { id: 3, kind: 'regular', order: 1 });
    seat(sim, 1, { id: 4, kind: 'office', order: 1 });
    sim.shelves[0] = ['good'];
    must(sim, OP.sell, 0);
    expect(sim.seats[1]).not.toBeNull();
  });

  it('탄 빵 버리기', () => {
    const sim = createDay(initialShopState(), 'trash');
    sim.shelves[0] = ['good', 'burnt', 'raw', 'burnt'];
    must(sim, OP.trash, 0);
    expect(sim.shelves[0]).toEqual(['good', 'raw']);
    expect(sim.stats.trashed).toBe(2);
  });
});

describe('마감과 정산', () => {
  it('마감 때 남은 손님은 평판 변화 없이 떠나고, 남은 빵은 폐기한다. 마감 뒤 입력은 실패', () => {
    const sim = createDay(initialShopState(), 'close');
    run(sim, DAY_TICKS - 1);
    seat(sim, 2, {});
    sim.shelves[0] = ['good', 'good'];
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

describe('메뉴 (팥·슈크림·피자)', () => {
  /** 평판 Lv5(피자까지 열림)이고 화력이 50%에 머무는 가게 */
  const allMenus = () => steadyShop({ reputation: 280 });

  /** menu 반죽을 0번 빵틀에 붓고 bottomTicks 뒤 뒤집고 topTicks 뒤 꺼낸 품질 */
  function bakeMenu(menu: number, bottomTicks: number, topTicks: number, seed = plainSeed()) {
    const sim = createDay(allMenus(), seed);
    must(sim, OP.tap, tapArg(0, menu));
    run(sim, bottomTicks);
    must(sim, OP.tap, 0);
    run(sim, topTicks);
    must(sim, OP.tap, 0);
    return sim.shelves[menu]![0];
  }

  it('메뉴는 평판 레벨로 열린다: 슈크림 Lv3, 피자 Lv5', () => {
    expect([1, 2, 3, 4, 5, 9].map(openMenus)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(createDay(initialShopState(), 'm').params.menus).toBe(1);
    expect(createDay(steadyShop({ reputation: 80 }), 'm').params.menus).toBe(2);
    expect(createDay(allMenus(), 'm').params.menus).toBe(3);
  });

  it('메뉴별 익힘 구간: 슈크림은 빨리 익고 빨리 타고, 피자는 오래 익는다', () => {
    // 화력 50%(속도 110): 슈크림 알맞음 210~330틱, 피자 300~480틱
    expect([MENUS[1]!.doneAt / 110, MENUS[1]!.burnAt / 110]).toEqual([210, 330]);
    expect([MENUS[2]!.doneAt / 110, MENUS[2]!.burnAt / 110]).toEqual([300, 480]);
    expect(bakeMenu(1, 210, 210)).toBe('good');
    expect(bakeMenu(1, 209, 210)).toBe('raw');
    expect(bakeMenu(1, 330, 210)).toBe('burnt');
    expect(bakeMenu(1, 329, 329)).toBe('good');
    expect(bakeMenu(2, 300, 300)).toBe('good');
    expect(bakeMenu(2, 299, 300)).toBe('raw');
    expect(bakeMenu(2, 479, 479)).toBe('good');
    expect(bakeMenu(2, 300, 480)).toBe('burnt');
  });

  it('황금 후보의 반짝임은 그 메뉴가 알맞음에 들어설 때 시작한다', () => {
    const seed = goldenSeed();
    expect(bakeMenu(1, 210, 210, seed)).toBe('golden');
    expect(bakeMenu(1, 210, 245, seed)).toBe('golden');
    expect(bakeMenu(1, 210, 246, seed)).toBe('burnt');
    expect(bakeMenu(2, 300, 299, seed)).toBe('raw');
    expect(bakeMenu(2, 300, 300, seed)).toBe('golden');
  });

  it('메뉴별 재료비와 빵 값 (반죽 레시피는 모든 메뉴에 더한다)', () => {
    const sim = createDay(allMenus(), plainSeed());
    const start = sim.money;
    must(sim, OP.tap, tapArg(0, 1));
    must(sim, OP.tap, tapArg(1, 2));
    expect(start - sim.money).toBe(70 + 90);
    expect(sim.stats.doughCost).toBe(160);
    expect(sim.params.prices).toEqual([120, 160, 200]);
    const rich = createDay(steadyShop({ reputation: 280, upgrades: { ...initialShopState().upgrades, burner: 5, recipe: 1 } }), 'p');
    expect(rich.params.prices).toEqual([140, 180, 220]);
  });

  it('열리지 않은 메뉴는 부을 수 없고, 없는 메뉴나 굽는 틀에 메뉴를 붙인 값은 실패', () => {
    const sim = createDay(steadyShop({ reputation: 80 }), plainSeed());
    expect(applyInput(sim, OP.tap, tapArg(0, 2))).toEqual({ ok: false, reason: 'locked_menu' });
    must(sim, OP.tap, tapArg(0, 1));
    expect(sim.molds[0]!.menu).toBe(1);
    run(sim, MIN_TAP_GAP);
    expect(applyInput(sim, OP.tap, tapArg(0, 1))).toEqual({ ok: false, reason: 'bad_menu' });
    expect(applyInput(sim, OP.tap, tapArg(1, 3))).toEqual({ ok: false, reason: 'bad_menu' });
    expect(applyInput(sim, OP.sell, sellArg(0, false, 3))).toEqual({ ok: false, reason: 'bad_menu' });
  });

  it('팥 입력 값은 메뉴를 넣기 전과 같다', () => {
    expect(tapArg(5)).toBe(5);
    expect([sellArg(0, false), sellArg(1, true), sellArg(2, false)]).toEqual([0, 3, 4]);
    expect(sellArg(2, true, 1)).toBe(8 + 5);
  });

  it('판매는 주문한 메뉴의 진열대 앞쪽부터 나가고, 그 메뉴가 모자라면 no_stock', () => {
    const sim = createDay(allMenus(), 'menu-sell');
    seat(sim, 0, { menu: 1, order: 2 });
    sim.shelves = [['good', 'good', 'good'], ['raw'], []];
    expect(applyInput(sim, OP.sell, sellArg(0, false, 1))).toEqual({ ok: false, reason: 'no_stock' });
    sim.shelves = [['good', 'good'], ['golden', 'raw', 'good'], []];
    const start = sim.money;
    must(sim, OP.sell, sellArg(0, false, 1));
    expect(sim.shelves).toEqual([['good', 'good'], ['good'], []]);
    // 황금 160 × 3 + 덜 익음 160 × 0.5, 점수 +1 → 만족(팁 없음)
    expect(sim.money - start).toBe(480 + 80);
    expect(sim.stats.soldBy).toEqual([0, 2, 0]);
  });

  it('주문과 다른 메뉴를 주면 불만: 절반만 내고 평판 −3, 콤보 0', () => {
    const sim = createDay(allMenus(), 'wrong');
    seat(sim, 0, { menu: 2, order: 1 });
    sim.shelves = [['good'], [], ['good']];
    sim.combo = 4;
    const start = sim.money;
    sim.events = [];
    must(sim, OP.sell, sellArg(0, false, 0));
    expect(sim.money - start).toBe(60);
    expect(sim.stats.served.bad).toBe(1);
    expect(sim.stats.repChange).toBe(-3);
    expect(sim.combo).toBe(0);
    expect(sim.events).toContainEqual(expect.objectContaining({ type: 'sale', menu: 0, result: 'bad' }));
  });

  it('탄 빵 버리기는 메뉴 상관없이, 마감 폐기는 메뉴를 합친 수', () => {
    const sim = createDay(allMenus(), 'trash-menus');
    sim.shelves = [['burnt', 'good'], ['burnt'], ['raw', 'burnt']];
    must(sim, OP.trash, 0);
    expect(sim.shelves).toEqual([['good'], [], ['raw']]);
    expect(sim.stats.trashed).toBe(3);
    expect(shelfCount(sim)).toBe(2);
  });

  it('손님은 열린 메뉴만 주문하고, 팥만 열린 날은 메뉴를 뽑지 않는다(난수 순서가 그대로)', () => {
    const a = new SeededRandom('order-menu');
    const b = new SeededRandom('order-menu');
    const drawn = drawCustomer(a, 2, 1);
    const kindRoll = b.int(0, 99);
    expect(drawn.menu).toBe(0);
    expect(kindRoll).toBeGreaterThanOrEqual(0);
    const [min, max] = KINDS[drawn.kind].order;
    expect(drawn.order).toBe(b.int(min, max));
    expect(a.int(0, 999)).toBe(b.int(0, 999));

    const sim = createDay(allMenus(), 'many-menus');
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) seen.add(drawCustomer(sim.customersRng, 5, 3).menu);
    expect([...seen].sort()).toEqual([0, 1, 2]);
    const two = new Set<number>();
    for (let i = 0; i < 400; i += 1) two.add(drawCustomer(sim.customersRng, 3, 2).menu);
    expect([...two].sort()).toEqual([0, 1]);
  });
});

describe('특별 손님 (수수께끼·관광객·진상)', () => {
  /** 평판 Lv5(세 메뉴, 특별 손님 모두 등장)이고 화력이 50%에 머무는 가게 */
  const lv5 = () => steadyShop({ reputation: 280 });

  it('수수께끼 손님: 맞는 메뉴면 판정대로 + 팁 30% + 평판 +1, 다른 메뉴면 불만', () => {
    const sim = createDay(lv5(), 'riddle');
    seat(sim, 0, { kind: 'riddler', menu: 1, order: 1 });
    sim.shelves = [['good'], ['good'], []];
    const start = sim.money;
    must(sim, OP.sell, sellArg(0, false, 1));
    // 160 + 팁 48
    expect(sim.money - start).toBe(160 + 48);
    expect(sim.stats.repChange).toBe(2 + 1);

    seat(sim, 1, { kind: 'riddler', menu: 1, order: 1 });
    const before = sim.money;
    must(sim, OP.sell, sellArg(1, false, 0));
    expect(sim.money - before).toBe(60);
    expect(sim.stats.served.bad).toBe(1);
    expect(sim.stats.repChange).toBe(3 - 3);
  });

  it('관광객: 맞는 메뉴면 판정대로(팁 없음), 다른 메뉴면 불만', () => {
    const sim = createDay(lv5(), 'tourist');
    seat(sim, 0, { kind: 'tourist', menu: 2, lang: 'ja', order: 1 });
    sim.shelves = [['good'], [], ['good']];
    const start = sim.money;
    must(sim, OP.sell, sellArg(0, false, 2));
    expect(sim.money - start).toBe(200);
    expect(sim.stats.served.good).toBe(1);
    seat(sim, 1, { kind: 'tourist', menu: 2, lang: 'en', order: 1 });
    must(sim, OP.sell, sellArg(1, false, 0));
    expect(sim.stats.served.bad).toBe(1);
  });

  it('특별 손님은 등장 레벨부터 오고, 수수께끼는 열린 메뉴만, 관광객 말은 시드대로 정해진다', () => {
    const kindsAt = (level: number, menus: number, seed: string) => {
      const rng = new SeededRandom(seed);
      return Array.from({ length: 600 }, () => drawCustomer(rng, level, menus));
    };
    const lv2 = kindsAt(2, 1, 'k2');
    expect(lv2.some((c) => ['riddler', 'tourist', 'rude'].includes(c.kind))).toBe(false);
    const lv3 = kindsAt(3, 2, 'k3');
    expect(lv3.some((c) => c.kind === 'riddler')).toBe(true);
    expect(lv3.some((c) => c.kind === 'tourist' || c.kind === 'rude')).toBe(false);
    expect(lv3.filter((c) => c.kind === 'riddler').every((c) => c.menu < 2)).toBe(true);
    const lv5 = kindsAt(5, 3, 'k5');
    const tourists = lv5.filter((c) => c.kind === 'tourist');
    expect(new Set(tourists.map((c) => c.lang))).toEqual(new Set(['en', 'ja']));
    expect(lv5.filter((c) => c.kind !== 'tourist').every((c) => c.lang === null)).toBe(true);
    expect(lv5.some((c) => c.kind === 'rude')).toBe(true);
    expect(kindsAt(5, 3, 'k5')).toEqual(lv5);
  });

  it('진상 손님이 불만이면 굽는 빵틀 하나가 깨지고 굽던 빵은 폐기, 깨질 틀은 시드대로', () => {
    const run1 = () => {
      const sim = createDay(lv5(), 'rude-bad');
      must(sim, OP.tap, 0);
      must(sim, OP.tap, 1);
      // 탄 빵 두 개(−4) → 불만
      seat(sim, 0, { kind: 'rude', order: 2 });
      sim.shelves = [['burnt', 'burnt'], [], []];
      sim.events = [];
      must(sim, OP.sell, sellArg(0, false, 0));
      return sim;
    };
    const sim = run1();
    const broken = sim.molds.findIndex((m) => m.broken);
    expect([0, 1]).toContain(broken);
    expect(sim.molds[broken]!.phase).toBe('empty');
    expect(sim.stats.broken).toBe(1);
    expect(sim.stats.wasted).toBe(1);
    expect(sim.events).toContainEqual({ type: 'break', mold: broken, wasted: true });
    expect(run1().molds.findIndex((m) => m.broken)).toBe(broken);
  });

  it('진상 손님이 기다리다 떠나면 빵틀을 깬다. 굽는 틀이 없으면 빈 틀 중에서', () => {
    const sim = createDay(lv5(), 'rude-leave');
    sim.nextArrival = DAY_TICKS;
    seat(sim, 0, { kind: 'rude', patience: 3 });
    run(sim, 3);
    expect(sim.stats.left).toBe(1);
    expect(sim.stats.broken).toBe(1);
    expect(sim.stats.wasted).toBe(0);
    // 만족이면 깨지 않는다
    seat(sim, 1, { kind: 'rude', order: 1 });
    sim.shelves = [['good'], [], []];
    must(sim, OP.sell, sellArg(1, false, 0));
    expect(sim.stats.broken).toBe(1);
  });

  it('깨진 빵틀: 부을 수 없고 5번 누르면 고쳐지며, 안 고치면 20초 뒤 저절로 고쳐진다', () => {
    const sim = createDay(lv5(), 'repair');
    sim.nextArrival = DAY_TICKS;
    seat(sim, 0, { kind: 'rude', patience: 1 });
    run(sim, 1);
    const i = sim.molds.findIndex((m) => m.broken);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(applyInput(sim, OP.tap, tapArg(i, 1))).toEqual({ ok: false, reason: 'bad_menu' });
    for (let hit = 1; hit < REPAIR_HITS; hit += 1) {
      must(sim, OP.tap, i);
      expect(sim.molds[i]!.broken).toBe(true);
      run(sim, MIN_TAP_GAP);
    }
    must(sim, OP.tap, i);
    expect(sim.molds[i]!.broken).toBe(false);
    run(sim, MIN_TAP_GAP);
    must(sim, OP.tap, i);
    expect(sim.molds[i]!.phase).toBe('bottom');

    const auto = createDay(lv5(), 'repair');
    auto.nextArrival = DAY_TICKS;
    seat(auto, 0, { kind: 'rude', patience: 1 });
    run(auto, 1);
    const j = auto.molds.findIndex((m) => m.broken);
    run(auto, REPAIR_TICKS - 1);
    expect(auto.molds[j]!.broken).toBe(true);
    run(auto, 1);
    expect(auto.molds[j]!.broken).toBe(false);
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
    expect(up.params.prices).toEqual([160, 200, 240]);
    expect(up.params.goldChance).toBe(150);
    expect(up.params.shelfCap).toBe(16);
  });
});

describe('초반과 막다른 길', () => {
  it('하루를 연 뒤 20초 동안은 바쁜 직장인이 오지 않는다', () => {
    for (let n = 0; n < 40; n += 1) {
      const sim = createDay({ ...initialShopState(), reputation: 30 }, `office-${n}`);
      run(sim, OFFICE_FREE_TICKS);
      for (const c of sim.seats) expect(c?.kind).not.toBe('office');
    }
  });

  it('돈이 바닥나 빵도 빵틀도 없으면 팥 반죽 한 번은 거저 부어진다', () => {
    const sim = createDay(initialShopState(), 'stuck');
    sim.money = 10;
    must(sim, OP.tap, tapArg(0, 0));
    expect(sim.molds[0]!.phase).toBe('bottom');
    expect(sim.money).toBe(10);
    // 이미 굽는 틀이 있으면 돈이 모자란 붓기는 막힌다
    run(sim, MIN_TAP_GAP);
    expect(applyInput(sim, OP.tap, tapArg(1, 0))).toEqual({ ok: false, reason: 'no_money' });
  });
});
