// 그림 목록: 텍스처 키 + 격자 + 도트 크기. 굽기(bake.ts)와 그림 보기(gallery.ts)가 같이 쓴다. Phaser를 모르는 순수 코드
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §1·§4(개발용 그림 보기)

import {
  DOT,
  MENU_ART,
  SMALL_DOT,
  STAFF_IDS,
  STAFF_TRAY_Y,
  dishKey,
  dishMiniKey,
  iconKey,
  propKey,
  stationKey,
  trayKey,
  traySlotOffsets,
  type Facing,
  type GuestFace,
  type GuestPose,
  type IconName,
  type StaffFace,
  type StaffId,
  type StaffPose,
} from './index';
import { width, type Grid } from './grid';
import { GUEST_LOOK_LIST, guestGrid, guestName } from './guests';
import { dishGrid, dishMiniGrid, iconGrid, stationGrid, trayGrid } from './kitchen';
import { PROP_NAMES, propArt } from './props';
import { STAFF_LOOKS, staffGrid } from './staff';
import { CLOTH_COLORS } from './palette';

/** 텍스처 하나 */
export interface Art {
  key: string;
  grid: Grid;
  /** 도트 한 칸의 px */
  dot: number;
  /** 바깥 1칸 자동 테두리 */
  outline: boolean;
}

/** 텍스처 px 크기(테두리 포함) */
export function artSize(art: Art): { w: number; h: number } {
  const pad = art.outline ? 2 : 0;
  return { w: (width(art.grid) + pad) * art.dot, h: (art.grid.length + pad) * art.dot };
}

/** 쟁반 칸 수 (굽는 범위) */
export const TRAY_SLOTS = [3, 4, 5, 6] as const;
/** 아이콘 이름 (굽기·그림 보기 순서) */
export const ICON_NAMES: readonly IconName[] = ['cup', 'heart', 'anger', 'coin', 'spoon', 'steam', 'sparkle', 'sweat'];

/** 직원 그림 키. 뒷모습은 얼굴이 없어 표정을 묻지 않는다 */
export function staffArtKey(id: StaffId, facing: Facing, pose: StaffPose, carry: boolean, face: StaffFace): string {
  return `staff:${id}:${facing}:${pose}:${carry ? 1 : 0}:${facing === 'up' ? 'normal' : face}`;
}

/** 직원 그림 */
export function staffArt(id: StaffId, facing: Facing, pose: StaffPose, carry: boolean, face: StaffFace): Art {
  return { key: staffArtKey(id, facing, pose, carry, face), grid: staffGrid(id, facing, pose, carry, face), dot: DOT, outline: true };
}

/** 손님 옷 번호를 0 ~ 옷 색 수-1로 */
function clothIndex(cloth: number): number {
  const n = CLOTH_COLORS.length;
  return ((Math.trunc(cloth) % n) + n) % n;
}

/** 손님 그림 키. 뒷모습은 표정·먹는 팔이 없어 같은 키를 쓴다 */
export function guestArtKey(look: number, face: GuestFace, side: 'front' | 'back', cloth: number, big: boolean, pose: GuestPose): string {
  const f = side === 'back' ? 'normal' : face;
  const p = side === 'back' ? 'sit' : pose;
  return `guest:${look}:${side}:${f}:${clothIndex(cloth)}:${big ? 1 : 0}:${p}`;
}

/** 손님 그림 */
export function guestArt(look: number, face: GuestFace, side: 'front' | 'back', cloth: number, big: boolean, pose: GuestPose): Art {
  return {
    key: guestArtKey(look, face, side, cloth, big, pose),
    grid: guestGrid(look, face, side, clothIndex(cloth), big, pose),
    dot: DOT,
    outline: true,
  };
}

/** 고정 그림 목록(처음 부를 때 한 번 만든다) */
let statics: Art[] | null = null;

/** 고정 그림 전부: 가구·바닥·벽, 조리대, 접시, 작은 접시, 쟁반, 아이콘 */
export function staticArts(): Art[] {
  statics ??= makeStaticArts();
  return statics;
}

