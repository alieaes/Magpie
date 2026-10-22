// 흉내 플레이어: 정해진 실력으로 하루를 돌린다. 밸런스 확인(설계 261021-03 §6)과 화면식 진행 = 다시 돌리기 확인에 쓴다.

import { SeededRandom } from '@magpie/shared';
import {
  DAY_TICKS,
  MENUS,
  OP,
  UPGRADE_KEYS,
  advance,
  applyInput,
  applyShopAction,
  canUpgrade,
  createDay,
  guessesMenu,
  sellArg,
  settleDay,
  shelfCount,
  tapArg,
  topBurnAt,
  type DaySim,
  type FishInput,
  type ShopState,
} from '../src/logic';

export interface BotSkill {
  /** 판단 간격(틱). 사람의 반응 속도 */
  reaction: number;
  /** 뒤집기·꺼내기 타이밍 오차(틱, ±) */
  timingError: number;
  /** 황금 후보를 반짝일 때 꺼낼 확률(%) */
  goldenHit: number;
  /** 덤을 주는 확률(%) (꼬마에게는 늘 준다) */
  extraRate: number;
  /** 유지하려는 화력 */
  heatTarget: number;
  /** 수수께끼·외국어 주문을 맞히는 확률(%) */
  guessRight: number;
}

export const AVERAGE: BotSkill = { reaction: 18, timingError: 40, goldenHit: 40, extraRate: 40, heatTarget: 3600, guessRight: 80 };
export const SKILLED: BotSkill = { reaction: 8, timingError: 15, goldenHit: 85, extraRate: 80, heatTarget: 4200, guessRight: 100 };

/** 하루를 흉내 플레이어로 돌린다. 화면처럼 지금 틱에 입력을 적용하고 그 틱을 기록한다 */
export function playDay(state: ShopState, seed: string, skill: BotSkill, botSeed = seed): { inputs: FishInput[]; sim: DaySim } {
  const sim = createDay(state, seed);
  const rng = new SeededRandom(`bot#${botSeed}`);
  const inputs: FishInput[] = [];
  /** 빵틀마다 뒤집기·꺼내기를 노리는 익힘 값 (단계가 바뀔 때 정한다) */
  const aims = sim.molds.map(() => 0);
  const phases = sim.molds.map(() => 'empty');

  /** 입력을 적용하고 성공하면 기록한다 */
  const act = (op: number, arg: number): boolean => {
    const result = applyInput(sim, op, arg);
    if (result.ok) inputs.push([sim.tick, op, arg]);
    return result.ok;
  };

  /** 이 면을 언제 넘길지 정한다: 알맞음 구간(doneAt~limit)의 앞쪽 1/3 + 오차 */
  const aimFor = (doneAt: number, limit: number, golden: boolean): number => {
    const speed = 110;
    if (golden) return rng.int(0, 99) < skill.goldenHit ? doneAt + rng.int(0, 2) * speed : doneAt + rng.int(0, 120) * speed;
    return doneAt + Math.floor((limit - doneAt) / 3) + rng.int(-skill.timingError, skill.timingError) * speed;
  };
  /** 손님이 없어도 메뉴마다 미리 구워 두는 개수 */
  const buffer = [4, 2, 2];

  while (!sim.closed) {
    if (sim.tick % skill.reaction === 0) {
      // 화력
      if (!sim.pumping && sim.heat < skill.heatTarget - 600) act(OP.pump, 1);
      else if (sim.pumping && sim.heat >= skill.heatTarget) act(OP.pump, 0);

      // 탄 빵: 어르신이 있거나 진열대가 거의 차면 버린다
      const elderWaiting = sim.seats.some((c) => c?.kind === 'elder');
      const hasBurnt = sim.shelves.some((list) => list.includes('burnt'));
      if (hasBurnt && (elderWaiting || shelfCount(sim) >= sim.params.shelfCap - 1)) act(OP.trash, 0);

      // 판매: 온 순서대로
      const order = sim.seats
        .map((c, seat) => ({ c, seat }))
        .filter((x): x is { c: NonNullable<typeof x.c>; seat: number } => x.c !== null)
        .sort((a, b) => a.c.id - b.c.id);
      // 메뉴마다 먼저 온 손님부터 판다. 못 판 손님이 바쁜 직장인이면 그 뒤로는 팔지 않는다(먼저 안 주면 떠나서)
      const blocked = new Set<number>();
      for (const { c, seat } of order) {
        const stock = sim.shelves[c.menu]!.length;
        if (blocked.has(c.menu)) continue;
        if (stock < c.order) {
          if (c.kind === 'office') break;
          blocked.add(c.menu);
          continue;
        }
        const wantsExtra = c.kind === 'kid' || rng.int(0, 99) < skill.extraRate;
        const extra = wantsExtra && stock >= c.order + 1;
        // 수수께끼·외국어 주문은 가끔 틀린다: 진열대에 있는 다른 메뉴를 준다
        let menu = c.menu;
        if (guessesMenu(c.kind) && rng.int(0, 99) >= skill.guessRight) {
          const other = MENUS.findIndex((_, m) => m !== c.menu && m < sim.params.menus && sim.shelves[m]!.length >= c.order + (extra ? 1 : 0));
          if (other >= 0) menu = other;
        }
        act(OP.sell, sellArg(seat, extra, menu));
      }

      // 빵틀: 메뉴마다 (기다리는 주문 + 미리 구울 개수) − (진열대 + 굽는 중)이 가장 모자란 메뉴를 붓는다
      const short = MENUS.map((_, m) => {
        if (m >= sim.params.menus) return -Infinity;
        const need = sim.seats.reduce((sum, c) => sum + (c && c.menu === m ? c.order + 1 : 0), 0) + buffer[m]!;
        const baking = sim.molds.filter((mold) => mold.phase !== 'empty' && mold.menu === m).length;
        return need - sim.shelves[m]!.length - baking;
      });
      sim.molds.forEach((mold, i) => {
        // 깨진 틀은 고친다 (판단할 때마다 한 번씩 두드린다)
        if (mold.broken) {
          act(OP.tap, i);
          return;
        }
        if (mold.phase !== phases[i]) {
          phases[i] = mold.phase;
          const doneAt = sim.params.doneAt[mold.menu]!;
          if (mold.phase === 'bottom') aims[i] = aimFor(doneAt, sim.params.burnAt[mold.menu]!, false);
          if (mold.phase === 'top') aims[i] = aimFor(doneAt, topBurnAt(mold, sim.params), mold.candidate);
        }
        if (mold.phase === 'empty') {
          const late = sim.tick > DAY_TICKS - 900;
          const menu = short.indexOf(Math.max(...short));
          if (!late && short[menu]! > 0 && sim.money >= MENUS[menu]!.cost && act(OP.tap, tapArg(i, menu))) short[menu]! -= 1;
        } else if (mold.phase === 'bottom' && mold.bottom >= aims[i]!) act(OP.tap, i);
        else if (mold.phase === 'top' && mold.top >= aims[i]!) act(OP.tap, i);
      });
    }
    advance(sim);
  }
  return { inputs, sim };
}

