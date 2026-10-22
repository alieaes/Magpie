// 메뉴(반죽): 팥·슈크림·피자. 평판 레벨로 저절로 열리고, 메뉴마다 재료비·빵 값·굽는 시간이 다르다. 정수 연산만 쓴다.
// 근거: docs/design/261022-02-fish-bun-menu.md §1, §4

import type { SeededRandom } from '@magpie/shared';

/** 메뉴 번호: 0 팥, 1 슈크림, 2 피자. 입력 값(붓기·판매)과 저장 기록에 이 번호를 쓴다 */
export type Menu = number;

export interface MenuDef {
  /** 화면에 쓰는 이름 */
  name: string;
  /** 열리는 평판 레벨 */
  unlock: number;
  /** 반죽 한 번 재료비 */
  cost: number;
  /** 빵 값 (알맞음, 레시피 0단계) */
  price: number;
  /** 알맞음이 시작되는 익힘 값 */
  doneAt: number;
  /** 타기 시작하는 익힘 값 (빵틀 길들이기 0단계) */
  burnAt: number;
}

/** 팥 붕어빵의 익힘 구간. 화력 50%(굽는 속도 110)면 덜 익음 0~4초, 알맞음 4~6.5초 */
export const DONE_AT = 26_400;
export const BURN_AT = 42_900;
/** 팥 반죽 재료비 */
export const DOUGH_COST = 50;

/** 메뉴 표 (설계 §1, 튜닝값). 굽기 시간은 화력 50% 기준: 슈크림은 빨리 익고 빨리 타고(3.5~5.5초), 피자는 오래 익는다(5~8초) */
export const MENUS: readonly MenuDef[] = [
  { name: '팥', unlock: 1, cost: DOUGH_COST, price: 120, doneAt: DONE_AT, burnAt: BURN_AT },
  { name: '슈크림', unlock: 3, cost: 70, price: 160, doneAt: 23_100, burnAt: 36_300 },
  { name: '피자', unlock: 5, cost: 90, price: 200, doneAt: 33_000, burnAt: 52_800 },
];

/** 열린 메뉴 수에 따른 주문 메뉴 비율(백분율), 팥부터 (설계 §4) */
const ORDER_ODDS: readonly (readonly number[])[] = [[100], [65, 35], [50, 28, 22]];

/** 평판 레벨로 열린 메뉴 수 (팥부터 차례로 열린다) */
export function openMenus(repLevel: number): number {
  return MENUS.filter((m) => repLevel >= m.unlock).length;
}

/**
 * 손님이 주문할 메뉴를 뽑는다. 메뉴가 팥 하나뿐이면 뽑지 않는다
 * (팥만 열린 날은 메뉴를 넣기 전과 난수 순서가 같아서, 그날의 기록이 그대로 다시 돌아간다)
 */
export function drawMenu(rng: SeededRandom, open: number): Menu {
  if (open <= 1) return 0;
  const odds = ORDER_ODDS[Math.min(open, ORDER_ODDS.length) - 1]!;
  let roll = rng.int(0, 99);
  for (let i = 0; i < odds.length; i += 1) {
    if (roll < odds[i]!) return i;
    roll -= odds[i]!;
  }
  return 0;
}
