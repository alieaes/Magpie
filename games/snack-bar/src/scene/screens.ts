// 장사 밖 화면: 가게(시작), 정산, 가게 꾸리기(강화), 직원 명부. 장면(SnackBarScene)이 상황에 맞게 다시 그린다.
// 근거: docs/design/261022-09-snack-bar.md §3, docs/design/261022-10-snack-bar-growth.md §4~§5, docs/design/261022-11-snack-bar-characters.md §3~§4

import Phaser from 'phaser';
import {
  GRADE_NAMES,
  MENUS,
  STAFF,
  STAFF_IDS,
  UPGRADES,
  UPGRADE_KEYS,
  dayParams,
  expForLevel,
  gradeOf,
  levelOf,
  openMenus,
  toNextGrade,
  unlockProgress,
  upgradeCheck,
  upgradeMax,
  type DayOutcome,
  type DayStats,
  type ShopState,
  type StaffId,
  type UpgradeKey,
} from '../logic/rules';
import type { Layout } from './layout';
import { MENU_ART, ensureStaff, iconKey, menuIconKey, propKey, stationKey, trayKey } from './sprites';
import { attachScroll } from './scroll';
import { framedBox, meter } from './style';
import { Button, num, textStyle, titleStyle, won, type ScenePalette } from './ui';

/** 정산의 저장 상태 */
export type SettleStatus =
  | { kind: 'saving' }
  | { kind: 'saved'; rank: number | null; best: { allTime: boolean } }
  | { kind: 'failed' }
  | { kind: 'rejected'; message: string }
  | { kind: 'trial' };

/** 서버가 하루를 거절한 사유의 안내 */
export const REJECT_TEXT: Record<string, string> = {
  stale_save: '다른 곳에서 가게가 바뀌어서 이 날은 저장되지 않았어요.',
  time: '시간이 맞지 않아 이 날은 저장되지 않았어요.',
  bad_input: '기록이 맞지 않아 이 날은 저장되지 않았어요.',
};

interface Base {
  scene: Phaser.Scene;
  layout: Layout;
  palette: ScenePalette;
}

/** 큰 제목 줄 */
function heading(scene: Phaser.Scene, x: number, y: number, text: string, p: ScenePalette): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, titleStyle(44, p.textStrong)).setOrigin(0.5);
}

// ---------------------------------------------------------------- 가게 화면

export interface ShopScreenOptions extends Base {
  state: ShopState;
  trial: boolean;
  trialUsed: boolean;
  starting: boolean;
  trialHint: string;
  /** 명부를 아직 안 본 새 직원이 있다 */
  newStaff: boolean;
  onStart(): void;
  onSettings(): void;
  /** 설정 왼쪽 [게임 방법] */
  onGuide(): void;
  onUpgrades(): void;
  onStaff(): void;
  onLogin(): void;
  onRetryTrial(): void;
}

