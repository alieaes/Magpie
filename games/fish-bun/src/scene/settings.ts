// 게임 안 설정: 소리 켜기·끄기와 음량(10칸), 진동 켜기·끄기(진동이 되는 폰만). 가게 화면의 설정 창과 장사 중 멈춤 창이 같이 쓴다.
// 소리는 바꾸면 효과음에 바로 반영하고, 셸에 알려 브라우저에 저장하게 한다(GrowthMountOptions.onSoundChange).
// 진동은 공통 함수(@magpie/shared/haptics)가 직접 저장한다.
// 근거: docs/design/261022-14-growth-play-immersive.md §2, docs/design/261023-01-haptics.md §4

import Phaser from 'phaser';
import { haptic, hapticSupport, hapticsEnabled, setHapticsEnabled } from '@magpie/shared/haptics';
import type { Sfx } from './sound';
import { framedBox, meter } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 음량 한 칸 */
const VOLUME_STEP = 0.1;
/** 설정 줄 사이 간격 */
const ROW_GAP = 84;

/** 진동 줄이 붙는 만큼 늘어나는 높이. 진동이 안 되는 기기(PC 등)는 줄이 없어 0 */
export function hapticsRowHeight(): number {
  return hapticSupport() === 'none' ? 0 : ROW_GAP;
}

export interface SoundControlsOptions {
  /** 가운데 x, 첫 줄 y */
  x: number;
  y: number;
  /** 줄 너비 */
  width: number;
  palette: ScenePalette;
  sfx: Sfx;
  /** 바뀐 값 (음량 0~1) */
  onChange(muted: boolean, volume: number): void;
}

/** 설정 줄: [소리 켜짐/꺼짐], [음량 − 칸 막대 +], (진동이 되면) [진동 켜짐/꺼짐]. 높이 약 150 + hapticsRowHeight() */
export function buildSettingRows(scene: Phaser.Scene, o: SoundControlsOptions): Phaser.GameObjects.Container {
  const { x, y, width, palette: p, sfx } = o;
  const left = x - width / 2;
  const right = x + width / 2;
  const root = scene.add.container(0, 0);
  const rowGap = ROW_GAP;

  root.add(scene.add.text(left, y, '소리', textStyle(26, p.textStrong, '800')).setOrigin(0, 0.5));
  const toggle = new Button(scene, {
    x: right - 90,
    y,
    width: 180,
    height: 64,
    label: '',
    style: 'primary',
    palette: p,
    fontSize: 26,
    onPress: () => apply(!sfx.isMuted(), sfx.getVolume()),
  });
  root.add(toggle);

  const vy = y + rowGap;
  root.add(scene.add.text(left, vy, '음량', textStyle(26, p.textStrong, '800')).setOrigin(0, 0.5));
  const minus = new Button(scene, { x: right - 300, y: vy, width: 64, height: 64, label: '-', style: 'secondary', palette: p, fontSize: 30, onPress: () => step(-1) });
  const plus = new Button(scene, { x: right - 32, y: vy, width: 64, height: 64, label: '+', style: 'secondary', palette: p, fontSize: 30, onPress: () => step(1) });
  const bar = scene.add.graphics();
  root.add([minus, plus, bar]);

  /** 지금 값으로 다시 그린다 */
  const render = () => {
    const muted = sfx.isMuted();
    toggle.setText(muted ? '꺼짐' : '켜짐').setStyle(muted ? 'secondary' : 'primary');
    meter(bar.clear(), right - 258, vy - 14, 194, 28, muted ? 0 : sfx.getVolume(), p.surfaceHover, p.accent);
  };

  /** 값을 바꾸고 알린다 */
  const apply = (muted: boolean, volume: number) => {
    sfx.setVolume(volume);
    sfx.setMuted(muted);
    sfx.click();
    o.onChange(muted, volume);
    render();
  };

  /** 음량을 한 칸 올리거나 내린다. 0이 되면 꺼짐(음량은 기억), 꺼진 상태에서 올리면 기억한 음량으로 켜짐 */
  const step = (dir: 1 | -1) => {
    const volume = sfx.getVolume();
    if (sfx.isMuted()) {
      if (dir > 0) apply(false, Math.max(VOLUME_STEP, volume));
      return;
    }
    const next = Math.round(Math.min(1, Math.max(0, volume + dir * VOLUME_STEP)) * 10) / 10;
    apply(next === 0, next === 0 ? volume : next);
  };

  render();
  if (hapticsRowHeight() > 0) root.add(buildHapticsRow(scene, left, right, vy + rowGap, p, sfx));
  return root;
}

/** 진동 줄: [진동 켜짐/꺼짐]. 켜면 한 번 울려 켜진 것을 손으로 알려 준다 */
function buildHapticsRow(scene: Phaser.Scene, left: number, right: number, y: number, p: ScenePalette, sfx: Sfx): Phaser.GameObjects.Container {
  const label = scene.add.text(left, y, '진동', textStyle(26, p.textStrong, '800')).setOrigin(0, 0.5);
  const toggle = new Button(scene, {
    x: right - 90,
    y,
    width: 180,
    height: 64,
    label: '',
    style: 'primary',
    palette: p,
    fontSize: 26,
    onPress: () => {
      const on = !hapticsEnabled();
      setHapticsEnabled(on);
      sfx.click();
      if (on) haptic('tap');
      render();
    },
  });
  /** 지금 값으로 다시 그린다 */
  const render = () => {
    const on = hapticsEnabled();
    toggle.setText(on ? '켜짐' : '꺼짐').setStyle(on ? 'primary' : 'secondary');
  };
  render();
  return scene.add.container(0, 0, [label, toggle]);
}

/** 가게 화면의 설정 창: 어둡게 덮고 가운데에 설정 줄과 [닫기] */
export function buildSettingsPanel(
  scene: Phaser.Scene,
  palette: ScenePalette,
  sfx: Sfx,
  onChange: (muted: boolean, volume: number) => void,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const p = palette;
  const cw = Math.min(560, width - 80);
  const ch = 420 + hapticsRowHeight();
  const top = height / 2 - ch / 2;
  const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
  dim.on(Phaser.Input.Events.POINTER_DOWN, onClose);
  const card = framedBox(scene.add.graphics(), width / 2 - cw / 2, top, cw, ch, 28, p.surface, p.border);
  // 카드 안을 눌러도 창이 닫히지 않게 막는다
  const blocker = scene.add.rectangle(width / 2, height / 2, cw, ch, 0x000000, 0).setInteractive();
  const title = scene.add.text(width / 2, top + 64, '설정', titleStyle(40, p.textStrong)).setOrigin(0.5);
  const controls = buildSettingRows(scene, { x: width / 2, y: top + 150, width: cw - 80, palette: p, sfx, onChange });
  const close = new Button(scene, { x: width / 2, y: top + ch - 70, width: cw - 80, height: 80, label: '닫기', style: 'secondary', palette: p, fontSize: 28, onPress: onClose });
  return scene.add.container(0, 0, [dim, card, blocker, title, controls, close]).setDepth(150);
}
