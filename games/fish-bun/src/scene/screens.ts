// 장사 밖 화면: 가게(하루 시작 전), 가게 꾸리기(강화), 정산. 화면마다 컨테이너 하나를 만들어 돌려준다.
// 근거: docs/design/261021-03-fish-bun-growth.md §3-1, §4, docs/design/261021-04-game-save.md §3

import Phaser from 'phaser';
import {
  MENUS,
  UPGRADE_KEYS,
  canUpgrade,
  goldenChance,
  heatFall,
  levelOf,
  moldCount,
  nextLevelAt,
  levelFloor,
  recipeBonus,
  shelfCapacity,
  signFactor,
  upgradeCost,
  upgradeRequires,
  UPGRADES,
  type DayOutcome,
  type DayStats,
  type ShopState,
  type UpgradeKey,
} from '../logic/rules';
import { BUN_H, BUN_W, MOLD_W, SHELF_W, TEX } from './art';
import type { Layout, Rect } from './layout';
import { attachScroll } from './scroll';
import { PIXEL_ART, disc, framedBox, meter, roundBox, vGradient } from './style';
import { Button, num, textStyle, titleStyle, won, type ScenePalette } from './ui';

/** 정산 화면의 저장 상태 */
export type SettleStatus =
  | { kind: 'saving' }
  /** rank는 전체 랭킹 순위, best.allTime이면 내 최고 수익 */
  | { kind: 'saved'; rank: number | null; best: { allTime: boolean } }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed' }
  | { kind: 'trial' };

/** 강화 이름, 효과 이름과 단계별 값 */
const UPGRADE_INFO: Record<UpgradeKey, { name: string; label: string; value(level: number): string; tex: string; texScale: number }> = {
  molds: { name: '빵틀 늘리기', label: '빵틀', value: (l) => `${moldCount(l)}칸`, tex: TEX.mold, texScale: 70 / MOLD_W },
  seasoning: {
    name: '빵틀 길들이기',
    label: '알맞음 구간',
    value: (l) => `${(2.5 + 0.4 * l).toFixed(1)}초`,
    tex: TEX.fish('good'),
    texScale: 70 / BUN_W,
  },
  burner: { name: '화구', label: '초당 화력 감소', value: (l) => (heatFall(l) === 0 ? '없음' : `${heatFall(l)}%`), tex: TEX.icon('flame'), texScale: 0.9 },
  recipe: { name: '반죽 레시피', label: '모든 빵 값', value: (l) => `+${won(recipeBonus(l))}`, tex: TEX.batter('good'), texScale: 70 / BUN_W },
  golden: { name: '황금 비법', label: '황금 확률', value: (l) => `${goldenChance(l) / 10}%`, tex: TEX.fish('golden'), texScale: 70 / BUN_W },
  shelf: { name: '진열대', label: '진열대', value: (l) => `${shelfCapacity(l)}개`, tex: TEX.shelf('good'), texScale: 64 / SHELF_W },
  sign: { name: '간판', label: '손님 간격', value: (l) => `${signFactor(l)}%`, tex: TEX.icon('store'), texScale: 0.9 },
};

/** 평판 레벨에 새로 오는 손님 */
const NEW_CUSTOMER: Record<number, string> = {
  2: '바쁜 직장인',
  3: '단골 어르신, 수수께끼 손님',
  4: '먹방 크리에이터, 관광객, 진상 손님',
  5: '리뷰어',
};

/** 평판 레벨에 열리는 메뉴 (MENUS의 열리는 레벨) */
const NEW_MENU: Record<number, string> = Object.fromEntries(MENUS.filter((m) => m.unlock > 1).map((m) => [m.unlock, `${m.name} 붕어빵`]));

/** 세로 배치 가게 화면: 가게 그림 아래 카드·버튼 묶음 높이 */
const SHOP_PORTRAIT_BOTTOM = 700;

/** 가로 배치 가게 화면: 상태 카드 높이(내용에 맞춤)와 그 아래 버튼 묶음 높이 */
const SHOP_CARD_H = 340;
const SHOP_BUTTONS_H = 300;

