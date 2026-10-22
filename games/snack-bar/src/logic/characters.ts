// 직원(플레이어 캐릭터) 9명: 능력과 열리는 조건. 생김새는 화면(scene/sprites)에만 있다.
// 근거: docs/design/261022-11-snack-bar-characters.md §2, §4, §5

import { STAFF_IDS, levelOf, type ShopState, type StaffId } from './state';

/** 직원 능력. 강화 값에 더한다(한계는 rules.ts의 createDay) */
export interface Perks {
  /** 한 칸 걸음 틱을 이만큼 줄인다 */
  step: number;
  /** 물·단무지를 한 번에 더 담는 세트 수 */
  water: number;
  /** 쟁반 칸을 더한다 */
  tray: number;
  /** 테이블을 깨끗하게 하는 닦기 횟수. 0이면 기본(3번) */
  wipes: number;
  /** 모든 메뉴 연타 수를 줄인다 */
  taps: number;
  /** 손님 기다림 막대 길이 +% */
  patience: number;
  /** 팁 +%p (기분 +2 이상 손님) */
  tip: number;
  /** 경험치 +% */
  exp: number;
}

/** 열리는 조건 */
export type Unlock =
  | { type: 'start' }
  | { type: 'level'; goal: number }
  | { type: 'water' | 'cleaned' | 'bigGroups' | 'best'; goal: number }
  | { type: 'sold'; menu: number; goal: number }
  | { type: 'profit'; goal: number }
  | { type: 'days'; goal: number };

export interface StaffDef {
  name: string;
  /** 능력 한 줄 (명부 카드) */
  ability: string;
  /** 조건 한 줄 (잠긴 카드) */
  condition: string;
  perks: Partial<Perks>;
  unlock: Unlock;
}

/** 직원 표 (1차 9명). 수치는 튜닝값이다 */
export const STAFF: Readonly<Record<StaffId, StaffDef>> = {
  owner: { name: '까치 사장', ability: '능력 없음', condition: '처음부터', perks: {}, unlock: { type: 'start' } },
  runner: { name: '콩콩', ability: '걸음이 빠르다', condition: '가게 Lv2', perks: { step: 1 }, unlock: { type: 'level', goal: 2 } },
  water: { name: '졸졸', ability: '물·단무지 한 번에 +1세트', condition: '물·단무지 150번 내기', perks: { water: 1 }, unlock: { type: 'water', goal: 150 } },
  server: { name: '척척', ability: '쟁반 +1칸', condition: '김밥 150그릇 팔기', perks: { tray: 1 }, unlock: { type: 'sold', menu: 1, goal: 150 } },
  cleaner: { name: '뽀득', ability: '두 번 닦으면 깨끗', condition: '테이블 300번 깨끗하게', perks: { wipes: 2 }, unlock: { type: 'cleaned', goal: 300 } },
  cook: { name: '보글', ability: '모든 메뉴 연타 -1', condition: '대식가 40무리 받기', perks: { taps: 1 }, unlock: { type: 'bigGroups', goal: 40 } },
  smile: { name: '방긋', ability: '손님 기다림 +15%', condition: '기분 최고 손님 300명', perks: { patience: 15 }, unlock: { type: 'best', goal: 300 } },
  talker: { name: '술술', ability: '팁 +10%p', condition: '하루 수익 80,000원', perks: { tip: 10 }, unlock: { type: 'profit', goal: 80_000 } },
  master: { name: '손맛 어르신', ability: '경험치 +20%', condition: '30일 장사하기', perks: { exp: 20 }, unlock: { type: 'days', goal: 30 } },
};

/** 직원 능력을 빈 값까지 채워 돌려준다 */
export function perksOf(id: StaffId): Perks {
  return { step: 0, water: 0, tray: 0, wipes: 0, taps: 0, patience: 0, tip: 0, exp: 0, ...STAFF[id].perks };
}

/** 조건의 진행: 지금 값과 목표. 레벨·일수는 지금 레벨·마친 일수 */
export function unlockProgress(state: ShopState, id: StaffId): { current: number; goal: number } {
  const u = STAFF[id].unlock;
  switch (u.type) {
    case 'start':
      return { current: 1, goal: 1 };
    case 'level':
      return { current: levelOf(state.exp), goal: u.goal };
    case 'sold':
      return { current: state.sold[u.menu] ?? 0, goal: u.goal };
    case 'profit':
      return { current: Math.max(0, state.stats.bestProfit), goal: u.goal };
    case 'days':
      return { current: state.day - 1, goal: u.goal };
    default:
      return { current: state.stats[u.type], goal: u.goal };
  }
}

/** 아직 잠긴 직원 중 조건을 채운 직원 (명부 순서) */
export function newlyUnlocked(state: ShopState): StaffId[] {
  return STAFF_IDS.filter((id) => {
    if (state.unlocked.includes(id)) return false;
    const { current, goal } = unlockProgress(state, id);
    return current >= goal;
  });
}
