// 머리 공통 틀(16 × 15)과 사람 머리: 머리 모양 7가지 × 앞·뒤·옆, 표정(눈·입·볼)
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2, 시안 draft-sprites.py의 HEAD·eyes·mouth·human·human_back
// 격자 글자: h = 머리카락 색, k = 피부색, x = 모자 색(그릴 때 바꿈). 나머지는 팔레트 글자

import { blank, g, put, rect, stamp, type Grid, type Pt } from './grid';

/** 머리 틀 크기(도트) */
export const HEAD_W = 16;
export const HEAD_H = 15;

/** 둥근 머리 14 × 11. 머리 틀의 (1, 4)에 놓는다(위 4줄은 귀·머리 모양·모자 자리) */
const ROUND = g([
  '....XXXXXX....',
  '..XXXXXXXXXX..',
  '.XXXXXXXXXXXX.',
  '.XXXXXXXXXXXX.',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  '.XXXXXXXXXXXX.',
  '..XXXXXXXXXX..',
  '....XXXXXX....',
]);

/** 둥근 머리를 한 색으로 칠한 빈 머리 틀 */
export function headBase(fill: string): Grid {
  return stamp(blank(HEAD_W, HEAD_H), ROUND, 1, 4, { X: fill });
}

// ---------------------------------------------------------------- 표정 (앞모습)

/** 눈 모양 */
export type EyeKind = 'normal' | 'blink' | 'happy' | 'angry';
/** 입 모양. cat은 ω */
export type MouthKind = 'normal' | 'happy' | 'angry' | 'cat';

/** 앞모습 눈. 왼눈 (4-5, 9-10), 오른눈 (10-11, 9-10). whites면 털이 어두운 얼굴에 흰자를 깐다. dy로 위아래 옮김 */
export function frontEyes(c: Grid, kind: EyeKind, whites = false, dy = 0): void {
  const at = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [x, y + dy] as const);
  if (whites && kind !== 'happy' && kind !== 'blink') {
    put(c, at(rect(3, 8, 6, 11)), 'W');
    put(c, at(rect(9, 8, 12, 11)), 'W');
  }
  if (kind === 'normal' || kind === 'angry') {
    put(c, at(rect(4, 9, 5, 10)), 'E');
    put(c, at(rect(10, 9, 11, 10)), 'E');
    put(c, at([[4, 9], [10, 9]]), 'W');
  } else if (kind === 'blink') {
    put(c, at([[3, 10], [4, 10], [5, 10], [10, 10], [11, 10], [12, 10]]), 'E');
  } else {
    put(c, at([[3, 10], [4, 9], [5, 9], [6, 10], [9, 10], [10, 9], [11, 9], [12, 10]]), 'E');
  }
  if (kind === 'angry') {
    // 찡그린 눈썹
    put(c, at([[3, 7], [4, 8], [5, 8], [12, 7], [11, 8], [10, 8]]), 'E');
  }
}

/** 앞모습 입 (y줄 가운데) */
export function frontMouth(c: Grid, kind: MouthKind, y = 12): void {
  if (kind === 'normal') put(c, [[7, y], [8, y]], 'M');
  else if (kind === 'happy') {
    put(c, [[6, y], [7, y], [8, y], [9, y]], 'M');
    put(c, [[7, y + 1], [8, y + 1]], 't');
  } else if (kind === 'angry') {
    put(c, [[7, y], [8, y]], 'M');
    put(c, [[6, y + 1], [9, y + 1]], 'M');
  } else put(c, [[6, y], [9, y], [7, y + 1], [8, y + 1]], 'M');
}

/** 앞모습 볼 */
export function frontBlush(c: Grid, color = 'b', y = 11): void {
  put(c, [[2, y], [3, y], [12, y], [13, y]], color);
}

/** 옆모습(오른쪽을 봄) 눈 하나 (11-12, 9-10) */
export function sideEye(c: Grid, kind: EyeKind): void {
  if (kind === 'normal' || kind === 'angry') {
    put(c, rect(11, 9, 12, 10), 'E');
    put(c, [[11, 9]], 'W');
  } else if (kind === 'blink') put(c, [[10, 10], [11, 10], [12, 10]], 'E');
  else put(c, [[10, 10], [11, 9], [12, 9], [13, 10]], 'E');
}

/** 옆모습 입·볼 */
export function sideMouth(c: Grid, kind: MouthKind): void {
  put(c, [[10, 11], [11, 11]], 'b');
  if (kind === 'happy') {
    put(c, [[12, 12], [13, 12]], 'M');
    put(c, [[13, 13]], 't');
  } else put(c, [[13, 12]], 'M');
}

