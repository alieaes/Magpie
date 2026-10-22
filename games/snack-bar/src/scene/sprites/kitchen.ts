// 주방 그림: 조리대(24 × 24), 접시(10 × 8), 작은 접시(6 × 5), 쟁반(칸 3~6), 아이콘(9 × 9)
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2, docs/design/261022-09-snack-bar.md §6
// 시안: draft-sprites.py의 PAN_STATION·DISH_*·tray_with·CUP·HEART

import type { IconName, MenuArt } from './index';
import { blank, g, put, rect, stamp, stampOutlined, type Grid } from './grid';

// ---------------------------------------------------------------- 조리대

/** 조리대 크기(도트) */
export const STATION_SIZE = 24;

/** 조리대 앞 이름표 색 (메뉴마다) */
const STATION_TAG: Record<MenuArt | 'water', string> = {
  tteok: 'R',
  kimbap: 'V',
  sundae: '4',
  ramen: 'O',
  fried: 'Y',
  water: '1',
};

/** 공통 조리대 받침: 위 판(8~12줄), 앞면(14~21줄), 발(22~23줄). tag는 앞면 이름표 색 */
function counter(tag?: string): Grid {
  const c = blank(STATION_SIZE, STATION_SIZE);
  put(c, rect(0, 8, 23, 12), 'w');
  put(c, rect(0, 13, 23, 13), 'W');
  put(c, rect(0, 14, 23, 21), 's');
  put(c, [...rect(2, 15, 21, 15), ...rect(2, 20, 21, 20), ...rect(2, 16, 2, 19), ...rect(21, 16, 21, 19)], 'm');
  put(c, rect(9, 17, 14, 17), tag ?? 'g');
  if (tag) put(c, rect(9, 18, 14, 18), 'g');
  put(c, rect(0, 22, 23, 22), 'g');
  put(c, [[1, 23], [2, 23], [21, 23], [22, 23]], 'g');
  return c;
}

/** 떡볶이 철판 */
const PAN = g([
  '.gggggggggggggggggggg.',
  'gEEEEEEEEEEEEEEEEEEEEg',
  'gERRtRRRRRtRRRRRtRRREg',
  'gERWWRRtRWWRRCCRWWRREg',
  'gERRRWWRRRRRRRCRRRtREg',
  'gERtRRRRWWRRtRRRWWRREg',
  'gERRCCRRRRRRWWRRRRRREg',
  'gERRRCRRtRRRRRRRtRRREg',
  'gEEEEEEEEEEEEEEEEEEEEg',
  '.gggggggggggggggggggg.',
]);

/** 김밥 한 줄을 썬 단면(5 × 5) */
const KIMBAP_SLICE = g(['.EEE.', 'EWWWE', 'EWYVE', 'EWOWE', '.EEE.']);

/** 순대 찜기: 뚜껑을 연 둥근 찜통에 순대가 똬리 */
const STEAMER = g([
  '....ssssssssssss....',
  '..ssWWWWWWWWWWWWss..',
  '.sWggmgggggmggggWs..',
  'sWgmggLLggmgLLggmWs.',
  'sWgggLggLgggggLggWs.',
  '.sWggmggggLLggmgWs..',
  '..ssWWWWWWWWWWWWss..',
  '..mssssssssssssssm..',
  '..mmmmmmmmmmmmmmmm..',
  '...mssssssssssssm...',
]);

/** 라면 냄비(노란 양은 냄비)와 화구 */
const RAMEN_POT = g([
  '....YYYYYYYYYYYY....',
  '..YYOOOCOOOOCOOOYY..',
  '.YOOCCOOCVOOOCCOOOY.',
  'oYOCOOOOOOWYOOCOOOYo',
  'oYOOOCCOVOOOCOOVOOYo',
  '.YYOOOOOCOOOOOOOOYY.',
  '..YYYYYYYYYYYYYYYY..',
  '..OYYYYYYYYYYYYYYO..',
  '...OOOOOOOOOOOOOO...',
  '.gggggggggggggggggg.',
]);

