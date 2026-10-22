// 붕어빵 가게 진입점. 셸(client)이 동적 import해서 mount한다. 성장형 게임이라 가게·정산 화면까지 게임이 그리고,
// 서버와는 셸이 넘긴 창구(GrowthSession)로만 이야기한다. 근거: docs/design/261021-04-game-save.md §6-2

import Phaser from 'phaser';
import galmuriBoldUrl from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import type { GrowthGameModule } from '@magpie/shared/game-module';
import titleFontUrl from '../assets/fonts/dnf-bitbit-v2/DNFBitBitv2.otf?url';
import { initialShopState } from './logic/rules';
import { buildTextures } from './scene/art';
import { FishBunScene } from './scene/FishBunScene';
import { canvasSize, type Layout } from './scene/layout';
import { Sfx } from './scene/sound';
import { PIXEL_ART } from './scene/style';
import { FONT, TITLE_FAMILY, hex, type ScenePalette } from './scene/ui';

let pixelFonts: Promise<void> | null = null;

/** 글꼴 파일 하나를 받아 문서에 더한다. 실패하면 대체 글꼴로 그리게 경고만 남긴다 */
function loadFace(family: string, url: string, descriptors?: FontFaceDescriptors): Promise<void> {
  return new FontFace(family, `url(${url})`, descriptors)
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((err: unknown) => console.warn(`[fish-bun] 글꼴 ${family}을 불러오지 못했다`, err));
}

/**
 * 도트 글꼴 둘을 한 번만, 함께 불러온다.
 * - 본문: 갈무리11(OFL-1.1). 굵은 꼴 한 파일(약 170KB)만 쓰고, 모든 굵기에 그 꼴을 쓴다.
 * - 제목: 던파 비트비트체 v2(넥슨 서체, 약 1.8MB). 넥슨 배포 파일을 고치지 않고 그대로 쓴다(assets/fonts/dnf-bitbit-v2/NOTICE.md)
 */
function loadPixelFonts(): Promise<void> {
  pixelFonts ??= Promise.all([
    loadFace('Galmuri11', galmuriBoldUrl, { weight: '100 900' }),
    loadFace(TITLE_FAMILY, titleFontUrl),
  ]).then(() => undefined);
  return pixelFonts;
}

/** 게임 영역이 세로로 길면 세로 배치(휴대폰) */
function pickLayout(el: HTMLElement): Layout {
  return el.clientWidth < el.clientHeight * 1.15 ? 'portrait' : 'landscape';
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

const fishBun: GrowthGameModule = {
  kind: 'growth',
  initialState: initialShopState,

  /** 가게 화면을 띄운다. 하루 시작은 게임 안 [장사 시작]으로 한다 */
  async mount(parent, options) {
    const sfx = new Sfx(options.muted ?? false, options.volume ?? 1);
    // 화면 글자를 캔버스에 그리기 전에 글꼴을 받아 둔다
    if (PIXEL_ART) await loadPixelFonts();
    else {
      await Promise.all(
        ['900 44px', '800 30px', '700 24px', '600 20px'].map((f) => document.fonts.load(`${f} ${FONT}`, '까치붕어빵장사시작0123456789원').catch(() => undefined)),
      );
    }
    const palette = readPalette();
    const textures = await buildTextures(hex(palette.textStrong));
    const layout = pickLayout(parent);
    const scene = new FishBunScene({
      layout,
      palette,
      textures,
      sfx,
      session: options.session,
      save: options.save,
      ...(options.onDayActive ? { onDayActive: options.onDayActive } : {}),
    });
    const { width, height } = canvasSize(layout);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: palette.bg,
      banner: false,
      // 저지연 캔버스: 그리기가 브라우저 합성 단계를 덜 거쳐 누름에 더 빨리 반응한다.
      // 도트 그림체면 확대해도 칸이 뭉개지지 않게 하되(smoothPixelArt), 칸 사이 경계는 부드럽게 해서 소수 배율에서도 칸 굵기가 들쭉날쭉하지 않게 한다
      render: { desynchronized: true, antialias: true, smoothPixelArt: PIXEL_ART },
      input: { activePointers: 3 },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width, height },
      scene,
    });

    // 화면이 가려지면 장사를 멈춘다 (미니게임처럼 판을 끝내지 않는다)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') scene.onHidden();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // 처음 누를 때 소리를 연다 (브라우저 자동재생 제한)
    const unlock = () => sfx.unlock();
    parent.addEventListener('pointerdown', unlock);

    // 영역 크기가 바뀌면 다시 맞추고, 가로·세로가 바뀌었으면 배치도 바꾼다
    const observer = new ResizeObserver(() => {
      scene.setLayout(pickLayout(parent));
      game.scale.refresh();
    });
    observer.observe(parent);

    return {
      setMuted: (muted) => sfx.setMuted(muted),
      setVolume: (volume) => sfx.setVolume(volume),
      destroy: () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        parent.removeEventListener('pointerdown', unlock);
        game.destroy(true);
        sfx.destroy();
      },
    };
  },
};

export default fishBun;
