// 동물 손님 머리 10종(16 × 15): 토끼·양·돼지·오리·개구리·코알라·펭귄·다람쥐·코끼리·사슴, 앞모습(표정)과 뒷모습
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2, 시안 draft-sprites.py의 rabbit·pig·duck·frog·animal_back

import type { GuestFace } from './index';
import { g, put, rect, stamp, type Grid } from './grid';
import { frontBlush, frontEyes, frontMouth, headBase, type EyeKind, type MouthKind } from './heads';

/** 동물 한 종 */
export interface Animal {
  id: string;
  /** 이름(그림 보기 이름표) */
  name: string;
  front: (face: GuestFace) => Grid;
  back: () => Grid;
  /** 머리 뒤로 보이는 꼬리(다람쥐). 손님 격자 기준 [격자, x, y] */
  tail?: { grid: Grid; front: readonly [number, number]; back: readonly [number, number] };
}

/** 손님 표정 → 눈 */
function eyesOf(face: GuestFace): EyeKind {
  return face === 'happy' ? 'happy' : face === 'angry' ? 'angry' : 'normal';
}

/** 손님 표정 → 입 (보통일 때 쓸 입을 고른다) */
function mouthOf(face: GuestFace, normal: MouthKind = 'cat'): MouthKind {
  return face === 'happy' ? 'happy' : face === 'angry' ? 'angry' : normal;
}

// ---------------------------------------------------------------- 토끼

const RABBIT_EARS = g([
  '...WW....WW.....',
  '...WbW..WbW.....',
  '...WbW..WbW.....',
  '...WbW..WbW.....',
]);

const rabbit: Animal = {
  id: 'rabbit',
  name: '토끼',
  front(face) {
    const c = headBase('W');
    stamp(c, RABBIT_EARS, 1, 0);
    frontEyes(c, eyesOf(face));
    put(c, [[7, 11], [8, 11]], 'b');
    frontMouth(c, mouthOf(face));
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('W');
    stamp(c, RABBIT_EARS, 1, 0, { b: 'W' });
    put(c, [[6, 13], [7, 13], [8, 13], [9, 13]], 'w');
    return c;
  },
};

// ---------------------------------------------------------------- 양

const SHEEP_WOOL = g([
  '................',
  '................',
  '................',
  '....WW.WW.WW....',
  '...WWWWWWWWWW...',
  '..WWwWWWWWWwWW..',
  '.WWWWWWWWWWWWWW.',
  '.WWwWWWWWWWWwWW.',
  'WWWWW......WWWWW',
  '.WWW........WWW.',
  '.WW..........WW.',
  '.WW..........WW.',
  '..W..........W..',
]);
/** 양 귀: 털 아래로 옆으로 처진 귀 */
const SHEEP_EARS: [number, number][] = [[0, 9], [0, 10], [1, 10], [15, 9], [15, 10], [14, 10]];

const sheep: Animal = {
  id: 'sheep',
  name: '양',
  front(face) {
    const c = headBase('a');
    stamp(c, SHEEP_WOOL, 0, 0);
    put(c, SHEEP_EARS, 'J'); // 옆으로 처진 귀
    frontEyes(c, eyesOf(face));
    put(c, [[7, 11], [8, 11]], 'J');
    frontMouth(c, mouthOf(face));
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('W');
    stamp(c, SHEEP_WOOL, 0, 0);
    put(c, SHEEP_EARS, 'J');
    put(c, [[4, 9], [9, 8], [6, 11], [11, 11], [3, 12], [8, 13]], 'w');
    return c;
  },
};

// ---------------------------------------------------------------- 돼지

const PIG_EARS = g(['.bb..........bb.', '.bbb........bbb.', '..bb........bb..']);

const pig: Animal = {
  id: 'pig',
  name: '돼지',
  front(face) {
    const c = headBase('P');
    stamp(c, PIG_EARS, 0, 3);
    frontEyes(c, eyesOf(face));
    put(c, rect(6, 11, 9, 13), 'b');
    put(c, [[6, 11], [9, 11], [6, 13], [9, 13]], 'P');
    put(c, [[7, 12], [8, 12]], 'M');
    if (face === 'angry') put(c, [[7, 14], [8, 14]], 'M');
    put(c, face === 'happy' ? [[1, 12], [2, 12], [13, 12], [14, 12]] : [[2, 12], [13, 12]], 'b');
    return c;
  },
  back() {
    const c = headBase('P');
    stamp(c, PIG_EARS, 0, 3, { b: 'P' });
    return c;
  },
};

