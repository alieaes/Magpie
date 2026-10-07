// 사과게임 진입점. 셸(client)이 동적 import해서 mount한다.

import Phaser from 'phaser';
import type { GameModule } from '@magpie/shared/game-module';
import { AppleScene, canvasSize, type Orientation, type ScenePalette } from './scene/AppleScene';

/** 게임 영역이 세로로 길면 판도 세로로 돌린다 */
function pickOrientation(el: HTMLElement): Orientation {
  return el.clientWidth < el.clientHeight ? 'portrait' : 'landscape';
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

/** 지금 테마(라이트·다크)의 판 색 */
function readPalette(): ScenePalette {
  const tray = cssColor('--surface', 0xffffff);
  return {
    tray,
    trayBorder: cssColor('--border-strong', 0xdcdbd7, tray),
    accent: cssColor('--accent', 0x0e7c86),
  };
}

const appleTen: GameModule = {
  /** 판을 띄우고 바로 시작한다 */
  async mount(parent, options) {
    // 사과 숫자를 캔버스에 그리기 전에 글꼴(숫자 부분)을 받아 둔다
    await document.fonts.load('700 42px "Pretendard Variable"', '0123456789').catch(() => undefined);

    const orientation = pickOrientation(parent);
    const scene = new AppleScene({ seed: options.seed, orientation, palette: readPalette(), onHud: options.onHud, onEnd: options.onEnd });
    const { width, height } = canvasSize(orientation);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      transparent: true,
      banner: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width, height },
      scene,
    });

    // 화면이 가려지면(탭·앱 전환) 판을 끝낸다. 제한 시간 게임에서 멈춤을 허용하지 않는다 (설계 §3)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') scene.finish();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 영역 크기가 바뀌면 다시 맞추고, 가로·세로가 바뀌었으면 판 방향도 바꾼다
    const observer = new ResizeObserver(() => {
      scene.setOrientation(pickOrientation(parent));
      game.scale.refresh();
    });
    observer.observe(parent);

    return {
      finish: () => scene.finish(),
      destroy: () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        game.destroy(true);
      },
    };
  },
};

export default appleTen;
