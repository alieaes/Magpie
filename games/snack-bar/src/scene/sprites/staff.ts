// 직원 그림: 공통 몸(16 × 8) 위에 직원 머리(16 × 15)를 얹은 16 × 22. 직원마다 얼굴·머리 모양·피부색·소품 하나
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2·§3, docs/design/261022-11-snack-bar-characters.md §2
// 시안: draft-sprites.py의 STAFF_BODY·STAFF_BODY_BACK·WALK_A·WALK_B·TRAY_ARMS·staff
// 몸 격자 글자: S = 셔츠, A = 앞치마, H = 손, f = 신발 (직원마다 바꿈). a·L은 팔레트 그대로(주머니·바지)

import type { Facing, StaffFace, StaffId, StaffPose } from './index';
import { blank, flipX, g, put, rect, stamp, type Grid, type Pt } from './grid';
import { glasses, humanFace, humanHead, type HairStyle, type View } from './heads';

/** 직원 그림 크기(도트, 테두리 제외). 머리 15줄 + 몸 8줄, 한 줄 겹침 */
export const STAFF_W = 16;
export const STAFF_H = 22;
/** 몸이 시작하는 줄 */
const BODY_Y = 14;
/** 쟁반을 든 손의 맨 윗줄(격자 줄). 쟁반 바닥이 여기 얹힌다 */
export const STAFF_HAND_TOP = 2;

/** 직원 생김새 */
export interface StaffLook {
  /** 이름(그림 보기 이름표) */
  name: string;
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  /** 손 색(고무장갑). 없으면 피부색 */
  hands?: string;
  /** 신발 색. 없으면 먹색 */
  shoes?: string;
  /** 머리 소품(머리를 그린 뒤, 얼굴을 그리기 전에) */
  hat?: (c: Grid, view: View) => void;
  /** 몸 소품(몸을 그린 뒤) */
  prop?: (c: Grid, view: View) => void;
  /** 얼굴을 그린 뒤 겹치는 것(안경) */
  over?: (c: Grid, view: View) => void;
}

// ---------------------------------------------------------------- 머리 소품

/** 두건: 이마 위 두 줄 + 아랫단 그늘, 매듭 */
function bandana(color: string, shade: string) {
  return (c: Grid, view: View) => {
    if (view === 'back') {
      put(c, rect(1, 5, 14, 7), color, true);
      put(c, rect(1, 8, 14, 8), shade, true);
      put(c, [[7, 9], [8, 9], [6, 10], [9, 10]], color);
      put(c, [[7, 8], [8, 8]], shade);
      return;
    }
    put(c, rect(0, 5, 15, 6), color, true);
    put(c, rect(0, 7, 15, 7), shade, true);
    if (view === 'front') put(c, [[15, 6], [15, 7], [14, 8]], color);
    else put(c, [[0, 6], [0, 7], [0, 8], [1, 9]], color);
  };
}

/** 땀 흡수 머리띠(콩콩): 흰 띠에 파란 줄 */
function headband(c: Grid, view: View): void {
  put(c, rect(0, 6, 15, 6), 'W', true);
  put(c, rect(0, 7, 15, 7), '7', true);
  if (view === 'side') put(c, [[0, 7], [0, 8]], 'W');
}

/** 노란 머릿수건(뽀득): 머리 위를 덮고 뒤로 묶음, 올림머리는 위로 나온다 */
function scarf(c: Grid, view: View): void {
  if (view === 'back') {
    put(c, rect(0, 4, 15, 7), 'Y', true);
    put(c, rect(0, 8, 15, 8), 'O', true);
    put(c, [[7, 9], [8, 9]], 'Y');
    put(c, [[7, 10]], 'O');
    return;
  }
  put(c, rect(0, 4, 15, 6), 'Y', true);
  put(c, rect(0, 7, 15, 7), 'O', true);
  if (view === 'front') put(c, [[1, 8], [14, 8]], 'O', true);
  else put(c, [[0, 7], [0, 8], [1, 9]], 'Y');
}

