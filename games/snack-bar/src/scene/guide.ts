// 게임 방법 창: 쪽마다 그림 한 칸과 짧은 글 몇 줄. 가게 화면·멈춤 창에서 열고, 1일째에는 가게 화면에서 한 번 저절로 연다.
// 그림은 게임에 이미 있는 도트 그림을 다시 쓰고, 숫자(메뉴가 열리는 레벨, 하루 길이, 닦는 횟수)는 로직 표에서 가져온다.
// 근거: docs/design/261023-02-growth-how-to-play.md

import Phaser from 'phaser';
import { BASE_WIPES, DAY_TICKS, MENUS, OPEN_MINUTE, TICKS_PER_GAME_MINUTE } from '../logic/rules';
import type { Rect } from './layout';
import type { Sfx } from './sound';
import { MENU_ART, STATION_FRONT_UP, ensureGuest, ensureStaff, iconKey, menuIconKey, propKey, stationKey } from './sprites';
import { PANEL_PAD, PATIENCE_W, UI_DOT, disc, framedBox, panelCells, panelWidth, patienceBar, speechBubble } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 글 한 줄. strong이면 강조색 */
interface GuideLine {
  text: string;
  strong?: boolean;
}

/** 게임 방법 한 쪽 */
interface GuidePage {
  title: string;
  /** 그림 칸(box)에 그림을 그린다 */
  art(scene: Phaser.Scene, box: Rect, palette: ScenePalette): Phaser.GameObjects.GameObject[];
  lines: GuideLine[];
}

/** 그림 칸 높이 */
const ART_H = 260;

/** 카드 위 제목·쪽 줄 높이, 아래 단추 줄 높이 */
const CARD_HEAD = 176;
const CARD_FOOT = 120;

/** 글 줄 사이 */
const LINE_GAP = 14;

/** 쓸어 넘기기로 보는 가로 이동 거리 */
const SWIPE_MIN = 90;

/** 바라보는 곳 테두리 색 (장사 화면과 같다) */
const FOCUS = 0xfff3b0;

/** 게임 시계 분을 "9:00"으로 */
function hm(minute: number): string {
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

/** 가운데 맞춘 짧은 글 */
function caption(scene: Phaser.Scene, x: number, y: number, text: string, color: number): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...textStyle(22, color), align: 'center' }).setOrigin(0.5).setLineSpacing(4);
}

/** 오른쪽 화살표 (도트 계단 머리) */
function arrow(scene: Phaser.Scene, x: number, y: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().fillStyle(color, 1);
  g.fillRect(x - 14, y - UI_DOT, 16, UI_DOT * 2);
  for (let k = 0; k < 4; k += 1) g.fillRect(x + 2 + k * UI_DOT, y - (4 - k) * UI_DOT, UI_DOT, (4 - k) * UI_DOT * 2);
  return g;
}

/** 머리 위 말풍선 하나 (그림 한 개, 꼬리는 아래). bar가 있으면 장사 화면처럼 아래쪽에 기다림 막대 */
function bubble(scene: Phaser.Scene, x: number, y: number, key: string, scale: number, bar?: { filled: number; color: number }): Phaser.GameObjects.GameObject[] {
  const g = speechBubble(scene.add.graphics(), x, y, bar ? PATIENCE_W + 24 : 72, bar !== undefined);
  if (bar) patienceBar(g, x, y, bar.filled, bar.color);
  return [g, scene.add.image(x, y, key).setScale(scale)];
}

/** 칸 n개에 같은 너비로 놓을 때 i번째 가운데 x (칸 사이 화살표 자리 gap) */
function slotX(box: Rect, n: number, gap: number, i: number): number {
  const slot = (box.w - gap * (n - 1)) / n;
  return box.x + slot / 2 + i * (slot + gap);
}

