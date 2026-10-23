import { describe, expect, it } from 'vitest';
import {
  ACT_TICKS,
  ANGRY_MOOD,
  BASE_STEP,
  DAY_TICKS,
  DONE_TICKS,
  LAST_ARRIVAL_TICK,
  MAX_TICKS,
  MENUS,
  OP,
  SUBSIDY_FLOOR,
  TRASH_STATION,
  WATER,
  WATER_STATION,
  advance,
  applyInput,
  applyShopAction,
  createDay,
  drawGroup,
  expForLevel,
  facedTarget,
  findPath,
  gradeOf,
  initialShopState,
  isWalkable,
  levelOf,
  menuPrice,
  newlyUnlocked,
  replayDay,
  routeTo,
  settleDay,
  snackBarLogic,
  type DaySim,
  type Dir,
  type Guest,
  type ShopState,
  type SnackInput,
} from '../src/logic';
import { SeededRandom } from '@magpie/shared';

/** n틱 진행한다 */
function run(sim: DaySim, n: number): void {
  for (let i = 0; i < n; i += 1) advance(sim);
}

/** 성공해야 하는 입력 */
function must(sim: DaySim, op: number, arg = 0): void {
  expect(applyInput(sim, op, arg)).toEqual({ ok: true });
}

/** 일을 마칠 때까지 기다린다 */
function settle(sim: DaySim): void {
  while (sim.tick < sim.busyUntil) advance(sim);
}

/** 캐릭터를 칸에 세우고 방향을 정한다 */
function stand(sim: DaySim, x: number, y: number, facing: Dir): void {
  sim.pos = { x, y };
  sim.facing = facing;
}

/** 손님이 오지 않는 하루 (테스트에서 손님을 직접 앉힌다) */
function quietDay(state: ShopState = initialShopState()): DaySim {
  const sim = createDay(state, 'test', true);
  sim.nextArrival = Number.MAX_SAFE_INTEGER;
  return sim;
}

/** 테이블에 손님을 바로 앉힌다 (물 기다림) */
function seat(sim: DaySim, index: number, guests: Partial<Guest>[], patience = 900): void {
  const list: Guest[] = guests.map((g) => ({ look: 0, cloth: 0, big: false, menu: 0, count: 1, left: g.count ?? 1, ...g }));
  sim.tables[index] = { phase: 'water', group: 1, guests: list, mood: 0, patience, gauge: patience, timer: 0, eat: 480, wipes: 0, served: 0 };
}

