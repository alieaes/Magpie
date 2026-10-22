// 흉내 플레이어: 정해진 실력(생각하는 틱, 연타 간격)으로 하루를 돌린다. 밸런스 시뮬레이션과 "화면식 진행 = 다시 돌리기" 확인에 쓴다.
// 화면처럼 지금 틱(sim.tick)에 입력을 적용하고 그 틱을 기록한다. 근거: docs/design/261022-10-snack-bar-growth.md §6

import {
  OP,
  TRASH_STATION,
  WATER,
  WATER_STATION,
  advance,
  applyInput,
  applyShopAction,
  createDay,
  initialShopState,
  isBusy,
  levelOf,
  routeTo,
  settleDay,
  type DaySim,
  type ShopState,
  type SnackInput,
  type StaffId,
  type Target,
  type UpgradeKey,
} from '../src/logic';

export interface Skill {
  /** 할 일을 바꿀 때 생각하는 틱 */
  think: number;
  /** 연타·닦기 사이 틱 (6 이상) */
  mashGap: number;
}

/** 보통 실력: 할 일을 바꿀 때 0.75초, 연타 초당 약 4번 */
export const AVERAGE: Skill = { think: 45, mashGap: 14 };
/** 잘하는 실력: 할 일을 바꿀 때 0.05초, 연타 초당 10번 */
export const SKILLED: Skill = { think: 3, mashGap: 6 };

/** 할 일: 대상과 거기서 할 동작 */
interface Goal {
  target: Target;
  /** act면 행동, 숫자면 그 쟁반 칸 내기 */
  then: 'act' | number;
  key: string;
}

/** 테이블이 아직 받지 못한 메뉴별 그릇 수 */
function needs(sim: DaySim): number[] {
  const need = [0, 0, 0, 0, 0];
  for (const t of sim.tables) if (t.phase === 'food') for (const g of t.guests) need[g.menu]! += g.left;
  return need;
}

/** 쟁반에 있는 메뉴별 수와 물 수 */
function trayCounts(sim: DaySim): { food: number[]; water: number } {
  const food = [0, 0, 0, 0, 0];
  let water = 0;
  for (const item of sim.tray) {
    if (item === null) continue;
    if (item === WATER) water += 1;
    else food[item]! += 1;
  }
  return { food, water };
}

/** 기다림이 가장 급한 테이블부터 (막대가 적게 남고 기분이 나쁜 순) */
function urgent(sim: DaySim, indices: number[]): number[] {
  return [...indices].sort((a, b) => {
    const ta = sim.tables[a]!;
    const tb = sim.tables[b]!;
    return ta.mood - tb.mood || ta.gauge - tb.gauge || a - b;
  });
}

/** 지금 할 일을 고른다 (욕심쟁이: 물 → 음식 내기 → 남는 것 버리기 → 물 담기 → 조리 → 닦기) */
function decide(sim: DaySim): Goal | null {
  const need = needs(sim);
  const tray = trayCounts(sim);
  const free = sim.tray.filter((i) => i === null).length;
  const waterTables = sim.tables.map((t, i) => (t.phase === 'water' ? i : -1)).filter((i) => i >= 0);

  if (tray.water > 0 && waterTables.length > 0) {
    const table = urgent(sim, waterTables)[0]!;
    return { target: { kind: 'table', index: table }, then: sim.tray.indexOf(WATER), key: `w${table}` };
  }
  for (const table of urgent(sim, sim.tables.map((t, i) => (t.phase === 'food' ? i : -1)).filter((i) => i >= 0))) {
    const want = sim.tables[table]!.guests.find((g) => g.left > 0 && sim.tray.includes(g.menu));
    if (want) return { target: { kind: 'table', index: table }, then: sim.tray.indexOf(want.menu), key: `f${table}` };
  }
  // 쟁반이 가득인데 아무도 안 기다리는 접시가 있으면 버린다
  if (free === 0) {
    const useless = sim.tray.findIndex((item) => item !== null && (item === WATER ? waterTables.length === 0 : need[item]! <= 0));
    if (useless >= 0) return { target: { kind: 'station', index: TRASH_STATION }, then: useless, key: 'trash' };
  }
  const waterShort = waterTables.length - tray.water;
  if (waterShort > 0 && free > 0) return { target: { kind: 'station', index: WATER_STATION }, then: 'act', key: 'water' };
  // 모자란 메뉴를 만든다: 쟁반·조리대에 있는 것을 빼고 가장 많이 모자란 메뉴
  let best = -1;
  let bestShort = 0;
  for (let m = 0; m < sim.params.menus; m += 1) {
    const st = sim.stations[m]!;
    const short = need[m]! - tray.food[m]! - (st.ready ? 1 : 0);
    if (short > bestShort || (short > 0 && short === bestShort && st.progress > sim.stations[best]!.progress)) {
      best = m;
      bestShort = short;
    }
  }
  if (best >= 0 && (free > 0 || sim.stations[best]!.progress > 0)) return { target: { kind: 'station', index: best }, then: 'act', key: `c${best}` };
  const dirty = sim.tables.findIndex((t) => t.phase === 'dirty');
  if (dirty >= 0) return { target: { kind: 'table', index: dirty }, then: 'act', key: `d${dirty}` };
  return null;
}