/** 분식집의 게임 방법 쪽들 */
export function guidePages(): GuidePage[] {
  const menuLine = MENUS.filter((m) => m.level > 1)
    .map((m) => `Lv${m.level} ${m.name}`)
    .join(', ');
  const closeMinute = OPEN_MINUTE + DAY_TICKS / TICKS_PER_GAME_MINUTE;

  return [
    {
      title: '움직이기',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const sx = box.x + box.w * 0.24;
        const tx = box.x + box.w * 0.66;
        const floor = box.y + box.h - 66;
        out.push(scene.add.image(sx, floor, ensureStaff(scene, 'owner', 'right', 'stand', { face: 'happy' })).setOrigin(0.5, 1).setScale(1.5));
        out.push(arrow(scene, (sx + tx) / 2 - 20, floor - 60, p.text2));
        const table = scene.add.image(tx, floor, propKey('table')).setOrigin(0.5, 1).setScale(1.5);
        out.push(table);
        // 바라보는 곳 노란 테두리
        const fw = table.displayWidth + 28;
        const fh = table.displayHeight + 28;
        out.push(scene.add.graphics().lineStyle(4, FOCUS, 1).strokeRect(tx - fw / 2, floor - table.displayHeight - 14, fw, fh));
        out.push(scene.add.graphics().lineStyle(4, 0x2c1c22, 0.5).strokeRect(tx - fw / 2 - 4, floor - table.displayHeight - 18, fw + 8, fh + 8));
        out.push(caption(scene, sx, box.y + box.h - 34, '직원', p.textStrong));
        out.push(caption(scene, tx, box.y + box.h - 34, '바라보는 곳', p.textStrong));
        return out;
      },
      lines: [
        { text: '바닥을 누르면 그 자리까지 걸어가요.' },
        { text: '테이블·조리대를 누르면 앞까지 가서 바라봐요. 바라보는 곳은 노란 테두리예요.', strong: true },
        { text: '바라보는 채로 한 번 더 누르면 일해요(조리·물 담기·닦기).', strong: true },
        { text: '손님에게 줄 때는 테이블을 바라보고 아래 쟁반 칸을 눌러요.' },
        { text: '키보드: 방향키 걷기, 스페이스 일하기, 숫자 1~6 쟁반 칸, Esc 멈춤.' },
      ],
    },
    {
      title: '손님 한 테이블',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const gap = 40;
        const by = box.y + 50;
        const gy = box.y + 172;
        const steps = [
          { cap: '물·단무지', strong: true },
          { cap: '주문한 음식', strong: false },
          { cap: '먹고 계산', strong: false },
          { cap: `${BASE_WIPES}번 닦기`, strong: true },
        ];
        steps.forEach((step, i) => {
          const cx = slotX(box, 4, gap, i);
          if (i === 0) {
            out.push(...bubble(scene, cx, by, iconKey('cup'), 1.4));
            out.push(scene.add.image(cx, gy, ensureGuest(scene, 0, 'normal', 'front')).setScale(1.2));
          } else if (i === 1) {
            out.push(...bubble(scene, cx, by, menuIconKey(MENU_ART[0]), 1));
            out.push(scene.add.image(cx, gy, ensureGuest(scene, 0, 'normal', 'front')).setScale(1.2));
          } else if (i === 2) {
            out.push(scene.add.image(cx, by, iconKey('coin')).setScale(1.4));
            out.push(scene.add.image(cx, gy, ensureGuest(scene, 0, 'happy', 'front', { pose: 'eatA' })).setScale(1.2));
          } else {
            out.push(scene.add.image(cx, gy + 20, propKey('tableDirty')).setOrigin(0.5, 1).setScale(1.1));
          }
          out.push(caption(scene, cx, box.y + box.h - 30, step.cap, step.strong ? p.accent : p.textStrong));
          if (i < 3) out.push(arrow(scene, cx + (box.w - gap * 3) / 8 + gap / 2, gy - 10, p.text2));
        });
        return out;
      },
      lines: [
        { text: '손님이 앉으면 먼저 물·단무지! 물통 조리대에서 담아 줘요.', strong: true },
        { text: '다음은 말풍선의 음식이에요. 메뉴 조리대에서 만들어 줘요.' },
        { text: '다 먹으면 손님이 알아서 계산하고 나가요.' },
        { text: `더러운 테이블은 ${BASE_WIPES}번 닦아야 다음 손님이 앉아요.`, strong: true },
        { text: '깨끗한 빈 테이블이 없으면 손님이 그냥 돌아가요.' },
      ],
    },
    {
      title: '조리와 쟁반',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const gap = 44;
        const cy = box.y + 110;
        // 조리대와 앞면 게이지 (연타 수만큼 칸, 한 번 남은 모습)
        const x0 = slotX(box, 3, gap, 0);
        const station = scene.add.image(x0, cy, stationKey(MENU_ART[0])).setScale(1.2);
        out.push(station);
        const taps = MENUS[0]!.taps;
        const gw = panelWidth(taps, 12, 4);
        const gy = cy + station.displayHeight / 2 - STATION_FRONT_UP * 1.2 - (12 + PANEL_PAD * 2) / 2;
        out.push(panelCells(scene.add.graphics(), x0 - gw / 2, gy, taps, taps - 1, 12, 12, 4, 0xf2b632));
        // 쟁반 칸
        const x1 = slotX(box, 3, gap, 1);
        const sw = 112;
        out.push(framedBox(scene.add.graphics(), x1 - sw / 2, cy - sw / 2, sw, sw, 12, p.surface, p.accent));
        out.push(scene.add.text(x1 - sw / 2 + 12, cy - sw / 2 + 8, '1', textStyle(22, p.text2)).setOrigin(0, 0));
        out.push(scene.add.image(x1, cy + 2, menuIconKey(MENU_ART[0])));
        // 손님
        const x2 = slotX(box, 3, gap, 2);
        out.push(...bubble(scene, x2, cy - 70, menuIconKey(MENU_ART[0]), 1));
        out.push(scene.add.image(x2, cy + 34, ensureGuest(scene, 14, 'normal', 'front')).setScale(1.2));
        const slot = (box.w - gap * 2) / 3;
        out.push(arrow(scene, x0 + slot / 2 + gap / 2, cy, p.text2));
        out.push(arrow(scene, x1 + slot / 2 + gap / 2, cy, p.text2));
        out.push(caption(scene, x0, box.y + box.h - 34, '칸 수만큼 누르기', p.textStrong));
        out.push(caption(scene, x1, box.y + box.h - 34, '쟁반 칸', p.textStrong));
        out.push(caption(scene, x2, box.y + box.h - 34, '보고 칸 누르기', p.accent));
        return out;
      },
      lines: [
        { text: '메뉴 조리대를 게이지 칸 수만큼 누르면 음식이 완성돼요. 처음 누를 때 재료비가 들어요.' },
        { text: '완성된 음식은 쟁반 빈 칸에 올라가요. 쟁반이 가득하면 조리대에서 기다려요(초록 깜빡).' },
        { text: '테이블을 바라보고 쟁반 칸을 누르면 줘요. 안 시킨 음식은 받지 않아요.', strong: true },
        { text: '남는 음식은 쓰레기통을 바라보고 쟁반 칸을 눌러 버려요.' },
      ],
    },
    {
      title: '손님 기분',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const items = [
          { face: 'happy' as const, filled: 8, color: 0x5fbf5a, cap: '기분 좋음' },
          { face: 'normal' as const, filled: 4, color: 0xf2b632, cap: '보통' },
          { face: 'angry' as const, filled: 1, color: 0xe0453a, cap: '화나기 직전' },
        ];
        items.forEach((it, i) => {
          const cx = slotX(box, 3, 0, i);
          const by = box.y + 50;
          out.push(...bubble(scene, cx, by, iconKey('cup'), 1.4, { filled: it.filled, color: it.color }));
          out.push(scene.add.image(cx, box.y + 166, ensureGuest(scene, 2, it.face, 'front')).setScale(1.2));
          if (i === 2) out.push(disc(scene.add.graphics(), cx + (PATIENCE_W + 24) / 2 + 14, by + 26, 6, 0xe0453a));
          out.push(caption(scene, cx, box.y + box.h - 34, it.cap, p.textStrong));
        });
        return out;
      },
      lines: [
        { text: '물·음식을 기다리는 동안 말풍선 속 막대가 줄어요.' },
        { text: '막대가 다 닳으면 기분이 한 칸 나빠지고, 막대는 다시 차요.' },
        { text: '기분이 바닥까지 떨어지면 화나서 돈을 안 내고 나가요.', strong: true },
        { text: '물·음식을 받고 계산할 때마다 기분이 좋아져요. 기분이 좋으면 팁을 줘요.' },
      ],
    },
    {
      title: '하루와 성장',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        MENUS.forEach((m, i) => {
          const cx = slotX(box, MENUS.length, 0, i);
          out.push(scene.add.image(cx, box.y + 96, menuIconKey(MENU_ART[i]!)).setScale(1.4));
          out.push(caption(scene, cx, box.y + 166, m.name, p.textStrong));
          out.push(caption(scene, cx, box.y + 206, `Lv${m.level}`, m.level > 1 ? p.accent : p.text2));
        });
        return out;
      },
      lines: [
        { text: `하루는 ${DAY_TICKS / 3600}분(${hm(OPEN_MINUTE)}~${hm(closeMinute)})이에요. 마감 뒤 남은 테이블을 치우면 하루가 끝나요.` },
        { text: '하루 수익(음식 값 + 팁 - 재료비)이 랭킹 점수예요.', strong: true },
        { text: `손님을 받을수록 가게 Lv이 올라 새 메뉴(${menuLine})와 강화가 열려요.` },
        { text: '많이 판 메뉴는 등급이 올라 값도 올라요.' },
        { text: '조건을 채우면 새 직원이 와요. [직원 명부]에서 오늘의 직원을 골라요.' },
      ],
    },
  ];
}

