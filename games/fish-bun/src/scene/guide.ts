// 게임 방법 창: 쪽마다 그림 한 칸과 짧은 글 몇 줄. 가게 화면·멈춤 창에서 열고, 1일째에는 가게 화면에서 한 번 저절로 연다.
// 그림은 게임에 이미 있는 텍스처를 다시 쓰고, 숫자(메뉴가 열리는 레벨, 하루 길이 등)는 로직 표에서 가져온다.
// 근거: docs/design/261023-02-growth-how-to-play.md

import Phaser from 'phaser';
import {
  ARRIVALS,
  CUSTOMER_KINDS,
  DAY_TICKS,
  MENUS,
  OPEN_MINUTE,
  TICKS_PER_GAME_MINUTE,
  valueTenths,
  type CustomerKind,
} from '../logic/rules';
import { BUN_SCALE, BUN_W, MOLD_W, PERSON_W, TEX } from './art';
import { TRAIT_ICON } from './DayView';
import type { Rect } from './layout';
import type { Sfx } from './sound';
import { DOT, disc, framedBox, meter } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 글 한 줄. strong이면 강조색, icon이면 점 대신 그 그림 */
interface GuideLine {
  text: string;
  strong?: boolean;
  icon?: string;
}

/** 게임 방법 한 쪽 */
interface GuidePage {
  title: string;
  /** 그림 칸 높이 (기본 260) */
  artH?: number;
  /** 그림 칸 바탕색 (기본 팔레트의 surfaceHover) */
  artBg?: number;
  /** 그림 칸(box)에 그림을 그린다 */
  art(scene: Phaser.Scene, box: Rect, palette: ScenePalette): Phaser.GameObjects.GameObject[];
  lines: GuideLine[];
}

/** 카드 위 제목·쪽 줄 높이, 아래 단추 줄 높이 */
const CARD_HEAD = 176;
const CARD_FOOT = 120;

/** 글 줄 사이 */
const LINE_GAP = 14;

/** 쓸어 넘기기로 보는 가로 이동 거리 */
const SWIPE_MIN = 90;

/** 빵틀 판 바탕색 (장사 화면과 같다) */
const GRILL = 0x3a322c;

/** 어두운 바탕 위 글자색 */
const LIGHT_TEXT = 0xfff6e0;

/** 화력 막대 색 */
const HEAT = 0xff6a1f;

/** 손님 종류 이름 */
const KIND_NAME: Record<CustomerKind, string> = {
  regular: '동네 손님',
  kid: '꼬마',
  office: '바쁜 직장인',
  elder: '단골 어르신',
  creator: '먹방 크리에이터',
  reviewer: '리뷰어',
  riddler: '수수께끼 손님',
  tourist: '관광객',
  rude: '진상 손님',
};

/** 손님 종류 설명 */
const KIND_TIP: Record<CustomerKind, string> = {
  regular: '평범하게 기다리는 손님이에요.',
  kid: '덤(+1)을 꼭 같이 줘요. 없으면 실망해요.',
  office: '자기보다 늦게 온 손님에게 먼저 팔면 떠나요.',
  elder: '탄 빵을 싫어해요. 다 알맞으면 팁을 줘요.',
  creator: '많이 사요. 덜 익거나 타도 괜찮아요.',
  reviewer: '평판이 세 배로 오르내려요.',
  riddler: '메뉴를 돌려 말해요. [메뉴 고르기]로 맞히면 팁.',
  tourist: '영어·일본어로 주문해요. [메뉴 고르기]로 맞혀요.',
  rude: '화나면 빵틀을 깨요. 깨진 틀은 5번 눌러 고쳐요.',
};

/** 손님 종류가 처음 오는 평판 레벨 (등장 표에서 비율이 처음 0보다 큰 줄) */
function firstLevel(kind: CustomerKind): number {
  const i = CUSTOMER_KINDS.indexOf(kind);
  const row = ARRIVALS.findIndex((r) => (r.weights[i] ?? 0) > 0);
  return row < 0 ? Infinity : row + 1;
}