/** 입력을 지금 틱에 적용하고 기록한다. 실패하면 흉내 플레이어 버그다 */
function input(sim: DaySim, inputs: SnackInput[], op: number, arg: number): void {
  const result = applyInput(sim, op, arg);
  if (!result.ok) throw new Error(`흉내 플레이어 입력 실패 ${result.reason} (틱 ${sim.tick}, ${op}/${arg})`);
  inputs.push([sim.tick, op, arg]);
}

/** 하루를 돌린다. 화면처럼 입력을 지금 틱에 적용한다 */
export function playDay(state: ShopState, seed: string, skill: Skill): { inputs: SnackInput[]; sim: DaySim } {
  const sim = createDay(state, seed);
  const inputs: SnackInput[] = [];
  let goalKey = '';
  let readyAt = 0;
  let lastWork = -100;
  while (sim.phase !== 'closed') {
    if (!isBusy(sim) && sim.tick >= readyAt) {
      const goal = decide(sim);
      if (goal && goal.key !== goalKey) {
        goalKey = goal.key;
        readyAt = sim.tick + skill.think;
      } else if (goal) {
        const route = routeTo(sim.pos, goal.target);
        if (route && route.path.length > 0) {
          input(sim, inputs, OP.move, route.path[0]!);
        } else if (route) {
          if (sim.facing !== route.dir) input(sim, inputs, OP.move, route.dir);
          if (sim.tick - lastWork >= skill.mashGap) {
            if (goal.then === 'act') input(sim, inputs, OP.act, 0);
            else input(sim, inputs, OP.give, goal.then);
            lastWork = sim.tick;
          }
        }
      } else {
        goalKey = '';
      }
    }
    advance(sim);
  }
  return { inputs, sim };
}

/** 하루 기록 (밸런스 표) */
export interface DayLog {
  day: number;
  profit: number;
  money: number;
  level: number;
  staff: StaffId;
  tables: number;
  tray: number;
  guests: number;
  angry: number;
  turnedAway: number;
  closingLeft: number;
  sold: number[];
  unlocked: number;
  bought: string[];
}

/** 하루 사이에 강화를 산다: 재료비 몫(5,000원)을 남기고, 우선순위대로 살 수 있는 만큼 */
const BUY_ORDER: readonly UpgradeKey[] = ['tables', 'tray', 'shoes', 'jug', 'stove', 'sign', 'interior'];
/** 직원은 열린 직원 중 이 순서로 앞선 사람 */
const STAFF_ORDER: readonly StaffId[] = ['cook', 'server', 'runner', 'cleaner', 'smile', 'water', 'talker', 'master', 'owner'];

/** 하루 사이 가게 꾸리기: 강화 사기, 직원 고르기 */
function manage(state: ShopState): { state: ShopState; bought: string[] } {
  let s = state;
  const bought: string[] = [];
  for (let again = true; again; ) {
    again = false;
    for (const key of BUY_ORDER) {
      const result = applyShopAction(s, { op: 'upgrade', key });
      if (result.ok && result.state.money >= 5_000) {
        s = result.state;
        bought.push(`${key}${s.upgrades[key]}`);
        again = true;
        break;
      }
    }
  }
  const pick = STAFF_ORDER.find((id) => s.unlocked.includes(id))!;
  if (pick !== s.character) {
    const result = applyShopAction(s, { op: 'pick', id: pick });
    if (result.ok) s = result.state;
  }
  return { state: s, bought };
}

/** 여러 날을 이어서 돌린다 */
export function playDays(days: number, skill: Skill, seedBase: string): DayLog[] {
  let state = initialShopState();
  const logs: DayLog[] = [];
  for (let d = 1; d <= days; d += 1) {
    const managed = manage(state);
    state = managed.state;
    const { sim } = playDay(state, `${seedBase}-${d}`, skill);
    const out = settleDay(sim);
    logs.push({
      day: state.day,
      profit: out.profit,
      money: out.nextState.money,
      level: levelOf(out.nextState.exp),
      staff: state.character,
      tables: sim.params.tables,
      tray: sim.params.traySlots,
      guests: sim.stats.guests,
      angry: sim.stats.angry,
      turnedAway: sim.stats.turnedAway,
      closingLeft: sim.stats.closingLeft,
      sold: sim.stats.sold,
      unlocked: out.nextState.unlocked.length,
      bought: managed.bought,
    });
    state = out.nextState;
  }
  return logs;
}
