// 복권 긁기 진입점. 셸(client)이 동적 import해서 mount한다.

import Phaser from 'phaser';
import type { GameModule } from '@magpie/shared/game-module';
import { FONT, buildTextures } from './scene/art';
import { LotteryScene, canvasSize, type Layout } from './scene/LotteryScene';
import { Sfx } from './scene/sound';
import type { ScenePalette } from './scene/ui';

/** 게임 영역이 세로로 길면 패널을 카드 아래로 */
function pickLayout(el: HTMLElement): Layout {
  return el.clientWidth < el.clientHeight * 1.1 ? 'portrait' : 'landscape';
}

/**
 * 셸의 CSS 변수 색을 Phaser 색 숫자로 읽는다. 못 읽으면 fallback.
 * 반투명 색(다크 모드 테두리 등)은 base 색 위에 섞은 결과를 돌려준다.
 */
function cssColor(name: string, fallback: number, base = 0x000000): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  const color = Phaser.Display.Color.ValueToColor(value);
  const a = color.alpha / 255;
  if (a >= 1) return color.color;
  const mix = (c: number, b: number) => Math.round(c * a + b * (1 - a));
  return (mix(color.red, (base >> 16) & 0xff) << 16) | (mix(color.green, (base >> 8) & 0xff) << 8) | mix(color.blue, base & 0xff);
}

/** 지금 테마(라이트·다크)의 패널 색 */
function readPalette(): ScenePalette {
  const bg = cssColor('--bg', 0xf7f7f5);
  const surface = cssColor('--surface', 0xffffff, bg);
  const luminance = ((bg >> 16) & 0xff) * 0.299 + ((bg >> 8) & 0xff) * 0.587 + (bg & 0xff) * 0.114;
  return {
    bg,
    surface,
    surfaceHover: cssColor('--surface-hover', 0xf1f1ef, surface),
    border: cssColor('--border-strong', 0xdcdbd7, surface),
    text: cssColor('--text', 0x37352f, surface),
    textStrong: cssColor('--text-strong', 0x191919, surface),
    text2: cssColor('--text-2', 0x787774, surface),
    accent: cssColor('--accent', 0x0e7c86),
    buttonBg: cssColor('--button-bg', 0x191919),
    buttonText: cssColor('--button-text', 0xffffff),
    dark: luminance < 128,
  };
}

const luckyScratch: GameModule = {
  /** 판을 띄우고 바로 시작한다 */
  async mount(parent, options) {
    // 소리는 "시작"을 누른 직후(사용자 동작 안)에 열어야 브라우저가 막지 않는다
    const sfx = new Sfx(options.muted ?? false, options.volume ?? 1);
    sfx.unlock();
    // 카드 글자를 캔버스에 그리기 전에 글꼴을 받아 둔다
    await Promise.all(
      ['900 56px', '800 48px', '600 24px', '500 19px'].map((f) => document.fonts.load(`${f} ${FONT}`, '까치즉석복권0123456789원').catch(() => undefined)),
    );
    const textures = await buildTextures();

    const palette = readPalette();
    const layout = pickLayout(parent);
    const scene = new LotteryScene({ seed: options.seed, layout, palette, textures, sfx, onHud: options.onHud, onEnd: options.onEnd });
    const { width, height } = canvasSize(layout);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: palette.bg,
      banner: false,
      // 저지연 캔버스: 그리기가 브라우저 합성 단계를 덜 거쳐 포인터를 더 바짝 따라온다 (설계 §3-7)
      render: { desynchronized: true, antialias: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width, height },
      scene,
    });

    // 화면이 가려지면(탭·앱 전환) 그 자리에서 정산한다 (설계 §3-8)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') scene.finish();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 영역 크기가 바뀌면 다시 맞추고, 가로·세로가 바뀌었으면 배치도 바꾼다
    const observer = new ResizeObserver(() => {
      scene.setLayout(pickLayout(parent));
      game.scale.refresh();
    });
    observer.observe(parent);

    return {
      finish: () => scene.finish(),
      setMuted: (muted) => sfx.setMuted(muted),
      setVolume: (volume) => sfx.setVolume(volume),
      destroy: () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        game.destroy(true);
        sfx.destroy();
      },
    };
  },
};

export default luckyScratch;
