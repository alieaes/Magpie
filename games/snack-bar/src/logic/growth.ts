// 강화 7종과 가게 행동(강화 사기·직원 고르기). 근거: docs/design/261022-10-snack-bar-growth.md §4, docs/design/261022-11-snack-bar-characters.md §1

import type { ActionResult } from '@magpie/shared';
import { levelOf, type ShopState, type StaffId, type UpgradeKey } from './state';

export interface UpgradeDef {
  name: string;
  /** 단계마다 비용 (단계 수 = 길이) */
  costs: readonly number[];
  /** 단계마다 필요한 가게 레벨 */
  levels: readonly number[];
}

/** 단계마다 2배가 되는 비용 */
function doubling(first: number, steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => first * 2 ** i);
}

/** 강화 표. 비용·효과는 튜닝값이다 */
export const UPGRADES: Readonly<Record<UpgradeKey, UpgradeDef>> = {
  tables: { name: '테이블 늘리기', costs: [30_000, 100_000], levels: [3, 5] },
  tray: { name: '큰 쟁반', costs: [20_000, 70_000], levels: [1, 4] },
  shoes: { name: '운동화', costs: doubling(15_000, 4), levels: [1, 1, 1, 1] },
  stove: { name: '센 불', costs: [60_000, 180_000], levels: [3, 6] },
  jug: { name: '큰 물통', costs: [20_000], levels: [1] },
  interior: { name: '인테리어', costs: doubling(12_000, 5), levels: [1, 1, 1, 1, 1] },
  sign: { name: '간판', costs: doubling(15_000, 5), levels: [1, 1, 1, 1, 1] },
};

/** 강화 최대 단계 */
export function upgradeMax(key: UpgradeKey): number {
  return UPGRADES[key].costs.length;
}

/** 가게 행동: 강화 사기, 오늘의 직원 고르기 */
export type ShopAction = { op: 'upgrade'; key: UpgradeKey } | { op: 'pick'; id: StaffId };

/** 다음 단계를 살 수 있는지와 막히는 사유 */
export function upgradeCheck(state: ShopState, key: UpgradeKey): { ok: true; cost: number } | { ok: false; reason: 'max_level' | 'locked' | 'no_money'; cost?: number; level?: number } {
  const def = UPGRADES[key];
  const step = state.upgrades[key];
  if (step >= def.costs.length) return { ok: false, reason: 'max_level' };
  const cost = def.costs[step]!;
  const need = def.levels[step]!;
  if (levelOf(state.exp) < need) return { ok: false, reason: 'locked', cost, level: need };
  if (state.money < cost) return { ok: false, reason: 'no_money', cost };
  return { ok: true, cost };
}

/** 가게 행동을 적용한다. 규칙에 안 맞으면 사유와 함께 실패하고 상태는 그대로 */
export function applyShopAction(state: ShopState, action: ShopAction): ActionResult<ShopState> {
  if (action.op === 'pick') {
    if (!state.unlocked.includes(action.id)) return { ok: false, reason: 'locked' };
    return { ok: true, state: { ...state, character: action.id } };
  }
  const check = upgradeCheck(state, action.key);
  if (!check.ok) return { ok: false, reason: check.reason };
  return {
    ok: true,
    state: {
      ...state,
      money: state.money - check.cost,
      upgrades: { ...state.upgrades, [action.key]: state.upgrades[action.key] + 1 },
    },
  };
}