describe('격자', () => {
  it('테이블 칸(잠긴 테이블 포함)·조리대 줄·문만 못 지나가고, 테이블 위아래 칸은 길이다', () => {
    expect(isWalkable(1, 3)).toBe(true);
    expect(isWalkable(1, 1)).toBe(false);
    expect(isWalkable(5, 5)).toBe(false);
    for (const y of [0, 2, 4, 6]) for (const x of [1, 3, 5]) expect(isWalkable(x, y)).toBe(true);
    expect(isWalkable(7, 2)).toBe(false);
    expect(isWalkable(0, 6)).toBe(false);
    expect(isWalkable(6, 6)).toBe(true);
  });

  it('바라보는 대상: 테이블은 좌우에서만(위아래 길에서는 없음), 조리대는 x = 6에서 오른쪽', () => {
    expect(facedTarget({ x: 6, y: 1 }, 1)).toEqual({ kind: 'station', index: 1 });
    expect(facedTarget({ x: 6, y: 1 }, 3)).toEqual({ kind: 'table', index: 2 });
    expect(facedTarget({ x: 2, y: 5 }, 3)).toEqual({ kind: 'table', index: 3 });
    expect(facedTarget({ x: 4, y: 3 }, 2)).toBeNull();
    expect(facedTarget({ x: 3, y: 0 }, 2)).toBeNull();
    expect(facedTarget({ x: 3, y: 2 }, 0)).toBeNull();
    expect(facedTarget({ x: 5, y: 4 }, 2)).toBeNull();
  });

  it('길찾기: 테이블 위아래 길로 가로지른다', () => {
    expect(findPath({ x: 2, y: 1 }, { x: 4, y: 1 })).toEqual([0, 1, 1, 2]);
    expect(findPath({ x: 0, y: 1 }, { x: 4, y: 1 })).toEqual([0, 1, 1, 1, 1, 2]);
    expect(findPath({ x: 4, y: 3 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath({ x: 4, y: 3 }, { x: 1, y: 6 })?.length).toBe(6);
    const route = routeTo({ x: 4, y: 3 }, { kind: 'station', index: 0 });
    expect(route?.dir).toBe(1);
    expect(route?.path.length).toBe(5);
  });
});

describe('레벨·등급', () => {
  it('레벨 L은 누적 경험치 50 × L × (L - 1)', () => {
    expect(expForLevel(2)).toBe(100);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(levelOf(300)).toBe(3);
    expect(levelOf(4_500)).toBe(10);
  });

  it('메뉴 등급과 값: 30·90·200·400·800그릇, 등급마다 +10%', () => {
    expect([0, 29, 30, 90, 200, 400, 800, 5000].map(gradeOf)).toEqual([0, 0, 1, 2, 3, 4, 5, 5]);
    expect(menuPrice(0, 0)).toBe(2000);
    expect(menuPrice(2, 1)).toBe(2750);
    expect(menuPrice(4, 5)).toBe(4500);
  });

  it('두 명 무리는 서로 다른 메뉴를 시킨다', () => {
    const rng = new SeededRandom('g');
    const orders = new SeededRandom('o');
    for (let i = 0; i < 200; i += 1) {
      const group = drawGroup(rng, orders, 6, [3, 3, 3, 3, 3]);
      if (group.length === 2) expect(group[0]!.menu).not.toBe(group[1]!.menu);
      for (const g of group) expect(g.look).toBeLessThan(34);
    }
  });
});

describe('걷기·행동', () => {
  it('통로면 한 칸 걷고 걸음 틱 동안 다른 입력을 받지 않는다. 막힌 쪽은 바라보기만', () => {
    const sim = quietDay();
    must(sim, OP.move, 1);
    expect(sim.pos).toEqual({ x: 5, y: 3 });
    expect(applyInput(sim, OP.move, 1)).toEqual({ ok: false, reason: 'busy' });
    run(sim, BASE_STEP);
    stand(sim, 6, 1, 2);
    must(sim, OP.move, 1);
    expect(sim.pos).toEqual({ x: 6, y: 1 });
    expect(sim.facing).toBe(1);
    expect(sim.busyUntil).toBeLessThanOrEqual(sim.tick);
  });

  it('걷는 중 반대 방향이면 걸어온 틱만큼 걸려 되돌아선다. 다른 방향·행동은 busy', () => {
    const sim = quietDay();
    must(sim, OP.move, 1);
    run(sim, 3);
    expect(applyInput(sim, OP.move, 0)).toEqual({ ok: false, reason: 'busy' });
    expect(applyInput(sim, OP.move, 1)).toEqual({ ok: false, reason: 'busy' });
    expect(applyInput(sim, OP.act, 0)).toEqual({ ok: false, reason: 'busy' });
    must(sim, OP.move, 3);
    expect(sim.pos).toEqual({ x: 4, y: 3 });
    expect(sim.stepFrom).toEqual({ x: 5, y: 3 });
    expect(sim.facing).toBe(3);
    expect(sim.busyUntil).toBe(sim.tick + 3);
    // 화면이 중간 자리에서 이어 그리도록 걸음 끝 = 되돌아온 시각
    expect(sim.stepAt + BASE_STEP).toBe(sim.busyUntil);
    // 돌아오는 중에 다시 반대: 1틱 돌아왔으니 (4,3)에서 2/9 자리, 남은 7/9만큼 걸린다
    run(sim, 1);
    must(sim, OP.move, 1);
    expect(sim.pos).toEqual({ x: 5, y: 3 });
    expect(sim.busyUntil).toBe(sim.tick + BASE_STEP - 2);
    settle(sim);
    // 걸음을 마친 뒤 반대 방향은 보통 걸음
    must(sim, OP.move, 3);
    expect(sim.busyUntil).toBe(sim.tick + BASE_STEP);
  });

  it('걸음을 시작한 틱에 되돌아서면 제자리, 일하는 중에는 되돌아서기 없음', () => {
    const sim = quietDay();
    must(sim, OP.move, 1);
    must(sim, OP.move, 3);
    expect(sim.pos).toEqual({ x: 4, y: 3 });
    expect(sim.busyUntil).toBe(sim.tick);
    must(sim, OP.move, 1);
    settle(sim);
    must(sim, OP.act, 0);
    expect(applyInput(sim, OP.move, 3)).toEqual({ ok: false, reason: 'busy' });
  });

  it('조리: 첫 누름에 재료비, 연타 수만큼 누르면 쟁반으로. 진행은 조리대에 남는다', () => {
    const sim = quietDay();
    stand(sim, 6, 0, 1);
    const money = sim.money;
    for (let i = 0; i < MENUS[0]!.taps; i += 1) {
      must(sim, OP.act);
      if (i === 0) expect(sim.money).toBe(money - MENUS[0]!.cost);
      settle(sim);
    }
    expect(sim.tray[0]).toBe(0);
    expect(sim.stations[0]!.progress).toBe(0);
    must(sim, OP.act);
    settle(sim);
    expect(sim.stations[0]!.progress).toBe(1);
  });

  it('쟁반이 가득이면 완성된 접시는 조리대에서 기다렸다가, 자리가 나면 가져온다', () => {
    const sim = quietDay();
    sim.tray = [WATER, WATER, WATER];
    stand(sim, 6, 1, 1);
    for (let i = 0; i < MENUS[1]!.taps; i += 1) {
      must(sim, OP.act);
      settle(sim);
    }
    expect(sim.stations[1]!.ready).toBe(true);
    must(sim, OP.act);
    settle(sim);
    expect(sim.events?.at(-1)).toEqual({ type: 'nothing', reason: 'trayFull' });
    sim.tray[2] = null;
    must(sim, OP.act);
    expect(sim.tray[2]).toBe(1);
    expect(sim.stations[1]!.ready).toBe(false);
  });

  it('돈이 모자라면 조리를 시작하지 못한다(실패가 아니라 아무 일 없음). 잠긴 메뉴도 마찬가지', () => {
    const sim = quietDay();
    sim.money = 100;
    stand(sim, 6, 0, 1);
    must(sim, OP.act);
    expect(sim.stations[0]!.progress).toBe(0);
    settle(sim);
    stand(sim, 6, 4, 1);
    must(sim, OP.act);
    expect(sim.events?.at(-1)).toEqual({ type: 'nothing', reason: 'locked' });
  });

  it('물·단무지 통은 빈 칸에 세트를 담는다 (큰 물통이면 2세트)', () => {
    const base = initialShopState();
    const sim = quietDay({ ...base, upgrades: { ...base.upgrades, jug: 1 } });
    stand(sim, 6, WATER_STATION, 1);
    must(sim, OP.act);
    expect(sim.tray).toEqual([WATER, WATER, null]);
  });
});

describe('손님 한 테이블', () => {
  it('물 → 주문 → 음식 → 식사 → 계산(팁) → 더러운 테이블 → 3번 닦기', () => {
    const sim = quietDay();
    seat(sim, 2, [{ menu: 0 }]);
    stand(sim, 6, 1, 3);
    sim.tray = [WATER, 0, null];
    must(sim, OP.give, 1);
    expect(sim.events?.at(-1)).toMatchObject({ type: 'refuse', table: 2 });
    settle(sim);
    must(sim, OP.give, 0);
    expect(sim.tables[2]!.phase).toBe('food');
    expect(sim.tables[2]!.mood).toBe(1);
    settle(sim);
    must(sim, OP.give, 1);
    expect(sim.tables[2]!.phase).toBe('eating');
    const money = sim.money;
    run(sim, 480 + DONE_TICKS);
    expect(sim.tables[2]!.phase).toBe('dirty');
    // 나갈 때 +1 → 기분 3: 음식 값 2,000 + 팁 20%
    expect(sim.money).toBe(money + 2_400);
    expect(sim.stats.best).toBe(1);
    for (let i = 0; i < 3; i += 1) {
      must(sim, OP.act);
      settle(sim);
    }
    expect(sim.tables[2]!.phase).toBe('empty');
    expect(sim.stats.cleaned).toBe(1);
  });

  it('대식가는 시킨 그릇 수만큼 받아야 먹기 시작하고, 두 명은 각자 메뉴를 받는다', () => {
    const sim = quietDay();
    seat(sim, 2, [{ menu: 0, count: 2, big: true }, { menu: 1 }]);
    sim.tables[2]!.phase = 'food';
    stand(sim, 6, 1, 3);
    sim.tray = [0, 1, 0];
    must(sim, OP.give, 0);
    settle(sim);
    must(sim, OP.give, 1);
    settle(sim);
    expect(sim.tables[2]!.phase).toBe('food');
    must(sim, OP.give, 2);
    expect(sim.tables[2]!.phase).toBe('eating');
  });

  it('기다림 막대가 닳을 때마다 기분 -1, -3이면 화나서 나간다(돈 없음, 낸 음식은 버려짐, 테이블은 깨끗)', () => {
    const sim = quietDay();
    seat(sim, 1, [{ menu: 0, count: 2, big: true }], 100);
    sim.tables[1]!.phase = 'food';
    sim.tables[1]!.served = 1;
    run(sim, 100);
    expect(sim.tables[1]!.mood).toBe(-1);
    run(sim, 200);
    expect(sim.tables[1]!.phase).toBe('empty');
    expect(sim.stats.angry).toBe(1);
    expect(sim.stats.wasted).toBe(1);
    expect(sim.stats.service).toBe(ANGRY_MOOD);
  });

  it('쓰레기통을 바라보고 내면 버린다', () => {
    const sim = quietDay();
    stand(sim, 6, TRASH_STATION, 1);
    sim.tray = [2, null, null];
    must(sim, OP.give, 0);
    expect(sim.tray[0]).toBeNull();
    expect(sim.stats.discarded).toBe(1);
  });

  it('빈 테이블이 없으면 손님이 돌아간다', () => {
    const sim = createDay(initialShopState(), 'busy', true);
    for (const i of [1, 2, 4, 5]) seat(sim, i, [{ menu: 0 }], 1_000_000);
    run(sim, 2_000);
    expect(sim.stats.turnedAway).toBeGreaterThan(0);
    expect(sim.stats.groups).toBe(0);
  });
});

describe('마감', () => {
  it('20:30부터 새 손님이 없고, 21:00에 음식 못 받은 손님은 나가고 먹던 손님은 계산한 뒤 닫는다', () => {
    const sim = quietDay();
    run(sim, LAST_ARRIVAL_TICK);
    seat(sim, 1, [{ menu: 0 }], 1_000_000);
    seat(sim, 2, [{ menu: 0 }], 1_000_000);
    sim.tables[2]!.phase = 'eating';
    sim.tables[2]!.timer = 2_000;
    run(sim, DAY_TICKS - LAST_ARRIVAL_TICK);
    expect(sim.phase).toBe('overtime');
    expect(sim.tables[1]!.phase).toBe('empty');
    expect(sim.stats.closingLeft).toBe(1);
    run(sim, MAX_TICKS);
    expect(sim.phase).toBe('closed');
    expect(sim.tick).toBe(MAX_TICKS);
    expect(sim.stats.guests).toBe(1);
  });

  it('21:00에 정리할 테이블이 없으면 바로 닫는다', () => {
    const sim = quietDay();
    run(sim, DAY_TICKS);
    expect(sim.phase).toBe('closed');
  });
});

describe('다시 돌리기', () => {
  it('실패 사유: 틱 역행·하루 초과, 걷는 중, 빈 쟁반 칸, 없는 방향', () => {
    const state = initialShopState();
    expect(replayDay('s', [[10, OP.move, 1], [5, OP.act, 0]], state)).toMatchObject({ ok: false, reason: 'bad_tick', index: 1 });
    expect(replayDay('s', [[MAX_TICKS, OP.act, 0]], state)).toMatchObject({ ok: false, reason: 'bad_tick' });
    expect(replayDay('s', [[10, OP.move, 1], [12, OP.move, 1]], state)).toMatchObject({ ok: false, reason: 'busy', index: 1 });
    expect(replayDay('s', [[10, OP.give, 0]], state)).toMatchObject({ ok: false, reason: 'bad_slot' });
    expect(replayDay('s', [[10, OP.move, 4]], state)).toMatchObject({ ok: false, reason: 'bad_dir' });
  });

  it('같은 시드·입력·상태면 같은 결과', () => {
    const inputs: SnackInput[] = [
      [0, OP.move, 1],
      [9, OP.move, 1],
      [18, OP.move, 1],
      [18 + ACT_TICKS, OP.act, 0],
    ];
    const a = replayDay('same', inputs, initialShopState());
    const b = replayDay('same', inputs, initialShopState());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.nextState).toEqual(b.nextState);
  });

  it('되돌아서기를 섞은 입력도 화면식 진행과 다시 돌리기가 같다', () => {
    const inputs: SnackInput[] = [
      [0, OP.move, 1],
      [3, OP.move, 3],
      [4, OP.move, 1],
      [4, OP.move, 3],
      [20, OP.move, 0],
      [24, OP.move, 2],
      [40, OP.move, 1],
    ];
    const live = createDay(initialShopState(), 'rev');
    for (const [t, op, arg] of inputs) {
      while (live.tick < t) advance(live);
      expect(applyInput(live, op, arg)).toEqual({ ok: true });
    }
    while (live.phase !== 'closed') advance(live);
    const replayed = replayDay('rev', inputs, initialShopState());
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.sim.pos).toEqual(live.pos);
      expect(replayed.nextState).toEqual(settleDay(live).nextState);
    }
  });

  it('지원금: 하루를 열 때 3,000원 미만이면 채운다', () => {
    const sim = createDay({ ...initialShopState(), money: 1_000 }, 'x');
    expect(sim.money).toBe(SUBSIDY_FLOOR);
    expect(sim.stats.subsidy).toBe(2_000);
  });
});

