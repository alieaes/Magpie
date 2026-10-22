// 저장 상태(v1)와 경험치·가게 레벨. 근거: docs/design/261022-10-snack-bar-growth.md §1, §2, §5-1

import { MENUS } from './menus';

/** 강화 항목 */
export const UPGRADE_KEYS = ['tables', 'tray', 'shoes', 'stove', 'jug', 'interior', 'sign'] as const;
export type UpgradeKey = (typeof UPGRADE_KEYS)[number];

/** 직원 id. 순서는 명부 순서 */
export const STAFF_IDS = ['owner', 'runner', 'water', 'server', 'cleaner', 'cook', 'smile', 'talker', 'master'] as const;
export type StaffId = (typeof STAFF_IDS)[number];

/** 누적 기록 (해금 조건·가게 화면) */
export interface ShopStats {
  /** 돈을 내고 나간 손님 수 */
  guests: number;
  /** 기분 최고(+3)로 나간 손님 수 */
  best: number;
  /** 화나서 나간 손님 수 */
  angry: number;
  /** 테이블에 낸 물·단무지 세트 수 */
  water: number;
  /** 더러운 테이블을 깨끗하게 만든 횟수 */
  cleaned: number;
  /** 대식가가 낀 무리를 받은(계산한) 수 */
  bigGroups: number;
  /** 누적 매출(음식 값 + 팁) */
  revenue: number;
  /** 최고 하루 수익 */
  bestProfit: number;
}

/** 저장 상태 (v1). 메뉴 열림과 등급은 exp·sold에서 계산하므로 저장하지 않는다 */
export interface ShopState {
  v: 1;
  day: number;
  money: number;
  exp: number;
  /** 메뉴별 누적 판매 그릇 수 (MENUS 순서) */
  sold: number[];
  upgrades: Record<UpgradeKey, number>;
  /** 오늘의 직원 */
  character: StaffId;
  /** 열린 직원 (열린 순서) */
  unlocked: StaffId[];
  stats: ShopStats;
}

/** 시작 상태: 1일째, 5,000원, 테이블 4개·쟁반 3칸(강화 0단계), 까치 사장 */
export function initialShopState(): ShopState {
  return {
    v: 1,
    day: 1,
    money: 5_000,
    exp: 0,
    sold: MENUS.map(() => 0),
    upgrades: { tables: 0, tray: 0, shoes: 0, stove: 0, jug: 0, interior: 0, sign: 0 },
    character: 'owner',
    unlocked: ['owner'],
    stats: { guests: 0, best: 0, angry: 0, water: 0, cleaned: 0, bigGroups: 0, revenue: 0, bestProfit: 0 },
  };
}

/** 레벨 L이 되는 누적 경험치: 50 × L × (L − 1) (원작 공식) */
export function expForLevel(level: number): number {
  return 50 * level * (level - 1);
}

/** 누적 경험치의 가게 레벨 */
export function levelOf(exp: number): number {
  let level = 1;
  while (exp >= expForLevel(level + 1)) level += 1;
  return level;
}