/** 가게 화면: 가게 앞모습("까치 분식")과 오늘의 직원, 상태 카드, [장사 시작] [가게 꾸리기] [직원 명부] */
export function buildShopScreen(o: ShopScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, state } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0);
  const landscape = o.layout === 'landscape';
  root.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0));

  // 세로 배치는 버튼을 아래에 붙이고, 그 위에 상태 카드, 남는 위쪽을 가게 그림이 쓴다
  const cardH = 300;
  const btnTop = landscape ? 0 : height - 260 - (o.trial ? 40 : 0);
  const portraitCardY = btnTop - 24 - cardH - (o.trial ? 24 : 0);
  // 가게 앞모습
  const artW = landscape ? 760 : width - 48;
  const artCx = landscape ? 440 : width / 2;
  const artBottom = landscape ? 780 : portraitCardY - 40;
  const front = scene.add.image(artCx, artBottom, propKey('shopFront')).setOrigin(0.5, 1);
  front.setScale(Math.min(artW / front.width, (artBottom - 120) / front.height));
  root.add(front);
  const signY = front.y - front.displayHeight - 4;
  const signBox = scene.add.graphics();
  framedBox(signBox, artCx - 170, signY - 40, 340, 80, 12, 0xd9483b, 0x2c1c22);
  root.add(signBox);
  root.add(scene.add.text(artCx, signY, '까치 분식', titleStyle(44, 0xfff6e0)).setOrigin(0.5));
  const staff = scene.add.image(artCx + front.displayWidth * 0.28, artBottom + 6, ensureStaff(scene, state.character, 'down', 'stand', { face: 'happy' })).setOrigin(0.5, 1).setScale(2);
  root.add(staff);
  scene.tweens.add({ targets: staff, y: staff.y - 6, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // 설정(톱니)
  root.add(new Button(scene, { x: width - 56, y: 56, width: 72, height: 72, label: '설정', style: 'secondary', palette: p, fontSize: 22, onPress: o.onSettings }));
  // 설정 왼쪽 [게임 방법]: 처음 하는 사람이 조작을 볼 수 있게 (docs/design/261023-02-growth-how-to-play.md §1)
  root.add(new Button(scene, { x: width - 56 - 36 - 12 - 90, y: 56, width: 180, height: 72, label: '게임 방법', style: 'secondary', palette: p, fontSize: 22, onPress: o.onGuide }));

  // 상태 카드
  const cardX = landscape ? 860 : 24;
  const cardW = landscape ? 660 : width - 48;
  const cardY = landscape ? 140 : portraitCardY;
  const card = scene.add.graphics();
  framedBox(card, cardX, cardY, cardW, cardH, 20, p.surface, p.border);
  root.add(card);
  const level = levelOf(state.exp);
  const lx = cardX + 32;
  root.add(scene.add.text(lx, cardY + 50, `${state.day}일째 아침`, titleStyle(40, p.textStrong)).setOrigin(0, 0.5));
  root.add(scene.add.text(cardX + cardW - 32, cardY + 50, won(state.money), textStyle(30, p.textStrong)).setOrigin(1, 0.5));
  const expFrom = expForLevel(level);
  const expTo = expForLevel(level + 1);
  root.add(scene.add.text(lx, cardY + 116, `가게 Lv${level}`, textStyle(26, p.accent)).setOrigin(0, 0.5));
  const bar = scene.add.graphics();
  meter(bar, lx + 150, cardY + 104, cardW - 64 - 150 - 140, 24, (state.exp - expFrom) / (expTo - expFrom), p.surfaceHover, p.accent);
  root.add(bar);
  root.add(scene.add.text(cardX + cardW - 32, cardY + 116, `${num(state.exp)} / ${num(expTo)}`, textStyle(22, p.text2)).setOrigin(1, 0.5));
  const menus = openMenus(level);
  root.add(scene.add.text(lx, cardY + 176, '메뉴', textStyle(22, p.text2)).setOrigin(0, 0.5));
  MENUS.forEach((m, i) => {
    const x = lx + 90 + i * ((cardW - 140) / MENUS.length);
    const icon = scene.add.image(x, cardY + 176, menuIconKey(MENU_ART[i]!));
    if (i >= menus) icon.setAlpha(0.25);
    root.add(icon);
    root.add(scene.add.text(x + 32, cardY + 176, i < menus ? GRADE_NAMES[gradeOf(state.sold[i] ?? 0)]! : `Lv${m.level}`, textStyle(22, i < menus ? p.textStrong : p.text2)).setOrigin(0, 0.5));
  });
  root.add(scene.add.text(lx, cardY + 240, `오늘의 직원 ${STAFF[state.character].name} · ${STAFF[state.character].ability}`, textStyle(22, p.text)).setOrigin(0, 0.5));
  if (state.stats.bestProfit > 0) root.add(scene.add.text(cardX + cardW - 32, cardY + 240, `최고 ${won(state.stats.bestProfit)}`, textStyle(22, p.text2)).setOrigin(1, 0.5));

  // 버튼
  const bx = cardX + cardW / 2;
  let by = landscape ? cardY + cardH + 80 : btnTop + 20;
  if (o.trial) {
    root.add(scene.add.text(bx, by - 30, `체험 중 · ${o.trialHint}`, textStyle(22, p.text2)).setOrigin(0.5));
    by += 20;
  }
  if (o.trial && o.trialUsed) {
    root.add(new Button(scene, { x: bx, y: by + 40, width: cardW, height: 96, label: '로그인하고 저장하기', style: 'primary', palette: p, fontSize: 32, onPress: o.onLogin }));
    root.add(new Button(scene, { x: bx, y: by + 150, width: cardW, height: 80, label: '다시 체험하기', style: 'secondary', palette: p, fontSize: 26, onPress: o.onRetryTrial }));
    return root;
  }
  const start = new Button(scene, { x: bx, y: by + 40, width: cardW, height: 104, label: o.starting ? '문 여는 중…' : '장사 시작', style: 'primary', palette: p, fontSize: 36, onPress: o.onStart });
  start.setEnabled(!o.starting);
  root.add(start);
  const half = (cardW - 16) / 2;
  root.add(new Button(scene, { x: cardX + half / 2, y: by + 160, width: half, height: 84, label: '가게 꾸리기', style: 'secondary', palette: p, fontSize: 26, onPress: o.onUpgrades }));
  const staffBtn = new Button(scene, { x: cardX + cardW - half / 2, y: by + 160, width: half, height: 84, label: '직원 명부', style: 'secondary', palette: p, fontSize: 26, onPress: o.onStaff });
  root.add(staffBtn);
  if (o.newStaff) {
    const dot = scene.add.graphics().fillStyle(0xe0453a, 1).fillRect(staffBtn.x + half / 2 - 28, staffBtn.y - 34, 16, 16);
    root.add(dot);
  }
  return root;
}

// ---------------------------------------------------------------- 정산 화면

export interface SettleScreenOptions extends Base {
  day: number;
  before: ShopState;
  stats: DayStats;
  outcome: DayOutcome;
  status: SettleStatus;
  onRetry(): void;
  onUpgrades(): void;
  onStaff(): void;
  onNextDay(): void;
  onLogin(): void;
  onRetryTrial(): void;
  onPickNew(id: StaffId): void;
}

/** 정산 화면: 돈, 손님, 메뉴, 경험치·레벨업, 새 직원, 저장 상태, 다음 버튼 */
export function buildSettleScreen(o: SettleScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, stats, outcome } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0);
  root.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0));
  const landscape = o.layout === 'landscape';
  const cw = landscape ? 880 : width - 48;
  const cx = width / 2;
  const left = cx - cw / 2 + 32;
  const right = cx + cw / 2 - 32;
  const body = scene.add.container(0, 0);
  root.add(body);
  const card = scene.add.graphics();
  body.add(card);
  body.add(heading(scene, cx, 70, `${o.day}일째 장사 끝`, p));

  let y = 150;
  /** 한 줄: 왼쪽 이름, 오른쪽 값 */
  const row = (label: string, value: string, color = p.textStrong, size = 26) => {
    body.add(scene.add.text(left, y, label, textStyle(size, p.text)).setOrigin(0, 0.5));
    body.add(scene.add.text(right, y, value, textStyle(size, color)).setOrigin(1, 0.5));
    y += size + 22;
  };
  row('음식 값', won(stats.food));
  row('팁', won(stats.tips));
  row('재료비', stats.cost > 0 ? `-${won(stats.cost)}` : won(0), stats.cost > 0 ? 0xc0392b : p.textStrong);
  if (stats.subsidy > 0) row('운영 지원금', won(stats.subsidy), p.text2, 22);
  const line = scene.add.graphics().fillStyle(p.border, 1).fillRect(left, y - 16, right - left, 4);
  body.add(line);
  y += 14;
  row('하루 수익', won(outcome.profit), outcome.profit >= 0 ? p.accent : 0xc0392b, 33);
  const lost = stats.discarded + stats.wasted;
  if (lost > 0) row('버린 음식', `${lost}그릇`, p.text2, 22);
  row('손님', `${stats.guests}명`, p.textStrong, 22);
  body.add(
    scene.add
      .text(left, y, `활짝 ${stats.happy}(최고 ${stats.best}) · 보통 ${stats.normal} · 찡그림 ${stats.sad}${stats.angry ? ` · 화남 ${stats.angry}` : ''}${stats.turnedAway ? ` · 돌아감 ${stats.turnedAway}무리` : ''}`, {
        ...textStyle(22, p.text2),
        wordWrap: { width: right - left },
      })
      .setOrigin(0, 0.5),
  );
  y += 48;
  // 메뉴별 판매: 메뉴마다 두 줄(이름·그릇 수 / 등급 진행)
  const sold = MENUS.map((m, i) => ({ m, i, n: stats.sold[i] ?? 0 })).filter((s) => s.n > 0);
  if (sold.length > 0) {
    body.add(scene.add.text(left, y, '메뉴별 판매', textStyle(22, p.text2)).setOrigin(0, 0.5));
    y += 44;
  }
  sold.forEach((s) => {
    body.add(scene.add.image(left + 27, y + 22, menuIconKey(MENU_ART[s.i]!)));
    body.add(scene.add.text(left + 62, y, s.m.name, textStyle(26, p.textStrong)).setOrigin(0, 0.5));
    body.add(scene.add.text(right, y, `${s.n}그릇`, textStyle(26, p.textStrong)).setOrigin(1, 0.5));
    const total = outcome.nextState.sold[s.i] ?? 0;
    const before = gradeOf(o.before.sold[s.i] ?? 0);
    const after = gradeOf(total);
    const more = toNextGrade(total);
    const grade = after > before ? `${GRADE_NAMES[after]}등급으로 올랐어요` : `${GRADE_NAMES[after]}등급`;
    const next = more > 0 ? ` · ${GRADE_NAMES[after + 1]}등급까지 ${more}그릇` : ' · 최고 등급';
    body.add(scene.add.text(left + 62, y + 36, `${grade}${next}`, textStyle(22, after > before ? p.accent : p.text2)).setOrigin(0, 0.5));
    y += 88;
  });
  y += 10;
  // 경험치·레벨
  const levelUp = outcome.levelAfter > outcome.levelBefore;
  row('경험치', `+${num(outcome.exp)}  Lv${outcome.levelBefore}${levelUp ? ` → Lv${outcome.levelAfter}` : ''}`, levelUp ? p.accent : p.textStrong, 22);
  if (levelUp) {
    const opened: string[] = [];
    const menusBefore = openMenus(outcome.levelBefore);
    const menusAfter = openMenus(outcome.levelAfter);
    for (let m = menusBefore; m < menusAfter; m += 1) opened.push(MENUS[m]!.name);
    for (const key of UPGRADE_KEYS) {
      const def = UPGRADES[key];
      if (def.levels.some((lv) => lv > outcome.levelBefore && lv <= outcome.levelAfter && lv > 1)) opened.push(def.name);
    }
    if (opened.length) {
      body.add(scene.add.text(left, y, `새로 열림: ${opened.join(', ')}`, { ...textStyle(22, p.accent), wordWrap: { width: right - left } }).setOrigin(0, 0.5));
      y += 44;
    }
  }
  // 새 직원
  if (outcome.newStaff.length > 0) {
    const id = outcome.newStaff[0]!;
    const box = scene.add.graphics();
    framedBox(box, left - 8, y - 8, right - left + 16, 130, 16, 0xfff3c4, 0xe2ac3a);
    body.add(box);
    const img = scene.add.image(left + 56, y + 116, ensureStaff(scene, id, 'down', 'stand', { face: 'happy' })).setOrigin(0.5, 1).setScale(1.2);
    body.add(img);
    scene.tweens.add({ targets: img, y: img.y - 14, duration: 260, yoyo: true, repeat: 2, delay: 300, ease: 'Quad.easeOut' });
    body.add(scene.add.text(left + 120, y + 30, `새 직원이 왔어요! ${STAFF[id].name}`, textStyle(26, 0x5a3410)).setOrigin(0, 0.5));
    body.add(scene.add.text(left + 120, y + 74, STAFF[id].ability, textStyle(22, 0x8a5a26)).setOrigin(0, 0.5));
    if (o.status.kind === 'saved' || o.status.kind === 'trial') {
      body.add(new Button(scene, { x: right - 110, y: y + 74, width: 200, height: 60, label: '오늘 직원으로', style: 'warm', palette: p, fontSize: 22, onPress: () => o.onPickNew(id) }));
    }
    y += 150;
  }
  // 저장 상태
  const st = o.status;
  const statusText =
    st.kind === 'saving'
      ? '저장하는 중…'
      : st.kind === 'saved'
        ? `저장했어요${st.best.allTime ? ' · 최고 수익' : ''}${st.rank ? ` · 전체 ${num(st.rank)}위` : ''}`
        : st.kind === 'failed'
          ? '저장하지 못했어요. 연결을 확인하고 다시 보내 주세요'
          : st.kind === 'rejected'
            ? st.message
            : '체험이라 저장되지 않아요';
  body.add(scene.add.text(cx, y + 10, statusText, { ...textStyle(22, st.kind === 'failed' || st.kind === 'rejected' ? 0xc0392b : p.text2), align: 'center', wordWrap: { width: cw - 64 } }).setOrigin(0.5));
  y += 70;
  framedBox(card, cx - cw / 2, 120, cw, y - 120, 20, p.surface, p.border);

  // 버튼은 아래에 고정하고 카드만 스크롤한다
  const st2 = st.kind;
  const bw = cw;
  const footH = st2 === 'saving' ? 24 : st2 === 'failed' ? 144 : 266;
  root.add(attachScroll({ scene, body, top: 0, contentH: y + 24, bottom: height - footH, width, height, color: p.bg, thumb: p.border }));
  const by = height - footH + 16;
  if (st2 === 'failed') {
    root.add(new Button(scene, { x: cx, y: by + 48, width: bw, height: 96, label: '다시 보내기', style: 'primary', palette: p, fontSize: 32, onPress: o.onRetry }));
    return root;
  }
  if (st2 === 'saving') return root;
  if (st2 === 'trial') {
    root.add(new Button(scene, { x: cx, y: by + 48, width: bw, height: 96, label: '로그인하고 저장하기', style: 'primary', palette: p, fontSize: 32, onPress: o.onLogin }));
    root.add(new Button(scene, { x: cx, y: by + 158, width: bw, height: 80, label: '다시 체험하기', style: 'secondary', palette: p, fontSize: 26, onPress: o.onRetryTrial }));
    return root;
  }
  root.add(new Button(scene, { x: cx, y: by + 48, width: bw, height: 96, label: '다음 날 장사', style: 'primary', palette: p, fontSize: 32, onPress: o.onNextDay }));
  const half = (bw - 16) / 2;
  root.add(new Button(scene, { x: cx - bw / 2 + half / 2, y: by + 158, width: half, height: 80, label: '가게 꾸리기', style: 'secondary', palette: p, fontSize: 26, onPress: o.onUpgrades }));
  root.add(new Button(scene, { x: cx + bw / 2 - half / 2, y: by + 158, width: half, height: 80, label: '직원 명부', style: 'secondary', palette: p, fontSize: 26, onPress: o.onStaff }));
  return root;
}

