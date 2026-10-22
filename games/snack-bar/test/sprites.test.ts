// 도트 그림 확인: 약속(손님 생김새 34·순서, 쟁반 자리)과 그림 규칙(크기, 팔레트 32색, 그림 하나 16색)을 본다.
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §1·§2

import { describe, expect, it } from 'vitest';
import {
  GUEST_CLOTHES,
  GUEST_LOOKS,
  MENU_ART,
  SMALL_DOT,
  STAFF_IDS,
  STAFF_TRAY_Y,
  dishMiniKey,
  ensureGuest,
  ensureStaff,
  trayKey,
  traySlotOffsets,
  type Facing,
  type PropName,
} from '../src/scene/sprites';
import { ICON_NAMES, TRAY_SLOTS, artSize, galleryLayout, guestArt, guestArtKey, staffArt, staticArts, type Art } from '../src/scene/sprites/catalog';
import { colorsOf, toPixels, width } from '../src/scene/sprites/grid';
import { ANIMALS } from '../src/scene/sprites/animals';
import { HEAD_H, HEAD_W, humanHead } from '../src/scene/sprites/heads';
import { CLOTH_COLORS, OUTLINE, PALETTE } from '../src/scene/sprites/palette';
import { PROP_NAMES } from '../src/scene/sprites/props';

const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];
const POSES = ['stand', 'walkA', 'walkB', 'work'] as const;

/** 직원 그림 전부(9명 × 방향 4 × 자세 4 × 쟁반 2 × 얼굴 3) */
function allStaff(): Art[] {
  return STAFF_IDS.flatMap((id) =>
    FACINGS.flatMap((f) => POSES.flatMap((p) => [false, true].flatMap((c) => (['normal', 'blink', 'happy'] as const).map((face) => staffArt(id, f, p, c, face))))),
  );
}

/** 손님 그림 전부(34 × 앞 표정 3·먹기 2 + 뒤, 옷 6, 대식가) */
function allGuests(): Art[] {
  return GUEST_LOOKS.flatMap((_, look) =>
    Array.from({ length: GUEST_CLOTHES }, (_, cloth) =>
      [false, true].flatMap((big) => [
        ...(['happy', 'normal', 'angry'] as const).map((face) => guestArt(look, face, 'front', cloth, big, 'sit')),
        guestArt(look, 'normal', 'front', cloth, big, 'eatA'),
        guestArt(look, 'normal', 'front', cloth, big, 'eatB'),
        guestArt(look, 'normal', 'back', cloth, big, 'sit'),
      ]),
    ).flat(),
  );
}

/** 그림 하나에 쓰인 색 수(자동 테두리 포함) */
function colorCount(art: Art): number {
  const set = colorsOf(art.grid);
  if (art.outline) set.add('E');
  return set.size;
}

describe('도트 그림 약속', () => {
  it('손님 생김새는 동물 10종 다음 사람 24(머리 모양 6 × 피부색 4) 순서로 34개다', () => {
    expect(GUEST_LOOKS).toHaveLength(34);
    expect(GUEST_LOOKS.slice(0, 10).map((l) => l.id)).toEqual(['rabbit', 'sheep', 'pig', 'duck', 'frog', 'koala', 'penguin', 'squirrel', 'elephant', 'deer']);
    expect(GUEST_LOOKS.slice(0, 10).every((l) => l.kind === 'animal')).toBe(true);
    const styles = ['short', 'bob', 'bun', 'curly', 'spiky', 'cap'];
    expect(GUEST_LOOKS.slice(10).map((l) => l.id)).toEqual(styles.flatMap((s) => [0, 1, 2, 3].map((i) => `${s}-${i}`)));
    expect(GUEST_LOOKS.slice(10).every((l) => l.kind === 'human')).toBe(true);
    expect(new Set(GUEST_LOOKS.map((l) => l.id)).size).toBe(34);
  });

  it('옷 색 수가 약속과 같다', () => {
    expect(CLOTH_COLORS).toHaveLength(GUEST_CLOTHES);
  });

  it('쟁반 바닥은 쟁반을 든 손 윗줄에 온다', () => {
    expect(STAFF_TRAY_Y).toBe(12);
  });

  it('쟁반 칸 자리는 쟁반 안에 있고 칸마다 오른쪽으로 간다', () => {
    const arts = staticArts();
    for (const n of TRAY_SLOTS) {
      const tray = artSize(arts.find((a) => a.key === trayKey(n))!);
      const dish = artSize(arts.find((a) => a.key === dishMiniKey('tteok'))!);
      const offs = traySlotOffsets(n);
      expect(offs).toHaveLength(n);
      offs.forEach((o, i) => {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x + dish.w).toBeLessThanOrEqual(tray.w);
        expect(o.y).toBeGreaterThan(0);
        expect(o.y).toBeLessThanOrEqual(tray.h);
        if (i > 0) expect(o.x).toBeGreaterThan(offs[i - 1]!.x);
      });
      expect(offs[0]!.x % SMALL_DOT).toBe(0);
    }
  });

  it('뒷모습 손님은 표정·먹는 팔과 상관없이 같은 그림을 쓴다', () => {
    expect(guestArtKey(12, 'angry', 'back', 3, false, 'eatB')).toBe(guestArtKey(12, 'happy', 'back', 3, false, 'sit'));
    expect(guestArtKey(12, 'angry', 'front', 3, false, 'sit')).not.toBe(guestArtKey(12, 'happy', 'front', 3, false, 'sit'));
    expect(guestArtKey(0, 'normal', 'front', 7, false, 'sit')).toBe(guestArtKey(0, 'normal', 'front', 1, false, 'sit'));
  });

  it('고정 그림은 키가 겹치지 않고 가구·조리대·접시·쟁반·아이콘을 모두 굽는다', () => {
    const keys = staticArts().map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    const props: PropName[] = ['table', 'tableDirty', 'tableLocked', 'chair', 'floorA', 'floorB', 'wall', 'window', 'door', 'menuBoard', 'shopFront'];
    expect([...PROP_NAMES].sort()).toEqual([...props].sort());
    for (const p of props) expect(keys).toContain(`prop:${p}`);
    for (const m of [...MENU_ART, 'water', 'trash', 'locked']) expect(keys).toContain(`station:${m}`);
    for (const m of [...MENU_ART, 'water', 'empty']) expect(keys).toContain(`dish:${m}`);
    for (const m of [...MENU_ART, 'water']) expect(keys).toContain(`dishMini:${m}`);
    for (const n of TRAY_SLOTS) expect(keys).toContain(`tray:${n}`);
    for (const i of ICON_NAMES) expect(keys).toContain(`icon:${i}`);
  });

  it('직원·손님 키 함수는 텍스처가 있으면 굽지 않고 키만 준다', () => {
    const made: string[] = [];
    const scene = { textures: { exists: (k: string) => (made.push(k), true) } } as unknown as Parameters<typeof ensureStaff>[0];
    expect(ensureStaff(scene, 'owner', 'up', 'stand', { face: 'happy' })).toBe(ensureStaff(scene, 'owner', 'up', 'stand'));
    expect(ensureGuest(scene, 3, 'normal', 'front', { cloth: 2, big: true, pose: 'eatA' })).toBe(guestArtKey(3, 'normal', 'front', 2, true, 'eatA'));
    expect(made.length).toBe(3);
  });
});