/** 판 거절 사유의 안내 */
export const REJECT_TEXT: Record<string, string> = {
  stale_save: '다른 곳에서 가게가 바뀌어 이 날은 저장되지 않았어요.',
  time: '게임 시간이 맞지 않아 저장되지 않았어요.',
  bad_input: '기록을 확인하지 못해 저장하지 않았어요.',
  mismatch: '기록을 확인하지 못해 저장하지 않았어요.',
  abandoned: '새 장사를 시작해서 이 날은 저장되지 않았어요.',
};

/** 패널 바탕 */
function panel(scene: Phaser.Scene, r: Rect, palette: ScenePalette): Phaser.GameObjects.Graphics {
  return framedBox(scene.add.graphics(), r.x, r.y, r.w, r.h, 24, palette.surface, palette.border, 2);
}

/** 가게 앞모습: 하늘, 골목, 포장마차(차양·간판·진열창) */
function storefront(scene: Phaser.Scene, r: Rect): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  vGradient(g, r.x, r.y, r.w, r.h * 0.8, 0x8fd0ff, 0xe8f7ff, 8);
  disc(g, r.x + r.w * 0.82, r.y + r.h * 0.12, r.w * 0.06, 0xfff3b0);
  g.fillStyle(0x9fb7d6, 0.6);
  for (let i = 0, x = r.x; x < r.x + r.w; i += 1) {
    const w = 80 + ((i * 37) % 70);
    const h = r.h * (0.25 + ((i * 29) % 30) / 100);
    // 마지막 건물은 그림 영역 밖으로 나가지 않게 자른다
    g.fillRect(x, r.y + r.h * 0.8 - h, Math.min(w - 10, r.x + r.w - x), h);
    x += w;
  }
  g.fillStyle(0xc8ccd2, 1).fillRect(r.x, r.y + r.h * 0.8, r.w, r.h * 0.2);
  g.fillStyle(0xb3b8bf, 1).fillRect(r.x, r.y + r.h * 0.8, r.w, 8);

  const sw = Math.min(r.w * 0.82, 620);
  const sx = r.x + (r.w - sw) / 2;
  const top = r.y + r.h * 0.3;
  const bottom = r.y + r.h * 0.86;
  // 가게 몸통(나무)
  roundBox(g, sx, top, sw, bottom - top, 12, 0x8a5a2b);
  g.fillStyle(0x6b4220, 1);
  for (let x = sx + 40; x < sx + sw; x += 60) g.fillRect(x, top + (bottom - top) * 0.55, 4, (bottom - top) * 0.45);
  // 진열창
  const wy = top + (bottom - top) * 0.12;
  const wh = (bottom - top) * 0.4;
  roundBox(g, sx + 24, wy, sw - 48, wh, 10, 0x3a2a1c);
  g.fillStyle(0x2a2420, 1).fillRect(sx + 40, wy + wh * 0.62, sw - 80, wh * 0.3);
  g.fillStyle(0xff7a2f, 0.35).fillRect(sx + 40, wy + wh * 0.86, sw - 80, wh * 0.06);
  // 카운터 판
  g.fillStyle(0xb57a3c, 1).fillRect(sx - 10, wy + wh, sw + 20, 22);
  root.add(g);
  // 진열창 안의 붕어빵
  // 창 안쪽 여백을 두고 칸을 4등분해, 붕어빵이 창 밖으로 나가지 않게 한다
  const innerX = sx + 24 + 24;
  const slotW = (sw - 96) / 4;
  const bunScale = Math.min(0.5, (slotW - 16) / BUN_H, BUN_W, (wh * 0.5) / BUN_H);
  for (let i = 0; i < 4; i += 1) {
    const bx = innerX + slotW * (i + 0.5);
    root.add(scene.add.image(bx, wy + wh * 0.6 - (BUN_H * bunScale) / 2, TEX.fish(i === 2 ? 'golden' : 'good')).setScale(bunScale));
  }
  // 차양
  const awning = scene.add.graphics();
  const stripe = Math.max(36, sw / 12);
  const ay = top - r.h * 0.07;
  for (let i = 0; i * stripe < sw + 20; i += 1) {
    const x = sx - 10 + i * stripe;
    const color = i % 2 === 0 ? 0xd9363e : 0xfff1dc;
    awning.fillStyle(color, 1).fillRect(x, ay, stripe, r.h * 0.07);
    disc(awning, x + stripe / 2, ay + r.h * 0.07, stripe / 2, color);
  }
  root.add(awning);
  // 간판
  const signW = Math.min(sw * 0.86, 480);
  const signH = r.h * 0.11;
  const signY = ay - signH - 10;
  const sign = scene.add.graphics();
  framedBox(sign, r.x + (r.w - signW) / 2, signY, signW, signH, 18, 0xfff6e0, 0x8a5a2b, 6);
  root.add(sign);
  // 까치와 가게 이름을 한 덩어리로 간판 가운데에 놓는다
  const magpie = scene.add.image(0, signY + signH / 2, TEX.magpie).setScale((signH * 0.8) / 96);
  const name = scene.add.text(0, signY + signH / 2, '까치 붕어빵', titleStyle(Math.round(signH * 0.42), 0x5a3410)).setOrigin(0, 0.5);
  const gap = 12;
  const groupW = magpie.displayWidth + gap + name.width;
  const left = r.x + r.w / 2 - groupW / 2;
  magpie.setX(left + magpie.displayWidth / 2);
  name.setX(left + magpie.displayWidth + gap);
  root.add([magpie, name]);
  // 전구
  const bulbs = scene.add.graphics();
  for (let x = sx; x <= sx + sw; x += 44) disc(bulbs, x, ay + r.h * 0.07 + stripe / 2 + 8, 6, 0xffe27a);
  root.add(bulbs);
  return root;
}