// ---------------------------------------------------------------- 사람 머리 모양

/** 머리 모양: 짧은 머리·단발·올림머리·곱슬·삐죽 머리·모자 + 가르마(척척) */
export type HairStyle = 'short' | 'bob' | 'bun' | 'curly' | 'spiky' | 'cap' | 'part';
/** 바라보는 쪽 그림. side는 오른쪽을 봄(왼쪽은 뒤집어 씀) */
export type View = 'front' | 'back' | 'side';

/** 앞모습 머리카락(위 10~13줄만 적고 나머지는 비움) */
const FRONT_HAIR: Record<HairStyle, readonly string[]> = {
  short: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '..hhhhhhhhhhhh..',
    '.hhhh.hhh.hhhhh.',
    '.hh..........hh.',
    '.h............h.',
  ],
  bob: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'hhh..........hhh',
    'hhh..........hhh',
    'hhh..........hhh',
    'hhh..........hhh',
    '.hh..........hh.',
  ],
  bun: [
    '......hhhh......',
    '.....hhhhhh.....',
    '......hhhh......',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '..hhhhhhhhhhhh..',
    '.hhhhh....hhhhh.',
    '.hh..........hh.',
    '.h............h.',
  ],
  curly: [
    '................',
    '................',
    '....hh.hh.hh....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'hhh.hh.hh.hh.hhh',
    'hh............hh',
    'hh............hh',
    '.h............h.',
  ],
  spiky: [
    '................',
    '................',
    '....h..h..h.....',
    '....hh.hh.hh....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '..hhhhhhhhhhhh..',
    '.hhh.hhhh.hhhh..',
    '.hh..........hh.',
  ],
  cap: [
    '................',
    '................',
    '................',
    '.....xxxxxx.....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '..xxxxxxxxxxxx..',
    '.hhhxxxxxxxxxxxx',
    '.hh..........hh.',
  ],
  part: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhh.hhhh.',
    '.hhhhhhhh...hhh.',
    '.hhhhhh.......h.',
    '.hh...........h.',
  ],
};

/** 뒷모습 머리 전체(15줄) */
const BACK_HAIR: Record<HairStyle, readonly string[]> = {
  short: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'khhhhhhhhhhhhhhk',
    'khhhhhhhhhhhhhhk',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '...hkkkkkkkkh...',
    '.....kkkkkk.....',
  ],
  bob: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '.....kkkkkk.....',
  ],
  bun: [
    '......hhhh......',
    '.....hhhhhh.....',
    '......hhhh......',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'khhhhhhhhhhhhhhk',
    'khhhhhhhhhhhhhhk',
    '.hhhhhhhhhhhhhh.',
    '..hhhkkkkkkhhh..',
    '...kkkkkkkkkk...',
    '.....kkkkkk.....',
  ],
  curly: [
    '................',
    '................',
    '....hh.hh.hh....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '...hkkkkkkkkh...',
    '.....kkkkkk.....',
  ],
  spiky: [
    '................',
    '................',
    '....h..h..h.....',
    '....hh.hh.hh....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'khhhhhhhhhhhhhhk',
    'khhhhhhhhhhhhhhk',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '...hkkkkkkkkh...',
    '.....kkkkkk.....',
  ],
  cap: [
    '................',
    '................',
    '................',
    '.....xxxxxx.....',
    '...xxxxxxxxxx...',
    '..xxxxxxxxxxxx..',
    '.xxxxxxxxxxxxxx.',
    '.xxxxxhhhhxxxxx.',
    '.hhhhhhhhhhhhhh.',
    'khhhhhhhhhhhhhhk',
    'khhhhhhhhhhhhhhk',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '...hkkkkkkkkh...',
    '.....kkkkkk.....',
  ],
  part: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    'khhhhhhhhhhhhhhk',
    'khhhhhhhhhhhhhhk',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '...hkkkkkkkkh...',
    '.....kkkkkk.....',
  ],
};