/** 튀김기: 기름 통과 철망 바구니 */
const FRYER = g([
  'gggggggggggggggggggggg',
  'gEEEEEEEEEEEEEEEEEEEEg',
  'gEYYOYYYYsssssssssYYEg',
  'gEYYYYOYYsOoOYOosYYYEg',
  'gEYOYYYYYsoOYOOOsYOYEg',
  'gEYYYYYOYsOYoOoOsYYYEg',
  'gEYYOYYYYsssssssssYYEg',
  'gEEEEEEEEEEEEEEEEEEEEg',
  'gggggggggggggggggggggg',
]);

/** 물통(하늘색 물통과 꼭지) */
const WATER_JUG = g([
  '..ssss..',
  '.ssssss.',
  '11111111',
  '1W111111',
  '1W111111',
  '1W111111',
  '11111111',
  '11111111',
  '.111111.',
]);

/** 단무지 통 */
const DANMUJI_TUB = g([
  '.WWWWWWWWWW.',
  'WYYoYYYYoYYW',
  'WYoYYYYYYoYW',
  'WYYYYoYYYYYW',
  'wWWWWWWWWWWw',
  '.wwwwwwwwww.',
]);

/** 쓰레기통(조리대 없이 서 있다) */
const TRASH_BIN = g([
  '....vvvvvvvvvv....',
  '..vvVVVVVVVVVVvv..',
  '.vVVVVVVVVVVVVVVv.',
  '..vvVVVVVVVVVVvv..',
  '....vvvggggvv.....',
  '..vvvvvvvvvvvvvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '..vVVvVVvVVvVVvv..',
  '...vvvvvvvvvvvv...',
  '...gggggggggggg...',
]);

/** 잠긴 조리대 덮개: 회색 천과 자물쇠 */
function lockedStation(): Grid {
  const c = counter();
  const cloth = g([
    '...mmmmmmmmmmmmmmmmmm...',
    '.mmsssssssssssssssssmm..',
    'msssssssssmsssssssssssm.',
    'mssssssssmssssssssmssssm',
    'msssssssmssssssssmsssssm',
    'msssssssmsssssssmssssssm',
    'mssssssmsssssssmsssssssm',
    'mssssssmssssssmssssssssm',
    'mssssssmssssssmssssssssm',
    'msssssmssssssmsssssssssm',
    'msssssmssssssmsssssssssm',
    'mssssmsssssssmsssssssssm',
    'mssssmssssssmssssssssssm',
    'msssmsssssssmssssssssssm',
    'mmsmmssssssmmssssssssmmm',
    '.mmm.mmmmmmm.mmmmmmmmm..',
  ]);
  stamp(c, cloth, 0, 6);
  // 자물쇠
  stampOutlined(c, g(['.gg.', 'g..g', 'YYYY', 'YoYY', 'YYYY']), 10, 13);
  return c;
}

/** 조리대 그림 (메뉴 5, 물·단무지 통, 쓰레기통, 잠긴 덮개) */
export function stationGrid(name: MenuArt | 'water' | 'trash' | 'locked'): Grid {
  if (name === 'trash') return stamp(blank(STATION_SIZE, STATION_SIZE), TRASH_BIN, 3, 7);
  if (name === 'locked') return lockedStation();
  const c = counter(STATION_TAG[name]);
  switch (name) {
    case 'tteok':
      stamp(c, PAN, 1, 2);
      break;
    case 'kimbap': {
      put(c, rect(2, 5, 21, 10), 'K');
      put(c, rect(2, 11, 21, 12), 'J');
      put(c, [[5, 10], [6, 10], [16, 6], [17, 6], [12, 11]], 'J');
      // 썰기 전 김밥 한 줄 + 썬 단면 둘
      stampOutlined(c, g(['ggggggg', 'EEEEEEE', 'EEEEEEE', 'EEEEEEE', 'EEEEEEE']), 3, 5);
      stampOutlined(c, KIMBAP_SLICE, 9, 5);
      stampOutlined(c, KIMBAP_SLICE, 15, 4);
      stampOutlined(c, KIMBAP_SLICE, 16, 8);
      break;
    }
    case 'sundae':
      stamp(c, STEAMER, 2, 1);
      break;
    case 'ramen':
      stamp(c, RAMEN_POT, 2, 1);
      put(c, [[4, 11], [8, 11], [12, 11], [16, 11], [19, 11]], 'R');
      break;
    case 'fried':
      stamp(c, FRYER, 1, 2);
      stampOutlined(c, g(['gg', 'g.', 'g.']), 19, 0);
      break;
    case 'water':
      stampOutlined(c, WATER_JUG, 2, 1);
      put(c, [[5, 10], [6, 10], [5, 11]], 's'); // 꼭지
      stampOutlined(c, DANMUJI_TUB, 11, 6);
      break;
  }
  return c;
}

