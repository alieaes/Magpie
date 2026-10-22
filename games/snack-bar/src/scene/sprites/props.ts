// 가구·바닥·벽 그림: 테이블 24 × 16(깨끗·더러움·잠김), 의자 10 × 10, 바닥·벽 타일 8 × 8, 창문·문·메뉴판·가게 앞모습
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2·§4, 시안 draft-sprites.py의 TABLE·STOOL·wall

import type { PropName } from './index';
import { blank, g, put, rect, stampOutlined, type Grid } from './grid';

/** 가구 그림 하나. outline이 false면 자동 테두리 없이 굽는다(이어 붙이는 타일) */
export interface PropArt {
  grid: Grid;
  outline: boolean;
}

/** 테이블(위 판 0~9줄, 앞 가장자리 10~11줄, 다리 12~15줄) */
function table(): Grid {
  return g([
    '..KKKKKKKKKKKKKKKKKKKK..',
    '.KKKKKKKKKKKKKKKKKKKKKK.',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KKKKJJJKKKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKKKJJJKKKK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KKKKKKKKKKJJJJKKKKKKKKKK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'JJJJJJJJJJJJJJJJJJJJJJJJ',
    'zzzzzzzzzzzzzzzzzzzzzzzz',
    '..zz..h..........h..zz..',
    '..zz..h..........h..zz..',
    '..zz................zz..',
    '..zz................zz..',
  ]);
}

/** 빈 그릇(테이블 위 더러운 그릇) */
const BOWL = g(['.WWWWWW.', 'WwwtwwwW', 'WwwwwtwW', '.WWWWWW.', '..wwww..']);

/** 더러운 테이블: 빈 그릇 둘, 국물 얼룩, 부스러기 */
function tableDirty(): Grid {
  const c = table();
  put(c, [[14, 6], [15, 6], [16, 6], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [15, 8], [16, 8]], 'o');
  put(c, [[14, 7], [16, 6]], 't');
  put(c, [[19, 3], [7, 8], [20, 8], [11, 2]], 'J');
  stampOutlined(c, BOWL, 3, 2);
  stampOutlined(c, BOWL, 12, 1);
  return c;
}

/** 잠긴 테이블: 천을 덮어 다리까지 가린다 */
function tableLocked(): Grid {
  return g([
    '..wwwwwwwwwwwwwwwwwwww..',
    '.wWWWWWWWWWWWWWWWWWWWWw.',
    'wWWWWWWWWWWWWWWWWWWWWWWw',
    'wWWwWWWWWWWWWWWWWWWwWWWw',
    'wWWWwWWWWWWWWWWWWWwWWWWw',
    'wWWWWWWWWWWWWWWWWWWWWWWw',
    'wWWWWWWWWWWWWWWWWWWWWWWw',
    'wWWWWWWWWWWWWWWWWWWWWWWw',
    'wWWWWWWWWWWWWWWWWWWWWWWw',
    'wwwwwwwwwwwwwwwwwwwwwwww',
    'wsswwwswwwwwswwwwswwwssw',
    'wswwwwswwwwwswwwwswwwwsw',
    'swwwwswwwwwwswwwwwswwwws',
    'swwwswwwwwwswwwwwwswwwws',
    'sssssssssssssssssssssss.',
    '.s.s.s.s.s.s.s.s.s.s.s..',
  ]);
}

/** 의자: 빨간 둥근 방석에 쇠 다리(분식집 둥근 의자) */
function chair(): Grid {
  return g([
    '..rrrrrr..',
    '.rRRRRRRr.',
    'rRRtRRRRRr',
    '.rRRRRRRr.',
    '..rrrrrr..',
    '..s....s..',
    '..s....s..',
    '..ssssss..',
    '..s....s..',
    '..m....m..',
  ]);
}

/** 이어 붙이는 바닥 타일 */
function floor(color: string): Grid {
  return blank(8, 8).map((r) => r.map(() => color));
}

/** 벽 타일: 나무 판자 두 장 */
function wall(): Grid {
  return g(['JJJJzzzz', 'JJJJzzzz', 'JJJJzzzz', 'JJzJzzzz', 'JJJJzzzz', 'JJJJzzhz', 'JJJJzzzz', 'JJJJzzzz']);
}

/** 창문: 나무 창틀 두 칸. 유리 자리는 비어 있다(화면이 뒤에 시간에 맞는 하늘색을 깐다) */
function windowFrame(): Grid {
  const c = blank(22, 14);
  put(c, rect(0, 0, 21, 12), 'h');
  put(c, rect(2, 2, 9, 10), '.');
  put(c, rect(12, 2, 19, 10), '.');
  put(c, rect(0, 13, 21, 13), 'K');
  put(c, [[0, 12], [21, 12]], 'K');
  put(c, rect(1, 1, 20, 1), 'z');
  return c;
}

