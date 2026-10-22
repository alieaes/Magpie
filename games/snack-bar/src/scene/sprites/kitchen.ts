// 주방 그림: 조리대(24 × 24), 접시(10 × 8), 작은 접시(6 × 6), 메뉴 그림(16 × 14), 쟁반(칸 3~6), 아이콘(9 × 9)
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

/**
 * 조리대 위 음식(공통 받침 위에 겹치는 격자, 받침과 같은 칸은 '.'). 음식마다 한눈에 알아볼 특징 하나:
 * 떡볶이 철판의 떡 원통·어묵·파, 도마 위 김밥 단면과 칼, 찜기 속 순대 줄과 썬 단면, 양은 냄비의 꼬불 면·달걀,
 * 기름 통과 새우튀김(꼬리)·고구마튀김(보라 껍질) 진열, 물통과 단무지 통
 */
const STATION_FOOD: Record<MenuArt | 'water', readonly string[]> = {
  tteok: [
    '..gggggggggggggggggggg..',
    '.gEEErrrrVEEEEEEEErrrEg.',
    '.gERrWPPPtrRrrrrrrWPtrg.',
    '.gERrtKKttrrWPPPtrtttrg.',
    '.gERRrCKrrRrtttttrrrVEg.',
    '.gERrrrrrRRRvrrrrrrrrEg.',
    '.gErWPPPtrrrrrrrWPPPtrg.',
    '.gErtttttrWPPPtrtKKKtrg.',
    '.gERrrrrrrtttttrrKCKrEg.',
    '.gErVrrrrrrrrVrrrrrrrEg.',
    '.gEEEEEEEEEEEEEEEEEEEEg.',
    '..gggggggggggggggggggg..',
  ],
  kimbap: [
    '.EEEEEEEEEEEEEEE........',
    'EEWWWEEWWWWEEEEEE.......',
    'EEWYOEEWYOEEWWWWEE......',
    'EEWVtEEWVtEEWYOWEE......',
    'EEWWEEEEWEEEEVtWEE......',
    '.EEEEEEEEEEEEEWWEEKKKKK.',
    'EEEEWWWEEWWWWEEEEKKKKKK.',
    '.EEEWYOEEWYOWEEEEEEEEEK.',
    '.KEEWVtEEWVtWEE.....JJE.',
    '.KEEWWWEEWWWWEEsssssEEK.',
    '.KKEEEEEEEEEEEKEEEEEJJK.',
    '.JEEEEEEEEEEEEEJJJJJJJJ.',
    '.JJEEEEEEEEEEEJJJJJJJJJ.',
  ],
  sundae: [
    '...JJEEEEEEEEEEJJJJJJ...',
    '.JKKEmmmmmmmmmgEKKKKKKJ.',
    '.JKaEgggggggEEEEEEEEaKJ.',
    '.JKaEEEEEEEEEmmmmmmgEKJ.',
    '.JKEmmmmmmmmgEggggggEKJ.',
    '.JKEgggggggggEMMMMMMEKJ.',
    '.JKEMMMMMMMMMEEEEEEEaKJ.',
    '.JKKEEEEEEEEEEgggEEEEKJ.',
    '..KKKKKKKKKKEgM.MEgggE..',
    '..JJJJJJJJJJEg.MEgM.MgE.',
    '..KKKKKKKKKKEgMgEg.MggE.',
    '..KJJJJJJJJJJEggEgMg.gE.',
    '..............EEEEgggE..',
    '..................EEE...',
  ],
  ramen: [
    '........................',
    '.....YYYYYYYYYYYYYY.....',
    '...YYOOOOOOOOOOOOOOYY...',
    '..YYCCRCCRCCVCCRWWWWYY..',
    '.oYRRCCRCCRCCRCWWYYWWYo.',
    '.oYRCCRCCRCCRCCRWWWWRYo.',
    '..YYRRVRRVRRRRRRRVRRYY..',
    '...YYYYRRRRRRRRRRYYYY...',
    '...YYYYYYYYYYYYYYYYYY...',
    '...YOYYYYYYYYYYYYYYOY...',
    '...YYYYYYYYYYYYYYYYYY...',
    '....OOOOOOOOOOOOOOOO....',
    '..gggggggggggggggggggg..',
  ],
  fried: [
    '.......EE...............',
    '......EggE.......tt.....',
    '......EgE.......tRt..tt.',
    '......EgE......YOt..tRt.',
    '.......gg.....YOYO.YOt..',
    'gggggggggg...YOYOYYOEEE.',
    'gEEEEEEEEg..YOYOYYOE444E',
    'gEYYWYYYEg.OYOYOYOE4YYY4',
    'gEYOYYWYEg.YOYOOYOE4YOY4',
    'gEYYYOYYEg.WWWWYOYE4YYY4',
    'gEEEEEEEEg.WWWWWWWWE444E',
    'gggggggggg.WWWWW.WWWEEEW',
    '...........W.WWWWWWW.WWW',
  ],
  water: [
    '....EEEE................',
    '...EssssE...............',
    '..EssssssE..............',
    '.E11111111E.............',
    '.E1W111111E.............',
    '.E1W111111E.EEEEEEEEEE..',
    '.E1W111111EEWWWWWWWWWWE.',
    '.E11111111EWYYOYYYOYYYWE',
    '.E11111111EWOYYYOYYYOYWE',
    '..E111111EEWYYOYYYOYYYWE',
    '...EEssEE.E.WWWWWWWWWW.E',
    '.....s.....E..........E.',
    '............EEEEEEEEEE..',
  ],
};

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
  return stamp(counter(STATION_TAG[name]), g(STATION_FOOD[name]), 0, 0);
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
export const MINI_H = 6;