// ---------------------------------------------------------------- 오리

const duck: Animal = {
  id: 'duck',
  name: '오리',
  front(face) {
    const c = headBase('Y');
    put(c, [[7, 2], [8, 3], [7, 3], [6, 3]], 'Y');
    frontEyes(c, eyesOf(face));
    put(c, rect(5, 11, 10, 12), 'O');
    put(c, [[5, 12], [10, 12]], 'Y');
    if (face === 'happy') put(c, rect(6, 13, 9, 13), 'O');
    if (face === 'angry') put(c, [[6, 12], [9, 12]], 'o');
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('Y');
    put(c, [[7, 2], [8, 3], [7, 3], [6, 3]], 'Y');
    return c;
  },
};

// ---------------------------------------------------------------- 개구리

const FROG_BUMPS = g(['..VVVV....VVVV..', '.VVVVVV..VVVVVV.', '.VVVVVV..VVVVVV.']);

const frog: Animal = {
  id: 'frog',
  name: '개구리',
  front(face) {
    const c = headBase('V');
    stamp(c, FROG_BUMPS, 0, 2);
    // 위로 튀어나온 눈
    if (face === 'happy') put(c, [[2, 4], [3, 3], [4, 3], [5, 4], [10, 4], [11, 3], [12, 3], [13, 4]], 'E');
    else {
      put(c, rect(2, 3, 5, 5), 'W');
      put(c, rect(10, 3, 13, 5), 'W');
      put(c, rect(3, 4, 4, 5), 'E');
      put(c, rect(11, 4, 12, 5), 'E');
      put(c, [[3, 4], [11, 4]], 'W');
      if (face === 'angry') put(c, [[2, 2], [3, 2], [12, 2], [13, 2]], 'E');
    }
    put(c, rect(3, 12, 12, 13), 'C', true);
    if (face === 'angry') put(c, [[4, 11], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 11]], 'v');
    else put(c, [[4, 10], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 10]], 'v');
    if (face === 'happy') put(c, [[7, 12], [8, 12]], 't');
    put(c, [[2, 9], [3, 9], [12, 9], [13, 9]], 'b');
    return c;
  },
  back() {
    const c = headBase('V');
    stamp(c, FROG_BUMPS, 0, 2);
    put(c, [[5, 9], [10, 10], [7, 12]], 'v');
    return c;
  },
};

// ---------------------------------------------------------------- 코알라

const KOALA_EAR = g(['.sss.', 'swwws', 'swwws', 'swwws', '.sss.']);

const koala: Animal = {
  id: 'koala',
  name: '코알라',
  front(face) {
    const c = headBase('s');
    stamp(c, KOALA_EAR, 0, 3);
    stamp(c, KOALA_EAR, 11, 3);
    frontEyes(c, eyesOf(face));
    put(c, [[7, 10], [8, 10], [6, 11], [7, 11], [8, 11], [9, 11], [7, 12], [8, 12]], 'g');
    frontMouth(c, mouthOf(face, 'normal'), 13);
    frontBlush(c, 'b', 12);
    return c;
  },
  back() {
    const c = headBase('s');
    stamp(c, KOALA_EAR, 0, 3, { w: 's' });
    stamp(c, KOALA_EAR, 11, 3, { w: 's' });
    put(c, [[6, 13], [7, 13], [8, 13], [9, 13]], 'm');
    return c;
  },
};

// ---------------------------------------------------------------- 펭귄

const PENGUIN_MASK = g([
  '...WWW..WWW...',
  '..WWWWWWWWWW..',
  '.WWWWWWWWWWWW.',
  '.WWWWWWWWWWWW.',
  '.WWWWWWWWWWWW.',
  '..WWWWWWWWWW..',
  '....WWWWWW....',
]);

const penguin: Animal = {
  id: 'penguin',
  name: '펭귄',
  front(face) {
    const c = headBase('L');
    put(c, [[7, 3], [8, 3]], 'L');
    stamp(c, PENGUIN_MASK, 1, 8, undefined, true);
    frontEyes(c, eyesOf(face));
    put(c, [[7, 11], [8, 11]], 'O');
    if (face === 'happy') put(c, [[7, 12], [8, 12]], 'o');
    if (face === 'angry') put(c, [[6, 11], [9, 11]], 'o');
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('L');
    put(c, [[7, 3], [8, 3]], 'L');
    return c;
  },
};

