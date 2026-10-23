// 분식집 도트 그림: 문자 격자 + 팔레트 → 텍스처. 화면(scene)은 이 파일의 함수와 키만 쓴다.
// 근거: docs/design/261022-12-snack-bar-pixel-art.md, 직원 생김새는 docs/design/261022-11-snack-bar-characters.md §2
// 시안(승인된 그림체): docs/design/assets/261022-12-snack-bar-pixel-art/ (draft-sprites.py가 시안 격자)
//
// 약속
// - 텍스처는 도트 한 칸을 DOT(작은 그림은 SMALL_DOT) px로 굽는다. 바깥 1칸 자동 테두리를 포함한다.
// - 직원·손님 그림은 쓰는 조합만 처음 쓸 때 굽는다(ensure*). 같은 키를 다시 부르면 굽지 않고 키만 준다.
// - 화면은 직원 그림을 발밑 가운데(setOrigin(0.5, 1))에, 손님 그림은 어깨 아래 가운데(setOrigin(0.5, 1))에 놓는다.
//
// 그림 크기(px, 테두리 포함)
// - 직원 72 × 96 (격자 16 × 22). 손님 88 × 80 (격자 20 × 18, 머리 16칸이 가운데, 양옆 2칸은 대식가 어깨·숟가락 팔 자리)
// - 테이블 104 × 72, 의자 48 × 48, 조리대 104 × 104, 바닥·벽 타일 32 × 32(테두리 없음), 창문 96 × 64(유리 자리는 비어 있음)
// - 문 80 × 112(위에 종), 메뉴판 168 × 72(글자 없음), 가게 앞모습 264 × 200(간판 글자 없음)
// - 접시 36 × 30, 작은 접시 24 × 24, 메뉴 그림 54 × 48, 아이콘 33 × 33, 쟁반 (21 × 칸 + 15) × 15
// 파일: palette(색) · grid(격자 도구) · heads·animals·staff·guests·kitchen·props(그림) · catalog(목록·그림 보기 배치) · bake(굽기) · gallery(그림 보기)

import type Phaser from 'phaser';
import { bakeArt } from './bake';
import { guestArt, guestArtKey, staffArt, staffArtKey, staticArts } from './catalog';
import { GUEST_LOOK_LIST } from './guests';
import { STATION_FRONT_MID, STATION_SIZE, traySlotDots } from './kitchen';
import { STAFF_HAND_TOP } from './staff';

export { drawGallery } from './gallery';

/** 큰 그림(직원·손님·가구·조리대) 도트 한 칸의 캔버스 px */
export const DOT = 4;
/** 작은 그림(접시·아이콘·쟁반 위 접시) 도트 한 칸의 캔버스 px */
export const SMALL_DOT = 3;

/** 직원 id. 순서는 명부 순서 */
export const STAFF_IDS = ['owner', 'runner', 'water', 'server', 'cleaner', 'cook', 'smile', 'talker', 'master'] as const;
export type StaffId = (typeof STAFF_IDS)[number];

/** 바라보는 방향. down = 앞모습, up = 뒷모습, left·right = 옆모습(한쪽을 좌우로 뒤집어 씀) */
export type Facing = 'down' | 'up' | 'left' | 'right';
/** 직원 자세. walkA·walkB는 걷기 두 장, work는 바라보는 쪽으로 팔을 뻗은 모습(연타·닦기) */
export type StaffPose = 'stand' | 'walkA' | 'walkB' | 'work';
/** 직원 얼굴. blink는 눈 감음(3초마다 깜빡), happy는 인사·폴짝 */
export type StaffFace = 'normal' | 'blink' | 'happy';

/** 손님 얼굴 */
export type GuestFace = 'happy' | 'normal' | 'angry';
/** 손님 자세. eatA·eatB는 먹는 숟가락 팔 두 장(앞모습만, 뒷모습은 sit과 같게 그려도 된다) */
export type GuestPose = 'sit' | 'eatA' | 'eatB';
/** 손님 생김새 하나 */
export interface GuestLook {
  id: string;
  kind: 'animal' | 'human';
}

/** 메뉴 그림 이름. 로직의 메뉴 순서(떡볶이·김밥·순대·라면·튀김)와 같다 */
export const MENU_ART = ['tteok', 'kimbap', 'sundae', 'ramen', 'fried'] as const;
export type MenuArt = (typeof MENU_ART)[number];

/** 아이콘 */
export type IconName = 'cup' | 'heart' | 'anger' | 'coin' | 'spoon' | 'steam' | 'sparkle' | 'sweat';

/** 가구·바닥·벽 */
export type PropName =
  | 'table'
  | 'tableDirty'
  | 'tableLocked'
  | 'chair'
  | 'floorA'
  | 'floorB'
  | 'wall'
  | 'window'
  | 'door'
  | 'menuBoard'
  | 'shopFront';

/**
 * 손님 생김새 목록: 동물 10종(토끼·양·돼지·오리·개구리·코알라·펭귄·다람쥐·코끼리·사슴) 다음에
 * 사람(머리 모양 6 × 피부색 4). 로직은 손님마다 이 목록의 번호(look)를 시드로 고르고, 동물·사람은 반반이다.
 */