/** 머리 위 쟁반에 얹는 작은 접시: 큰 메뉴 그림(MENU_ICONS)을 줄인 모양(떡 원통, 김밥 단면, 순대, 냄비, 새우·고구마) */
const MINI: Record<MenuArt | 'water', readonly string[]> = {
  tteok: ['.rrrr.', 'rWPPtr', 'RrrrrR', 'RWPtVR', 'WRRRRW', '.wwww.'],
  kimbap: ['.EEEE.', 'EWWWWE', 'EWYOWE', 'EWVtWE', '.EEEE.', 'EEEEEE'],
  sundae: ['.EEEE.', 'EmmmgE', 'EMMMME', '.EEE..', 'WgwgMW', '.wwww.'],
  ramen: ['.YYYY.', 'YRCCWY', 'YCRVRY', 'oYYYYo', '.YYYY.', '..OO..'],
  fried: ['....t.', '...Yt.', '..YO44', '.YO4Y4', 'WOYW44', '.wwww.'],
  water: ['WW....', '11....', '1W.YY.', '11YYYY', '11WWWW', '11.ww.'],
};

/** 작은 접시 그림 */
export function dishMiniGrid(name: MenuArt | 'water'): Grid {
  return g(MINI[name]);
}

// ---------------------------------------------------------------- 메뉴 그림

/** 메뉴 그림 크기(작은 도트, 테두리 제외) */
export const MENU_ICON_W = 16;
export const MENU_ICON_H = 14;

/**
 * 메뉴 그림: 손님 머리 위 주문 말풍선·화면 아래 쟁반 칸·메뉴 카드에 크게 보이는 음식 그림.
 * 색이 아니라 모양으로 알아보게 음식마다 특징을 그린다(떡볶이: 소스 속 떡 원통과 어묵, 김밥: 단면 다섯 조각,
 * 순대: 순대 한 줄·썬 단면·소금, 라면: 양은 냄비에 꼬불 면·달걀, 튀김: 새우튀김 꼬리·고구마 보라 껍질)
 */
const MENU_ICONS: Record<MenuArt | 'water', readonly string[]> = {
  tteok: [
    '................',
    '......rrrrr.....',
    '.....rWPPPtr....',
    '.....rtttttr....',
    '..rrrrrrrrrrrr..',
    '.rWPPPtrrWPPvtr.',
    '.rtttttrrttttVr.',
    '..rrrrrrrrrrrr..',
    '.RRRrWPPtrRKKRR.',
    'RRVRrttttrRKCKRR',
    'RRRvRrrrrRVKKKRR',
    'WRRRRRRRRRRRRRRW',
    'WWwwwwwwwwwwwwWW',
    '.WWWWWWWWWWWWWW.',
  ],
  kimbap: [
    '......EEEE......',
    '.EEEEEWWWWEEEEE.',
    'EWWWWEWYOWEWWWWE',
    'EWYOWEWVtWEWYOWE',
    'EWVtWEWWWWEWVtWE',
    'EWWEEEEEEEEEEWWE',
    '.EEWWWWEEWWWWEE.',
    'EEEWYOWEEWYOWEEE',
    '.EEWVtWEEWVtWEE.',
    '..EWWWWEEWWWWE..',
    '.WwEEEEwwEEEEwW.',
    'WwEEEEEEEEEEEEwW',
    'WWwEEEEwwEEEEwWW',
    '.WWWWWWWWWWWWWW.',
  ],
  sundae: [
    '.............EE.',
    '....EEEEEEEEEwwE',
    '..EEgggggggEwWgw',
    '.EggmmmmmmEwWWWw',
    'EggggggggggEEEEE',
    'ggEEEgggggEEEgE.',
    'EEgggEEEEEgggE..',
    'EgMwMEggEgMwMgE.',
    'EgwMEgMwEgwMMgE.',
    'EgMMEgwMEgMMwgE.',
    '.EggEgMMwEgggEW.',
    'WwEEEEgggEEEEwwW',
    'WWwwwwEEEwwwwwWW',
    '.WWWWWWWWWWWWWW.',
  ],
  ramen: [
    '................',
    '...YYYYYYYYYY...',
    '.YYOOOOOOOOOOYY.',
    'YYOVRRRRRRRWWWYY',
    'YRCCRCCRCCWWYYWY',
    'YRRCCRCCRCRWWWRY',
    'YYCCRCCRCCRRRVYY',
    '.YYYvRRRRVRRYYY.',
    'OOYYYYYYYYYYYYOO',
    'OOYYYYYYYYYYYYOO',
    '.YOYYYYYYYYYYOY.',
    '.YYYYYYYYYYYYYY.',
    '..OYYYYYYYYYYO..',
    '...OOOOOOOOOO...',
  ],
  fried: [
    '................',
    '...........tt...',
    '......tt..tRt...',
    '.....tRt.YOt....',
    '....YOt.YOYO....',
    '...YOYOYOYOEEE..',
    '..YOYOYOYOE444E.',
    '.YOYOOYOYE4YYY4E',
    'OYOYOYOYOE4YOY4E',
    'YOYO.....E4YYY4E',
    'WW.O......E444EW',
    'WwW.....O..EEEwW',
    '.WwWWWWWWWWWWwW.',
    '..wwwwwwwwwwww..',
  ],
  water: [
    '................',
    '................',
    'WWWWWW..........',
    '111111..........',
    '1W1111..........',
    '1W1111..........',
    '1W1111..........',
    '111111..........',
    '111111...YYYY...',
    '111111..YYoYYY..',
    '111111.WYYYYYYW.',
    '111111.WWWWWWWW.',
    '.1111...wwwwww..',
    '................',
  ],
};

/** 메뉴 그림 */
export function menuIconGrid(name: MenuArt | 'water'): Grid {
  return g(MENU_ICONS[name]);
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
