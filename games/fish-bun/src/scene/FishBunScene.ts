// 붕어빵 가게 장면. 화면(가게 → 장사 → 정산 → 가게 꾸리기)을 바꾸고, 장사 중에는 실제 흐른 시간만큼 하루를 틱 단위로 진행한다.
// 저장은 셸이 넘긴 창구(GrowthSession)로만 한다. 규칙 판정은 logic이 한다.
// 근거: docs/design/261021-01-fish-bun.md §2, §5, docs/design/261021-04-game-save.md §6-2

import Phaser from 'phaser';
import { TICKS_PER_SECOND, type SaveSnapshot } from '@magpie/shared';
import type { GrowthSession, PlayResult } from '@magpie/shared/game-module';
import {
  DAY_TICKS,
  MAX_INPUTS,
  OP,
  advance,
  applyInput,
  createDay,
  initialShopState,
  sellArg,
  settleDay,
  tapArg,
  type DayOutcome,
  type DaySim,
  type DayStats,
  type FishInput,
  type InputResult,
  type Menu,
  type ShopState,
  type UpgradeKey,
} from '../logic/rules';
import type { TextureSet } from './art';
import { DayView } from './DayView';
import { canvasSize, type Layout } from './layout';
import { REJECT_TEXT, buildSettleScreen, buildShopScreen, buildUpgradeScreen, type SettleStatus } from './screens';
import { buildSettingsPanel, buildSoundControls } from './settings';
import type { Sfx } from './sound';
import { framedBox, roundBox } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 세로 배치 높이가 이만큼 이상 달라질 때만 다시 그린다 (게임 단위, 주소창이 조금 움직일 때 깜빡이지 않게) */
const STAGE_HEIGHT_STEP = 16;

export interface FishBunSceneOptions {
  layout: Layout;
  palette: ScenePalette;
  textures: TextureSet;
  sfx: Sfx;
  session: GrowthSession;
  save: SaveSnapshot;
  onDayActive?(active: boolean): void;
  /** 게임 안 설정에서 소리를 바꿨다 (셸이 저장한다) */
  onSoundChange?(muted: boolean, volume: number): void;
  /** 하루를 열기 전에 그날 평판에 필요한 것(일본어 글꼴 등)을 받아 둔다 */
  prepareDay?(reputation: number): Promise<void>;
}

type Screen = 'shop' | 'upgrades' | 'day' | 'settle';

/** 진행 중인 하루 */
interface DayRun {
  seed: string;
  sim: DaySim;
  inputs: FishInput[];
  /** 멈춘 시간을 뺀 경과 시간(ms) */
  elapsed: number;
  paused: boolean;
  ended: boolean;
  view: DayView | null;
  /** 고른 반죽 (배치를 바꿔 장사 화면을 다시 그려도 유지) */
  batter: Menu;
}

/** 정산 중인 하루 */
interface Settlement {
  day: number;
  before: ShopState;
  stats: DayStats;
  outcome: DayOutcome;
  status: SettleStatus;
  result: PlayResult<FishInput>;
}

/** 가게 행동 실패 사유의 안내 */
const ACT_TEXT: Record<string, string> = {
  no_money: '돈이 모자라요',
  locked: '평판이 더 필요해요',
  max_level: '이미 최대예요',
  trial: '로그인하면 강화할 수 있어요',
};

export class FishBunScene extends Phaser.Scene {
  private readonly opts: FishBunSceneOptions;
  private layout: Layout;
  private save: SaveSnapshot<ShopState>;
  private screen: Screen = 'shop';
  private screenRoot: Phaser.GameObjects.Container | null = null;
  private run: DayRun | null = null;
  private settlement: Settlement | null = null;
  private starting = false;
  private buying: UpgradeKey | null = null;
  private trialUsed = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  /** 가게 화면의 설정 창 */
  private settingsLayer: Phaser.GameObjects.Container | null = null;
  private toastText: Phaser.GameObjects.Container | null = null;

  constructor(opts: FishBunSceneOptions) {
    super('fish-bun');
    this.opts = opts;
    this.layout = opts.layout;
    this.save = opts.save as SaveSnapshot<ShopState>;
  }