/** 하얀 요리사 모자(보글) */
function chefHat(c: Grid): void {
  stamp(
    c,
    g([
      '....WW.WW.WW....',
      '..WWWWWWWWWWWW..',
      '..WWWWWWWWWWWW..',
      '..WWWWWWWWWWwW..',
      '...wWWWWWWWww...',
      '..wwwwwwwwwwww..',
      '..ssssssssssss..',
    ]),
    0,
    0,
  );
}

/** 큰 리본 머리핀(방긋) */
function ribbon(c: Grid, view: View): void {
  const bow = g(['bb...bb', 'bbbtbbb', 'bb...bb']);
  if (view === 'back') stamp(c, bow, 9, 2);
  else if (view === 'side') stamp(c, bow, 1, 1);
  else stamp(c, bow, 0, 2);
}

/** 베레모(술술): 비스듬히 얹은 납작한 모자와 꼭지 */
function beret(c: Grid, view: View): void {
  const front = g([
    '.........x......',
    '....xxxxxxxx....',
    '..xxxxxxxxxxxx..',
    '.xxxxxxxxxxxxxxx',
    '..LLLLLLLLLLLL..',
  ]);
  const side = g([
    '......x.........',
    '...xxxxxxxx.....',
    '.xxxxxxxxxxxx...',
    'xxxxxxxxxxxxxx..',
    '.LLLLLLLLLLLLL..',
  ]);
  const shape = view === 'side' ? side : view === 'back' ? flipX(front) : front;
  stamp(c, shape, 0, 2, { x: '4' });
}

/** 동그란 안경(손맛 어르신) */
function roundGlasses(c: Grid, view: View): void {
  glasses(c, view);
}

// ---------------------------------------------------------------- 몸 소품 (직원 격자 좌표)

/** 앞치마의 까치 배지(까치 사장) */
function badge(c: Grid, view: View): void {
  if (view === 'front') put(c, [[9, BODY_Y + 1], [10, BODY_Y + 1], [9, BODY_Y + 2], [10, BODY_Y + 2]], 'L');
  if (view === 'front') put(c, [[10, BODY_Y + 2]], 'W');
}

/** 허리에 찬 물병(졸졸) */
function bottle(c: Grid, view: View): void {
  const at = view === 'back' ? 1 : view === 'side' ? 4 : 13;
  put(c, [[at, BODY_Y + 4]], 'W');
  put(c, rect(at, BODY_Y + 5, at + 1, BODY_Y + 6), '1');
  put(c, [[at + 1, BODY_Y + 5]], 'W');
}

/** 나비넥타이(척척) */
function bowTie(c: Grid, view: View): void {
  if (view === 'front') {
    put(c, [[6, BODY_Y + 1], [9, BODY_Y + 1], [6, BODY_Y + 2], [9, BODY_Y + 2]], 'R');
    put(c, [[7, BODY_Y + 1], [8, BODY_Y + 1]], 'r');
  } else if (view === 'side') put(c, [[11, BODY_Y + 1], [11, BODY_Y + 2]], 'R');
}

/** 직원 9명 생김새 (261022-11 §2 표). 피부색은 밝은 3·중간 2·갈색 2·짙은 갈색 2 */
export const STAFF_LOOKS: Readonly<Record<StaffId, StaffLook>> = {
  owner: { name: '까치 사장', skin: 'k', hair: 'h', style: 'short', shirt: '1', hat: bandana('R', 'r'), prop: badge },
  runner: { name: '콩콩', skin: 'z', hair: 'E', style: 'spiky', shirt: '7', shoes: 'O', hat: headband },
  water: { name: '졸졸', skin: 'j', hair: 'z', style: 'bob', shirt: '8', hat: bandana('7', 'L'), prop: bottle },
  server: { name: '척척', skin: 'J', hair: 'h', style: 'part', shirt: 'L', prop: bowTie },
  cleaner: { name: '뽀득', skin: 'z', hair: 'E', style: 'bun', shirt: '4', hands: 'b', hat: scarf },
  cook: { name: '보글', skin: 'k', hair: 'J', style: 'short', shirt: 'w', hat: chefHat },
  smile: { name: '방긋', skin: 'j', hair: 'o', style: 'curly', shirt: 'Y', hat: ribbon },
  talker: { name: '술술', skin: 'J', hair: 'E', style: 'short', shirt: 't', hat: beret },
  master: { name: '손맛 어르신', skin: 'k', hair: 'w', style: 'curly', shirt: 'V', over: roundGlasses },
};

