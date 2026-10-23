// 분식집 장면. 화면(가게 → 장사 → 정산 → 가게 꾸리기·직원 명부)을 바꾸고, 장사 중에는 실제 흐른 시간만큼 하루를 틱 단위로 진행한다.
// 저장은 셸이 넘긴 창구(GrowthSession)로만 한다. 규칙 판정은 logic이 한다.
// 근거: docs/design/261022-09-snack-bar.md §3, §8, docs/design/261021-04-game-save.md §6-2

import Phaser from 'phaser';
import { TICKS_PER_SECOND, type SaveSnapshot } from '@magpie/shared';
import type { GrowthSession, PlayResult } from '@magpie/shared/game-module';
import {
  MAX_INPUTS,
  MAX_TICKS,
  OP,
  advance,
  applyInput,
  applyShopAction,
  createDay,
  initialShopState,
  settleDay,
  type DayOutcome,
  type DaySim,
  type DayStats,
  type InputResult,
  type ShopState,
  type SnackInput,
  type StaffId,
  type UpgradeKey,
} from '../logic/rules';
import { DayView } from './DayView';
import { buildGuidePanel } from './guide';
import { buildLicenseScreen } from './licenses';
import { canvasSize, type Layout } from './layout';
import { REJECT_TEXT, buildSettleScreen, buildShopScreen, buildStaffScreen, buildUpgradeScreen, type SettleStatus } from './screens';
import { buildSettingsPanel, buildSoundControls } from './settings';
import type { Sfx } from './sound';
import { bakeSprites, drawGallery } from './sprites';
import { framedBox, roundBox } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 세로 배치 높이가 이만큼 이상 달라질 때만 다시 그린다 */
const STAGE_HEIGHT_STEP = 16;

export interface SnackBarSceneOptions {
  layout: Layout;
  palette: ScenePalette;
  sfx: Sfx;
  session: GrowthSession;
  save: SaveSnapshot;
  /** 개발용 그림 보기(?sprites) */
  gallery?: boolean;
  onDayActive?(active: boolean): void;
  /** 게임 안 설정에서 소리를 바꿨다 (셸이 저장한다) */
  onSoundChange?(muted: boolean, volume: number): void;
}

type Screen = 'shop' | 'upgrades' | 'staff' | 'day' | 'settle';

/** 진행 중인 하루 */
interface DayRun {
  seed: string;
  sim: DaySim;
  inputs: SnackInput[];
  /** 멈춘 시간을 뺀 경과 시간(ms) */
  elapsed: number;
  paused: boolean;
  ended: boolean;
  view: DayView | null;
}

/** 정산 중인 하루 */
interface Settlement {
  day: number;
  before: ShopState;
  stats: DayStats;
  outcome: DayOutcome;
  status: SettleStatus;
  result: PlayResult<SnackInput>;
}

/** 가게 행동 실패 사유의 안내 */
const ACT_TEXT: Record<string, string> = {
  no_money: '돈이 모자라요',
  locked: '아직 열리지 않았어요',
  max_level: '이미 최대예요',
  trial: '로그인하면 할 수 있어요',
};

export class SnackBarScene extends Phaser.Scene {
  private readonly opts: SnackBarSceneOptions;
  private layout: Layout;
  private save: SaveSnapshot<ShopState>;
  private screen: Screen = 'shop';
  private screenRoot: Phaser.GameObjects.Container | null = null;
  private run: DayRun | null = null;
  private settlement: Settlement | null = null;
  private starting = false;
  private buying: UpgradeKey | null = null;
  private picking: StaffId | null = null;
  private trialUsed = false;
  /** 명부를 아직 안 본 새 직원 (화면에서만 기억) */
  private newStaff = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private settingsLayer: Phaser.GameObjects.Container | null = null;
  /** 설정 창 위 오픈소스 라이선스 화면과 보던 원문(null이면 목록) */
  private licenseLayer: Phaser.GameObjects.Container | null = null;
  private license: { item: number | null } | null = null;
  /** 게임 방법 창과 그 상태(연 곳, 보던 쪽). 배치를 다시 그려도 같은 쪽을 다시 연다 */
  private guideLayer: Phaser.GameObjects.Container | null = null;
  private guide: { from: 'shop' | 'pause'; page: number } | null = null;
  /** 1일째 가게 화면에서 게임 방법을 저절로 열었는지 (게임을 열 때마다 한 번) */
  private guideShown = false;
  private toastBox: Phaser.GameObjects.Container | null = null;

