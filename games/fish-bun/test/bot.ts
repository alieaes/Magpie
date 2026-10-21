// 흉내 플레이어: 정해진 실력으로 하루를 돌린다. 밸런스 확인(설계 261021-03 §6)과 화면식 진행 = 다시 돌리기 확인에 쓴다.

import { SeededRandom } from '@magpie/shared';
import {
  DAY_TICKS,
  DONE_AT,
  DOUGH_COST,
  OP,
  UPGRADE_KEYS,
  advance,
  applyInput,
  applyShopAction,
  canUpgrade,
  createDay,
  settleDay,
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
}

export const AVERAGE: BotSkill = { reaction: 18, timingError: 40, goldenHit: 40, extraRate: 40, heatTarget: 3600 };
export const SKILLED: BotSkill = { reaction: 8, timingError: 15, goldenHit: 85, extraRate: 80, heatTarget: 4200 };

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

  /** 이 면을 언제 넘길지 정한다: 알맞음 구간의 앞쪽 1/3 + 오차 */
  const aimFor = (limit: number, golden: boolean): number => {
    const speed = 110;
    if (golden) return rng.int(0, 99) < skill.goldenHit ? DONE_AT + rng.int(0, 2) * speed : DONE_AT + rng.int(0, 120) * speed;
    return DONE_AT + Math.floor((limit - DONE_AT) / 3) + rng.int(-skill.timingError, skill.timingError) * speed;
  };

  while (!sim.closed) {
    if (sim.tick % skill.reaction === 0) {
      // 화력
      if (!sim.pumping && sim.heat < skill.heatTarget - 600) act(OP.pump, 1);
      else if (sim.pumping && sim.heat >= skill.heatTarget) act(OP.pump, 0);

      // 탄 빵: 어르신이 있거나 진열대가 거의 차면 버린다
      const elderWaiting = sim.seats.some((c) => c?.kind === 'elder');
      if (sim.shelf.includes('burnt') && (elderWaiting || sim.shelf.length >= sim.params.shelfCap - 1)) act(OP.trash, 0);

      // 판매: 온 순서대로
      const order = sim.seats
        .map((c, seat) => ({ c, seat }))
        .filter((x): x is { c: NonNullable<typeof x.c>; seat: number } => x.c !== null)
        .sort((a, b) => a.c.id - b.c.id);
      for (const { c, seat } of order) {
        if (sim.shelf.length < c.order) break;
        const wantsExtra = c.kind === 'kid' || rng.int(0, 99) < skill.extraRate;
        const extra = wantsExtra && sim.shelf.length >= c.order + 1;
        act(OP.sell, seat * 2 + (extra ? 1 : 0));
      }

      // 빵틀
      const demand = sim.seats.reduce((sum, c) => sum + (c ? c.order + 1 : 0), 0) + 4;
      let baking = sim.molds.filter((m) => m.phase !== 'empty').length;
      sim.molds.forEach((mold, i) => {
        if (mold.phase !== phases[i]) {
          phases[i] = mold.phase;
          if (mold.phase === 'bottom') aims[i] = aimFor(sim.params.burnAt, false);
          if (mold.phase === 'top') aims[i] = aimFor(topBurnAt(mold, sim.params), mold.candidate);
        }
        if (mold.phase === 'empty') {
          const late = sim.tick > DAY_TICKS - 900;
          if (!late && sim.money >= DOUGH_COST && sim.shelf.length + baking < demand && act(OP.tap, i)) baking += 1;
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