/** 게임 시계 분을 "10:00"으로 */
function hm(minute: number): string {
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

/** 빵 값 배율 "×0.5" */
function rate(tenths: number): string {
  return `×${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}`;
}

/** 가운데 맞춘 짧은 글 */
function caption(scene: Phaser.Scene, x: number, y: number, text: string, color: number): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...textStyle(22, color, '700'), align: 'center' }).setOrigin(0.5).setLineSpacing(4);
}

/** 오른쪽 화살표 (도트 계단 머리) */
function arrow(scene: Phaser.Scene, x: number, y: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().fillStyle(color, 1);
  g.fillRect(x - 14, y - DOT, 16, DOT * 2);
  for (let k = 0; k < 4; k += 1) g.fillRect(x + 2 + k * DOT, y - (4 - k) * DOT, DOT, (4 - k) * DOT * 2);
  return g;
}

/** 김 세 알 (그림 위 정적인 표시) */
function steam(scene: Phaser.Scene, x: number, y: number, s: number): Phaser.GameObjects.Image[] {
  return [
    [-22, 0, 0.9],
    [2, -16, 1.1],
    [24, -2, 0.8],
  ].map(([dx, dy, k]) => scene.add.image(x + dx! * s, y + dy! * s, TEX.steam).setScale(k! * Math.max(0.7, s)).setAlpha(0.9));
}

/** 크기를 맞춘 텍스처 그림 (가로 기준) */
function fitImage(scene: Phaser.Scene, x: number, y: number, key: string, w: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, key);
  return img.setScale(w / img.width);
}

/**
 * 붕어빵 가게의 게임 방법 쪽들. 손님 쪽은 지금 평판 레벨까지 오는 손님만 보여 준다
 */