// ---------------------------------------------------------------- 가게

export interface ShopScreenOptions {
  scene: Phaser.Scene;
  layout: Layout;
  palette: ScenePalette;
  state: ShopState;
  trial: boolean;
  /** 체험 하루를 이미 했는지 */
  trialUsed: boolean;
  starting: boolean;
  /** 체험 안내 문구 ("로그인하면 가게가 저장돼요" 등, 셸이 정한다) */
  trialHint: string;
  onStart(): void;
  onUpgrades(): void;
  onLogin(): void;
  onRetryTrial(): void;
  /** 오른쪽 위 톱니: 설정 창(소리) */
  onSettings(): void;
}

/** 가게 화면: 몇 일째, 돈, 평판, [장사 시작] [가게 꾸리기] */
export function buildShopScreen(o: ShopScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, state } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0);
  const portrait = o.layout === 'portrait';
  // 세로 배치: 아래 카드·버튼 묶음(700)을 빼고 남은 높이를 가게 그림이 받는다(화면 비율에 따라 1240~1640, 기준 1400이면 700)
  const art: Rect = portrait ? { x: 0, y: 0, w: width, h: height - SHOP_PORTRAIT_BOTTOM } : { x: 0, y: 0, w: 900, h: height };
  root.add(storefront(scene, art));
  // 오른쪽 위 톱니: 설정 창(소리). 셸 머리줄이 없어서 소리는 여기서 바꾼다 (docs/design/261022-14-growth-play-immersive.md)
  root.add(
    new Button(scene, { x: width - 56, y: 56, width: 76, height: 76, label: '', style: 'secondary', palette: p, onPress: o.onSettings }).add(
      scene.add.image(0, 0, TEX.icon('gear')).setScale(0.7),
    ),
  );

  // 가로 배치는 카드 높이를 내용에 맞추고, 카드와 아래 버튼 묶음(약 300)을 세로 가운데에 둔다
  const card: Rect = portrait
    ? { x: 24, y: art.h + 24, w: width - 48, h: 380 }
    : { x: 940, y: Math.round((height - (SHOP_CARD_H + SHOP_BUTTONS_H)) / 2), w: 580, h: SHOP_CARD_H };
  root.add(panel(scene, card, p));
  const level = levelOf(state.reputation);
  const next = nextLevelAt(level);
  const cx = card.x + 32;
  let y = card.y + 56;
  root.add(scene.add.text(cx, y, `${num(state.day)}일째 아침`, titleStyle(46, p.textStrong)).setOrigin(0, 0.5));
  y += 72;
  root.add(scene.add.text(cx, y, '가진 돈', textStyle(24, p.text2, '700')).setOrigin(0, 0.5));
  root.add(scene.add.text(card.x + card.w - 32, y, won(state.money), textStyle(34, p.textStrong, '800')).setOrigin(1, 0.5));
  y += 64;
  root.add(scene.add.text(cx, y, `평판 Lv${level}`, textStyle(24, p.text2, '700')).setOrigin(0, 0.5));
  root.add(
    scene.add
      .text(card.x + card.w - 32, y, next === null ? '최고 레벨' : `${num(state.reputation)} / ${num(next)}`, textStyle(24, p.text, '700'))
      .setOrigin(1, 0.5),
  );
  y += 36;
  const floor = levelFloor(level);
  const ratio = next === null ? 1 : (state.reputation - floor) / (next - floor);
  root.add(meter(scene.add.graphics(), cx, y, card.w - 64, 16, ratio, p.surfaceHover, p.accent));
  y += 62;
  root.add(scene.add.text(cx, y, '최고 하루 수익', textStyle(24, p.text2, '700')).setOrigin(0, 0.5));
  root.add(scene.add.text(card.x + card.w - 32, y, won(state.stats.bestProfit), textStyle(26, p.text, '700')).setOrigin(1, 0.5));

  const bx = portrait ? width / 2 : card.x + card.w / 2;
  const bw = portrait ? width - 48 : card.w;
  let by = portrait ? height - 220 : card.y + card.h + 80;
  if (o.trial && o.trialUsed) {
    root.add(
      scene.add
        .text(bx, by - 30, '체험은 하루만 할 수 있어요.\n로그인하면 가게를 이어서 키울 수 있어요.', { ...textStyle(24, p.text, '700'), align: 'center' })
        .setOrigin(0.5),
    );
    by += 60;
    root.add(new Button(scene, { x: bx, y: by, width: bw, height: 96, label: '로그인하고 저장하기', style: 'primary', palette: p, fontSize: 34, onPress: o.onLogin }));
    root.add(new Button(scene, { x: bx, y: by + 116, width: bw, height: 80, label: '다시 체험하기', style: 'secondary', palette: p, fontSize: 28, onPress: o.onRetryTrial }));
    return root;
  }
  const start = new Button(scene, {
    x: bx,
    y: by,
    width: bw,
    height: 104,
    label: o.starting ? '문 여는 중' : '장사 시작',
    style: 'primary',
    palette: p,
    fontSize: 38,
    onPress: o.onStart,
  });
  start.setEnabled(!o.starting);
  root.add(start);
  root.add(new Button(scene, { x: bx, y: by + 124, width: bw, height: 84, label: '가게 꾸리기', style: 'secondary', palette: p, fontSize: 30, onPress: o.onUpgrades }));
  if (o.trial) {
    const note = scene.add
      .text(bx, by + 210, `체험 중 · ${o.trialHint}`, textStyle(22, p.text2, '700'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    note.on(Phaser.Input.Events.POINTER_DOWN, o.onLogin);
    root.add(note);
  }
  return root;
}

// ---------------------------------------------------------------- 가게 꾸리기

export interface UpgradeScreenOptions {
  scene: Phaser.Scene;
  layout: Layout;
  palette: ScenePalette;
  state: ShopState;
  trial: boolean;
  /** 사는 중인 강화 */
  buying: UpgradeKey | null;
  onBuy(key: UpgradeKey): void;
  onBack(): void;
}

/** 가게 꾸리기: 강화 7종 카드 */
export function buildUpgradeScreen(o: UpgradeScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, state } = o;
  const { width } = scene.scale;
  const root = scene.add.container(0, 0);
  const portrait = o.layout === 'portrait';
  root.add(new Button(scene, { x: 24 + 80, y: 56, width: 160, height: 68, label: '가게로', style: 'secondary', palette: p, fontSize: 26, onPress: o.onBack }));
  root.add(scene.add.text(width / 2, 56, '가게 꾸리기', titleStyle(38, p.textStrong)).setOrigin(0.5));
  root.add(scene.add.text(width - 24, 56, won(state.money), textStyle(30, p.textStrong, '800')).setOrigin(1, 0.5));

  const cols = portrait ? 1 : 2;
  const cardW = portrait ? width - 48 : (width - 48 - 24) / 2;
  const cardH = portrait ? 142 : 168;
  const gap = portrait ? 12 : 16;
  UPGRADE_KEYS.forEach((key, i) => {
    const info = UPGRADE_INFO[key];
    const level = state.upgrades[key];
    const def = UPGRADES[key];
    const r: Rect = { x: 24 + (i % cols) * (cardW + 24), y: 120 + Math.floor(i / cols) * (cardH + gap), w: cardW, h: cardH };
    root.add(panel(scene, r, p));
    root.add(scene.add.image(r.x + 66, r.y + cardH / 2, info.tex).setScale(info.texScale));
    const tx = r.x + 124;
    root.add(scene.add.text(tx, r.y + 36, info.name, textStyle(30, p.textStrong, '800')).setOrigin(0, 0.5));
    const dots = scene.add.graphics();
    for (let d = 0; d < def.max; d += 1) disc(dots, tx + 12 + d * 26, r.y + 72, 9, d < level ? p.accent : p.border);
    root.add(dots);
    const cost = upgradeCost(key, level);
    const effect = cost === null ? `${info.label} ${info.value(level)}` : `${info.label} ${info.value(level)} → ${info.value(level + 1)}`;
    root.add(
      scene.add
        .text(tx, r.y + cardH - 34, effect, { ...textStyle(21, p.text, '600'), wordWrap: { width: r.w - 124 - 210 } })
        .setOrigin(0, 0.5),
    );
    const check = canUpgrade(state, key);
    let label: string;
    let sub: string | undefined;
    if (cost === null) label = '최대';
    else if (o.trial) {
      label = won(cost);
      sub = '로그인 필요';
    } else if (!check.ok && check.reason === 'locked') {
      label = won(cost);
      sub = `평판 Lv${upgradeRequires(key, level)}부터`;
    } else if (o.buying === key) label = '사는 중';
    else label = won(cost);
    const button = new Button(scene, {
      x: r.x + r.w - 110,
      y: r.y + cardH / 2,
      width: 190,
      height: cardH - 44,
      label,
      ...(sub ? { sub } : {}),
      style: 'primary',
      palette: p,
      fontSize: 26,
      onPress: () => o.onBuy(key),
    });
    button.setEnabled(!o.trial && check.ok && o.buying === null);
    root.add(button);
  });
  // 글꼴 출처 (넥슨 서체는 출처 표기를 권장한다. 근거: docs/design/261022-04-fish-bun-title-font.md §3)
  if (PIXEL_ART) {
    root.add(scene.add.text(width / 2, scene.scale.height - 30, '글꼴: 던파 비트비트체 v2(넥슨), 갈무리11', textStyle(22, p.text2)).setOrigin(0.5));
  }
  return root;
}

