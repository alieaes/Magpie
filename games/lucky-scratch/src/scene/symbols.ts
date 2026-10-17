// 복권 그림 5종과 까치 문장·동전. 모두 자체 제작 SVG다(원작·실존 복권 그림을 쓰지 않는다, CLAUDE.md §4-3).
// viewBox는 128 × 128. 화면에서는 텍스처로 구워서 쓴다(art.ts).
// 근거: docs/design/261016-02-lucky-scratch.md §3-6

import type { SymbolId } from '../logic/rules';

/** SVG 문서로 감싼다. size는 구울 때의 픽셀 크기 */
export function svgDocument(body: string, size: number, viewBox = '0 0 128 128'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${body}</svg>`;
}

/** 까치: 나뭇가지에 앉은 옆모습. 검은 머리·등, 흰 배·어깨 무늬, 청록 광택의 긴 꼬리 */
const MAGPIE = `
<defs>
  <linearGradient id="mg-tail" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#0b2f3d"/>
    <stop offset="0.45" stop-color="#17707a"/>
    <stop offset="1" stop-color="#2b4c8c"/>
  </linearGradient>
  <linearGradient id="mg-wing" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#34558c"/>
    <stop offset="0.6" stop-color="#1b2a45"/>
    <stop offset="1" stop-color="#0f1623"/>
  </linearGradient>
  <linearGradient id="mg-belly" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#d9e1ea"/>
  </linearGradient>
  <radialGradient id="mg-head" cx="0.38" cy="0.3" r="0.75">
    <stop offset="0" stop-color="#3b4452"/>
    <stop offset="1" stop-color="#0c0f15"/>
  </radialGradient>
</defs>
<path d="M14 106 Q62 97 118 104" fill="none" stroke="#6b3f1d" stroke-width="7" stroke-linecap="round"/>
<path d="M14 106 Q62 97 118 104" fill="none" stroke="#9a6233" stroke-width="2.5" stroke-linecap="round" transform="translate(0 -2)"/>
<path d="M98 101 q7 -9 17 -9" fill="none" stroke="#6b3f1d" stroke-width="4" stroke-linecap="round"/>
<path d="M54 68 L11 104 Q6 110 13 111 L23 108 L64 82 Z" fill="url(#mg-tail)" stroke="#08131b" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M50 76 L18 104" stroke="#5fc3c4" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
<path d="M85 20 C70 20 61 32 57 46 C54 56 49 63 45 70 C51 83 62 92 78 92 C95 92 106 78 105 60 C104 42 99 20 85 20 Z" fill="#11161e"/>
<path d="M60 72 C63 86 74 92 86 89 C96 86 102 79 102 70 C92 76 76 77 60 72 Z" fill="url(#mg-belly)"/>
<path d="M53 50 C63 42 81 46 86 59 C89 69 82 80 67 82 C57 82 49 78 44 71 C47 63 49 56 53 50 Z" fill="url(#mg-wing)" stroke="#0a0f17" stroke-width="2" stroke-linejoin="round"/>
<path d="M55 51 C64 45 77 47 82 55 C73 55 64 58 54 64 C53 60 53 55 55 51 Z" fill="#f5f8fb"/>
<path d="M58 74 Q66 78 76 77 M56 69 Q65 73 77 72" fill="none" stroke="#4d6fa6" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
<circle cx="87" cy="35" r="16" fill="url(#mg-head)"/>
<path d="M100 31 L120 37 L100 42 Z" fill="#1d222b" stroke="#0a0d12" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M100 37 L118 37" stroke="#3d4450" stroke-width="1"/>
<circle cx="92" cy="32" r="3.6" fill="#05070a"/>
<circle cx="93.3" cy="30.8" r="1.3" fill="#ffffff"/>
<path d="M76 28 Q81 22 89 22" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.35"/>
<path d="M72 92 L70 102 M70 102 l-5 3 M70 102 l1 4 M70 102 l5 2" fill="none" stroke="#2a2f38" stroke-width="2.6" stroke-linecap="round"/>
<path d="M82 91 L82 101 M82 101 l-5 3 M82 101 l1 4 M82 101 l5 2" fill="none" stroke="#2a2f38" stroke-width="2.6" stroke-linecap="round"/>
`;

/** 왕관: 금색 몸체, 띠의 보석 세 개, 끝에 진주 */
const CROWN = `
<defs>
  <linearGradient id="cr-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff1a8"/>
    <stop offset="0.45" stop-color="#f4c542"/>
    <stop offset="1" stop-color="#c47f14"/>
  </linearGradient>
  <linearGradient id="cr-band" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffd966"/>
    <stop offset="1" stop-color="#a8650e"/>
  </linearGradient>
  <radialGradient id="cr-pearl" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#e3cfa4"/>
  </radialGradient>
  <radialGradient id="cr-ruby" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#ff8aa5"/>
    <stop offset="1" stop-color="#b3123c"/>
  </radialGradient>
  <radialGradient id="cr-sapph" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#9cc8ff"/>
    <stop offset="1" stop-color="#1c4fb0"/>
  </radialGradient>
</defs>
<path d="M18 86 L12 38 L40 62 L64 24 L88 62 L116 38 L110 86 Z" fill="url(#cr-gold)" stroke="#8a5208" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M22 80 L18 50 L40 68 L64 34 L88 68 L110 50 L106 80" fill="none" stroke="#fff6c8" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/>
<rect x="15" y="82" width="98" height="22" rx="5" fill="url(#cr-band)" stroke="#8a5208" stroke-width="3.5"/>
<rect x="20" y="85" width="88" height="5" rx="2.5" fill="#fff3b8" opacity="0.6"/>
<circle cx="12" cy="36" r="7" fill="url(#cr-pearl)" stroke="#8a5208" stroke-width="2.5"/>
<circle cx="64" cy="21" r="8" fill="url(#cr-pearl)" stroke="#8a5208" stroke-width="2.5"/>
<circle cx="116" cy="36" r="7" fill="url(#cr-pearl)" stroke="#8a5208" stroke-width="2.5"/>
<ellipse cx="64" cy="93" rx="10" ry="7.5" fill="url(#cr-ruby)" stroke="#6e0b25" stroke-width="2"/>
<circle cx="37" cy="93" r="6" fill="url(#cr-sapph)" stroke="#123578" stroke-width="2"/>
<circle cx="91" cy="93" r="6" fill="url(#cr-sapph)" stroke="#123578" stroke-width="2"/>
<path d="M64 46 l3.5 8 l-3.5 8 l-3.5 -8 Z" fill="url(#cr-ruby)" stroke="#6e0b25" stroke-width="1.5"/>
`;

/** 보석: 위에서 비스듬히 본 다이아몬드. 면마다 밝기를 달리한다 */
const GEM = `
<g stroke="#155a8a" stroke-width="2" stroke-linejoin="round">
  <polygon points="38,26 18,50 42,50" fill="#9fe3ff"/>
  <polygon points="38,26 64,26 64,50 42,50" fill="#e4f9ff"/>
  <polygon points="64,26 90,26 86,50 64,50" fill="#c4efff"/>
  <polygon points="90,26 110,50 86,50" fill="#6fcdf2"/>
  <polygon points="18,50 42,50 64,112" fill="#5cc0ec"/>
  <polygon points="42,50 64,50 64,112" fill="#a6e4fb"/>
  <polygon points="64,50 86,50 64,112" fill="#3aa2d8"/>
  <polygon points="86,50 110,50 64,112" fill="#1f78b4"/>
</g>
<polygon points="38,26 90,26 110,50 64,112 18,50" fill="none" stroke="#0f4670" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M44 31 L58 31" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
<path d="M30 52 L50 88" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
<path d="M106 14 l2.6 7.4 l7.4 2.6 l-7.4 2.6 l-2.6 7.4 l-2.6 -7.4 l-7.4 -2.6 l7.4 -2.6 Z" fill="#ffffff"/>
<path d="M20 96 l1.8 5 l5 1.8 l-5 1.8 l-1.8 5 l-1.8 -5 l-5 -1.8 l5 -1.8 Z" fill="#ffffff" opacity="0.85"/>
`;

/** 클로버 잎 하나(위쪽을 향한 하트). 가운데(64, 58)를 기준으로 돌려서 네 장을 만든다 */
const LEAF = `
<path d="M64 58 C51 49 41 35 49 26 C55 19 63 22 64 30 C65 22 73 19 79 26 C87 35 77 49 64 58 Z" fill="url(#cl-leaf)" stroke="#23622a" stroke-width="2.8" stroke-linejoin="round"/>
<path d="M64 56 L64 32" stroke="#2f7a33" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<ellipse cx="55" cy="33" rx="4.5" ry="3" fill="#ffffff" opacity="0.45" transform="rotate(-35 55 33)"/>
`;

/** 네잎클로버: 하트 잎 네 장 + 줄기 */
const CLOVER = `
<defs>
  <radialGradient id="cl-leaf" cx="0.5" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#9be27c"/>
    <stop offset="0.6" stop-color="#4fae45"/>
    <stop offset="1" stop-color="#2f8136"/>
  </radialGradient>
</defs>
<path d="M64 60 Q72 86 60 114" fill="none" stroke="#23622a" stroke-width="8" stroke-linecap="round"/>
<path d="M64 60 Q72 86 60 114" fill="none" stroke="#4f9c3f" stroke-width="4" stroke-linecap="round"/>
<g>${LEAF}</g>
<g transform="rotate(90 64 58)">${LEAF}</g>
<g transform="rotate(180 64 58)">${LEAF}</g>
<g transform="rotate(270 64 58)">${LEAF}</g>
<circle cx="64" cy="58" r="4" fill="#2f7a33"/>
`;

/** 복주머니: 빨간 비단 주머니, 금색 끈과 매듭, 금색 꽃무늬 */
const POUCH = `
<defs>
  <radialGradient id="po-silk" cx="0.38" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#ff7b7b"/>
    <stop offset="0.55" stop-color="#e0303f"/>
    <stop offset="1" stop-color="#9c1526"/>
  </radialGradient>
  <linearGradient id="po-frill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8f8f"/>
    <stop offset="1" stop-color="#c8283a"/>
  </linearGradient>
  <linearGradient id="po-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff0a0"/>
    <stop offset="1" stop-color="#d1931c"/>
  </linearGradient>
</defs>
<path d="M44 52 C38 40 46 30 54 38 C56 27 66 25 68 36 C72 26 83 29 81 40 C89 34 96 44 86 54 Z" fill="url(#po-frill)" stroke="#7c0f1e" stroke-width="2.8" stroke-linejoin="round"/>
<path d="M40 60 C22 74 20 104 40 113 C52 119 76 119 88 113 C108 104 106 74 88 60 Z" fill="url(#po-silk)" stroke="#7c0f1e" stroke-width="3" stroke-linejoin="round"/>
<path d="M50 66 C46 76 46 90 50 100 M78 66 C82 76 82 90 78 100" fill="none" stroke="#a51a2c" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<rect x="38" y="52" width="52" height="11" rx="5.5" fill="url(#po-gold)" stroke="#8a5a0c" stroke-width="2.5"/>
<path d="M58 62 C52 72 50 80 54 86 M70 62 C76 72 78 80 74 86" fill="none" stroke="#e8b33a" stroke-width="3" stroke-linecap="round"/>
<circle cx="64" cy="60" r="6" fill="url(#po-gold)" stroke="#8a5a0c" stroke-width="2.5"/>
<circle cx="64" cy="94" r="13" fill="url(#po-gold)" stroke="#8a5a0c" stroke-width="2.5"/>
<g fill="#c4352e">
  <ellipse cx="64" cy="87.5" rx="3.6" ry="5"/>
  <ellipse cx="64" cy="100.5" rx="3.6" ry="5"/>
  <ellipse cx="57.5" cy="94" rx="5" ry="3.6"/>
  <ellipse cx="70.5" cy="94" rx="5" ry="3.6"/>
</g>
<circle cx="64" cy="94" r="2.8" fill="#fff0a0"/>
<ellipse cx="44" cy="82" rx="5" ry="10" fill="#ffffff" opacity="0.22" transform="rotate(18 44 82)"/>
`;

/** 그림 번호(= 등수 - 1)별 SVG 본문 */
export const SYMBOL_SVGS: Record<SymbolId, string> = {
  0: MAGPIE,
  1: CROWN,
  2: GEM,
  3: CLOVER,
  4: POUCH,
};

/** 그림 이름 */
export const SYMBOL_NAMES: Record<SymbolId, string> = {
  0: '까치',
  1: '왕관',
  2: '보석',
  3: '클로버',
  4: '복주머니',
};

/** 등수 색 (1등 금, 2등 보라, 3등 하늘, 4등 초록, 5등 빨강). 그림 번호로 찾는다 */
export const RANK_COLORS: Record<SymbolId, number> = {
  0: 0xf2b632,
  1: 0xa46bf5,
  2: 0x3fb4ea,
  3: 0x4cb85a,
  4: 0xec4f5c,
};

/** 동전: 금색 원, 테두리, 가운데 까치 날개 무늬 */
export const COIN_SVG = `
<defs>
  <radialGradient id="co-face" cx="0.35" cy="0.3" r="0.85">
    <stop offset="0" stop-color="#fff4b0"/>
    <stop offset="0.55" stop-color="#f5c53e"/>
    <stop offset="1" stop-color="#c2800f"/>
  </radialGradient>
</defs>
<circle cx="64" cy="64" r="58" fill="#a8680a"/>
<circle cx="64" cy="60" r="56" fill="url(#co-face)" stroke="#8a5208" stroke-width="4"/>
<circle cx="64" cy="60" r="42" fill="none" stroke="#b9770e" stroke-width="4" opacity="0.8"/>
<path d="M44 66 C52 50 70 44 88 46 C78 52 72 60 70 72 C62 66 52 64 44 66 Z" fill="#c9861a"/>
<path d="M50 64 C58 54 70 50 82 50" fill="none" stroke="#fff3b8" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
<path d="M34 40 Q44 26 60 22" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
`;

/** 카드 머리의 까치 문장: 금색 원 안에 까치 */
export const EMBLEM_SVG = `
<defs>
  <radialGradient id="em-ring" cx="0.4" cy="0.3" r="0.9">
    <stop offset="0" stop-color="#fff2b0"/>
    <stop offset="0.5" stop-color="#e6b23c"/>
    <stop offset="1" stop-color="#a36a10"/>
  </radialGradient>
  <radialGradient id="em-face" cx="0.5" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#22355e"/>
    <stop offset="1" stop-color="#0d1630"/>
  </radialGradient>
</defs>
<circle cx="64" cy="64" r="62" fill="url(#em-ring)"/>
<circle cx="64" cy="64" r="53" fill="url(#em-face)" stroke="#7a4c0c" stroke-width="2"/>
<circle cx="64" cy="64" r="48" fill="none" stroke="#e6b23c" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.8"/>
<g transform="translate(17 15) scale(0.74)">${MAGPIE}</g>
`;
