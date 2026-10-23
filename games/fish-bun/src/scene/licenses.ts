// 오픈소스 라이선스: 설정 창에서 여는 전체 화면. 목록(글꼴·라이브러리) → 원문 두 단계.
// 원문 파일은 배포처 것을 고치지 않고 assets/licenses에 두고, 그릴 때만 마크다운 표시(#, &copy;, <주소>)를 걷어 내고 문단 안 줄바꿈을 잇는다.
// 근거: docs/design/261023-03-oss-licenses.md

import Phaser from 'phaser';
import dnfText from '../../assets/licenses/dnf-bitbit-v2.md?raw';
import galmuriText from '../../assets/licenses/galmuri-ofl.md?raw';
import phaserText from '../../assets/licenses/phaser-license.md?raw';
import { attachScroll } from './scroll';
import type { Sfx } from './sound';
import { DOT, framedBox } from './style';
import { Button, textStyle, titleStyle, type ScenePalette } from './ui';

/** 라이선스 항목 하나 */
interface LicenseItem {
  name: string;
  /** 만든 곳 */
  author: string;
  /** 라이선스 이름 */
  license: string;
  /** 이 게임에서 쓰는 곳 */
  use: string;
  /** 배포처 (글자로만 보인다) */
  url: string;
  text: string;
}

/** 이 게임에 들어간 글꼴·라이브러리. 새로 쓰면 여기에 더한다 */
const ITEMS: readonly LicenseItem[] = [
  { name: '던파 비트비트체 v2', author: '넥슨(NEOPLE)', license: '넥슨 서체 약관', use: '제목·큰 숫자 글꼴', url: 'https://brand.nexon.com/ko/ci-brand-guidelines/typeface', text: dnfText },
  { name: '갈무리11', author: 'Lee Minseo', license: 'SIL OFL 1.1', use: '게임 안 글자', url: 'https://galmuri.quiple.dev', text: galmuriText },
  { name: 'Phaser', author: 'Phaser Studio Inc.', license: 'MIT', use: '게임 엔진', url: 'https://phaser.io', text: phaserText },
];

/** 원문 한 문단. heading이면 제목 줄 */
interface Paragraph {
  text: string;
  heading: boolean;
}

/** 원문을 문단으로 나눈다: 빈 줄로 나누고, 문단 안 줄은 이어 붙이되 "- "로 시작하는 줄은 새 줄로 둔다 */
function paragraphs(raw: string): Paragraph[] {
  const clean = raw.replace(/&copy;/g, '©').replace(/<(https?:\/\/[^>]+)>/g, '$1');
  return clean
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const heading = /^#+\s/.test(lines[0]!);
      const text = lines.reduce((acc, line, i) => (i === 0 ? line : `${acc}${line.startsWith('- ') ? '\n' : ' '}${line}`), '');
      return { text: heading ? text.replace(/^#+\s*/, '') : text, heading };
    });
}

export interface LicenseScreenOptions {
  scene: Phaser.Scene;
  palette: ScenePalette;
  sfx: Sfx;
  /** 처음 볼 원문 (null이면 목록) */
  item: number | null;
  depth: number;
  /** 목록·원문을 바꿨다 (배치를 다시 그릴 때 같은 단계를 열려고 기억한다) */
  onItem(item: number | null): void;
  /** 설정 창으로 */
  onClose(): void;
}