describe('정산·성장', () => {
  it('하루 수익 = 음식 값 + 팁 - 재료비, 경험치 = 판 그릇 + 서비스 점수, Lv2면 콩콩이 열린다', () => {
    const sim = quietDay({ ...initialShopState(), exp: 90 });
    sim.stats.food = 10_000;
    sim.stats.tips = 1_000;
    sim.stats.cost = 4_000;
    sim.stats.sold = [3, 2, 0, 0, 0];
    sim.stats.service = 9;
    sim.phase = 'closed';
    const out = settleDay(sim);
    expect(out.profit).toBe(7_000);
    expect(out.score).toBe(7_000);
    expect(out.exp).toBe(14);
    expect(out.levelAfter).toBe(2);
    expect(out.newStaff).toEqual(['runner']);
    expect(out.nextState.sold).toEqual([3, 2, 0, 0, 0]);
    expect(out.nextState.day).toBe(2);
  });

  it('강화: 레벨 부족·돈 부족·최대 단계는 실패, 성공하면 돈이 줄고 다음 날 효과', () => {
    const state = { ...initialShopState(), money: 1_000_000 };
    expect(applyShopAction(state, { op: 'upgrade', key: 'tables' })).toEqual({ ok: false, reason: 'locked' });
    expect(applyShopAction({ ...state, money: 10 }, { op: 'upgrade', key: 'tray' })).toEqual({ ok: false, reason: 'no_money' });
    const bought = applyShopAction(state, { op: 'upgrade', key: 'jug' });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(applyShopAction(bought.state, { op: 'upgrade', key: 'jug' })).toEqual({ ok: false, reason: 'max_level' });
    expect(createDay(bought.state, 'x').params.waterSets).toBe(2);
  });

  it('직원 고르기: 잠긴 직원은 실패, 능력이 그날 값에 더해지고 한계를 지킨다', () => {
    const state = initialShopState();
    expect(applyShopAction(state, { op: 'pick', id: 'server' })).toEqual({ ok: false, reason: 'locked' });
    const open = { ...state, unlocked: [...state.unlocked, 'server' as const, 'cook' as const] };
    const picked = applyShopAction(open, { op: 'pick', id: 'server' });
    expect(picked.ok && createDay(picked.state, 'x').params.traySlots).toBe(4);
    const cook = { ...open, character: 'cook' as const, upgrades: { ...open.upgrades, stove: 2 } };
    expect(createDay(cook, 'x').params.taps).toEqual([2, 2, 2, 2, 2]);
  });

  it('누적 조건을 채운 직원이 열린다', () => {
    const state = { ...initialShopState(), sold: [0, 150, 0, 0, 0], stats: { ...initialShopState().stats, water: 150 } };
    expect(newlyUnlocked(state)).toEqual(['water', 'server']);
  });

  it('서버 로직: 시작 상태와 입력 형식이 맞다', () => {
    expect(snackBarLogic.stateSchema.safeParse(initialShopState()).success).toBe(true);
    expect(snackBarLogic.inputSchema.safeParse([[0, 0, 1]]).success).toBe(true);
    expect(snackBarLogic.inputSchema.safeParse([[0, 3, 1]]).success).toBe(false);
    expect(snackBarLogic.actionSchema.safeParse({ op: 'pick', id: 'cook' }).success).toBe(true);
  });
});