/** 옆모습(오른쪽을 봄) 머리카락. 뒤통수(왼쪽)를 덮고 앞머리가 이마 위로 */
const SIDE_HAIR: Partial<Record<HairStyle, readonly string[]>> = {
  short: [
    '................',
    '................',
    '................',
    '....hhhhhh......',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    '.hhhhhhhhhhhhh..',
    'hhhhhhhhhhhhhhh.',
    'hhhhhhh.....hh..',
    'hhhhhh..........',
    'hhhhhh..........',
    '.hhhhh..........',
    '..hhh...........',
    '...h............',
  ],
  bob: [
    '................',
    '................',
    '................',
    '....hhhhhh......',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    '.hhhhhhhhhhhhh..',
    'hhhhhhhhhhhhhhh.',
    'hhhhhhhhhhhhhhh.',
    'hhhhhhhhh.......',
    'hhhhhhhhh.......',
    'hhhhhhhhh.......',
    'hhhhhhhh........',
    '.hhhhhh.........',
  ],
  bun: [
    '...hhhh.........',
    '..hhhhhh........',
    '...hhhh.........',
    '....hhhhhh......',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    '.hhhhhhhhhhhhh..',
    'hhhhhhhhhhhhhhh.',
    'hhhhhh.......h..',
    'hhhhh...........',
    'hhhhh...........',
    '.hhhh...........',
    '..hh............',
  ],
  curly: [
    '................',
    '................',
    '...hh.hh.hh.....',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    'hhhhhhhhhhhhhh..',
    'hhhhhhhhhhhhhhh.',
    'hhhhhhhhhhhhhhhh',
    'hhhhhhh.hh..h.h.',
    'hhhhhh..........',
    'hhhhhh..........',
    'hhhhhh..........',
    '.hhhh...........',
    '..hh............',
  ],
  spiky: [
    '................',
    '..h..h..........',
    '..hh.hh.h.......',
    '..hhhhhhhhh.....',
    '.hhhhhhhhhhh....',
    'hhhhhhhhhhhhh...',
    '.hhhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    'hhhhhhh..h...h..',
    '.hhhhh..........',
    '.hhhhh..........',
    '.hhhhh..........',
    '..hhh...........',
  ],
  part: [
    '................',
    '................',
    '................',
    '....hhhhhh......',
    '..hhhhhhhhhh....',
    '.hhhhhhhhhhhh...',
    '.hhhhhhhhhhhhhh.',
    'hhhhhhhhhh..hhh.',
    'hhhhhhh.......h.',
    'hhhhhh..........',
    'hhhhhh..........',
    '.hhhhh..........',
    '..hhh...........',
    '...h............',
  ],
};

/** 짧은 줄을 16칸으로 채워 격자로 */
function rows16(rows: readonly string[]): Grid {
  return g(rows.map((r) => r.padEnd(HEAD_W, '.')));
}

/** 사람 머리(얼굴 없이): 피부·머리 모양·머리카락 색. cap은 모자 색 */
export function humanHead(view: View, skin: string, hair: string, style: HairStyle, cap = 't'): Grid {
  const remap = { h: hair, k: skin, x: cap };
  if (view === 'back') {
    const c = blank(HEAD_W, HEAD_H);
    return stamp(c, rows16(BACK_HAIR[style]), 0, 0, remap);
  }
  const c = headBase(skin);
  if (view === 'front') {
    put(c, [[0, 9], [0, 10], [15, 9], [15, 10]], skin); // 귀
    stamp(c, rows16(FRONT_HAIR[style]), 0, 0, remap);
  } else {
    put(c, [[15, 10]], skin); // 코끝
    stamp(c, rows16(SIDE_HAIR[style] ?? SIDE_HAIR.short!), 0, 0, remap);
  }
  return c;
}

/** 사람 얼굴을 그린다(앞·옆). 뒷모습은 얼굴이 없다 */
export function humanFace(c: Grid, view: View, eyes: EyeKind, mouth: MouthKind): Grid {
  if (view === 'front') {
    frontEyes(c, eyes);
    frontMouth(c, mouth);
    frontBlush(c);
  } else if (view === 'side') {
    sideEye(c, eyes);
    sideMouth(c, mouth);
  }
  return c;
}

/** 동그란 안경(앞·옆) */
export function glasses(c: Grid, view: View): void {
  if (view === 'front') {
    for (const [x0, x1] of [[3, 6], [9, 12]] as const) {
      put(c, [...rect(x0, 8, x1, 8), ...rect(x0, 11, x1, 11), [x0, 9], [x0, 10], [x1, 9], [x1, 10]], 'g');
    }
    put(c, [[7, 9], [8, 9]], 'g');
  } else if (view === 'side') {
    put(c, [...rect(10, 8, 13, 8), ...rect(10, 11, 13, 11), [10, 9], [10, 10], [13, 9], [13, 10]], 'g');
    put(c, [[7, 9], [8, 9], [9, 9]], 'g');
  }
}
