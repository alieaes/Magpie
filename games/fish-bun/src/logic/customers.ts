// 손님: 종류·성격·등장 표·만족 판정. 정수 연산만 쓴다.
// 근거: docs/design/261021-02-fish-bun-customers.md, 특별 손님: docs/design/261022-03-fish-bun-special-customers.md

import type { SeededRandom } from '@magpie/shared';
import { signFactor } from './growth';
import { drawMenu, type Menu } from './menus';

/** 빵 품질. 두 면 중 나쁜 쪽으로 정하고, 황금은 반짝일 때 꺼낸 황금 후보 */
export type Quality = 'golden' | 'good' | 'raw' | 'burnt';

/** 손님 종류: 동네 손님, 꼬마, 바쁜 직장인, 단골 어르신, 먹방 크리에이터, 리뷰어, 수수께끼 손님, 관광객, 진상 손님 */
export type CustomerKind = 'regular' | 'kid' | 'office' | 'elder' | 'creator' | 'reviewer' | 'riddler' | 'tourist' | 'rude';

export const CUSTOMER_KINDS: readonly CustomerKind[] = ['regular', 'kid', 'office', 'elder', 'creator', 'reviewer', 'riddler', 'tourist', 'rude'];

/** 관광객이 주문하는 말: 영어, 일본어 */
export type Lang = 'en' | 'ja';
export const LANGS: readonly Lang[] = ['en', 'ja'];

/** 메뉴를 바로 말하지 않아 무엇을 원하는지 알아맞혀야 하는 손님 (수수께끼 손님·관광객) */
export function guessesMenu(kind: CustomerKind): boolean {
  return kind === 'riddler' || kind === 'tourist';
}

/** 판매 결과: 최고, 만족, 아쉬움, 불만 */
export type SaleResult = 'best' | 'good' | 'meh' | 'bad';

interface KindDef {
  /** 주문 개수 범위 */
  order: readonly [number, number];
  /** 기다리는 틱 */
  patience: number;
}

/** 종류별 주문 개수와 기다림 (설계 §1) */
export const KINDS: Readonly<Record<CustomerKind, KindDef>> = {
  regular: { order: [1, 3], patience: 20 * 60 },
  kid: { order: [1, 1], patience: 20 * 60 },
  office: { order: [1, 2], patience: 10 * 60 },
  elder: { order: [2, 3], patience: 30 * 60 },
  creator: { order: [3, 5], patience: 20 * 60 },
  reviewer: { order: [1, 2], patience: 20 * 60 },
  riddler: { order: [1, 2], patience: 25 * 60 },
  tourist: { order: [1, 3], patience: 25 * 60 },
  rude: { order: [1, 3], patience: 12 * 60 },
};

interface ArrivalRow {
  /** 손님 간격(틱) 범위 */
  gap: readonly [number, number];
  /** 종류 비율(백분율). CUSTOMER_KINDS 순서 */
  weights: readonly number[];
}

/** 평판 레벨별 등장 표 (손님 설계 §4, 특별 손님 설계 §2). 5레벨 이상은 마지막 줄. Lv1~2는 특별 손님을 넣기 전과 같다 */
export const ARRIVALS: readonly ArrivalRow[] = [
  { gap: [7 * 60, 11 * 60], weights: [80, 20, 0, 0, 0, 0, 0, 0, 0] },
  { gap: [6 * 60, 10 * 60], weights: [60, 20, 20, 0, 0, 0, 0, 0, 0] },
  { gap: [6 * 60, 9 * 60], weights: [44, 14, 18, 14, 0, 0, 10, 0, 0] },
  { gap: [5 * 60, 8 * 60], weights: [34, 12, 16, 12, 8, 0, 8, 6, 4] },
  { gap: [4 * 60, 7 * 60], weights: [30, 11, 15, 12, 8, 5, 8, 6, 5] },
];