// ---------------------------------------------------------------- 몸

/** 몸통(몸 0~5줄): 앞·뒤·옆 */
const TORSO: Record<View, Grid> = {
  front: g([
    '....SSSSSSSS....',
    '...SSAAAAAASS...',
    '...SSAAAAAASS...',
    '...SSAAaaAASS...',
    '.....AAAAAA.....',
    '....AAAAAAAA....',
  ]),
  back: g([
    '....SSSSSSSS....',
    '...SSSAAAASSS...',
    '...SSSSAASSSS...',
    '...SSSSAASSSS...',
    '.....SAAAAS.....',
    '....SSSSSSSS....',
  ]),
  side: g([
    '.....SSSSSS.....',
    '.....SSSSAAA....',
    '.....SSSSAAA....',
    '....ASSSSAAA....',
    '......SSSAAA....',
    '......LLAAAA....',
  ]),
};

/** 다리(몸 6~7줄): 서기·걷기 두 장 */
const LEGS: Record<'front' | 'side', Record<'stand' | 'walkA' | 'walkB', Grid>> = {
  front: {
    stand: g(['....LL....LL....', '...fff....fff...']),
    walkA: g(['....LL....ff....', '...fff..........']),
    walkB: g(['....ff....LL....', '..........fff...']),
  },
  side: {
    stand: g(['......LLLL......', '......fffff.....']),
    walkA: g(['.....LL..LL.....', '....fff..fff....']),
    walkB: g(['......LLLL......', '.......ffff.....']),
  },
};

/** 팔 하나의 자세 */
type Arm = 'down' | 'up' | 'work' | 'swingF' | 'swingB';
/** 팔 점: [x, y, 글자] (직원 격자 좌표) */
type ArmPx = readonly [number, number, 'S' | 'H'];

/** 앞·뒷모습 왼팔(그림 왼쪽). 오른팔은 좌우를 뒤집어 쓴다 */
function frontArm(arm: Arm, view: 'front' | 'back'): ArmPx[] {
  const y = BODY_Y;
  if (arm === 'up') {
    return [
      [1, STAFF_HAND_TOP, 'H'],
      [2, STAFF_HAND_TOP, 'H'],
      [1, STAFF_HAND_TOP + 1, 'H'],
      [2, STAFF_HAND_TOP + 1, 'H'],
      [1, STAFF_HAND_TOP + 2, 'S'],
      [1, STAFF_HAND_TOP + 3, 'S'],
      [1, STAFF_HAND_TOP + 4, 'S'],
      [2, y - 1, 'S'],
      [2, y, 'S'],
      [2, y + 1, 'S'],
    ];
  }
  if (arm === 'work') {
    if (view === 'back') return [[2, y + 1, 'S'], [2, y, 'S'], [3, y, 'H'], [3, y - 1, 'H']];
    return [[2, y + 2, 'S'], [3, y + 4, 'H'], [4, y + 4, 'H'], [4, y + 5, 'H']];
  }
  return [[2, y + 2, 'S'], [2, y + 3, 'H'], [2, y + 4, 'H'], [3, y + 4, 'H']];
}

/** 옆모습(오른쪽을 봄) 가까운 팔 */
function sideArm(arm: Arm): ArmPx[] {
  const y = BODY_Y;
  if (arm === 'up') {
    return [
      [13, STAFF_HAND_TOP, 'H'],
      [14, STAFF_HAND_TOP, 'H'],
      [13, STAFF_HAND_TOP + 1, 'H'],
      [14, STAFF_HAND_TOP + 1, 'H'],
      [14, STAFF_HAND_TOP + 2, 'S'],
      [14, STAFF_HAND_TOP + 3, 'S'],
      [15, STAFF_HAND_TOP + 4, 'S'],
      [15, STAFF_HAND_TOP + 5, 'S'],
    ];
  }
  if (arm === 'work') return [[12, y + 2, 'S'], [13, y + 2, 'H'], [14, y + 2, 'H'], [13, y + 3, 'H']];
  if (arm === 'swingF') return [[9, y + 4, 'H'], [10, y + 4, 'H']];
  if (arm === 'swingB') return [[5, y + 4, 'H'], [5, y + 5, 'H']];
  return [[7, y + 4, 'H'], [8, y + 4, 'H']];
}