export function guidePages(level: number): GuidePage[] {
  const menuLine = MENUS.filter((m) => m.unlock > 1)
    .map((m) => `Lv${m.unlock}에 ${m.name}`)
    .join(', ');
  const kinds = CUSTOMER_KINDS.filter((k) => firstLevel(k) <= level);
  const more = CUSTOMER_KINDS.some((k) => firstLevel(k) > level);
  const closeMinute = OPEN_MINUTE + DAY_TICKS / TICKS_PER_GAME_MINUTE;

  return [
    {
      title: '굽기',
      artBg: GRILL,
      art: (scene, box) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const gap = 40;
        const slot = (box.w - gap * 3) / 4;
        const s = Math.min(0.75, (slot - 12) / MOLD_W);
        const cy = box.y + 96;
        const steps: { key: string | null; cap: string; steam: boolean }[] = [
          { key: null, cap: '누르면\n붓기', steam: false },
          { key: TEX.batter('good'), cap: '김 나면\n뒤집기', steam: true },
          { key: TEX.fish('good'), cap: '김 나면\n꺼내기', steam: true },
          { key: null, cap: '진열대로', steam: false },
        ];
        steps.forEach((step, i) => {
          const cx = box.x + slot / 2 + i * (slot + gap);
          if (i < 3) {
            out.push(scene.add.image(cx, cy, TEX.mold).setScale(s));
            if (step.key) out.push(scene.add.image(cx, cy - 2 * s, step.key).setScale(s * BUN_SCALE));
            if (step.steam) out.push(...steam(scene, cx, cy - 60 * s, s));
          } else {
            const w = Math.min(96, slot * 0.6);
            out.push(fitImage(scene, cx - w * 0.2, cy + 8, TEX.shelf('good'), w));
            out.push(fitImage(scene, cx + w * 0.2, cy - 10, TEX.shelf('good'), w));
          }
          out.push(caption(scene, cx, box.y + box.h - 54, step.cap, i === 1 || i === 2 ? 0xffd166 : LIGHT_TEXT));
          if (i < 3) out.push(arrow(scene, cx + slot / 2 + gap / 2, cy, LIGHT_TEXT));
        });
        return out;
      },
      lines: [
        { text: '빈 빵틀을 누르면 반죽을 부어요. 부을 때마다 재료비가 들어요.' },
        { text: '김이 오르면 눌러서 뒤집어요.', strong: true },
        { text: '뒤집고 다시 김이 오르면 눌러서 꺼내요.', strong: true },
        { text: '회색 연기가 나면 타는 중이에요. 얼른 꺼내요.' },
        { text: '누른 채로 빵틀 위를 쓸면 여러 칸을 한 번에 할 수 있어요.' },
      ],
    },
    {
      title: '익힘과 빵 값',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const items: { key: string; name: string; rate: string }[] = [
          { key: TEX.fish('raw'), name: '덜 익음', rate: rate(valueTenths('raw', 'regular')) },
          { key: TEX.fish('good'), name: '알맞음', rate: rate(valueTenths('good', 'regular')) },
          { key: TEX.fish('burnt'), name: '탐', rate: rate(valueTenths('burnt', 'regular')) },
          { key: TEX.candidate('good'), name: '황금 후보', rate: '반짝일 때' },
          { key: TEX.fish('golden'), name: '황금', rate: rate(valueTenths('golden', 'regular')) },
        ];
        const slot = box.w / items.length;
        const s = Math.min(0.6, (slot - 14) / BUN_W);
        const cy = box.y + 84;
        items.forEach((item, i) => {
          const cx = box.x + slot * (i + 0.5);
          out.push(scene.add.image(cx, cy, item.key).setScale(s));
          if (i === 4) {
            out.push(scene.add.image(cx - 40 * s, cy - 44 * s, TEX.sparkle).setScale(0.9));
            out.push(scene.add.image(cx + 52 * s, cy - 30 * s, TEX.sparkle).setScale(0.7));
          }
          out.push(caption(scene, cx, box.y + 170, item.name, p.textStrong));
          out.push(caption(scene, cx, box.y + 210, item.rate, i === 1 || i === 4 ? p.accent : p.text2));
        });
        return out;
      },
      lines: [
        { text: '빵 값은 익힘에 따라 달라져요. 두 면 중 나쁜 쪽으로 쳐요.' },
        { text: '손님은 알맞은 빵을 좋아해요. 덜 익거나 탄 빵은 만족도가 떨어져요.' },
        { text: '꼬리 모양이 다른 빵은 황금 후보예요.' },
        { text: '황금 후보가 반짝일 때 꺼내면 황금 붕어빵! 놓치면 바로 타요.', strong: true },
      ],
    },
    {
      title: '화력',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const s = 0.9;
        const px = box.x + 80;
        const py = box.y + 126;
        out.push(scene.add.image(px, py + 16 * s, TEX.pumpBody).setScale(s));
        out.push(scene.add.image(px, py - 92 * s, TEX.pumpHandle).setScale(s));
        const left = box.x + 170;
        // 막대 오른쪽에 배수 글자(약 70) 자리를 남긴다
        const meterW = Math.min(240, box.x + box.w - 24 - 70 - (left + 150 + 36));
        const rows: { label: string; ratio: number }[] = [
          { label: '누르고 있으면', ratio: 0.8 },
          { label: '떼면', ratio: 0.3 },
        ];
        rows.forEach((row, i) => {
          const y = box.y + 80 + i * 100;
          out.push(scene.add.text(left, y, row.label, textStyle(22, p.textStrong, '800')).setOrigin(0, 0.5));
          const mx = left + 150;
          out.push(scene.add.image(mx + 14, y, TEX.icon('flame')).setScale(0.5));
          out.push(meter(scene.add.graphics(), mx + 36, y - 12, meterW, 24, row.ratio, p.surface, HEAT));
          // 굽는 빠르기 배수: (60 + 화력% ) / 100 (장사 화면 화력 계기와 같은 값)
          out.push(scene.add.text(mx + 48 + meterW, y, `×${((60 + row.ratio * 100) / 100).toFixed(1)}`, textStyle(22, p.textStrong, '800')).setOrigin(0, 0.5));
        });
        return out;
      },
      lines: [
        { text: '펌프를 누르고 있으면 화력이 오르고, 떼면 내려가요.' },
        { text: '화력이 높으면 빨리 익지만, 알맞은 때도 금방 지나가요.', strong: true },
        { text: '화력 계기의 ×숫자가 굽는 빠르기예요. 처음엔 ×1.1 안팎이 편해요.' },
        { text: '화구를 강화하면 펌프를 떼도 화력이 덜 떨어져요.' },
      ],
    },
    {
      title: '팔기',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const person = scene.add.image(box.x + box.w * 0.2, box.y + box.h - 8, TEX.person('regular', 0, 'normal')).setOrigin(0.5, 1);
        person.setScale(Math.min(0.78, (box.h - 24) / person.height));
        out.push(person);
        // 말풍선: 주문 개수와 대사
        const bx = box.x + box.w * 0.4;
        const bw = Math.min(300, box.x + box.w - bx - 20);
        out.push(framedBox(scene.add.graphics(), bx, box.y + 20, bw, 70, 16, 0xffffff, 0x3a2a1a, 3));
        out.push(scene.add.image(bx + 36, box.y + 55, TEX.icon('menuBean')).setScale(0.6));
        out.push(scene.add.text(bx + 64, box.y + 55, '2개 주세요', textStyle(22, 0x2b1d14, '800')).setOrigin(0, 0.5));
        // 기다림 막대
        out.push(meter(scene.add.graphics(), bx, box.y + 104, bw, 16, 0.65, p.surface, 0x4caf50));
        const give = new Button(scene, { x: bx + 64, y: box.y + 178, width: 128, height: 72, label: '2개 주기', style: 'warm', palette: p, fontSize: 22, onPress: () => undefined });
        const extra = new Button(scene, { x: bx + 128 + 16 + 50, y: box.y + 178, width: 100, height: 72, label: '+1 덤', style: 'warm', palette: p, fontSize: 22, onPress: () => undefined });
        // 그림일 뿐이라 누를 수 없다
        give.disableInteractive();
        extra.disableInteractive();
        out.push(give, extra);
        return out;
      },
      lines: [
        { text: '손님 말풍선의 메뉴와 개수를 보고 [N개 주기]를 눌러요.' },
        { text: '[+1 덤]은 하나 더 얹어 줘요. 손님이 만족하면 콤보가 쌓여 보너스!', strong: true },
        { text: '말풍선 아래 기다림 막대가 다 닳으면 손님이 그냥 떠나요.' },
        { text: '진열대는 왼쪽 빵부터 나가요. 탄 빵은 [탄 빵 버리기]로 치워요.' },
        { text: '메뉴가 늘면 빵틀 위 반죽 단추로 골라 부어요.' },
      ],
    },
    {
      title: '손님',
      artH: 140,
      art: (scene, box) => {
        const slot = box.w / Math.max(kinds.length, 5);
        const s = Math.min(0.5, (slot - 8) / PERSON_W, (box.h - 16) / 220);
        const left = box.x + (box.w - slot * kinds.length) / 2;
        return kinds.map((kind, i) => scene.add.image(left + slot * (i + 0.5), box.y + box.h - 6, TEX.person(kind, 0, 'normal')).setOrigin(0.5, 1).setScale(s));
      },
      lines: [
        ...kinds.map((kind) => {
          const icon = TRAIT_ICON[kind];
          return { text: `${KIND_NAME[kind]}: ${KIND_TIP[kind]}`, icon: icon ? TEX.icon(icon) : undefined };
        }),
        ...(more ? [{ text: '평판이 오르면 새 손님이 와요.', strong: true }] : []),
      ],
    },
    {
      title: '하루와 성장',
      art: (scene, box, p) => {
        const out: Phaser.GameObjects.GameObject[] = [];
        const items: { key: string; cap: string }[] = [
          { key: TEX.icon('clock'), cap: `하루 ${DAY_TICKS / 3600}분` },
          { key: TEX.coin, cap: '하루 수익' },
          { key: TEX.icon('star'), cap: '평판' },
          { key: TEX.icon('store'), cap: '가게 꾸리기' },
        ];
        const slot = box.w / items.length;
        items.forEach((item, i) => {
          const cx = box.x + slot * (i + 0.5);
          out.push(fitImage(scene, cx, box.y + 100, item.key, 72));
          out.push(caption(scene, cx, box.y + 180, item.cap, p.textStrong));
        });
        return out;
      },
      lines: [
        { text: `하루는 ${DAY_TICKS / 3600}분(${hm(OPEN_MINUTE)}~${hm(closeMinute)})이에요. 마감하면 남은 빵은 버려져요.` },
        { text: '하루 수익(매출 - 재료비)이 랭킹 점수예요.', strong: true },
        { text: `손님이 만족하면 평판이 올라요. 평판 ${menuLine}이 열려요.` },
        { text: '번 돈으로 [가게 꾸리기]에서 빵틀·화구·진열대 등을 강화해요.' },
      ],
    },
  ];
}