/** 고정 그림 목록을 만든다 */
function makeStaticArts(): Art[] {
  const arts: Art[] = [];
  for (const name of PROP_NAMES) {
    const { grid, outline } = propArt(name);
    arts.push({ key: propKey(name), grid, dot: DOT, outline });
  }
  for (const name of [...MENU_ART, 'water', 'trash', 'locked'] as const) arts.push({ key: stationKey(name), grid: stationGrid(name), dot: DOT, outline: true });
  for (const name of [...MENU_ART, 'water', 'empty'] as const) arts.push({ key: dishKey(name), grid: dishGrid(name), dot: SMALL_DOT, outline: true });
  for (const name of [...MENU_ART, 'water'] as const) arts.push({ key: dishMiniKey(name), grid: dishMiniGrid(name), dot: SMALL_DOT, outline: true });
  for (const n of TRAY_SLOTS) arts.push({ key: trayKey(n), grid: trayGrid(n), dot: SMALL_DOT, outline: true });
  for (const name of ICON_NAMES) arts.push({ key: iconKey(name), grid: iconGrid(name), dot: SMALL_DOT, outline: true });
  return arts;
}

// ---------------------------------------------------------------- 그림 보기 배치

/** 그림 보기의 그림 한 칸. over는 위에 겹쳐 그릴 그림(쟁반 든 직원의 쟁반·접시) */
export interface GalleryItem {
  art: Art;
  label: string;
  x: number;
  y: number;
  over?: { art: Art; x: number; y: number }[];
}

/** 그림 보기 배치 결과 */
export interface GalleryLayout {
  titles: { text: string; x: number; y: number }[];
  items: GalleryItem[];
  width: number;
  height: number;
}

/** 그림 보기 묶음 */
interface Section {
  title: string;
  items: { art: Art; label: string; over?: (box: { w: number; h: number }) => { art: Art; x: number; y: number }[] }[];
}

const FACING_NAME: Record<Facing, string> = { down: '앞', up: '뒤', right: '오른', left: '왼' };
const POSE_NAME: Record<StaffPose, string> = { stand: '서기', walkA: '걷기1', walkB: '걷기2', work: '일' };

/** 쟁반(3칸)과 작은 접시를 직원 그림 위에 얹은 겹침 그림 (화면과 같은 계산) */
function trayOver(staffBox: { w: number; h: number }): { art: Art; x: number; y: number }[] {
  const all = staticArts();
  const tray = all.find((a) => a.key === trayKey(3))!;
  const size = artSize(tray);
  const left = Math.round(staffBox.w / 2 - size.w / 2);
  const top = STAFF_TRAY_Y - size.h;
  const dishes = (['tteok', 'kimbap', 'water'] as const).map((name, i) => {
    const art = all.find((a) => a.key === dishMiniKey(name))!;
    const o = traySlotOffsets(3)[i]!;
    return { art, x: left + o.x, y: top + o.y - artSize(art).h };
  });
  return [{ art: tray, x: left, y: top }, ...dishes];
}