// ---------------------------------------------------------------- 가게 꾸리기

export interface UpgradeScreenOptions extends Base {
  state: ShopState;
  trial: boolean;
  buying: UpgradeKey | null;
  onBuy(key: UpgradeKey): void;
  onBack(): void;
}

/** 강화의 지금 → 다음 효과 한 줄 */
function effectText(key: UpgradeKey, state: ShopState): string {
  const now = dayParams(state);
  const step = state.upgrades[key];
  const next = dayParams({ ...state, upgrades: { ...state.upgrades, [key]: Math.min(step + 1, upgradeMax(key)) } });
  const arrow = (a: string, b: string) => (step >= upgradeMax(key) ? a : `${a} → ${b}`);
  switch (key) {
    case 'tables':
      return arrow(`테이블 ${now.tables}개`, `${next.tables}개`);
    case 'tray':
      return arrow(`쟁반 ${now.traySlots}칸`, `${next.traySlots}칸`);
    case 'shoes':
      return arrow(`한 칸 ${(now.step / 60).toFixed(2)}초`, `${(next.step / 60).toFixed(2)}초`);
    case 'stove':
      return arrow(`김밥 연타 ${now.taps[1]}번`, `${next.taps[1]}번`);
    case 'jug':
      return arrow(`물·단무지 ${now.waterSets}세트`, `${next.waterSets}세트`);
    case 'interior':
      return arrow(`기다림 +${now.patiencePlus}%`, `+${next.patiencePlus}%`);
    case 'sign':
      return arrow(`손님 간격 -${8 * state.upgrades.sign}%`, `-${8 * Math.min(state.upgrades.sign + 1, 5)}%`);
  }
}