export const GUEST_LOOKS: readonly GuestLook[] = GUEST_LOOK_LIST;
/** 손님 옷 색 수. 로직은 0 ~ GUEST_CLOTHES-1을 고른다 */
export const GUEST_CLOTHES = 6;

/** 모든 고정 그림(가구·조리대·접시·아이콘·바닥)을 텍스처로 굽는다. 게임을 열 때 한 번 */
export function bakeSprites(scene: Phaser.Scene): void {
  for (const art of staticArts()) bakeArt(scene, art);
}

/** 직원 그림 키. carry면 두 팔을 올려 쟁반을 든 모습(쟁반·접시는 화면이 trayKey·dishMiniKey로 따로 그린다) */
export function ensureStaff(
  scene: Phaser.Scene,
  id: StaffId,
  facing: Facing,
  pose: StaffPose,
  opts: { carry?: boolean; face?: StaffFace } = {},
): string {
  const carry = opts.carry ?? false;
  const face = opts.face ?? 'normal';
  const key = staffArtKey(id, facing, pose, carry, face);
  if (scene.textures.exists(key)) return key;
  return bakeArt(scene, staffArt(id, facing, pose, carry, face));
}

/**
 * 직원을 그렸을 때 쟁반을 놓을 자리: 그림 위쪽 끝에서 아래로 몇 px인지(carry일 때 손 높이).
 * 쟁반 그림의 아래 끝(테두리 포함, setOrigin(0.5, 1))을 여기에 맞추면 두 손 위에 얹힌다. 쟁반·접시는 그림 위로 삐져나온다
 */
export const STAFF_TRAY_Y = (STAFF_HAND_TOP + 1) * DOT;

/** 손님 그림 키: 머리 + 어깨를 합친 한 장. side는 앞모습(테이블 위쪽 의자) / 뒷모습(아래쪽 의자), big은 대식가(넓은 어깨) */
export function ensureGuest(
  scene: Phaser.Scene,
  look: number,
  face: GuestFace,
  side: 'front' | 'back',
  opts: { cloth?: number; big?: boolean; pose?: GuestPose } = {},
): string {
  const cloth = opts.cloth ?? 0;
  const big = opts.big ?? false;
  const pose = opts.pose ?? 'sit';
  const key = guestArtKey(look, face, side, cloth, big, pose);
  if (scene.textures.exists(key)) return key;
  return bakeArt(scene, guestArt(look, face, side, cloth, big, pose));
}

/** 조리대 그림 아래 끝(테두리 포함)에서 앞면 가운데까지 px(1배). 연타 게이지를 앞면에 얹는다 */
export const STATION_FRONT_UP = (STATION_SIZE + 1 - STATION_FRONT_MID) * DOT;

/** 조리대 그림 키 (메뉴 5, 물·단무지 통, 쓰레기통, 잠긴 덮개) */
export function stationKey(name: MenuArt | 'water' | 'trash' | 'locked'): string {
  return `station:${name}`;
}

/** 테이블에 내려놓는 접시 그림 키 (메뉴 5, 물·단무지, 빈 그릇) */
export function dishKey(name: MenuArt | 'water' | 'empty'): string {
  return `dish:${name}`;
}

/** 머리 위 쟁반에 얹는 작은 접시 그림 키 (24 × 24px) */
export function dishMiniKey(name: MenuArt | 'water'): string {
  return `dishMini:${name}`;
}

/**
 * 메뉴 그림 키: 손님 머리 위 주문 말풍선·화면 아래 쟁반 칸·메뉴 카드처럼 음식을 알아봐야 하는 자리에 쓰는 큰 그림
 * (16 × 14 도트, 54 × 48px). 1배로 쓴다(작은 접시를 키워 쓰지 않는다)
 */
export function menuIconKey(name: MenuArt | 'water'): string {
  return `menuIcon:${name}`;
}

/** 머리 위 쟁반 그림 키 (칸 수 3~6에 맞는 폭, bakeSprites가 3~6을 굽는다) */
export function trayKey(slots: number): string {
  return `tray:${slots}`;
}

/**
 * 쟁반 위 칸마다 접시를 놓을 자리(쟁반 그림 왼쪽 위에서 px). 칸 수마다.
 * 작은 접시 그림의 왼쪽 아래(setOrigin(0, 1))를 여기에 놓는다. 접시 바닥이 쟁반 바닥 줄에 얹히고 앞턱은 보인다
 */
export function traySlotOffsets(slots: number): readonly { x: number; y: number }[] {
  return traySlotDots(slots).map((p) => ({ x: p.x * SMALL_DOT, y: p.y * SMALL_DOT }));
}

/** 가구·바닥·벽 그림 키 */
export function propKey(name: PropName): string {
  return `prop:${name}`;
}

/** 아이콘 그림 키 */
export function iconKey(name: IconName): string {
  return `icon:${name}`;
}