describe('그림 규칙', () => {
  it('게임 팔레트는 32색 이하이고 자동 테두리는 먹색이다', () => {
    expect(Object.keys(PALETTE).length).toBeLessThanOrEqual(32);
    expect(OUTLINE).toEqual(PALETTE.E);
  });

  it('그림 크기가 설계와 같다', () => {
    const size = (a: Art) => [width(a.grid), a.grid.length];
    expect(size(staffArt('owner', 'down', 'stand', false, 'normal'))).toEqual([16, 22]);
    expect(size(guestArt(0, 'normal', 'front', 0, false, 'sit'))).toEqual([20, 18]);
    expect([width(humanHead('front', 'k', 'h', 'short')), humanHead('back', 'k', 'h', 'bob').length]).toEqual([HEAD_W, HEAD_H]);
    for (const a of ANIMALS) {
      expect([width(a.front('normal')), a.front('angry').length]).toEqual([HEAD_W, HEAD_H]);
      expect([width(a.back()), a.back().length]).toEqual([HEAD_W, HEAD_H]);
    }
    const byKey = new Map(staticArts().map((a) => [a.key, a]));
    const expectSize = (key: string, w: number, h: number) => expect(size(byKey.get(key)!), key).toEqual([w, h]);
    expectSize('prop:table', 24, 16);
    expectSize('prop:tableDirty', 24, 16);
    expectSize('prop:tableLocked', 24, 16);
    expectSize('prop:chair', 10, 10);
    for (const k of ['floorA', 'floorB', 'wall']) expectSize(`prop:${k}`, 8, 8);
    for (const m of [...MENU_ART, 'water', 'trash', 'locked']) expectSize(`station:${m}`, 24, 24);
    for (const m of [...MENU_ART, 'water', 'empty']) expectSize(`dish:${m}`, 10, 8);
    for (const m of [...MENU_ART, 'water']) expectSize(`dishMini:${m}`, 6, 5);
    for (const i of ICON_NAMES) expectSize(`icon:${i}`, 9, 9);
  });

  it('모든 그림은 네모 격자이고 팔레트 글자만 쓰며 한 그림에 16색 이하다', () => {
    for (const art of [...staticArts(), ...allStaff(), ...allGuests()]) {
      const w = width(art.grid);
      expect(art.grid.every((r) => r.length === w), art.key).toBe(true);
      for (const ch of colorsOf(art.grid)) expect(PALETTE[ch], `${art.key} '${ch}'`).toBeDefined();
      expect(colorCount(art), art.key).toBeLessThanOrEqual(16);
      expect(() => toPixels(art.grid, art.outline)).not.toThrow();
    }
  });

  it('왼쪽 직원은 오른쪽 그림을 뒤집은 것이다', () => {
    const r = staffArt('cook', 'right', 'walkA', true, 'happy').grid;
    const l = staffArt('cook', 'left', 'walkA', true, 'happy').grid;
    expect(l.map((row) => [...row].reverse().join(''))).toEqual(r.map((row) => row.join('')));
  });

  it('그림 보기 배치는 모든 그림을 화면 폭 안에 겹치지 않게 늘어놓는다', () => {
    const view = 720;
    const layout = galleryLayout(view);
    expect(layout.items.length).toBeGreaterThan(STAFF_IDS.length * 20 + GUEST_LOOKS.length * 6);
    for (const it of layout.items) expect(it.x + artSize(it.art).w).toBeLessThanOrEqual(view);
  });
});
