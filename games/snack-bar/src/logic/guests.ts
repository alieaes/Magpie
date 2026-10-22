// 손님: 레벨별 등장 표, 무리 뽑기(인원·대식가·생김새·옷·메뉴), 기다림·식사 시간.
// 근거: docs/design/261022-09-snack-bar.md §5 (원작 값: 막대 한 번 15초/12초, 식사 8초/10초, 다 먹고 6초)

import type { SeededRandom } from '@magpie/shared';
import { drawMenu, type Menu } from './menus';

/** 레벨별 무리 간격(초)·두 명 무리 %·대식가 %. Lv6 이상은 마지막 줄 */
export const ARRIVALS: readonly { gap: readonly [number, number]; pair: number; big: number }[] = [
  { gap: [8, 12], pair: 25, big: 0 },
  { gap: [7, 11], pair: 30, big: 10 },
  { gap: [7, 10], pair: 35, big: 15 },
  { gap: [6, 9], pair: 40, big: 20 },
  { gap: [5, 8], pair: 40, big: 25 },
  { gap: [4, 7], pair: 40, big: 30 },
];

/** 기다림 막대 한 번 (틱): 보통 15초, 대식가 12초 */
export const PATIENCE_TICKS = { normal: 900, big: 720 } as const;
/** 식사 (틱): 보통 8초, 대식가 10초 */
export const EAT_TICKS = { normal: 480, big: 600 } as const;
/** 다 먹고 계산하고 나가기까지 (6초) */
export const DONE_TICKS = 360;
/** 간판을 다 올려도 무리 간격은 이보다 짧아지지 않는다 (4초) */
export const MIN_GAP = 240;
/** 손님 생김새 수: 동물 10종 다음에 사람 24가지 (화면 scene/sprites의 GUEST_LOOKS 순서와 같다) */
export const ANIMAL_LOOKS = 10;
export const HUMAN_LOOKS = 24;
/** 손님 옷 색 수 */
export const CLOTHES = 6;

/** 손님 한 명 */
export interface Guest {
  /** 생김새 번호 (0~9 동물, 10~33 사람) */
  look: number;
  cloth: number;
  /** 대식가 */
  big: boolean;
  menu: Menu;
  /** 시킨 그릇 수 */
  count: number;
  /** 아직 받지 못한 그릇 수 */
  left: number;
}

/** 레벨의 등장 표 줄 */
export function arrivalRow(level: number) {
  return ARRIVALS[Math.min(level, ARRIVALS.length) - 1]!;
}

/**
 * 손님 무리를 뽑는다. 순서: 인원 → 손님마다 (대식가 → 생김새 → 옷 → 그릇 수) → 메뉴(주문 난수).
 * 두 명이면 서로 다른 메뉴(열린 메뉴가 하나면 같은 메뉴). 순서를 바꾸면 저장된 하루의 재계산이 달라진다
 */
export function drawGroup(rng: SeededRandom, orders: SeededRandom, level: number, weights: readonly number[]): Guest[] {
  const row = arrivalRow(level);
  const size = rng.int(0, 99) < row.pair ? 2 : 1;
  const guests: Guest[] = [];
  for (let i = 0; i < size; i += 1) {
    const big = rng.int(0, 99) < row.big;
    const look = rng.int(0, 1) === 0 ? rng.int(0, ANIMAL_LOOKS - 1) : ANIMAL_LOOKS + rng.int(0, HUMAN_LOOKS - 1);
    const cloth = rng.int(0, CLOTHES - 1);
    const count = big ? (rng.int(0, 99) < 85 ? 2 : 3) : 1;
    guests.push({ look, cloth, big, menu: 0, count, left: count });
  }
  guests[0]!.menu = drawMenu(orders, weights);
  if (size === 2) {
    let menu = drawMenu(orders, weights);
    if (weights.length > 1) {
      while (menu === guests[0]!.menu) menu = drawMenu(orders, weights);
    }
    guests[1]!.menu = menu;
  }
  return guests;
}

/** 다음 무리까지 틱: 표의 간격을 간판 단계마다 8%씩 줄인다 */
export function drawGap(rng: SeededRandom, level: number, signLevel: number): number {
  const [lo, hi] = arrivalRow(level).gap;
  const raw = rng.int(lo * 60, hi * 60);
  return Math.max(MIN_GAP, Math.floor((raw * (100 - 8 * signLevel)) / 100));
}

/** 무리의 기다림 막대 한 번 (틱): 손님들의 평균 × (100 + 늘림%) / 100 */
export function groupPatience(guests: readonly Guest[], plusPercent: number): number {
  const sum = guests.reduce((s, g) => s + (g.big ? PATIENCE_TICKS.big : PATIENCE_TICKS.normal), 0);
  return Math.floor((Math.floor(sum / guests.length) * (100 + plusPercent)) / 100);
}

/** 무리의 식사 시간 (틱): 손님들의 평균 */
export function groupEat(guests: readonly Guest[]): number {
  const sum = guests.reduce((s, g) => s + (g.big ? EAT_TICKS.big : EAT_TICKS.normal), 0);
  return Math.floor(sum / guests.length);
}