// ---------------------------------------------------------------- 정산

export interface SettleScreenOptions {
  scene: Phaser.Scene;
  layout: Layout;
  palette: ScenePalette;
  /** 끝낸 날 */
  day: number;
  before: ShopState;
  stats: DayStats;
  outcome: DayOutcome;
  status: SettleStatus;
  onRetry(): void;
  onUpgrades(): void;
  onLogin(): void;
  onRetryTrial(): void;
}

/** 정산 화면 */
export function buildSettleScreen(o: SettleScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, stats, outcome } = o;
  const { width, height } = scene.scale;
  const portrait = o.layout === 'portrait';
  const root = scene.add.container(0, 0);
  const body = scene.add.container(0, 0);
  root.add(body);
  // 카드 높이는 내용을 다 놓은 뒤 정한다
  const card: Rect = portrait ? { x: 24, y: 40, w: width - 48, h: 0 } : { x: 300, y: 40, w: width - 600, h: 0 };
  const left = card.x + 40;
  const right = card.x + card.w - 40;
  let y = card.y + 64;
  body.add(scene.add.text(card.x + card.w / 2, y, `${num(o.day)}일차 장사 끝`, titleStyle(44, p.textStrong)).setOrigin(0.5));
  y += 84;

  /** 이름 · 값 한 줄 */
  const row = (name: string, value: string, color = p.textStrong, size = 28) => {
    body.add(scene.add.text(left, y, name, textStyle(24, p.text2, '700')).setOrigin(0, 0.5));
    body.add(scene.add.text(right, y, value, textStyle(size, color, '800')).setOrigin(1, 0.5));
    y += size + 30;
  };
  row('매출 (팁·콤보 포함)', won(stats.revenue));
  row(`재료비 (반죽 ${num(stats.pours)}번)`, stats.doughCost > 0 ? `-${won(stats.doughCost)}` : won(0), stats.doughCost > 0 ? 0xc0392b : p.textStrong);
  const line = scene.add.graphics();
  line.lineStyle(2, p.border, 1).lineBetween(left, y - 12, right, y - 12);
  body.add(line);
  y += 40;
  row('순 수익', won(outcome.profit), outcome.profit >= 0 ? p.accent : 0xc0392b, 44);
  if (stats.subsidy > 0) row('운영 지원금', `+${won(stats.subsidy)}`, p.text, 24);
  const served = stats.served.best + stats.served.good + stats.served.meh + stats.served.bad;
  y += 6;
  row('손님', `${num(served + stats.left)}명`, p.textStrong, 26);
  /** 안쪽으로 들여 쓴 작은 줄: 이름은 왼쪽, 값은 오른쪽 정렬 */
  const sub = (name: string, value: string) => {
    body.add(scene.add.text(left + 24, y, name, textStyle(22, p.text2, '600')).setOrigin(0, 0.5));
    body.add(scene.add.text(right, y, value, textStyle(22, p.text, '700')).setOrigin(1, 0.5));
    y += 38;
  };
  sub('최고', `${num(stats.served.best)}명`);
  sub('만족', `${num(stats.served.good)}명`);
  sub('아쉬움', `${num(stats.served.meh)}명`);
  sub('불만', `${num(stats.served.bad)}명`);
  sub('떠남', `${num(stats.left)}명`);
  y += 14;
  row('최대 콤보', `${num(stats.maxCombo)}`, p.textStrong, 26);
  sub('황금붕어빵', `${num(stats.golden)}개`);
  if (stats.wasted > 0) sub('남은 빵 폐기', `${num(stats.wasted)}개`);
  if (stats.trashed > 0) sub('버린 탄 빵', `${num(stats.trashed)}개`);
  if (stats.broken > 0) sub('깨진 빵틀', `${num(stats.broken)}번`);
  // 팥 말고 다른 메뉴도 팔았으면 메뉴별 판 개수
  if (stats.soldBy.some((n, m) => m > 0 && n > 0)) {
    y += 14;
    row('판 빵', '', p.textStrong, 26);
    MENUS.forEach((m, i) => sub(m.name, `${num(stats.soldBy[i] ?? 0)}개`));
  }
  y += 14;
  const levelBefore = levelOf(o.before.reputation);
  const levelAfter = levelOf(outcome.nextState.reputation);
  const repDelta = outcome.nextState.reputation - o.before.reputation;
  row('평판', `${repDelta >= 0 ? '+' : ''}${num(repDelta)}${levelAfter > levelBefore ? `  Lv${levelBefore} → Lv${levelAfter}` : ''}`, levelAfter > levelBefore ? 0xff8a3d : p.textStrong);
  if (levelAfter > levelBefore) {
    const news: string[] = [];
    for (let l = levelBefore + 1; l <= levelAfter; l += 1) {
      if (NEW_MENU[l]) news.push(`새 메뉴: ${NEW_MENU[l]}`);
      if (NEW_CUSTOMER[l]) news.push(`새 손님: ${NEW_CUSTOMER[l]}`);
      if (l === 2) news.push('새 강화: 빵틀 9칸');
      if (l === 4) news.push('새 강화: 빵틀 12칸');
    }
    if (news.length) {
      body.add(scene.add.text(left, y, news.join(' · '), { ...textStyle(22, 0xff8a3d, '700'), wordWrap: { width: right - left } }).setOrigin(0, 0.5));
      y += 48;
    }
  }

  // 저장 상태
  const s = o.status;
  const statusText =
    s.kind === 'saving'
      ? '저장하는 중'
      : s.kind === 'saved'
        ? `저장했어요${s.best.allTime ? ' · 최고 수익' : ''}${s.rank !== null ? ` · 전체 ${num(s.rank)}위` : ''}`
        : s.kind === 'rejected'
          ? s.message
          : s.kind === 'failed'
            ? '저장하지 못했어요. 연결을 확인해 주세요.'
            : '체험이라 저장되지 않아요';
  const statusColor = s.kind === 'rejected' || s.kind === 'failed' ? 0xc0392b : s.kind === 'saved' ? p.accent : p.text2;
  const divider = scene.add.graphics();
  divider.lineStyle(2, p.border, 1).lineBetween(left, y, right, y);
  body.add(divider);
  y += 50;
  body.add(
    scene.add
      .text(card.x + card.w / 2, y, statusText, { ...textStyle(24, statusColor, '700'), align: 'center', wordWrap: { width: right - left } })
      .setOrigin(0.5),
  );
  card.h = y + 56 - card.y;
  body.addAt(panel(scene, card, p), 0);

  const bw = portrait ? (width - 48 - 16) / 2 : 360;
  // 버튼은 아래에 고정하고 카드만 스크롤한다
  const footH = 176;
  root.add(attachScroll({ scene, body, top: 0, contentH: card.y + card.h + 24, bottom: height - footH, width, height, color: p.bg, thumb: p.border }));
  const by = height - footH + 88;
  const bx1 = portrait ? 24 + bw / 2 : width / 2 - bw / 2 - 8;
  const bx2 = portrait ? width - 24 - bw / 2 : width / 2 + bw / 2 + 8;
  if (s.kind === 'failed') {
    root.add(new Button(scene, { x: width / 2, y: by, width: portrait ? width - 48 : 560, height: 100, label: '다시 보내기', style: 'primary', palette: p, fontSize: 34, onPress: o.onRetry }));
  } else if (s.kind === 'trial') {
    root.add(new Button(scene, { x: bx1, y: by, width: bw, height: 100, label: '다시 체험하기', style: 'secondary', palette: p, fontSize: 30, onPress: o.onRetryTrial }));
    root.add(new Button(scene, { x: bx2, y: by, width: bw, height: 100, label: '로그인하고 저장', style: 'primary', palette: p, fontSize: 30, onPress: o.onLogin }));
  } else {
    // 강화를 놓치고 바로 다음 날로 넘어가지 않게, 정산 뒤에는 가게 꾸리기를 거쳐 가게에서 장사를 시작한다
    const upgrades = new Button(scene, { x: width / 2, y: by, width: portrait ? width - 48 : 560, height: 100, label: '가게 꾸리기', style: 'primary', palette: p, fontSize: 34, onPress: o.onUpgrades });
    upgrades.setEnabled(s.kind !== 'saving');
    root.add(upgrades);
  }
  return root;
}
