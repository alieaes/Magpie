// 메뉴 5가지와 메뉴 등급(누적 판매 그릇 수로 E~S). 근거: docs/design/261022-09-snack-bar.md §6-1, docs/design/261022-10-snack-bar-growth.md §3

import type { SeededRandom } from '@magpie/shared';

/** 메뉴 번호: 0 떡볶이, 1 김밥, 2 순대, 3 라면, 4 튀김 */
export type Menu = 0 | 1 | 2 | 3 | 4;

export interface MenuDef {
  id: 'tteok' | 'kimbap' | 'sundae' | 'ramen' | 'fried';
  name: string;
  /** E등급 값 */
  price: number;
  /** 재료비 (조리 첫 누름에 낸다) */
  cost: number;
  /** 완성까지 연타 수 (원작 그대로) */
  taps: number;
  /** 열리는 가게 레벨 */
  level: number;
}

/** 메뉴 표. 열리는 레벨 순서다 */
export const MENUS: readonly MenuDef[] = [
  { id: 'tteok', name: '떡볶이', price: 2000, cost: 900, taps: 4, level: 1 },
  { id: 'kimbap', name: '김밥', price: 2000, cost: 900, taps: 5, level: 1 },
  { id: 'sundae', name: '순대', price: 2500, cost: 1200, taps: 4, level: 2 },
  { id: 'ramen', name: '라면', price: 2500, cost: 1100, taps: 5, level: 4 },
  { id: 'fried', name: '튀김', price: 3000, cost: 1500, taps: 5, level: 6 },
];

/** 등급이 오르는 누적 판매 그릇 수: E 0, D 30, C 90, B 200, A 400, S 800 */
export const GRADE_STEPS: readonly number[] = [0, 30, 90, 200, 400, 800];
export const GRADE_NAMES: readonly string[] = ['E', 'D', 'C', 'B', 'A', 'S'];

/** 누적 판매 그릇 수의 등급 (0 = E … 5 = S) */
export function gradeOf(sold: number): number {
  let grade = 0;
  while (grade + 1 < GRADE_STEPS.length && sold >= GRADE_STEPS[grade + 1]!) grade += 1;
  return grade;
}

/** 다음 등급까지 남은 그릇 수. S면 0 */
export function toNextGrade(sold: number): number {
  const grade = gradeOf(sold);
  return grade + 1 < GRADE_STEPS.length ? GRADE_STEPS[grade + 1]! - sold : 0;
}

/** 가게 레벨에 열린 메뉴 수 (떡볶이부터) */
export function openMenus(level: number): number {
  return MENUS.filter((m) => m.level <= level).length;
}

/** 등급을 반영한 한 그릇 값: 등급마다 +10% */
export function menuPrice(menu: number, grade: number): number {
  return Math.floor((MENUS[menu]!.price * (100 + 10 * grade)) / 100);
}

/** 주문 비중: 등급 + 3 (E 3 … S 8). 원작은 등급 그대로라 나중에 열린 메뉴가 거의 주문되지 않아서 더한다 */
export function orderWeight(grade: number): number {
  return grade + 3;
}

/** 비중대로 메뉴 하나를 뽑는다 */
export function drawMenu(rng: SeededRandom, weights: readonly number[]): Menu {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.int(0, total - 1);
  for (let m = 0; m < weights.length; m += 1) {
    roll -= weights[m]!;
    if (roll < 0) return m as Menu;
  }
  return (weights.length - 1) as Menu;
}