// ---------------------------------------------------------------- 접시

/** 접시 크기(작은 도트) */
export const DISH_W = 10;
export const DISH_H = 8;

/** 테이블에 내려놓는 접시 (메뉴 5, 물·단무지, 빈 그릇) */
const DISHES: Record<MenuArt | 'water' | 'empty', readonly string[]> = {
  tteok: [
    '..........',
    '...RRRR...',
    '..RWWRtR..',
    '.RRtRWWRR.',
    'WRWWRRRtRW',
    'WWRRRRRRWW',
    'wWWWWWWWWw',
    '.wwwwwwww.',
  ],
  kimbap: [
    '..........',
    '.EE.EE.EE.',
    'EWWEWWEWWE',
    'EYOEVYEOVE',
    'WEEWEEWEEW',
    'WWWWWWWWWW',
    'wWWWWWWWWw',
    '.wwwwwwww.',
  ],
  sundae: [
    '..........',
    '..ggg.ggg.',
    '.gmgggmggg',
    '.ggggmgggg',
    'WgmggggmgW',
    'WWgggWWWYW',
    'wWWWWWWWWw',
    '.wwwwwwww.',
  ],
  ramen: [
    '..........',
    '..YYYYYY..',
    '.YOCOOCOY.',
    '.YCOVOCOY.',
    'oYYYYYYYYo',
    '.YYYYYYYY.',
    '.OYYYYYYO.',
    '..OOOOOO..',
  ],
  fried: [
    '..........',
    '...OO.....',
    '..OYOOoO..',
    '.OoOYOOYO.',
    'WOYOOoOOOW',
    'WWWWWWWWWW',
    'wWWWWWWWWw',
    '.wwwwwwww.',
  ],
  water: [
    'WWWW......',
    '1111......',
    '1W11......',
    '1W11..YY..',
    '1111.YYYY.',
    '1111WWWWWW',
    '1111wWWWWw',
    '.11..wwww.',
  ],
  empty: [
    '..........',
    '..WWWWWW..',
    '.WwwtwwwW.',
    'WwwwwwtwwW',
    'WWwwwwwwWW',
    '.WWWWWWWW.',
    '..wwwwww..',
    '...ssss...',
  ],
};

/** 접시 그림 */
export function dishGrid(name: MenuArt | 'water' | 'empty'): Grid {
  return g(DISHES[name]);
}

/** 작은 접시 크기(작은 도트, 테두리 제외) */
export const MINI_W = 6;
export const MINI_H = 5;

/** 쟁반 위·쟁반 칸에 보이는 작은 접시 */
const MINI: Record<MenuArt | 'water', readonly string[]> = {
  tteok: ['.RRRR.', 'RWRtWR', 'RRWWRR', 'WWWWWW', '.wwww.'],
  kimbap: ['.EEEE.', 'EWWWWE', 'EWYOWE', 'WEEEEW', '.wwww.'],
  sundae: ['.gggg.', 'gmgmgg', 'ggmgmg', 'WWWWWW', '.wwww.'],
  ramen: ['YYYYYY', 'YOCOCY', 'YCOVOY', 'oYYYYo', '.OOOO.'],
  fried: ['.OO...', 'OYOoO.', 'oOYOOO', 'WWWWWW', '.wwww.'],
  water: ['WW....', '11.YY.', '1WYYYY', '11WWWW', '11.ww.'],
};

