// 분식집 진입점. 셸(client)이 동적 import해서 mount한다. 성장형 게임이라 가게·정산 화면까지 게임이 그리고,
// 서버와는 셸이 넘긴 창구(GrowthSession)로만 이야기한다. 근거: docs/design/261022-09-snack-bar.md, docs/design/261021-04-game-save.md §6-2

import Phaser from 'phaser';
import galmuriBoldUrl from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import type { GrowthGameModule } from '@magpie/shared/game-module';
import titleFontUrl from '../assets/fonts/dnf-bitbit-v2/DNFBitBitv2.otf?url';
import { initialShopState } from './logic/rules';
import { canvasSize, type Layout } from './scene/layout';
import { SnackBarScene } from './scene/SnackBarScene';
import { Sfx } from './scene/sound';
import { TITLE_FAMILY, type ScenePalette } from './scene/ui';

let pixelFonts: Promise<void> | null = null;

/** 글꼴 파일 하나를 받아 문서에 더한다. 실패하면 대체 글꼴로 그리게 경고만 남긴다 */
function loadFace(family: string, url: string, descriptors?: FontFaceDescriptors): Promise<void> {
  return new FontFace(family, `url(${url})`, descriptors)
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((err: unknown) => console.warn(`[snack-bar] 글꼴 ${family}을 불러오지 못했다`, err));
}

/**
 * 도트 글꼴 둘을 한 번만, 함께 불러온다.
 * - 본문: 갈무리11(OFL-1.1) 굵은 꼴 한 파일. 모든 굵기에 그 꼴을 쓴다.
 * - 제목: 던파 비트비트체 v2(넥슨 서체). 배포 파일을 고치지 않고 그대로 쓴다(assets/fonts/dnf-bitbit-v2/NOTICE.md)
 */
function loadPixelFonts(): Promise<void> {
  pixelFonts ??= Promise.all([loadFace('Galmuri11', galmuriBoldUrl, { weight: '100 900' }), loadFace(TITLE_FAMILY, titleFontUrl)]).then(() => undefined);
  return pixelFonts;
}

/** 무대 비율(높이 ÷ 너비). 아직 크기가 없으면 undefined */
function stageAspect(el: HTMLElement): number | undefined {
  return el.clientWidth > 0 && el.clientHeight > 0 ? el.clientHeight / el.clientWidth : undefined;
}

/** 게임 영역이 세로로 길면 세로 배치(휴대폰) */
function pickLayout(el: HTMLElement): Layout {
  return el.clientWidth < el.clientHeight * 1.15 ? 'portrait' : 'landscape';
}

/** 셸의 CSS 변수 색을 Phaser 색 숫자로 읽는다. 못 읽으면 fallback. 반투명 색은 base 위에 섞은 결과 */
function cssColor(name: string, fallback: number, base = 0x000000): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  const color = Phaser.Display.Color.ValueToColor(value);
  const a = color.alpha / 255;
  if (a >= 1) return color.color;
  const mixc = (c: number, b: number) => Math.round(c * a + b * (1 - a));
  return (mixc(color.red, (base >> 16) & 0xff) << 16) | (mixc(color.green, (base >> 8) & 0xff) << 8) | mixc(color.blue, base & 0xff);
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

const snackBar: GrowthGameModule = {
  kind: 'growth',
  initialState: initialShopState,

  /** 가게 화면을 띄운다. 하루 시작은 게임 안 [장사 시작]으로 한다 */
  async mount(parent, options) {
    const sfx = new Sfx(options.muted ?? false, options.volume ?? 1);
    await loadPixelFonts();
    const palette = readPalette();
    const layout = pickLayout(parent);
    // 개발 빌드에서 ?sprites를 붙이면 도트 그림 보기 (배포 빌드에서는 빠진다)
    const gallery = import.meta.env.DEV && new URLSearchParams(location.search).has('sprites');
    const scene = new SnackBarScene({
      layout,
      palette,
      sfx,
      session: options.session,
      save: options.save,
      gallery,
      ...(options.onSoundChange ? { onSoundChange: options.onSoundChange } : {}),
      ...(options.onDayActive ? { onDayActive: options.onDayActive } : {}),
    });
    const { width, height } = canvasSize(layout, stageAspect(parent));
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: palette.bg,
      banner: false,
      // 저지연 캔버스. 확대해도 도트 칸이 뭉개지지 않게 하되, 칸 사이 경계는 부드럽게(소수 배율에서도 칸 굵기가 고르게)
      render: { desynchronized: true, antialias: true, smoothPixelArt: true },
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
    window.addEventListener('keydown', unlock);

    // 영역 크기가 바뀌면 다시 맞추고, 가로·세로나 세로 배치 높이(화면 비율)가 바뀌었으면 캔버스 크기와 배치도 바꾼다
    const observer = new ResizeObserver(() => {
      scene.setStage(pickLayout(parent), stageAspect(parent));
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
        window.removeEventListener('keydown', unlock);
        game.destroy(true);
        sfx.destroy();
      },
    };
  },
};

export default snackBar;