  constructor(opts: SnackBarSceneOptions) {
    super('snack-bar');
    this.opts = opts;
    this.layout = opts.layout;
    this.save = opts.save as SaveSnapshot<ShopState>;
  }

  /** 도트 그림을 굽고 가게 화면을 띄운다 */
  create(): void {
    bakeSprites(this);
    if (this.opts.gallery) {
      drawGallery(this);
      return;
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const run = this.activeRun();
      if (run) run.view!.pointerDown(p, over, run.sim);
    });
    this.show('shop');
  }

  /** 입력을 받을 수 있는 하루 */
  private activeRun(): DayRun | null {
    const run = this.run;
    return run && run.view && !run.paused && !run.ended ? run : null;
  }

  /** 실제로 흐른 시간만큼 하루를 진행한다 (멈춘 동안은 흐르지 않는다) */
  override update(_time: number, delta: number): void {
    const run = this.run;
    if (!run || !run.view || run.ended) return;
    let frac = 0;
    if (!run.paused) {
      // 한 프레임이 크게 늦어도 한꺼번에 많이 진행하지 않는다. 게임 시간이 실제보다 느린 것은 서버가 허용한다
      run.elapsed += Math.min(delta, 250);
      const exact = (run.elapsed * TICKS_PER_SECOND) / 1000;
      const target = Math.min(MAX_TICKS, Math.floor(exact));
      while (run.sim.tick < target && run.sim.phase !== 'closed') advance(run.sim);
      frac = Math.min(1, Math.max(0, exact - run.sim.tick));
      if (run.sim.phase !== 'closed') run.view.update(run.sim);
    }
    const events = run.sim.events;
    if (events && events.length > 0) run.view.handleEvents(events.splice(0), run.sim);
    run.view.render(run.sim, frac);
    if (run.sim.phase === 'closed') this.closeDay(run);
  }

  /** 무대 크기가 바뀌었다(회전, 주소창, 창 크기). 배치나 세로 높이가 달라지면 캔버스 크기를 바꾸고 지금 화면을 다시 그린다 */
  setStage(layout: Layout, aspect?: number): void {
    // 장면이 아직 뜨기 전(첫 크기 알림)이면 처음 크기 그대로 둔다
    if (!this.scale) return;
    const { width, height } = canvasSize(layout, aspect);
    if (layout === this.layout && Math.abs(height - this.scale.height) < STAGE_HEIGHT_STEP) return;
    this.layout = layout;
    this.scale.setGameSize(width, height);
    if (this.opts.gallery) return;
    const guide = this.guide;
    const settings = this.settingsLayer !== null;
    const license = this.license;
    this.show(this.screen);
    if (this.run?.paused) this.showPause();
    if (guide) this.openGuide(guide.from, guide.page);
    if (settings) this.openSettings();
    if (license) this.openLicenses(license.item);
  }

  /** 화면이 가려지면(탭·앱 전환) 장사를 멈춘다 */
  onHidden(): void {
    if (this.run && !this.run.ended && !this.run.paused) this.pauseDay();
  }

  // ---------------------------------------------------------------- 화면

  /** 화면을 바꾼다 */
  private show(screen: Screen): void {
    this.screen = screen;
    this.screenRoot?.destroy();
    this.screenRoot = null;
    this.run?.view?.destroy();
    if (this.run) this.run.view = null;
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.closeSettings();
    this.closeGuide();
    const { palette } = this.opts;
    const trial = this.opts.session.mode === 'trial';
    const base = { scene: this as Phaser.Scene, layout: this.layout, palette };
    switch (screen) {
      case 'shop':
        this.screenRoot = buildShopScreen({
          ...base,
          state: this.save.state,
          trial,
          trialUsed: this.trialUsed,
          starting: this.starting,
          trialHint: this.opts.session.trialHint ?? '로그인하면 가게가 저장돼요',
          newStaff: this.newStaff,
          onStart: () => void this.startDay(),
          onSettings: () => this.click(() => this.openSettings()),
          onGuide: () => this.click(() => this.openGuide('shop', 0)),
          onUpgrades: () => this.click(() => this.show('upgrades')),
          onStaff: () => this.click(() => this.openStaff()),
          onLogin: () => this.opts.session.requestLogin(),
          onRetryTrial: () => this.click(() => this.retryTrial()),
        });
        // 처음 하는 날(1일째)은 게임 방법을 한 번 저절로 연다
        if (this.save.state.day === 1 && !this.guideShown && !this.starting) {
          this.guideShown = true;
          this.openGuide('shop', 0);
        }
        break;
      case 'upgrades':
        this.screenRoot = buildUpgradeScreen({ ...base, state: this.save.state, trial, buying: this.buying, onBuy: (key) => void this.buy(key), onBack: () => this.click(() => this.backToShop()) });
        break;
      case 'staff':
        this.screenRoot = buildStaffScreen({ ...base, state: this.save.state, trial, picking: this.picking, onPick: (id) => void this.pick(id), onBack: () => this.click(() => this.backToShop()) });
        break;
      case 'settle': {
        const s = this.settlement;
        if (!s) return this.show('shop');
        this.screenRoot = buildSettleScreen({
          ...base,
          day: s.day,
          before: s.before,
          stats: s.stats,
          outcome: s.outcome,
          status: s.status,
          onRetry: () => void this.submitDay(),
          onUpgrades: () => this.click(() => this.show('upgrades')),
          onStaff: () => this.click(() => this.openStaff()),
          onNextDay: () => {
            this.settlement = null;
            void this.startDay();
          },
          onLogin: () => this.opts.session.requestLogin(),
          onRetryTrial: () => this.click(() => this.retryTrial()),
          onPickNew: (id) => void this.pick(id, 'settle'),
        });
        break;
      }
      case 'day': {
        const run = this.run;
        if (!run) return this.show('shop');
        run.view = new DayView(this, this.layout, this.scale.height, palette, this.opts.sfx, run.sim, {
          move: (dir) => this.input1(OP.move, dir),
          act: () => this.input1(OP.act, 0),
          give: (slot) => this.input1(OP.give, slot),
          pause: () => this.pauseDay(),
        });
        break;
      }
    }
  }

  /** 버튼 소리를 내고 동작한다 */
  private click(fn: () => void): void {
    this.opts.sfx.unlock();
    this.opts.sfx.click();
    fn();
  }

  /** 정산을 마치고 가게로 */
  private backToShop(): void {
    this.settlement = null;
    this.show('shop');
  }

  /** 직원 명부를 연다 (새 직원 점은 사라진다) */
  private openStaff(): void {
    this.newStaff = false;
    this.show('staff');
  }

  /** 체험을 처음부터 다시 */
  private retryTrial(): void {
    this.save = { version: 0, state: initialShopState() };
    this.trialUsed = false;
    this.settlement = null;
    this.show('shop');
  }

  /** 소리 설정을 바꿨다: 셸에 알려 저장하게 한다 */
  private soundChanged(muted: boolean, volume: number): void {
    this.opts.onSoundChange?.(muted, volume);
  }

  /** 설정 창을 연다 (가게 화면) */
  private openSettings(): void {
    this.closeSettings();
    this.settingsLayer = buildSettingsPanel(
      this,
      this.opts.palette,
      this.opts.sfx,
      (m, v) => this.soundChanged(m, v),
      () => this.closeSettings(),
      () => this.click(() => this.openLicenses(null)),
    );
  }

  /** 설정 창을 닫는다 (위에 뜬 라이선스 화면도) */
  private closeSettings(): void {
    this.closeLicenses();
    this.settingsLayer?.destroy();
    this.settingsLayer = null;
  }

  /** 오픈소스 라이선스 화면을 연다 (설정 창 위). 닫으면 설정 창으로 돌아간다 */
  private openLicenses(item: number | null): void {
    this.closeLicenses();
    const license = { item };
    this.license = license;
    this.licenseLayer = buildLicenseScreen({
      scene: this,
      palette: this.opts.palette,
      sfx: this.opts.sfx,
      item,
      // 설정 창(150)보다 위
      depth: 170,
      onItem: (i) => (license.item = i),
      onClose: () => this.closeLicenses(),
    });
  }

  /** 오픈소스 라이선스 화면을 닫는다 */
  private closeLicenses(): void {
    this.licenseLayer?.destroy();
    this.licenseLayer = null;
    this.license = null;
  }

  /** 게임 방법 창을 연다. 멈춤 창에서 열면 닫을 때 멈춤 창으로 돌아간다(시간은 계속 멈춰 있다) */
  private openGuide(from: 'shop' | 'pause', page: number): void {
    this.closeGuide();
    const guide = { from, page };
    this.guide = guide;
    this.guideLayer = buildGuidePanel({
      scene: this,
      palette: this.opts.palette,
      sfx: this.opts.sfx,
      page,
      lastLabel: from === 'pause' ? '멈춤 창으로' : '닫기',
      // 멈춤 창(5000)보다 위
      depth: 5100,
      onPage: (p) => (guide.page = p),
      onClose: () => this.click(() => this.closeGuide()),
    });
  }

  /** 게임 방법 창을 닫는다 */
  private closeGuide(): void {
    this.guideLayer?.destroy();
    this.guideLayer = null;
    this.guide = null;
  }

  /** 화면 위쪽에 잠깐 뜨는 안내 */
  private toast(message: string): void {
    this.toastBox?.destroy();
    const { width } = this.scale;
    const text = this.add.text(0, 0, message, textStyle(26, 0xffffff)).setOrigin(0.5);
    const w = text.width + 56;
    const bg = roundBox(this.add.graphics(), -w / 2, -32, w, 64, 32, 0x1f1d1c, 0.92);
    const box = this.add.container(width / 2, 150, [bg, text]).setDepth(5000).setAlpha(0);
    this.toastBox = box;
    this.tweens.add({ targets: box, alpha: 1, y: 130, duration: 200 });
    this.tweens.add({ targets: box, alpha: 0, delay: 2200, duration: 300, onComplete: () => box.destroy() });
  }

  // ---------------------------------------------------------------- 하루

  /** 장사 시작: 서버에서 하루를 열어 시드를 받는다 */
  private async startDay(): Promise<void> {
    if (this.starting) return;
    this.click(() => undefined);
    this.starting = true;
    this.show('shop');
    try {
      const { seed } = await this.opts.session.startDay();
      const sim = createDay(this.save.state, seed, true);
      this.run = { seed, sim, inputs: [], elapsed: 0, paused: false, ended: false, view: null };
      this.starting = false;
      this.opts.onDayActive?.(true);
      this.show('day');
    } catch (err) {
      console.warn('[snack-bar] 장사를 시작하지 못했다', err);
      this.starting = false;
      this.show('shop');
      this.toast('장사를 시작하지 못했어요. 잠시 뒤 다시 해 주세요');
    }
  }

  /** 입력을 지금 틱에 적용하고, 받아들여지면 기록한다. 장사 중이 아니면 사유 inactive로 실패 */
  private input1(op: number, arg: number): InputResult {
    const run = this.activeRun();
    if (!run || run.sim.phase === 'closed' || run.inputs.length >= MAX_INPUTS) return { ok: false, reason: 'inactive' };
    const result = applyInput(run.sim, op, arg);
    if (result.ok) run.inputs.push([run.sim.tick, op, arg]);
    return result;
  }

  /** 멈춤: 시간을 멈춘다 */
  private pauseDay(): void {
    const run = this.run;
    if (!run || run.ended || run.paused) return;
    run.view?.releaseAll();
    run.paused = true;
    this.showPause();
  }

  /** 멈춤 창 (소리 줄 포함) */
  private showPause(): void {
    this.pauseLayer?.destroy();
    const { width, height } = this.scale;
    const p = this.opts.palette;
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
    const cw = Math.min(560, width - 80);
    // [게임 방법] 단추(96)만큼 길다
    const ch = 736;
    const top = height / 2 - ch / 2;
    const card = framedBox(this.add.graphics(), width / 2 - cw / 2, top, cw, ch, 28, p.surface, p.border);
    const title = this.add.text(width / 2, top + 70, '잠깐 쉬는 중', titleStyle(40, p.textStrong)).setOrigin(0.5);
    const note = this.add.text(width / 2, top + 140, '멈춘 동안은 시간이 흐르지 않아요.\n그만두면 오늘 장사는 저장되지 않아요.', { ...textStyle(22, p.text2), align: 'center' }).setOrigin(0.5);
    const sound = buildSoundControls(this, { x: width / 2, y: top + 230, width: cw - 80, palette: p, sfx: this.opts.sfx, onChange: (m, v) => this.soundChanged(m, v) });
    const guide = new Button(this, { x: width / 2, y: top + 420, width: cw - 80, height: 76, label: '게임 방법', style: 'secondary', palette: p, fontSize: 26, onPress: () => this.click(() => this.openGuide('pause', 0)) });
    const resume = new Button(this, { x: width / 2, y: top + 526, width: cw - 80, height: 96, label: '계속하기', style: 'primary', palette: p, fontSize: 32, onPress: () => this.resumeDay() });
    const quit = new Button(this, { x: width / 2, y: top + 644, width: cw - 80, height: 84, label: '오늘 장사 그만두기', style: 'secondary', palette: p, fontSize: 26, onPress: () => this.quitDay() });
    this.pauseLayer = this.add.container(0, 0, [dim, card, title, note, sound, guide, resume, quit]).setDepth(5000);
  }

  /** 계속하기 */
  private resumeDay(): void {
    const run = this.run;
    if (!run) return;
    this.opts.sfx.unlock();
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    // 멈춘 동안 누른 키(게임 방법 창의 ← → 등)가 다시 이어서 걷지 않게 미뤄 둔 조작을 버린다
    run.view?.releaseAll();
    run.paused = false;
  }

  /** 오늘 장사 그만두기: 그날은 저장하지 않고 가게로 */
  private quitDay(): void {
    this.opts.sfx.click();
    this.run?.view?.destroy();
    this.run = null;
    this.opts.onDayActive?.(false);
    this.show('shop');
  }

  /** 하루가 닫혔다: 정산을 계산하고 잠깐 "마감!"을 보여 준 뒤 정산 화면으로 넘어가 저장한다 */
  private closeDay(run: DayRun): void {
    run.ended = true;
    run.view?.releaseAll();
    const outcome = settleDay(run.sim);
    const trial = this.opts.session.mode === 'trial';
    this.settlement = {
      day: run.sim.base.day,
      before: run.sim.base,
      stats: run.sim.stats,
      outcome,
      status: trial ? { kind: 'trial' } : { kind: 'saving' },
      result: { seed: run.seed, inputs: run.inputs, ticks: run.sim.tick, score: outcome.score },
    };
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, '마감!', titleStyle(72, 0xffffff)).setOrigin(0.5).setDepth(5000);
    label.setStroke('#2c1c22', 12);
    this.opts.sfx.fanfare();
    this.time.delayedCall(1300, () => {
      label.destroy();
      if (this.run !== run) return;
      run.view?.destroy();
      run.view = null;
      this.run = null;
      if (outcome.newStaff.length > 0) this.newStaff = true;
      this.show('settle');
      void this.submitDay();
    });
  }

  /** 끝낸 하루를 보낸다. 통과하면 서버가 준 새 저장으로 바꾼다 */
  private async submitDay(): Promise<void> {
    const s = this.settlement;
    if (!s) return;
    const trial = this.opts.session.mode === 'trial';
    if (!trial) {
      s.status = { kind: 'saving' };
      if (this.screen === 'settle') this.show('settle');
    }
    try {
      const response = await this.opts.session.finishDay(s.result);
      if (response.accepted) {
        if (response.save) this.save = response.save as SaveSnapshot<ShopState>;
        else if (trial) this.save = { version: this.save.version, state: s.outcome.nextState };
        s.status = trial ? { kind: 'trial' } : { kind: 'saved', rank: response.rank.allTime ?? null, best: response.best };
      } else {
        s.status = { kind: 'rejected', message: REJECT_TEXT[response.reason] ?? '이 날은 저장되지 않았어요.' };
        try {
          this.save = (await this.opts.session.load()) as SaveSnapshot<ShopState>;
        } catch (err) {
          console.warn('[snack-bar] 최신 저장을 받지 못했다', err);
        }
      }
      if (trial) this.trialUsed = true;
      if (s.status.kind === 'saved' && s.status.best.allTime) this.opts.sfx.fanfare();
      this.opts.onDayActive?.(false);
    } catch (err) {
      console.warn('[snack-bar] 하루를 보내지 못했다', err);
      s.status = { kind: 'failed' };
    }
    if (this.settlement === s && this.screen === 'settle') this.show('settle');
  }

  // ---------------------------------------------------------------- 가게 행동

  /** 강화를 산다. 서버가 규칙을 확인하고 새 저장을 준다 */
  private async buy(key: UpgradeKey): Promise<void> {
    if (this.buying) return;
    this.opts.sfx.unlock();
    this.buying = key;
    this.show('upgrades');
    try {
      const result = await this.opts.session.act({ op: 'upgrade', key });
      if (result.ok) {
        this.save = result.save as SaveSnapshot<ShopState>;
        this.opts.sfx.upgrade();
      } else {
        if (result.save) this.save = result.save as SaveSnapshot<ShopState>;
        this.opts.sfx.deny();
        this.toast(result.reason === 'conflict' ? '다른 곳에서 가게가 바뀌었어요' : (ACT_TEXT[result.reason] ?? '지금은 살 수 없어요'));
      }
    } catch (err) {
      console.warn('[snack-bar] 강화를 사지 못했다', err);
      this.toast('연결이 불안해요. 잠시 뒤 다시 해 주세요');
    }
    this.buying = null;
    if (this.screen === 'upgrades') this.show('upgrades');
  }

  /** 오늘의 직원을 고른다. 체험이면 저장 없이 이 화면에서만 바꾼다 */
  private async pick(id: StaffId, from: Screen = 'staff'): Promise<void> {
    if (this.picking) return;
    this.opts.sfx.unlock();
    if (this.opts.session.mode === 'trial') {
      const local = applyShopAction(this.save.state, { op: 'pick', id });
      if (local.ok) {
        this.save = { ...this.save, state: local.state };
        this.opts.sfx.upgrade();
      }
      this.show(from);
      return;
    }
    this.picking = id;
    this.show(from);
    try {
      const result = await this.opts.session.act({ op: 'pick', id });
      if (result.ok) {
        this.save = result.save as SaveSnapshot<ShopState>;
        this.opts.sfx.upgrade();
      } else {
        if (result.save) this.save = result.save as SaveSnapshot<ShopState>;
        this.opts.sfx.deny();
        this.toast(result.reason === 'conflict' ? '다른 곳에서 가게가 바뀌었어요' : (ACT_TEXT[result.reason] ?? '지금은 고를 수 없어요'));
      }
    } catch (err) {
      console.warn('[snack-bar] 직원을 고르지 못했다', err);
      this.toast('연결이 불안해요. 잠시 뒤 다시 해 주세요');
    }
    this.picking = null;
    if (this.screen === from) this.show(from);
  }
}