/** 작은 접시 그림 */
export function dishMiniGrid(name: MenuArt | 'water'): Grid {
  return g(MINI[name]);
}

// ---------------------------------------------------------------- 쟁반

/** 쟁반 칸 하나의 너비(작은 도트). 이웃 접시와 테두리 한 칸을 같이 쓴다 */
const SLOT_PITCH = MINI_W + 1;

/** 쟁반 그림(칸 수 3~6): 테두리 안쪽 위부터 가장자리·바닥·앞턱 세 줄 */
export function trayGrid(slots: number): Grid {
  const w = SLOT_PITCH * slots + 3;
  const c = blank(w, 3);
  put(c, rect(1, 0, w - 2, 0), 'w');
  put(c, rect(0, 1, w - 1, 1), 's');
  put(c, rect(1, 2, w - 2, 2), 'm');
  return c;
}

/**
 * 쟁반 텍스처(테두리 포함) 왼쪽 위를 (0, 0)으로, 칸마다 작은 접시 텍스처(테두리 포함)의 왼쪽 아래 자리(작은 도트).
 * 접시 바닥 테두리가 쟁반 바닥 줄에 얹히고 앞턱은 보인다
 */
export function traySlotDots(slots: number): { x: number; y: number }[] {
  return Array.from({ length: slots }, (_, i) => ({ x: 2 + SLOT_PITCH * i, y: 3 }));
}

// ---------------------------------------------------------------- 아이콘

/** 아이콘 크기(작은 도트) */
export const ICON_SIZE = 9;

const ICONS: Record<IconName, readonly string[]> = {
  cup: [
    '.........',
    '.WWWWWWW.',
    '.1111111.',
    '.1W11111.',
    '..1W111..',
    '..11111..',
    '..11111..',
    '..11111..',
    '...www...',
  ],
  heart: [
    '.........',
    '.RRR.RRR.',
    'RRWRRRRRR',
    'RWRRRRRRR',
    'RRRRRRRRR',
    '.RRRRRRR.',
    '..RRRRR..',
    '...RRR...',
    '....R....',
  ],
  anger: [
    '..RR.RR..',
    '...R.R...',
    'RR.....RR',
    '.R.....R.',
    '.........',
    '.R.....R.',
    'RR.....RR',
    '...R.R...',
    '..RR.RR..',
  ],
  coin: [
    '..OOOOO..',
    '.OYYYYYO.',
    'OYWYYYYYO',
    'OYWYOYYYO',
    'OYYOOYYYO',
    'OYYYOYYYO',
    'OYYOOOYYO',
    '.OYYYYYO.',
    '..OOOOO..',
  ],
  spoon: [
    '......ss.',
    '.....sWss',
    '.....swws',
    '....s.ss.',
    '...s.....',
    '..s......',
    '.s.......',
    's........',
    '.........',
  ],
  steam: [
    '.........',
    '..WW.WW..',
    '.WWWWWWW.',
    'WWWWWWWWW',
    'WWWWWWWWw',
    '.wWWWWww.',
    '..wwwww..',
    '.........',
    '.........',
  ],
  sparkle: [
    '....Y....',
    '....Y....',
    '....Y....',
    '...YWY...',
    'YYYWWWYYY',
    '...YWY...',
    '....Y....',
    '....Y....',
    '....Y....',
  ],
  sweat: [
    '....1....',
    '....1....',
    '...111...',
    '..11111..',
    '.1W11111.',
    '.1W11111.',
    '.1111111.',
    '..11111..',
    '...111...',
  ],
};

/** 아이콘 그림 */
export function iconGrid(name: IconName): Grid {
  return g(ICONS[name]);
}