/** 문: 위에 종, 유리창 달린 나무 문 */
function door(): Grid {
  const c = blank(18, 26);
  stampOutlined(c, g(['.YY.', 'YYYY', 'YYYY', '.o..']), 7, 0);
  put(c, rect(0, 5, 17, 25), 'z');
  put(c, rect(2, 6, 15, 25), 'K');
  put(c, rect(4, 8, 13, 14), '1');
  put(c, [[5, 9], [6, 9], [5, 10]], 'W');
  put(c, [...rect(4, 17, 13, 17), ...rect(4, 23, 13, 23), ...rect(4, 18, 4, 22), ...rect(13, 18, 13, 22)], 'J');
  put(c, [[12, 19], [12, 20]], 'Y');
  return c;
}

/** 메뉴판: 빨간 머리띠와 빈 흰 판(글자는 화면이 쓴다) */
function menuBoard(): Grid {
  const c = blank(40, 16);
  put(c, rect(0, 0, 39, 15), 'z');
  put(c, rect(1, 1, 38, 14), 'W');
  put(c, rect(1, 1, 38, 3), 'R');
  put(c, rect(1, 4, 38, 4), 'r');
  put(c, [[3, 2], [36, 2]], 'Y');
  put(c, rect(1, 14, 38, 14), 'w');
  return c;
}

/** 가게 앞모습: 간판 자리(글자는 화면이 쓴다), 줄무늬 차양, 창문, 문, 화분 */
function shopFront(): Grid {
  const W = 64;
  const c = blank(W, 48);
  // 간판
  put(c, rect(4, 0, 59, 11), 'h');
  put(c, rect(5, 1, 58, 10), 'C');
  put(c, rect(5, 10, 58, 10), 'a');
  // 벽
  put(c, rect(1, 12, 62, 45), 'F');
  put(c, rect(1, 12, 62, 13), 'a');
  // 차양(빨강·흰 줄무늬, 아래 물결)
  for (let x = 0; x < W; x += 1) {
    const ch = Math.floor(x / 4) % 2 === 0 ? 'R' : 'W';
    put(c, rect(x, 14, x, 19), ch);
    if (x % 4 !== 3) put(c, [[x, 20]], ch);
    if (x % 4 === 1 || x % 4 === 2) put(c, [[x, 21]], ch);
  }
  put(c, rect(0, 14, 63, 14), 'r');
  // 창문 둘
  for (const x0 of [5, 42]) {
    put(c, rect(x0, 25, x0 + 16, 38), 'h');
    put(c, rect(x0 + 1, 26, x0 + 15, 37), '1');
    put(c, rect(x0 + 8, 26, x0 + 8, 37), 'h');
    put(c, [[x0 + 2, 27], [x0 + 3, 27], [x0 + 2, 28], [x0 + 10, 27], [x0 + 11, 27]], 'W');
    put(c, rect(x0 - 1, 39, x0 + 17, 39), 'K');
  }
  // 문
  put(c, rect(25, 23, 38, 45), 'z');
  put(c, rect(26, 24, 37, 45), 'K');
  put(c, rect(28, 26, 35, 33), '1');
  put(c, [[29, 27], [30, 27], [29, 28]], 'W');
  put(c, [[35, 37], [35, 38]], 'Y');
  // 화분
  for (const x0 of [21, 40]) {
    put(c, rect(x0, 37, x0 + 2, 40), 'V');
    put(c, [[x0 + 1, 36], [x0, 38]], 'v');
    put(c, rect(x0, 41, x0 + 2, 45), 'z');
  }
  // 바닥 턱
  put(c, rect(0, 46, 63, 47), 's');
  put(c, rect(0, 47, 63, 47), 'm');
  return c;
}

/** 가구·바닥·벽 그림 */
export function propArt(name: PropName): PropArt {
  switch (name) {
    case 'table':
      return { grid: table(), outline: true };
    case 'tableDirty':
      return { grid: tableDirty(), outline: true };
    case 'tableLocked':
      return { grid: tableLocked(), outline: true };
    case 'chair':
      return { grid: chair(), outline: true };
    case 'floorA':
      return { grid: floor('F'), outline: false };
    case 'floorB':
      return { grid: floor('a'), outline: false };
    case 'wall':
      return { grid: wall(), outline: false };
    case 'window':
      return { grid: windowFrame(), outline: true };
    case 'door':
      return { grid: door(), outline: true };
    case 'menuBoard':
      return { grid: menuBoard(), outline: true };
    case 'shopFront':
      return { grid: shopFront(), outline: true };
  }
}

/** 모든 가구 이름 (굽기·그림 보기 순서) */
export const PROP_NAMES: readonly PropName[] = [
  'table',
  'tableDirty',
  'tableLocked',
  'chair',
  'floorA',
  'floorB',
  'wall',
  'window',
  'door',
  'menuBoard',
  'shopFront',
];
