// 분식집 도트 그림: 문자 격자 + 팔레트 → 텍스처. 화면(scene)은 이 파일의 함수와 키만 쓴다.
// 근거: docs/design/261022-12-snack-bar-pixel-art.md, 직원 생김새는 docs/design/261022-11-snack-bar-characters.md §2
// 시안(승인된 그림체): docs/design/assets/261022-12-snack-bar-pixel-art/ (draft-sprites.py가 시안 격자)
//
// 약속
// - 텍스처는 도트 한 칸을 DOT(작은 그림은 SMALL_DOT) px로 굽는다. 바깥 1칸 자동 테두리를 포함한다.
// - 직원·손님 그림은 쓰는 조합만 처음 쓸 때 굽는다(ensure*). 같은 키를 다시 부르면 굽지 않고 키만 준다.
// - 화면은 직원 그림을 발밑 가운데(setOrigin(0.5, 1))에, 손님 그림은 어깨 아래 가운데(setOrigin(0.5, 1))에 놓는다.

import type Phaser from 'phaser';

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
export const GUEST_LOOKS: readonly GuestLook[] = [];
/** 손님 옷 색 수. 로직은 0 ~ GUEST_CLOTHES-1을 고른다 */
export const GUEST_CLOTHES = 6;

/** 모든 고정 그림(가구·조리대·접시·아이콘·바닥)을 텍스처로 굽는다. 게임을 열 때 한 번 */
export function bakeSprites(scene: Phaser.Scene): void {
  void scene;
  throw new Error('도트 그림을 아직 굽지 않는다 (sprites 구현 전)');
}

/** 직원 그림 키. carry면 두 팔을 올려 쟁반을 든 모습(쟁반·접시는 화면이 trayKey·dishMiniKey로 따로 그린다) */
export function ensureStaff(
  scene: Phaser.Scene,
  id: StaffId,
  facing: Facing,
  pose: StaffPose,
  opts: { carry?: boolean; face?: StaffFace } = {},
): string {
  void scene;
  return `staff:${id}:${facing}:${pose}:${opts.carry ? 1 : 0}:${opts.face ?? 'normal'}`;
}

/** 직원을 그렸을 때 쟁반을 놓을 자리: 그림 위쪽 끝에서 아래로 몇 px인지(carry일 때 손 높이) */
export const STAFF_TRAY_Y = 0;

/** 손님 그림 키: 머리 + 어깨를 합친 한 장. side는 앞모습(테이블 위쪽 의자) / 뒷모습(아래쪽 의자), big은 대식가(넓은 어깨) */
export function ensureGuest(
  scene: Phaser.Scene,
  look: number,
  face: GuestFace,
  side: 'front' | 'back',
  opts: { cloth?: number; big?: boolean; pose?: GuestPose } = {},
): string {
  void scene;
  return `guest:${look}:${face}:${side}:${opts.cloth ?? 0}:${opts.big ? 1 : 0}:${opts.pose ?? 'sit'}`;
}

/** 조리대 그림 키 (메뉴 5, 물·단무지 통, 쓰레기통, 잠긴 덮개) */
export function stationKey(name: MenuArt | 'water' | 'trash' | 'locked'): string {
  return `station:${name}`;
}

/** 테이블에 내려놓는 접시 그림 키 (메뉴 5, 물·단무지, 빈 그릇) */
export function dishKey(name: MenuArt | 'water' | 'empty'): string {
  return `dish:${name}`;
}

/** 쟁반 위·화면 아래 쟁반 칸에 보이는 작은 접시 그림 키 */
export function dishMiniKey(name: MenuArt | 'water'): string {
  return `dishMini:${name}`;
}

/** 머리 위 쟁반 그림 키 (칸 수 3~6에 맞는 폭) */
export function trayKey(slots: number): string {
  return `tray:${slots}`;
}

/** 쟁반 위 칸마다 접시를 놓을 자리(쟁반 그림 왼쪽 위에서 px). 칸 수마다 */
export function traySlotOffsets(slots: number): readonly { x: number; y: number }[] {
  return Array.from({ length: slots }, (_, i) => ({ x: i * 6 * SMALL_DOT, y: 0 }));
}

/** 가구·바닥·벽 그림 키 */
export function propKey(name: PropName): string {
  return `prop:${name}`;
}

/** 아이콘 그림 키 */
export function iconKey(name: IconName): string {
  return `icon:${name}`;
}

/** 개발용 그림 보기(?sprites): 모든 그림(직원 9명 × 방향·자세, 손님 생김새 × 표정, 조리대, 접시, 아이콘)을 한 화면에 늘어놓는다 */
export function drawGallery(scene: Phaser.Scene): void {
  void scene;
  throw new Error('도트 그림 보기는 sprites 구현 뒤에 쓴다');
}