/** 옆모습 먼 팔(쟁반을 들 때만 보인다) */
function sideFarArm(arm: Arm): ArmPx[] {
  if (arm !== 'up') return [];
  return [
    [2, STAFF_HAND_TOP, 'H'],
    [3, STAFF_HAND_TOP, 'H'],
    [2, STAFF_HAND_TOP + 1, 'H'],
    [3, STAFF_HAND_TOP + 1, 'H'],
    [1, STAFF_HAND_TOP + 2, 'S'],
    [1, STAFF_HAND_TOP + 3, 'S'],
    [0, STAFF_HAND_TOP + 4, 'S'],
    [0, STAFF_HAND_TOP + 5, 'S'],
  ];
}

/** 팔 점들을 칠한다 */
function drawArm(c: Grid, px: readonly ArmPx[], remap: Readonly<Record<string, string>>, mirror = false): void {
  for (const [x, y, ch] of px) put(c, [[mirror ? STAFF_W - 1 - x : x, y] as Pt], remap[ch]!);
}

/** 직원 한 장을 격자로 그린다. 왼쪽은 오른쪽 그림을 뒤집는다 */
export function staffGrid(id: StaffId, facing: Facing, pose: StaffPose, carry: boolean, face: StaffFace): Grid {
  const look = STAFF_LOOKS[id] ?? STAFF_LOOKS.owner;
  const view: View = facing === 'down' ? 'front' : facing === 'up' ? 'back' : 'side';
  const remap = { S: look.shirt, A: 'W', H: look.hands ?? look.skin, f: look.shoes ?? 'E' };
  const c = blank(STAFF_W, STAFF_H);

  // 팔 자세: 쟁반을 들면 두 팔을 올린다. 쟁반을 든 채 일하면 한 손만 올리고 한 손으로 일한다
  const legPose = pose === 'work' ? 'stand' : pose;
  let near: Arm = pose === 'work' ? 'work' : 'down';
  let far: Arm = near;
  if (view === 'side' && pose === 'walkA') near = 'swingF';
  if (view === 'side' && pose === 'walkB') near = 'swingB';
  if (carry) {
    far = 'up';
    near = pose === 'work' ? 'work' : 'up';
  }

  // 몸
  stamp(c, TORSO[view], 0, BODY_Y, remap);
  stamp(c, LEGS[view === 'side' ? 'side' : 'front'][legPose], 0, BODY_Y + 6, remap);
  if (view !== 'side') {
    // 내려간 팔은 몸 뒤에서 먼저(올린 손은 머리 앞에 나중에)
    if (far !== 'up') drawArm(c, frontArm(far, view), remap);
    if (near !== 'up') drawArm(c, frontArm(near, view), remap, true);
  }
  look.prop?.(c, view);

  // 머리
  const head = humanHead(view, look.skin, look.hair, look.style);
  look.hat?.(head, view);
  const eyes = face === 'blink' ? 'blink' : face === 'happy' ? 'happy' : 'normal';
  humanFace(head, view, eyes, face === 'happy' ? 'happy' : 'normal');
  look.over?.(head, view);
  stamp(c, head, 0, 0);

  // 올린 손·옆모습 팔은 머리 앞에
  if (view === 'side') {
    drawArm(c, sideFarArm(far), remap);
    drawArm(c, sideArm(near), remap);
  } else {
    if (far === 'up') drawArm(c, frontArm('up', view), remap);
    if (near === 'up') drawArm(c, frontArm('up', view), remap, true);
  }
  return facing === 'left' ? flipX(c) : c;
}