/** 하루를 마친 상태에서 살 수 있는 강화를 싼 것부터 산다 (빵틀 늘리기를 먼저) */
export function buyUpgrades(state: ShopState): { state: ShopState; bought: string[] } {
  let current = state;
  const bought: string[] = [];
  for (;;) {
    const options = UPGRADE_KEYS.map((key) => ({ key, check: canUpgrade(current, key) }))
      .filter((o): o is { key: (typeof UPGRADE_KEYS)[number]; check: { ok: true; cost: number } } => o.check.ok)
      .sort((a, b) => (a.key === 'molds' ? -1 : b.key === 'molds' ? 1 : a.check.cost - b.check.cost));
    const pick = options[0];
    if (!pick) return { state: current, bought };
    const result = applyShopAction(current, { op: 'upgrade', key: pick.key });
    if (!result.ok) return { state: current, bought };
    current = result.state;
    bought.push(pick.key);
  }
}

/** 여러 날을 이어서 돌린 기록 한 줄 */
export interface DayLog {
  day: number;
  profit: number;
  money: number;
  reputation: number;
  molds: number;
  customers: number;
  served: number;
  left: number;
  golden: number;
  /** 메뉴별 판 개수 */
  soldBy: number[];
  /** 깨진 빵틀 수 */
  broken: number;
  bought: string[];
}

/** days일을 이어서 돌린다 */
export function playDays(days: number, skill: BotSkill, seedPrefix: string): DayLog[] {
  let state: ShopState | null = null;
  const logs: DayLog[] = [];
  for (let d = 0; d < days; d += 1) {
    const start = state ?? (playDayInit());
    const { sim } = playDay(start, `${seedPrefix}-${d}`, skill);
    const outcome = settleDay(sim);
    const after = buyUpgrades(outcome.nextState);
    const s = sim.stats;
    logs.push({
      day: start.day,
      profit: outcome.profit,
      money: after.state.money,
      reputation: outcome.nextState.reputation,
      molds: sim.molds.length,
      customers: s.customers,
      served: s.served.best + s.served.good + s.served.meh + s.served.bad,
      left: s.left,
      golden: s.golden,
      soldBy: s.soldBy,
      broken: s.broken,
      bought: after.bought,
    });
    state = after.state;
  }
  return logs;
}

/** 시작 상태 */
function playDayInit(): ShopState {
  return {
    v: 1,
    day: 1,
    money: 1000,
    reputation: 0,
    upgrades: { molds: 0, seasoning: 0, burner: 0, recipe: 0, golden: 0, shelf: 0, sign: 0 },
    stats: { revenue: 0, sold: 0, golden: 0, bestProfit: 0, maxCombo: 0 },
  };
}
