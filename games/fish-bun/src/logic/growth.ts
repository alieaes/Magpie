// 붕어빵 가게의 하루 사이에 남는 것: 저장 상태, 평판, 강화. 정수 연산만 쓴다.
// 근거: docs/design/261021-03-fish-bun-growth.md

/** 강화 항목 */
export type UpgradeKey = 'molds' | 'seasoning' | 'burner' | 'recipe' | 'golden' | 'shelf' | 'sign';

export const UPGRADE_KEYS: readonly UpgradeKey[] = ['molds', 'seasoning', 'burner', 'recipe', 'golden', 'shelf', 'sign'];

/** 저장에 남기는 누적 기록 */
export interface ShopStats {
  /** 누적 매출 */
  revenue: number;
  /** 누적 판매 개수 (덤 포함) */
  sold: number;
  /** 누적 황금붕어빵 */
  golden: number;
  /** 최고 하루 수익 */
  bestProfit: number;
  /** 최대 콤보 */
  maxCombo: number;
}

/** 저장 상태 (서버에 저장된다). v는 형식 버전 */
export interface ShopState {
  v: 1;
  /** 다음에 할 날 (1일째부터) */
  day: number;
  money: number;
  /** 평판 점수(누적). 레벨은 levelOf로 */
  reputation: number;
  upgrades: Record<UpgradeKey, number>;
  stats: ShopStats;
}

/** 가게 행동 */
export type ShopAction = { op: 'upgrade'; key: UpgradeKey };

/** 시작 상태 */
export function initialShopState(): ShopState {
  return {
    v: 1,
    day: 1,
    money: 1000,
    reputation: 0,
    upgrades: { molds: 0, seasoning: 0, burner: 0, recipe: 0, golden: 0, shelf: 0, sign: 0 },
    stats: { revenue: 0, sold: 0, golden: 0, bestProfit: 0, maxCombo: 0 },
  };
}

// ---------------------------------------------------------------- 평판

/** 평판 레벨별 필요 점수(누적). 1레벨부터 10레벨 */
export const REP_LEVELS: readonly number[] = [0, 30, 80, 160, 280, 450, 700, 1000, 1400, 2000];

/** 평판 점수의 레벨 (1~10) */
export function levelOf(reputation: number): number {
  let level = 1;
  for (let i = 1; i < REP_LEVELS.length; i += 1) if (reputation >= REP_LEVELS[i]!) level = i + 1;
  return level;
}

/** 그 레벨의 기준점. 평판은 지금 레벨의 기준점 아래로 내려가지 않는다 */
export function levelFloor(level: number): number {
  return REP_LEVELS[Math.min(REP_LEVELS.length, Math.max(1, level)) - 1]!;
}

/** 다음 레벨 기준점. 최고 레벨이면 null */
export function nextLevelAt(level: number): number | null {
  return level < REP_LEVELS.length ? REP_LEVELS[level]! : null;
}

/** 하루 평판 변화를 반영한다. 레벨은 내려가지 않는다 */
export function applyReputation(reputation: number, change: number): number {
  return Math.max(levelFloor(levelOf(reputation)), reputation + change);
}

// ---------------------------------------------------------------- 강화

interface UpgradeDef {
  /** 최대 단계 */
  max: number;
  /** 단계별 비용: cost[지금 단계] */
  cost: readonly number[];
  /** 단계별로 필요한 평판 레벨: requires[지금 단계]. 없으면 조건 없음 */
  requires?: readonly number[];
}

/** 처음 값에서 단계마다 두 배가 되는 비용 */
function doubling(first: number, steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => first * 2 ** i);
}

/** 강화 표. 비용·효과는 튜닝값 (설계 §3) */
export const UPGRADES: Readonly<Record<UpgradeKey, UpgradeDef>> = {
  molds: { max: 2, cost: [3000, 12000], requires: [2, 4] },
  seasoning: { max: 5, cost: doubling(1500, 5) },
  burner: { max: 5, cost: doubling(2000, 5) },
  recipe: { max: 5, cost: doubling(2500, 5) },
  golden: { max: 5, cost: doubling(3000, 5) },
  shelf: { max: 3, cost: [2000, 6000, 18000] },
  sign: { max: 5, cost: doubling(2000, 5) },
};

/** 다음 단계 비용. 최대 단계면 null */
export function upgradeCost(key: UpgradeKey, level: number): number | null {
  const def = UPGRADES[key];
  return level < def.max ? def.cost[level]! : null;
}

/** 다음 단계에 필요한 평판 레벨. 조건이 없으면 1 */
export function upgradeRequires(key: UpgradeKey, level: number): number {
  return UPGRADES[key].requires?.[level] ?? 1;
}

/** 강화를 살 수 있는지. 못 사면 사유 */
export function canUpgrade(state: ShopState, key: UpgradeKey): { ok: true; cost: number } | { ok: false; reason: 'max_level' | 'locked' | 'no_money' } {
  const level = state.upgrades[key];
  const cost = upgradeCost(key, level);
  if (cost === null) return { ok: false, reason: 'max_level' };
  if (levelOf(state.reputation) < upgradeRequires(key, level)) return { ok: false, reason: 'locked' };
  if (state.money < cost) return { ok: false, reason: 'no_money' };
  return { ok: true, cost };
}

/** 가게 행동을 적용한다. 서버도 같은 함수로 확인한다 */
export function applyShopAction(state: ShopState, action: ShopAction): { ok: true; state: ShopState } | { ok: false; reason: string } {
  const check = canUpgrade(state, action.key);
  if (!check.ok) return check;
  return {
    ok: true,
    state: { ...state, money: state.money - check.cost, upgrades: { ...state.upgrades, [action.key]: state.upgrades[action.key] + 1 } },
  };
}

// ---------------------------------------------------------------- 강화 효과

/** 빵틀 칸 수 */
export function moldCount(level: number): number {
  return [6, 9, 12][level] ?? 12;
}

/** 빵틀 길들이기: 알맞음 구간이 늘어나는 익힘 값 (화력 50%에서 0.4초씩) */
export function burnBonus(level: number): number {
  return 2640 * level;
}

/** 화구: 펌프를 떼면 틱마다 내려가는 화력. 마지막 단계는 내려가지 않는다 */
export function heatFall(level: number): number {
  return [8, 6, 5, 3, 2, 0][level] ?? 0;
}

/** 반죽 레시피: 빵 값(알맞음 기준) */
export function breadPrice(level: number): number {
  return 120 + 20 * level;
}

/** 황금 비법: 황금 후보 확률 (천분율) */
export function goldenChance(level: number): number {
  return 50 + 20 * level;
}

/** 진열대: 최대 개수 */
export function shelfCapacity(level: number): number {
  return 12 + 4 * level;
}

/** 간판: 손님 간격 비율 (백분율) */
export function signFactor(level: number): number {
  return 100 - 8 * level;
}
