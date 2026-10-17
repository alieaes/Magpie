// 게임 안 버튼. 누르는 순간(pointerdown) 바로 동작하고 눌린 모양이 된다(설계 §3-7: 반응이 느리지 않게).

import Phaser from 'phaser';
import { FONT } from './art';
import { hex } from './format';

/** 셸의 CSS 변수에서 읽어 오는 색 (라이트·다크에 따라 다르다) */
export interface ScenePalette {
  bg: number;
  surface: number;
  surfaceHover: number;
  border: number;
  text: number;
  textStrong: number;
  text2: number;
  accent: number;
  buttonBg: number;
  buttonText: number;
  /** 다크 모드인지 */
  dark: boolean;
}

/** 두 색을 섞는다. t = 0이면 a, 1이면 b */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export type ButtonStyle = 'primary' | 'secondary' | 'buy';

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  style: ButtonStyle;
  palette: ScenePalette;
  /** 큰 글자 크기 */
  fontSize?: number;
  onPress(): void;
  /** 꺼진 버튼을 눌렀을 때 */
  onDenied?(): void;
}

export class Button extends Phaser.GameObjects.Container {
  private readonly opts: ButtonOptions;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text | null;
  private enabled = true;
  private hovered = false;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, opts: ButtonOptions) {
    super(scene, opts.x, opts.y);
    this.opts = opts;
    const { width, height, palette } = opts;
    const size = opts.fontSize ?? 30;
    this.bg = scene.add.graphics();
    const textColor = hex(this.textColor());
    this.label = scene.add
      .text(0, opts.sub ? -height * 0.13 : 0, opts.label, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '800', color: textColor })
      .setOrigin(0.5);
    this.sub = opts.sub
      ? scene.add
          .text(0, height * 0.22, opts.sub, {
            fontFamily: FONT,
            fontSize: `${Math.round(size * 0.62)}px`,
            fontStyle: '600',
            color: hex(opts.style === 'primary' ? palette.buttonText : palette.text2),
          })
          .setOrigin(0.5)
      : null;
    this.add([this.bg, this.label, ...(this.sub ? [this.sub] : [])]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hovered = true;
      this.draw();
    });
    this.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.setScale(1);
      this.draw();
    });
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.press());
    this.on(Phaser.Input.Events.POINTER_UP, () => this.setScale(1));
    this.draw();
    scene.add.existing(this);
  }

  /** 글자 색 */
  private textColor(): number {
    const { style, palette } = this.opts;
    return style === 'primary' ? palette.buttonText : palette.textStrong;
  }

  /** 바탕을 다시 그린다 */
  private draw(): void {
    const { width, height, style, palette } = this.opts;
    const g = this.bg.clear();
    const r = Math.min(22, height / 2);
    let fill: number;
    let stroke: number | null = null;
    if (style === 'primary') fill = this.hovered ? mix(palette.buttonBg, palette.accent, 0.25) : palette.buttonBg;
    else if (style === 'buy') {
      fill = this.hovered ? palette.surfaceHover : mix(palette.surface, palette.accent, palette.dark ? 0.1 : 0.06);
      stroke = mix(palette.border, palette.accent, 0.35);
    } else {
      fill = this.hovered ? palette.surfaceHover : palette.surface;
      stroke = palette.border;
    }
    g.fillStyle(fill, 1).fillRoundedRect(-width / 2, -height / 2, width, height, r);
    if (stroke !== null) g.lineStyle(3, stroke, 1).strokeRoundedRect(-width / 2, -height / 2, width, height, r);
    this.setAlpha(this.enabled ? 1 : 0.38);
  }

  /** 누름: 바로 눌린 모양 + 동작 */
  private press(): void {
    this.setScale(0.95);
    if (!this.enabled) {
      this.opts.onDenied?.();
      return;
    }
    this.opts.onPress();
  }

  /** 켜기·끄기 */
  setEnabled(enabled: boolean): this {
    if (this.enabled === enabled) return this;
    this.enabled = enabled;
    this.input!.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.setPulse(false);
    this.draw();
    return this;
  }

  /** 글자를 바꾼다 */
  setText(label: string, sub?: string): this {
    this.label.setText(label);
    if (sub !== undefined) this.sub?.setText(sub);
    return this;
  }

  /** 눈길을 끌도록 살짝 커졌다 작아지기를 반복한다 */
  setPulse(on: boolean): this {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({ targets: this, scale: 1.04, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!on && this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
      this.setScale(1);
    }
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.pulseTween?.stop();
    super.destroy(fromScene);
  }
}