  /** 텍스처를 올리고 가게 화면을 띄운다 */
  create(): void {
    for (const [key, source] of this.opts.textures) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, source);
    }
    // 펌프를 누른 채 빵틀을 누를 수 있게 손가락을 셋까지 받는다
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const run = this.activeRun();
      if (run) run.view!.pointerDown(p, over, run.sim);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const run = this.activeRun();
      if (run) run.view!.pointerMove(p, run.sim);
    });
    const up = (p: Phaser.Input.Pointer) => this.run?.view?.pointerUp(p);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
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
    if (!run.paused) {
      // 한 프레임이 크게 늦어도(탭 전환 직후 등) 한꺼번에 많이 진행하지 않는다. 게임 시간이 실제보다 느린 것은 서버가 허용한다
      run.elapsed += Math.min(delta, 250);
      const target = Math.min(DAY_TICKS, Math.floor((run.elapsed * TICKS_PER_SECOND) / 1000));
      while (run.sim.tick < target && !run.sim.closed) advance(run.sim);
    }
    this.flushEvents(run);
    run.view.render(run.sim);
    if (run.sim.closed) this.closeDay(run);
  }

  /** 로직이 남긴 사건을 화면에 넘긴다 */
  private flushEvents(run: DayRun): void {
    const events = run.sim.events;
    if (events && events.length > 0) run.view?.handleEvents(events.splice(0));
  }

  /**
   * 무대 크기가 바뀌었다(회전, 주소창, 창 크기). 배치(가로·세로)나 세로 배치 높이(화면 비율)가 달라지면
   * 캔버스 크기를 바꾸고 지금 화면을 다시 그린다(장사 중 상태는 그대로). 높이 차이가 작으면 그대로 둔다
   */
  setStage(layout: Layout, aspect?: number): void {
    // 장면이 아직 뜨기 전(첫 크기 알림)이면 create가 처음 크기로 그린다
    if (!this.scale) return;
    const { width, height } = canvasSize(layout, aspect);
    if (layout === this.layout && Math.abs(height - this.scale.height) < STAGE_HEIGHT_STEP) return;
    this.layout = layout;
    this.scale.setGameSize(width, height);
    this.show(this.screen);
    if (this.run?.paused) this.showPause();
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
    const { palette } = this.opts;
    const trial = this.opts.session.mode === 'trial';
    switch (screen) {
      case 'shop':
        this.screenRoot = buildShopScreen({
          scene: this,
          layout: this.layout,
          palette,
          state: this.save.state,
          trial,
          trialUsed: this.trialUsed,
          starting: this.starting,
          trialHint: this.opts.session.trialHint ?? '로그인하면 가게가 저장돼요',
          onStart: () => void this.startDay(),
          onSettings: () => this.click(() => this.openSettings()),
          onUpgrades: () => this.click(() => this.show('upgrades')),
          onLogin: () => this.opts.session.requestLogin(),
          onRetryTrial: () => this.click(() => this.retryTrial()),
        });
        break;
      case 'upgrades':
        this.screenRoot = buildUpgradeScreen({
          scene: this,
          layout: this.layout,
          palette,
          state: this.save.state,
          trial,
          buying: this.buying,
          onBuy: (key) => void this.buy(key),
          onBack: () => this.click(() => this.backToShop()),
        });
        break;
      case 'settle': {
        const s = this.settlement;
        if (!s) return this.show('shop');
        this.screenRoot = buildSettleScreen({
          scene: this,
          layout: this.layout,
          palette,
          day: s.day,
          before: s.before,
          stats: s.stats,
          outcome: s.outcome,
          status: s.status,
          onRetry: () => void this.submitDay(),
          onUpgrades: () => this.click(() => this.show('upgrades')),
          onLogin: () => this.opts.session.requestLogin(),
          onRetryTrial: () => this.click(() => this.retryTrial()),
        });
        break;
      }
      case 'day': {
        const run = this.run;
        if (!run) return this.show('shop');
        run.view = new DayView(
          this,
          this.layout,
          palette,
          this.opts.sfx,
          run.sim,
          {
            tap: (i, menu) => this.tapMold(i, menu),
            pump: (on) => this.setPump(on),
            sell: (seat, extra, menu) => this.sell(seat, extra, menu),
            trash: () => void this.act(OP.trash, 0),
            pause: () => this.pauseDay(),
            batter: (menu) => (run.batter = menu),
          },
          run.batter,
        );
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
    this.settingsLayer = buildSettingsPanel(this, this.opts.palette, this.opts.sfx, (m, v) => this.soundChanged(m, v), () => this.closeSettings());
  }

  /** 설정 창을 닫는다 */
  private closeSettings(): void {
    this.settingsLayer?.destroy();
    this.settingsLayer = null;
  }

  /** 화면 위쪽에 잠깐 뜨는 안내 */
  private toast(message: string): void {
    this.toastText?.destroy();
    const { width } = this.scale;
    const text = this.add.text(0, 0, message, textStyle(26, 0xffffff, '700')).setOrigin(0.5);
    const w = text.width + 56;
    const bg = roundBox(this.add.graphics(), -w / 2, -32, w, 64, 32, 0x1f1d1c, 0.92);
    const box = this.add.container(width / 2, 150, [bg, text]).setDepth(200).setAlpha(0);
    this.toastText = box;
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
      const [{ seed }] = await Promise.all([this.opts.session.startDay(), this.opts.prepareDay?.(this.save.state.reputation)]);
      const sim = createDay(this.save.state, seed, true);
      this.run = { seed, sim, inputs: [], elapsed: 0, paused: false, ended: false, view: null, batter: 0 };
      this.starting = false;
      this.opts.onDayActive?.(true);
      this.show('day');
    } catch (err) {
      console.warn('[fish-bun] 장사를 시작하지 못했다', err);
      this.starting = false;
      this.show('shop');
      this.toast('장사를 시작하지 못했어요. 잠시 뒤 다시 해 주세요');
    }
  }

  /** 입력을 지금 틱에 적용하고, 받아들여지면 기록한다 */
  private act(op: number, arg: number): InputResult | null {
    const run = this.activeRun();
    if (!run || run.sim.closed || run.inputs.length >= MAX_INPUTS) return null;
    const result = applyInput(run.sim, op, arg);
    if (result.ok) run.inputs.push([run.sim.tick, op, arg]);
    return result;
  }

  /** 빵틀 누름. 빈 틀이면 고른 반죽(menu)을 붓고, 굽는 틀·깨진 틀이면 빵틀 번호만 보낸다 */
  private tapMold(index: number, menu: Menu): boolean {
    const mold = this.run?.sim.molds[index];
    const result = this.act(OP.tap, mold?.phase === 'empty' && !mold.broken ? tapArg(index, menu) : index);
    if (result && !result.ok && result.reason !== 'too_fast') this.run?.view?.deniedMold(index, result.reason);
    return result?.ok ?? false;
  }

  /** 펌프 누름·뗌 */
  private setPump(on: boolean): void {
    const run = this.run;
    if (!run || run.ended || run.sim.pumping === on) return;
    this.act(OP.pump, on ? 1 : 0);
  }

  /** 판매: menu 빵을 준다 */
  private sell(seat: number, extra: boolean, menu: Menu): void {
    const result = this.act(OP.sell, sellArg(seat, extra, menu));
    if (result && !result.ok) this.opts.sfx.deny();
  }

  /** 멈춤: 펌프를 놓고 시간을 멈춘다 */
  private pauseDay(): void {
    const run = this.run;
    if (!run || run.ended || run.paused) return;
    run.view?.releaseAll();
    run.paused = true;
    this.opts.sfx.setPumping(false);
    this.opts.sfx.setSizzle(0);
    this.showPause();
  }

  /** 멈춤 창 */
  private showPause(): void {
    this.pauseLayer?.destroy();
    const { width, height } = this.scale;
    const p = this.opts.palette;
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
    const cw = Math.min(560, width - 80);
    // 소리 줄(설정)이 들어가 카드가 길다. 셸 머리줄이 없어서 장사 중 소리는 여기서 바꾼다
    const top = height / 2 - 320;
    const card = framedBox(this.add.graphics(), width / 2 - cw / 2, top, cw, 640, 28, p.surface, p.border);
    const title = this.add.text(width / 2, top + 70, '잠깐 쉬는 중', titleStyle(40, p.textStrong)).setOrigin(0.5);
    const note = this.add
      .text(width / 2, top + 140, '멈춘 동안은 시간이 흐르지 않아요.\n그만두면 오늘 장사는 저장되지 않아요.', {
        ...textStyle(22, p.text2, '600'),
        align: 'center',
      })
      .setOrigin(0.5);
    const sound = buildSoundControls(this, { x: width / 2, y: top + 230, width: cw - 80, palette: p, sfx: this.opts.sfx, onChange: (m, v) => this.soundChanged(m, v) });
    const resume = new Button(this, { x: width / 2, y: top + 430, width: cw - 80, height: 96, label: '계속하기', style: 'primary', palette: p, fontSize: 32, onPress: () => this.resumeDay() });
    const quit = new Button(this, { x: width / 2, y: top + 548, width: cw - 80, height: 84, label: '오늘 장사 그만두기', style: 'secondary', palette: p, fontSize: 26, onPress: () => this.quitDay() });
    this.pauseLayer = this.add.container(0, 0, [dim, card, title, note, sound, resume, quit]).setDepth(150);
  }

  /** 계속하기 */
  private resumeDay(): void {
    const run = this.run;
    if (!run) return;
    this.opts.sfx.unlock();
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    run.paused = false;
  }

  /** 오늘 장사 그만두기: 그날은 저장하지 않고 가게로 (서버의 열린 판은 다음 시작이나 하루 뒤 정리된다) */
  private quitDay(): void {
    this.opts.sfx.click();
    this.run?.view?.releaseAll();
    this.run?.view?.destroy();
    // 그날 입력·정산은 보내지도 남기지도 않는다
    this.run = null;
    this.settlement = null;
    this.opts.sfx.setPumping(false);
    this.opts.sfx.setSizzle(0);
    this.opts.onDayActive?.(false);
    this.show('shop');
  }

  /** 마감: 정산을 계산하고 잠깐 "마감!"을 보여 준 뒤 정산 화면으로 넘어가 저장한다 */
  private closeDay(run: DayRun): void {
    run.ended = true;
    run.view?.releaseAll();
    this.opts.sfx.setPumping(false);
    this.opts.sfx.setSizzle(0);
    const outcome = settleDay(run.sim);
    const trial = this.opts.session.mode === 'trial';
    this.settlement = {
      day: run.sim.base.day,
      before: run.sim.base,
      stats: run.sim.stats,
      outcome,
      status: trial ? { kind: 'trial' } : { kind: 'saving' },
      result: { seed: run.seed, inputs: run.inputs, ticks: DAY_TICKS, score: outcome.score },
    };
    this.time.delayedCall(1300, () => {
      if (this.run !== run) return;
      run.view?.destroy();
      run.view = null;
      this.run = null;
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
        // "게임" 분류라 일간 랭킹이 없다. 순위는 전체 순위
        s.status = trial ? { kind: 'trial' } : { kind: 'saved', rank: response.rank.allTime ?? null, best: response.best };
      } else {
        s.status = { kind: 'rejected', message: REJECT_TEXT[response.reason] ?? '이 날은 저장되지 않았어요.' };
        try {
          this.save = (await this.opts.session.load()) as SaveSnapshot<ShopState>;
        } catch (err) {
          console.warn('[fish-bun] 최신 저장을 받지 못했다', err);
        }
      }
      if (trial) this.trialUsed = true;
      if (s.status.kind === 'saved' && s.status.best.allTime) this.opts.sfx.fanfare();
      this.opts.onDayActive?.(false);
    } catch (err) {
      console.warn('[fish-bun] 하루를 보내지 못했다', err);
      s.status = { kind: 'failed' };
    }
    if (this.settlement === s && this.screen === 'settle') this.show('settle');
  }

  // ---------------------------------------------------------------- 가게 꾸리기

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
      console.warn('[fish-bun] 강화를 사지 못했다', err);
      this.toast('연결이 불안해요. 잠시 뒤 다시 해 주세요');
    }
    this.buying = null;
    if (this.screen === 'upgrades') this.show('upgrades');
  }
}
