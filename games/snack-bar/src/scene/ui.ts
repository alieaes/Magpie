// 게임 안 공통 UI: 셸 색(팔레트), 버튼, 글자 모양, 숫자 형식.
// 버튼은 누르는 순간(pointerdown) 바로 동작하고 눌린 모양이 된다. 글꼴은 갈무리11(11px 격자의 배수), 제목은 던파 비트비트체 v2.
// 근거: docs/design/261022-12-snack-bar-pixel-art.md §4

import Phaser from 'phaser';
import { framedBox, mix, roundBox } from './style';

export { mix } from './style';

/** 게임 안 글꼴 (index.ts에서 불러온다) */
export const FONT = '"Galmuri11", "Pretendard Variable", Pretendard, sans-serif';
/** 제목 글꼴을 문서에 더할 때 쓰는 이름 */
export const TITLE_FAMILY = 'DNFBitBitv2';
/** 제목·큰 숫자 글꼴. 못 받으면 갈무리11로 그린다 */
const TITLE_FONT = `"${TITLE_FAMILY}", ${FONT}`;
/** 도트 글꼴의 격자. 글자 크기를 이 배수로 맞춰야 획이 또렷하다 */
const FONT_GRID = 11;

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
  dark: boolean;
}

/** 색 숫자를 CSS 색 문자열로 */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/** 금액 "12,340원" */
export function won(n: number): string {
  return `${numberFormat.format(n)}원`;
}

/** 숫자에 쉼표 */
export function num(n: number): string {
  return numberFormat.format(n);
}

/** 게임 시계 분(자정부터)을 "오후 2:40"으로 */
export function clockText(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const half = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${String(m).padStart(2, '0')}`;
}

/** 글자 크기: 격자 배수(최소 22px: 휴대폰에서 캔버스가 절반쯤으로 줄어도 읽히게) */
export function fontSize(size: number): number {
  return Math.max(FONT_GRID * 2, Math.round(size / FONT_GRID) * FONT_GRID);
}

/** 글자 모양. 도트 글꼴은 굵은 꼴 하나만 쓴다 */
export function textStyle(size: number, color: number): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${fontSize(size)}px`, fontStyle: 'bold', color: hex(color) };
}

/** 제목·큰 숫자 글자 모양. 보통 꼴 하나뿐이라 굵게(가짜 굵기)를 쓰지 않는다 */
export function titleStyle(size: number, color: number): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: TITLE_FONT, fontSize: `${Math.round(size)}px`, fontStyle: 'normal', color: hex(color) };
}

export type ButtonStyle = 'primary' | 'secondary' | 'warm' | 'ghost';

export interface ButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  style: ButtonStyle;
  palette: ScenePalette;
  fontSize?: number;
  radius?: number;
  onPress(): void;
  /** 꺼진 버튼을 눌렀을 때 */
  onDenied?(): void;
}

/** 가게 그림 위에 놓는 따뜻한 색 버튼 */
const WARM = { fill: 0xffe3a3, hover: 0xffd57a, stroke: 0xc9852b, text: 0x5a3410, sub: 0x8a5a26 } as const;

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
    const { width, height } = opts;
    const size = opts.fontSize ?? 28;
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, opts.sub ? -height * 0.14 : 0, opts.label, textStyle(size, this.textColor())).setOrigin(0.5);
    this.sub = opts.sub ? scene.add.text(0, height * 0.22, opts.sub, textStyle(Math.round(size * 0.62), this.subColor())).setOrigin(0.5) : null;
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

  /** 큰 글자 색 */
  private textColor(): number {
    const { style, palette } = this.opts;
    if (style === 'primary') return palette.buttonText;
    if (style === 'warm') return WARM.text;
    return palette.textStrong;
  }

  /** 작은 글자 색 */
  private subColor(): number {
    const { style, palette } = this.opts;
    if (style === 'primary') return palette.buttonText;
    if (style === 'warm') return WARM.sub;
    return palette.text2;
  }

  /** 바탕을 다시 그린다 */
  private draw(): void {
    const { width, height, style, palette } = this.opts;
    const g = this.bg.clear();
    const r = this.opts.radius ?? Math.min(20, height / 2);
    let fill: number;
    let stroke: number | null = null;
    if (style === 'primary') fill = this.hovered ? mix(palette.buttonBg, palette.accent, 0.25) : palette.buttonBg;
    else if (style === 'warm') {
      fill = this.hovered ? WARM.hover : WARM.fill;
      stroke = WARM.stroke;
    } else if (style === 'ghost') {
      fill = this.hovered ? palette.surfaceHover : palette.surface;
    } else {
      fill = this.hovered ? palette.surfaceHover : palette.surface;
      stroke = palette.border;
    }
    if (style === 'warm') roundBox(g, -width / 2, -height / 2 + 8, width, height, r, 0x7a4a18, 0.35);
    if (stroke !== null) framedBox(g, -width / 2, -height / 2, width, height, r, fill, stroke);
    else roundBox(g, -width / 2, -height / 2, width, height, r, fill);
    // 위쪽에 밝은 줄 하나 (눌리는 버튼 느낌)
    g.fillStyle(0xffffff, style === 'primary' ? 0.14 : 0.35).fillRect(-width / 2 + 12, -height / 2 + 8, width - 24, 4);
    this.setAlpha(this.enabled ? 1 : 0.4);
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
    if (this.input) this.input.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.setPulse(false);
    this.draw();
    return this;
  }

  /** 모양을 바꾼다 */
  setStyle(style: ButtonStyle): this {
    if (this.opts.style === style) return this;
    this.opts.style = style;
    this.label.setColor(hex(this.textColor()));
    this.sub?.setColor(hex(this.subColor()));
    this.draw();
    return this;
  }

  /** 글자를 바꾼다. 같으면 다시 그리지 않는다 */
  setText(label: string, sub?: string): this {
    if (this.label.text !== label) this.label.setText(label);
    if (sub !== undefined && this.sub && this.sub.text !== sub) this.sub.setText(sub);
    return this;
  }

  /** 눈길을 끌도록 살짝 커졌다 작아지기를 반복한다 */
  setPulse(on: boolean): this {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({ targets: this, scale: 1.05, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