/** 강화 그림 */
function upgradeIcon(scene: Phaser.Scene, key: UpgradeKey): string {
  switch (key) {
    case 'tables':
      return propKey('table');
    case 'tray':
      return trayKey(4);
    case 'shoes':
      return ensureStaff(scene, 'runner', 'right', 'walkA');
    case 'stove':
      return stationKey('tteok');
    case 'jug':
      return stationKey('water');
    case 'interior':
      return propKey('window');
    case 'sign':
      return propKey('menuBoard');
  }
}

/** 가게 꾸리기: 강화 7종 카드 (그림·단계 점·지금 → 다음·비용 버튼) */
export function buildUpgradeScreen(o: UpgradeScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, state } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0);
  root.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0));
  root.add(heading(scene, width / 2, 64, '가게 꾸리기', p));
  root.add(scene.add.text(width / 2, 120, `가진 돈 ${won(state.money)}`, textStyle(26, p.textStrong)).setOrigin(0.5));
  const landscape = o.layout === 'landscape';
  const cols = landscape ? 2 : 1;
  const gap = 16;
  const cardW = landscape ? (width - 96 - gap) / 2 : width - 48;
  const cardH = landscape ? 150 : 120;
  const top = 160;
  UPGRADE_KEYS.forEach((key, i) => {
    const col = i % cols;
    const rowI = Math.floor(i / cols);
    const x = (landscape ? 48 : 24) + col * (cardW + gap);
    const y = top + rowI * (cardH + gap);
    const def = UPGRADES[key];
    const step = state.upgrades[key];
    const max = upgradeMax(key);
    const card = scene.add.graphics();
    framedBox(card, x, y, cardW, cardH, 16, p.surface, p.border);
    root.add(card);
    const icon = scene.add.image(x + 64, y + cardH / 2, upgradeIcon(scene, key));
    icon.setScale(Math.min(2, 88 / Math.max(icon.width, icon.height)));
    root.add(icon);
    root.add(scene.add.text(x + 128, y + 32, def.name, textStyle(26, p.textStrong)).setOrigin(0, 0.5));
    const dots = scene.add.graphics();
    for (let d = 0; d < max; d += 1) dots.fillStyle(d < step ? p.accent : p.surfaceHover, 1).fillRect(x + 128 + d * 22, y + 58, 16, 16);
    root.add(dots);
    root.add(scene.add.text(x + 128, y + cardH - 30, effectText(key, state), textStyle(22, p.text)).setOrigin(0, 0.5));
    const check = upgradeCheck(state, key);
    const label = step >= max ? '최대' : `${won(def.costs[step]!)}`;
    const sub = check.ok ? undefined : check.reason === 'locked' ? `Lv${check.level}부터` : check.reason === 'no_money' ? '돈 부족' : undefined;
    const btn = new Button(scene, {
      x: x + cardW - 110,
      y: y + cardH / 2,
      width: 190,
      height: 80,
      label: o.buying === key ? '사는 중…' : label,
      ...(o.trial ? { sub: '로그인 필요' } : sub ? { sub } : {}),
      style: check.ok ? 'primary' : 'secondary',
      palette: p,
      fontSize: 24,
      onPress: () => o.onBuy(key),
    });
    btn.setEnabled(check.ok && !o.trial && o.buying === null);
    root.add(btn);
  });
  const rows = Math.ceil(UPGRADE_KEYS.length / cols);
  const backY = Math.min(height - 70, top + rows * (cardH + gap) + 60);
  root.add(new Button(scene, { x: width / 2, y: backY, width: Math.min(560, width - 48), height: 76, label: '가게로', style: 'secondary', palette: p, fontSize: 28, onPress: o.onBack }));
  root.add(scene.add.text(width / 2, height - 6, '글꼴: 던파 비트비트체 v2(넥슨), 갈무리11', textStyle(22, p.text2)).setOrigin(0.5, 1).setAlpha(0.7));
  return root;
}