/** 그림 보기 묶음 목록 */
function sections(): Section[] {
  const out: Section[] = [];
  for (const id of STAFF_IDS) {
    const items: Section['items'] = [];
    for (const facing of ['down', 'up', 'right', 'left'] as const) {
      for (const pose of ['stand', 'walkA', 'walkB', 'work'] as const) {
        items.push({ art: staffArt(id, facing, pose, false, 'normal'), label: `${FACING_NAME[facing]} ${POSE_NAME[pose]}` });
      }
    }
    for (const facing of ['down', 'up', 'right'] as const) {
      for (const pose of ['stand', 'work'] as const) {
        items.push({ art: staffArt(id, facing, pose, true, 'normal'), label: `쟁반 ${FACING_NAME[facing]} ${POSE_NAME[pose]}`, over: trayOver });
      }
    }
    for (const facing of ['down', 'right'] as const) {
      items.push({ art: staffArt(id, facing, 'stand', false, 'blink'), label: `${FACING_NAME[facing]} 깜빡` });
      items.push({ art: staffArt(id, facing, 'stand', false, 'happy'), label: `${FACING_NAME[facing]} 활짝` });
    }
    out.push({ title: `직원 ${STAFF_LOOKS[id].name} (${id})`, items });
  }
  const guests: Section['items'] = [];
  GUEST_LOOK_LIST.forEach((_, look) => {
    const cloth = look % CLOTH_COLORS.length;
    guests.push({ art: guestArt(look, 'happy', 'front', cloth, false, 'sit'), label: `${look} ${guestName(look)}` });
    guests.push({ art: guestArt(look, 'normal', 'front', cloth, false, 'sit'), label: '보통' });
    guests.push({ art: guestArt(look, 'angry', 'front', cloth, false, 'sit'), label: '찡그림' });
    guests.push({ art: guestArt(look, 'normal', 'front', cloth, false, 'eatA'), label: '먹기1' });
    guests.push({ art: guestArt(look, 'normal', 'front', cloth, false, 'eatB'), label: '먹기2' });
    guests.push({ art: guestArt(look, 'normal', 'back', cloth, false, 'sit'), label: '뒤' });
  });
  out.push({ title: `손님 생김새 ${GUEST_LOOK_LIST.length} (동물 10 + 사람 24)`, items: guests });
  const clothes: Section['items'] = CLOTH_COLORS.map((_, i) => ({ art: guestArt(10, 'normal', 'front', i, false, 'sit'), label: `옷 ${i}` }));
  clothes.push({ art: guestArt(2, 'happy', 'front', 1, true, 'sit'), label: '대식가' });
  clothes.push({ art: guestArt(2, 'normal', 'front', 1, true, 'eatB'), label: '대식가 먹기' });
  clothes.push({ art: guestArt(2, 'normal', 'back', 1, true, 'sit'), label: '대식가 뒤' });
  out.push({ title: '손님 옷·대식가', items: clothes });

  const all = staticArts();
  const pick = (prefix: string, title: string) =>
    out.push({ title, items: all.filter((a) => a.key.startsWith(prefix)).map((art) => ({ art, label: art.key.slice(prefix.length) })) });
  pick('station:', '조리대');
  pick('dish:', '접시');
  pick('dishMini:', '작은 접시');
  out.push({
    title: '쟁반',
    items: TRAY_SLOTS.map((n) => ({
      art: all.find((a) => a.key === trayKey(n))!,
      label: `${n}칸`,
      over: () =>
        traySlotOffsets(n).map((o, i) => {
          const art = all.find((a) => a.key === dishMiniKey([...MENU_ART, 'water'][i % 6]! as (typeof MENU_ART)[number]))!;
          return { art, x: o.x, y: o.y - artSize(art).h };
        }),
    })),
  });
  pick('icon:', '아이콘');
  pick('prop:', '가구·바닥·벽');
  return out;
}

/** 그림 보기 배치: 묶음마다 제목, 그림은 왼쪽부터 채우고 넘치면 다음 줄 */
export function galleryLayout(viewWidth: number): GalleryLayout {
  const PAD = 16;
  const GAP = 14;
  const LABEL = 18;
  const TITLE = 34;
  const titles: GalleryLayout['titles'] = [];
  const items: GalleryItem[] = [];
  let y = PAD;
  let maxW = viewWidth;
  for (const sec of sections()) {
    titles.push({ text: sec.title, x: PAD, y });
    y += TITLE;
    let x = PAD;
    let rowH = 0;
    for (const it of sec.items) {
      const box = artSize(it.art);
      // 쟁반이 위로 삐져나오는 칸은 위 여백을 둔다
      const over = it.over?.(box) ?? [];
      const top = Math.min(0, ...over.map((o) => o.y));
      const cellW = Math.max(box.w, 84);
      if (x + cellW > viewWidth - PAD && x > PAD) {
        x = PAD;
        y += rowH + GAP;
        rowH = 0;
      }
      const iy = y - top;
      items.push({ art: it.art, label: it.label, x, y: iy, over: over.map((o) => ({ art: o.art, x: x + o.x, y: iy + o.y })) });
      rowH = Math.max(rowH, box.h - top + LABEL);
      x += cellW + GAP;
      maxW = Math.max(maxW, x);
    }
    y += rowH + GAP * 2;
  }
  return { titles, items, width: maxW, height: y + PAD };
}