// ---------------------------------------------------------------- 다람쥐

const SQUIRREL_EARS = g(['..o..........o..', '.oo..........oo.', '.oJo........oJo.']);
const SQUIRREL_TAIL = g([
  '..ooo.',
  '.ooooo',
  'oooJoo',
  'ooJooo',
  'oJoooo',
  'oJooo.',
  'ooooo.',
  '.oooo.',
  '..ooo.',
  '...oo.',
]);

const squirrel: Animal = {
  id: 'squirrel',
  name: '다람쥐',
  front(face) {
    const c = headBase('o');
    stamp(c, SQUIRREL_EARS, 0, 2);
    put(c, [...rect(4, 11, 11, 13), [3, 12], [12, 12]], 'C', true);
    put(c, [[7, 6], [8, 6], [7, 7], [8, 7]], 'J'); // 이마 줄무늬
    frontEyes(c, eyesOf(face));
    put(c, [[7, 11], [8, 11]], 'h');
    frontMouth(c, mouthOf(face));
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('o');
    stamp(c, SQUIRREL_EARS, 0, 2, { J: 'o' });
    put(c, [[7, 5], [8, 5], [7, 6], [8, 6], [7, 7], [8, 7]], 'J');
    return c;
  },
  tail: { grid: SQUIRREL_TAIL, front: [14, 1], back: [0, 3] },
};

// ---------------------------------------------------------------- 코끼리

const ELEPHANT_EAR = g(['mmm.', 'mbbm', 'mbbm', 'mbbm', 'mbbm', 'mbm.', '.mm.']);

const elephant: Animal = {
  id: 'elephant',
  name: '코끼리',
  front(face) {
    const c = headBase('m');
    stamp(c, ELEPHANT_EAR, 0, 6);
    stamp(c, g(ELEPHANT_EAR.map((r) => [...r].reverse().join(''))), 12, 6);
    frontEyes(c, eyesOf(face));
    // 코
    put(c, [[7, 10], [8, 10], [7, 11], [8, 11], [7, 12], [8, 12], [8, 13], [9, 13], [9, 14]], 's');
    put(c, [[7, 12], [8, 13]], 'w');
    if (face === 'happy') put(c, [[5, 13], [6, 13]], 'M');
    if (face === 'angry') put(c, [[5, 13], [6, 12]], 'M');
    put(c, [[4, 12], [11, 12]], 'b');
    return c;
  },
  back() {
    const c = headBase('m');
    stamp(c, ELEPHANT_EAR, 0, 6, { b: 'm' });
    stamp(c, g(ELEPHANT_EAR.map((r) => [...r].reverse().join(''))), 12, 6, { b: 'm' });
    put(c, [[2, 8], [2, 9], [2, 10], [13, 8], [13, 9], [13, 10]], 'g');
    return c;
  },
};

// ---------------------------------------------------------------- 사슴

const DEER_ANTLERS = g([
  '.a..a....a..a...',
  '.aa.a....a.aa...',
  '..aaa....aaa....',
  '...a......a.....',
]);

const deer: Animal = {
  id: 'deer',
  name: '사슴',
  front(face) {
    const c = headBase('J');
    stamp(c, DEER_ANTLERS, 1, 0);
    put(c, [[0, 7], [1, 7], [0, 8], [14, 7], [15, 7], [15, 8]], 'J'); // 옆으로 난 귀
    put(c, [[1, 8], [14, 8]], 'b');
    put(c, [...rect(5, 11, 10, 13), [4, 12], [11, 12]], 'C', true);
    put(c, [[6, 6], [9, 6], [7, 7]], 'C'); // 점무늬
    frontEyes(c, eyesOf(face));
    put(c, [[7, 11], [8, 11]], 'E');
    frontMouth(c, mouthOf(face));
    frontBlush(c);
    return c;
  },
  back() {
    const c = headBase('J');
    stamp(c, DEER_ANTLERS, 1, 0);
    put(c, [[0, 7], [1, 7], [0, 8], [14, 7], [15, 7], [15, 8]], 'J');
    put(c, [[5, 7], [10, 8], [7, 10], [4, 11], [11, 11]], 'C');
    return c;
  },
};

/** 동물 10종. 순서가 손님 생김새 번호 0~9다 */
export const ANIMALS: readonly Animal[] = [rabbit, sheep, pig, duck, frog, koala, penguin, squirrel, elephant, deer];
