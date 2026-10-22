// 손님 그림: 머리(16 × 15) + 어깨(16 × 4, 대식가는 20 × 4)를 합친 한 장 20 × 18. 테이블에 가려 어깨까지만 보인다
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §2·§3, docs/design/261022-09-snack-bar.md §5-1
// 시안: draft-sprites.py의 SHOULDERS·guest, human(손님 표정 3)

import type { GuestFace, GuestLook, GuestPose } from './index';
import { ANIMALS, type Animal } from './animals';
import { blank, g, put, stamp, type Grid } from './grid';
import { glasses, humanFace, humanHead, type HairStyle } from './heads';
import { CLOTH_COLORS, SKINS } from './palette';

/** 손님 그림 크기(도트, 테두리 제외). 대식가 어깨와 숟가락 팔이 들어가게 머리 양옆에 2칸씩 둔다 */
export const GUEST_W = 20;
export const GUEST_H = 18;
/** 머리를 놓는 x */
const HEAD_X = 2;
/** 어깨가 시작하는 줄 */
const SHOULDER_Y = 14;

/** 사람 손님 머리 모양 순서 (생김새 번호 10~33에서 바깥 순서) */
export const GUEST_STYLES: readonly HairStyle[] = ['short', 'bob', 'bun', 'curly', 'spiky', 'cap'];

/** 사람 손님 머리카락 색 [머리 모양][피부색 번호]. 하얀 머리(w)는 어르신 */
const HUMAN_HAIR: Readonly<Record<string, readonly string[]>> = {
  short: ['h', 'E', 'z', 'w'],
  bob: ['h', 'o', 'E', 'E'],
  bun: ['E', 'J', 'w', 'E'],
  curly: ['o', 'h', 'E', 'E'],
  spiky: ['E', 'J', 'h', 'E'],
  cap: ['h', 'E', 'o', 'E'],
};
/** 모자 색 [피부색 번호] */
const CAP_COLORS = ['t', '7', 'V', 'Y'];
/** 안경을 쓴 사람 손님 */
const WITH_GLASSES = new Set(['short-3', 'bun-2', 'curly-1']);

/** 사람 손님 한 명 */
interface HumanGuest {
  id: string;
  style: HairStyle;
  skin: string;
  hair: string;
  cap: string;
  glasses: boolean;
}

const HUMANS: readonly HumanGuest[] = GUEST_STYLES.flatMap((style) =>
  SKINS.map((skin, i) => {
    const id = `${style}-${i}`;
    return { id, style, skin, hair: HUMAN_HAIR[style]![i]!, cap: CAP_COLORS[i]!, glasses: WITH_GLASSES.has(id) };
  }),
);

/** 손님 생김새 목록 34: 동물 10(0~9) 다음 사람 24(10~33) */
export const GUEST_LOOK_LIST: readonly GuestLook[] = [
  ...ANIMALS.map((a) => ({ id: a.id, kind: 'animal' as const })),
  ...HUMANS.map((h) => ({ id: h.id, kind: 'human' as const })),
];

/** 이름표용 손님 이름 */
export function guestName(look: number): string {
  const a = ANIMALS[look];
  if (a) return a.name;
  return GUEST_LOOK_LIST[look]?.id ?? `${look}`;
}

// ---------------------------------------------------------------- 어깨

const SHOULDERS = g(['...CCCCCCCCCC...', '..CCCCCCCCCCCC..', '.CCCCCCCCCCCCCC.', '.CCCCCCCCCCCCCC.']);
const SHOULDERS_BIG = g(['...CCCCCCCCCCCCCC...', '.CCCCCCCCCCCCCCCCCC.', 'CCCCCCCCCCCCCCCCCCCC', 'CCCCCCCCCCCCCCCCCCCC']);

/** 머리 격자에서 손 색(피부·털)을 고른다: 볼 옆 칸 */
function handColor(head: Grid): string {
  const ch = head[10]?.[2] ?? 'k';
  return ch === '.' || ch === 'E' || ch === 'b' ? 'k' : ch;
}

/** 볼이 한 칸 부푼다(먹는 중) */
function puffCheeks(head: Grid): void {
  const fur = head[11]?.[1];
  if (!fur || fur === '.') return;
  put(head, [[0, 11], [15, 11], [1, 12], [14, 12]], fur);
}

/** 숟가락 팔 (손님 격자 좌표, 머리 오른쪽 밖). eatA는 숟가락을 든 채 내리고, eatB는 입으로 가져간다 */
function spoonArm(c: Grid, pose: GuestPose, cloth: string, hand: string): void {
  if (pose === 'eatA') {
    put(c, [[16, 15], [17, 15]], cloth);
    put(c, [[17, 13], [18, 13], [17, 14], [18, 14]], hand);
    put(c, [[18, 12], [18, 11]], 'm');
    put(c, [[17, 10], [18, 10]], 's');
  } else if (pose === 'eatB') {
    put(c, [[17, 14], [17, 15]], cloth);
    put(c, [[16, 12], [17, 12], [16, 13], [17, 13]], hand);
    put(c, [[14, 12], [15, 12]], 'm');
    put(c, [[12, 12], [13, 12]], 's');
  }
}

/** 손님 머리(얼굴 포함) */
function guestHead(look: number, face: GuestFace, side: 'front' | 'back'): { head: Grid; animal?: Animal } {
  const animal = ANIMALS[look];
  if (animal) return { head: side === 'front' ? animal.front(face) : animal.back(), animal };
  const h = HUMANS[look - ANIMALS.length] ?? HUMANS[0]!;
  const head = humanHead(side, h.skin, h.hair, h.style, h.cap);
  if (side === 'front') {
    const eyes = face === 'happy' ? 'happy' : face === 'angry' ? 'angry' : 'normal';
    humanFace(head, 'front', eyes, face);
    if (h.glasses) glasses(head, 'front');
  }
  return { head };
}

/** 손님 한 장을 격자로 그린다. 뒷모습은 표정·먹는 팔이 없다 */
export function guestGrid(look: number, face: GuestFace, side: 'front' | 'back', cloth: number, big: boolean, pose: GuestPose): Grid {
  const c = blank(GUEST_W, GUEST_H);
  const color = CLOTH_COLORS[((cloth % CLOTH_COLORS.length) + CLOTH_COLORS.length) % CLOTH_COLORS.length]!;
  const { head, animal } = guestHead(look, face, side);
  const eating = side === 'front' && (pose === 'eatA' || pose === 'eatB');
  if (eating && pose === 'eatB') puffCheeks(head);

  // 꼬리는 몸 뒤
  if (animal?.tail) {
    const [tx, ty] = side === 'front' ? animal.tail.front : animal.tail.back;
    stamp(c, animal.tail.grid, tx, ty);
  }
  if (big) stamp(c, SHOULDERS_BIG, 0, SHOULDER_Y, { C: color });
  else stamp(c, SHOULDERS, HEAD_X, SHOULDER_Y, { C: color });
  stamp(c, head, HEAD_X, 0);
  if (eating) spoonArm(c, pose, color, handColor(head));
  return c;
}