// ---------------------------------------------------------------- 직원 명부

export interface StaffScreenOptions extends Base {
  state: ShopState;
  trial: boolean;
  picking: StaffId | null;
  onPick(id: StaffId): void;
  onBack(): void;
}

/** 직원 명부: 열린 직원은 그림·이름·능력·[고르기], 잠긴 직원은 실루엣·"???"·조건·진행 막대 */
export function buildStaffScreen(o: StaffScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p, state } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0);
  root.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0));
  root.add(heading(scene, width / 2, 64, '직원 명부', p));
  root.add(scene.add.text(width / 2, 118, `${state.unlocked.length} / ${STAFF_IDS.length}명`, textStyle(26, p.text2)).setOrigin(0.5));
  if (o.trial) root.add(scene.add.text(width / 2, 156, '체험이라 고른 직원은 저장되지 않아요', textStyle(22, p.text2)).setOrigin(0.5));
  const landscape = o.layout === 'landscape';
  const cols = landscape ? 5 : 3;
  const gap = 12;
  const cardW = (width - 48 - gap * (cols - 1)) / cols;
  const cardH = landscape ? 330 : 308;
  const top = 184;
  STAFF_IDS.forEach((id, i) => {
    const x = 24 + (i % cols) * (cardW + gap);
    const y = top + Math.floor(i / cols) * (cardH + gap);
    const open = state.unlocked.includes(id);
    const today = state.character === id;
    const card = scene.add.graphics();
    framedBox(card, x, y, cardW, cardH, 16, today ? 0xfff3c4 : p.surface, today ? 0xe2ac3a : p.border);
    root.add(card);
    const img = scene.add.image(x + cardW / 2, y + 140, ensureStaff(scene, id, 'down', 'stand', { face: open ? 'happy' : 'normal' })).setOrigin(0.5, 1).setScale(1.3);
    root.add(img);
    const staff = STAFF[id];
    if (open) {
      scene.tweens.add({ targets: img, y: img.y - 5, duration: 380, yoyo: true, repeat: -1, delay: i * 90, ease: 'Sine.easeInOut' });
      root.add(scene.add.text(x + cardW / 2, y + 170, staff.name, textStyle(26, today ? 0x5a3410 : p.textStrong)).setOrigin(0.5));
      root.add(scene.add.text(x + cardW / 2, y + 222, staff.ability, { ...textStyle(22, today ? 0x8a5a26 : p.text2), align: 'center', wordWrap: { width: cardW - 24 } }).setOrigin(0.5));
      if (today) root.add(scene.add.text(x + cardW / 2, y + cardH - 40, '오늘 직원', textStyle(22, 0x8a5a26)).setOrigin(0.5));
      else {
        const btn = new Button(scene, { x: x + cardW / 2, y: y + cardH - 44, width: cardW - 32, height: 64, label: o.picking === id ? '고르는 중…' : '고르기', style: 'primary', palette: p, fontSize: 22, onPress: () => o.onPick(id) });
        btn.setEnabled(o.picking === null);
        root.add(btn);
      }
    } else {
      // 다크 모드에서는 바탕이 어두워 실루엣을 조금 밝게
      img.setTint(p.dark ? 0x4a4458 : 0x2a2230).setTintMode(Phaser.TintModes.FILL).setAlpha(0.85);
      root.add(scene.add.text(x + cardW / 2, y + 170, '???', textStyle(26, p.text2)).setOrigin(0.5));
      root.add(scene.add.text(x + cardW / 2, y + 218, staff.condition, { ...textStyle(22, p.text), align: 'center', wordWrap: { width: cardW - 24 } }).setOrigin(0.5));
      const { current, goal } = unlockProgress(state, id);
      const bar = scene.add.graphics();
      meter(bar, x + 16, y + cardH - 70, cardW - 32, 20, current / goal, p.surfaceHover, p.accent);
      root.add(bar);
      root.add(scene.add.text(x + cardW / 2, y + cardH - 30, `${num(Math.min(current, goal))} / ${num(goal)}`, textStyle(22, p.text2)).setOrigin(0.5));
    }
  });
  const rows = Math.ceil(STAFF_IDS.length / cols);
  const backY = Math.min(height - 64, top + rows * (cardH + gap) + 56);
  root.add(new Button(scene, { x: width / 2, y: backY, width: Math.min(560, width - 48), height: 84, label: '가게로', style: 'secondary', palette: p, fontSize: 28, onPress: o.onBack }));
  return root;
}