export interface GuideOptions {
  scene: Phaser.Scene;
  palette: ScenePalette;
  sfx: Sfx;
  /** 처음 볼 쪽 */
  page: number;
  /** 마지막 쪽의 [다음] 자리 단추 글자 */
  lastLabel: string;
  depth: number;
  /** 쪽을 넘겼다 (배치를 다시 그릴 때 같은 쪽을 열려고 기억한다) */
  onPage(page: number): void;
  onClose(): void;
}

/** 게임 방법 창: 어둡게 덮고 가운데 카드. 바깥·[닫기]·Esc로 닫고, [이전] [다음]·쪽 점·좌우 쓸기·← →로 넘긴다 */
export function buildGuidePanel(o: GuideOptions): Phaser.GameObjects.Container {
  const { scene, palette: p } = o;
  const pages = guidePages();
  const { width, height } = scene.scale;
  const portrait = height > width;
  const cw = portrait ? width - 48 : 1000;
  const left = Math.round((width - cw) / 2);
  const inner = cw - 64;
  /** 글 한 줄 (줄이 길면 접는다) */
  const lineText = (x: number, y: number, line: GuideLine) =>
    scene.add.text(x, y, line.text, { ...textStyle(22, line.strong ? p.accent : p.text), wordWrap: { width: inner - 40, useAdvancedWrap: true } }).setLineSpacing(6);
  // 카드 높이는 가장 긴 쪽(그림 + 글)에 맞춘다. 쪽을 넘겨도 카드가 그대로이고 아래가 비지 않게. 화면보다 길면 화면에 맞춘다
  const contentH = Math.max(
    ...pages.map((pg) =>
      pg.lines.reduce((sum, line) => {
        const t = lineText(0, 0, line);
        const h = t.height;
        t.destroy();
        return sum + h + LINE_GAP;
      }, (ART_H) + 28),
    ),
  );
  const ch = Math.min(height - 48, CARD_HEAD + contentH + CARD_FOOT);
  const top = Math.round((height - ch) / 2);
  let page = Math.min(Math.max(0, o.page), pages.length - 1);

  const root = scene.add.container(0, 0).setDepth(o.depth);
  const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
  dim.on(Phaser.Input.Events.POINTER_DOWN, () => o.onClose());
  const card = framedBox(scene.add.graphics(), left, top, cw, ch, 28, p.surface, p.border);
  // 카드 안을 눌러도 창이 닫히지 않게 막는다
  const blocker = scene.add.rectangle(left, top, cw, ch, 0x000000, 0).setOrigin(0).setInteractive();
  const title = scene.add.text(left + 32, top + 58, '게임 방법', titleStyle(38, p.textStrong)).setOrigin(0, 0.5);
  const close = new Button(scene, { x: left + cw - 32 - 64, y: top + 58, width: 128, height: 64, label: '닫기', style: 'secondary', palette: p, fontSize: 22, onPress: () => o.onClose() });
  const body = scene.add.container(0, 0);
  const btnW = (inner - 16) / 2;
  const btnY = top + ch - 32 - 42;
  const prev = new Button(scene, { x: left + 32 + btnW / 2, y: btnY, width: btnW, height: 84, label: '이전', style: 'secondary', palette: p, fontSize: 26, onPress: () => go(page - 1) });
  const next = new Button(scene, { x: left + cw - 32 - btnW / 2, y: btnY, width: btnW, height: 84, label: '다음', style: 'primary', palette: p, fontSize: 26, onPress: () => (page === pages.length - 1 ? o.onClose() : go(page + 1)) });
  root.add([dim, card, blocker, title, close, body, prev, next]);

  /** 쪽을 그린다 */
  const render = () => {
    body.removeAll(true);
    const pg = pages[page]!;
    const rowY = top + 136;
    body.add(scene.add.text(left + 32, rowY, `${page + 1}. ${pg.title}`, textStyle(30, p.textStrong)).setOrigin(0, 0.5));
    // 쪽 점: 눌러서 바로 간다
    const dots = scene.add.graphics();
    body.add(dots);
    pages.forEach((_, i) => {
      const x = left + cw - 32 - 12 - (pages.length - 1 - i) * 32;
      disc(dots, x, rowY, i === page ? 10 : 8, i === page ? p.accent : p.border);
      const hit = scene.add.rectangle(x, rowY, 32, 48, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => go(i));
      body.add(hit);
    });
    const box: Rect = { x: left + 32, y: top + CARD_HEAD, w: inner, h: ART_H };
    body.add(framedBox(scene.add.graphics(), box.x, box.y, box.w, box.h, 16, p.surfaceHover, p.border));
    body.add(pg.art(scene, box, p));
    let y = box.y + box.h + 28;
    for (const line of pg.lines) {
      const text = lineText(left + 32 + 40, y, line);
      body.add(scene.add.rectangle(left + 32 + 14, y + 15, UI_DOT * 2, UI_DOT * 2, line.strong ? p.accent : p.text2));
      body.add(text);
      y += text.height + LINE_GAP;
    }
    if (y > btnY - 42) console.warn(`[snack-bar] 게임 방법 ${page + 1}쪽 글이 카드를 넘친다`, y - (btnY - 42));
    prev.setEnabled(page > 0);
    next.setText(page === pages.length - 1 ? o.lastLabel : '다음');
  };

  /** 다른 쪽으로 */
  const go = (to: number) => {
    if (to < 0 || to >= pages.length || to === page) return;
    page = to;
    o.sfx.click();
    o.onPage(page);
    render();
  };

  // 카드를 좌우로 쓸어 넘기기
  let swipe: { x: number; y: number } | null = null;
  blocker.on(Phaser.Input.Events.POINTER_DOWN, (ptr: Phaser.Input.Pointer) => (swipe = { x: ptr.x, y: ptr.y }));
  const onUp = (ptr: Phaser.Input.Pointer) => {
    if (!swipe) return;
    const dx = ptr.x - swipe.x;
    const dy = ptr.y - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) go(page + (dx < 0 ? 1 : -1));
  };
  // 키보드: ← → 넘기기, Esc 닫기
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(page - 1);
    else if (e.key === 'ArrowRight') go(page + 1);
    else if (e.key === 'Escape') o.onClose();
  };
  scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
  scene.input.keyboard?.on('keydown', onKey);
  root.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.keyboard?.off('keydown', onKey);
  });

  render();
  return root;
}