/** 오픈소스 라이선스 화면. 화면 전체를 덮고, 목록에서 항목을 누르면 원문, [목록으로]·Esc로 돌아온다 */
export function buildLicenseScreen(o: LicenseScreenOptions): Phaser.GameObjects.Container {
  const { scene, palette: p } = o;
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(o.depth);
  const view = scene.add.container(0, 0);
  root.add(view);
  const colW = Math.min(1000, width - 48);
  const left = Math.round((width - colW) / 2);
  const headH = 112;
  let item = o.item !== null && ITEMS[o.item] ? o.item : null;

  /** 위 줄: [설정으로]·[목록으로]와 제목. 스크롤된 원문을 가리도록 바탕을 깐다 */
  const header = (title: string, back: string, onBack: () => void) => {
    view.add(scene.add.rectangle(0, 0, width, headH, p.bg).setOrigin(0).setInteractive());
    view.add(new Button(scene, { x: 24 + 84, y: 56, width: 168, height: 68, label: back, style: 'secondary', palette: p, fontSize: 24, onPress: onBack }));
    view.add(scene.add.text(24 + 168 + 24, 56, title, titleStyle(34, p.textStrong)).setOrigin(0, 0.5));
  };

  /** 목록 */
  const renderList = () => {
    view.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0).setInteractive());
    header('오픈소스 라이선스', '설정으로', () => close());
    view.add(scene.add.text(left, headH + 20, '이 게임에 쓰인 글꼴과 라이브러리예요.', textStyle(22, p.text2, '700')).setOrigin(0, 0));
    const cardH = 140;
    ITEMS.forEach((it, i) => {
      const y = headH + 72 + i * (cardH + 16);
      view.add(framedBox(scene.add.graphics(), left, y, colW, cardH, 20, p.surface, p.border, 2));
      view.add(scene.add.text(left + 28, y + 34, it.name, textStyle(30, p.textStrong, '800')).setOrigin(0, 0.5));
      view.add(scene.add.text(left + 28, y + 78, `${it.author} · ${it.license}`, textStyle(22, p.text, '700')).setOrigin(0, 0.5));
      view.add(scene.add.text(left + 28, y + 112, it.use, textStyle(22, p.text2, '700')).setOrigin(0, 0.5));
      // 오른쪽 화살표 (도트)
      const g = scene.add.graphics().fillStyle(p.text2, 1);
      const ax = left + colW - 44;
      for (let k = 0; k < 4; k += 1) g.fillRect(ax + k * DOT, y + cardH / 2 - (4 - k) * DOT, DOT, (4 - k) * DOT * 2);
      view.add(g);
      const hit = scene.add.rectangle(left, y, colW, cardH, 0x000000, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      // 같은 누름을 새로 그린 원문 화면이 받지 않게 다음 틈에 연다
      hit.on(Phaser.Input.Events.POINTER_DOWN, () => scene.time.delayedCall(0, () => go(i)));
      view.add(hit);
    });
  };

  /** 원문: 이름·만든 곳·라이선스·쓰는 곳·배포처, 그 아래 원문(스크롤), [목록으로] 고정 */
  const renderDetail = (it: LicenseItem) => {
    view.add(scene.add.rectangle(0, 0, width, height, p.bg).setOrigin(0).setInteractive());
    const body = scene.add.container(0, 0);
    const textW = colW - 16;
    let y = 0;
    const add = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap: number) => {
      const t = scene.add.text(0, y, text, { ...style, wordWrap: { width: textW, useAdvancedWrap: true } }).setLineSpacing(6);
      body.add(t);
      y += t.height + gap;
    };
    add(`${it.author} · ${it.license}`, textStyle(22, p.textStrong, '800'), 8);
    add(it.use, textStyle(22, p.text, '700'), 8);
    add(it.url, textStyle(22, p.text2, '700'), 20);
    body.add(scene.add.rectangle(0, y, textW, DOT / 2, p.border).setOrigin(0));
    y += 24;
    // 원문이 길어 문단마다 글자 하나로 그린다 (글자 텍스처가 너무 커지지 않게)
    for (const para of paragraphs(it.text)) add(para.text, textStyle(22, para.heading ? p.textStrong : p.text, para.heading ? '800' : '600'), para.heading ? 12 : 16);
    body.setPosition(left + 8, headH + 16);
    const bottom = height - 128;
    view.add(body);
    view.add(attachScroll({ scene, body, top: headH + 16, contentH: y + 16, bottom, width, height, color: p.bg, thumb: p.text2 }));
    view.add(new Button(scene, { x: width / 2, y: height - 66, width: Math.min(560, width - 48), height: 80, label: '목록으로', style: 'secondary', palette: p, fontSize: 28, onPress: () => go(null) }));
    // 위 줄은 스크롤된 원문 위에 그린다
    header(it.name, '목록으로', () => go(null));
  };

  /** 지금 단계를 다시 그린다 */
  const render = () => {
    view.removeAll(true);
    if (item === null) renderList();
    else renderDetail(ITEMS[item]!);
  };

  /** 목록·원문으로 */
  const go = (next: number | null) => {
    if (next === item) return;
    item = next;
    o.sfx.click();
    o.onItem(item);
    render();
  };

  /** 설정 창으로 */
  const close = () => {
    o.sfx.click();
    o.onClose();
  };

  // Esc: 원문이면 목록, 목록이면 설정 창으로
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (item !== null) go(null);
    else close();
  };
  scene.input.keyboard?.on('keydown', onKey);
  root.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.keyboard?.off('keydown', onKey));

  render();
  return root;
}