/** 평판 레벨의 등장 표 줄 */
function arrivalRow(repLevel: number): ArrivalRow {
  return ARRIVALS[Math.min(ARRIVALS.length, Math.max(1, repLevel)) - 1]!;
}

/** 다음 손님까지의 틱. 간판 강화만큼 줄인다 */
export function drawGap(rng: SeededRandom, repLevel: number, signLevel: number): number {
  const [min, max] = arrivalRow(repLevel).gap;
  return Math.max(60, Math.floor((rng.int(min, max) * signFactor(signLevel)) / 100));
}

/**
 * 다음 손님의 종류·주문 메뉴·(관광객이면) 말·개수를 뽑는다. 뽑는 순서(종류 → 메뉴 → 말 → 개수)를 바꾸면 저장된 하루의 재계산이 달라진다.
 * 메뉴는 열린 메뉴가 둘 이상일 때만 뽑는다(drawMenu). 수수께끼 손님도 열린 메뉴 안에서만 낸다
 */
export function drawCustomer(
  rng: SeededRandom,
  repLevel: number,
  openMenus: number,
): { kind: CustomerKind; menu: Menu; lang: Lang | null; order: number } {
  const { weights } = arrivalRow(repLevel);
  let roll = rng.int(0, 99);
  let kind: CustomerKind = 'regular';
  for (let i = 0; i < CUSTOMER_KINDS.length; i += 1) {
    if (roll < weights[i]!) {
      kind = CUSTOMER_KINDS[i]!;
      break;
    }
    roll -= weights[i]!;
  }
  const menu = drawMenu(rng, openMenus);
  const lang = kind === 'tourist' ? LANGS[rng.int(0, LANGS.length - 1)]! : null;
  const [min, max] = KINDS[kind].order;
  return { kind, menu, lang, order: rng.int(min, max) };
}

/** 빵 값 배율(십분율): 황금 3, 알맞음 1, 덜 익음 0.5, 탐 0.3. 먹방 크리에이터는 품질을 따지지 않는다(황금은 그대로) */
export function valueTenths(quality: Quality, kind: CustomerKind): number {
  if (quality === 'golden') return 30;
  if (kind === 'creator' || quality === 'good') return 10;
  return quality === 'raw' ? 5 : 3;
}

/** 만족 점수: 황금 +2, 알맞음 0, 덜 익음 −1, 탐 −2. 먹방 크리에이터는 덜 익음·탐도 0 */
function qualityPoints(quality: Quality, kind: CustomerKind): number {
  if (quality === 'golden') return 2;
  if (quality === 'good' || kind === 'creator') return 0;
  return quality === 'raw' ? -1 : -2;
}

const RESULT_ORDER: readonly SaleResult[] = ['bad', 'meh', 'good', 'best'];

/** 둘 중 나쁜 결과 */
function worse(a: SaleResult, b: SaleResult): SaleResult {
  return RESULT_ORDER.indexOf(a) <= RESULT_ORDER.indexOf(b) ? a : b;
}

/** 받은 빵(덤 포함)으로 만족을 판정한다 (설계 §2) */
export function judgeSale(kind: CustomerKind, given: readonly Quality[], extra: boolean): SaleResult {
  const points = given.reduce((sum, q) => sum + qualityPoints(q, kind), 0);
  let result: SaleResult = points >= 2 ? 'best' : points >= 0 ? 'good' : points >= -2 ? 'meh' : 'bad';
  if (kind === 'kid' && !extra) result = worse(result, 'meh');
  if (kind === 'elder' && given.includes('burnt')) result = 'bad';
  return result;
}

/** 결과별 평판 변화. 리뷰어는 3배 */
export function reputationChange(result: SaleResult | 'left', kind: CustomerKind): number {
  const base = result === 'best' ? 3 : result === 'good' ? 2 : result === 'meh' ? 0 : result === 'bad' ? -3 : -2;
  return kind === 'reviewer' ? base * 3 : base;
}