export interface GuideOptions {
  scene: Phaser.Scene;
  palette: ScenePalette;
  sfx: Sfx;
  /** 지금 평판 레벨 (손님 쪽에 보일 손님) */
  level: number;
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
  const pages = guidePages(o.level);
  const { width, height } = scene.scale;
  const portrait = height > width;
  const cw = portrait ? width - 48 : 1000;
  const left = Math.round((width - cw) / 2);
  const inner = cw - 64;
  /** 글 한 줄 (줄이 길면 접는다) */
  const lineText = (x: number, y: number, line: GuideLine) =>
    scene.add.text(x, y, line.text, { ...textStyle(22, line.strong ? p.accent : p.text, '700'), wordWrap: { width: inner - 40, useAdvancedWrap: true } }).setLineSpacing(6);
  // 카드 높이는 가장 긴 쪽(그림 + 글)에 맞춘다. 쪽을 넘겨도 카드가 그대로이고 아래가 비지 않게. 화면보다 길면 화면에 맞춘다
  const contentH = Math.max(
    ...pages.map((pg) =>
      pg.lines.reduce((sum, line) => {
        const t = lineText(0, 0, line);
        const h = t.height;
        t.destroy();
        return sum + h + LINE_GAP;
      }, (pg.artH ?? 260) + 28),
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
    body.add(scene.add.text(left + 32, rowY, `${page + 1}. ${pg.title}`, textStyle(30, p.textStrong, '800')).setOrigin(0, 0.5));
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
    const box: Rect = { x: left + 32, y: top + CARD_HEAD, w: inner, h: pg.artH ?? 260 };
    body.add(framedBox(scene.add.graphics(), box.x, box.y, box.w, box.h, 16, pg.artBg ?? p.surfaceHover, p.border, 2));
    body.add(pg.art(scene, box, p));
    let y = box.y + box.h + 28;
    for (const line of pg.lines) {
      const text = lineText(left + 32 + 40, y, line);
      const markY = y + 15;
      if (line.icon) body.add(fitImage(scene, left + 32 + 14, markY, line.icon, 30));
      else body.add(scene.add.rectangle(left + 32 + 14, markY, DOT * 2, DOT * 2, line.strong ? p.accent : p.text2));
      body.add(text);
      y += text.height + LINE_GAP;
    }
    if (y > btnY - 42) console.warn(`[fish-bun] 게임 방법 ${page + 1}쪽 글이 카드를 넘친다`, y - (btnY - 42));
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
