// 그림: 붕어빵(익힘 단계별), 무쇠 빵틀, 진열대 아이콘, 펌프, 아이콘, 효과 조각을 SVG로 그려 Phaser 텍스처로 굽는다.
// 원작 그림은 쓰지 않는다(CLAUDE.md §4-3). 이모지 대신 직접 그린 그림만 쓴다. 근거: docs/design/261021-01-fish-bun.md §5-3

import type { Quality, SideStage } from '../logic/rules';
import { PEOPLE_FACES, PEOPLE_KINDS, PEOPLE_VARIANTS, personSvg, type Face } from './people';

/** 구운 텍스처: 이름 → 캔버스 */
export type TextureSet = Map<string, HTMLCanvasElement>;

/** 아이콘 이름 */
export type IconName = 'pause' | 'trash' | 'clock' | 'plusOne' | 'noBurnt' | 'camera' | 'star' | 'heart' | 'flame' | 'store' | 'back';

/** 그림 크기 (캔버스 픽셀) */
export const MOLD_W = 210;
export const MOLD_H = 128;
export const BUN_W = 200;
export const BUN_H = 120;
/** 빵틀 안에서 붕어빵(과 홈)이 차지하는 비율 */
export const BUN_SCALE = 0.86;
export const SHELF_W = 64;
export const SHELF_H = 40;
export const PERSON_W = 200;
export const PERSON_H = 220;
export const ICON = 64;

/** 텍스처 이름 */
export const TEX = {
  mold: 'fb-mold',
  batter: (s: SideStage) => `fb-batter-${s}`,
  fish: (s: 'raw' | 'good' | 'burnt' | 'golden') => `fb-fish-${s}`,
  candidate: (s: 'raw' | 'good' | 'burnt') => `fb-cand-${s}`,
  shelf: (q: Quality) => `fb-shelf-${q}`,
  pumpBody: 'fb-pump-body',
  pumpHandle: 'fb-pump-handle',
  steam: 'fb-steam',
  smoke: 'fb-smoke',
  sparkle: 'fb-sparkle',
  glow: 'fb-glow',
  coin: 'fb-coin',
  icon: (name: IconName) => `fb-icon-${name}`,
  person: (kind: string, variant: number, face: Face) => `fb-person-${kind}-${variant}-${face}`,
  magpie: 'fb-magpie',
} as const;

/** SVG 문서로 감싼다 */
function svgDocument(body: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** 빈 캔버스와 2D 문맥 */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** SVG를 w × h 캔버스로 굽는다 */
async function rasterize(body: string, w: number, h: number, outW = w, outH = h): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDocument(body, w, h))}`;
  await img.decode();
  const [c, ctx] = canvas(outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);
  return c;
}

// ---------------------------------------------------------------- 붕어빵

/** 붕어빵 몸통 (200 × 120, 머리가 왼쪽) */
const FISH = 'M16 62 C18 36 52 16 100 16 C128 16 148 26 160 42 L182 22 C190 16 199 21 197 31 L189 60 L197 89 C199 99 190 104 182 98 L160 78 C148 94 128 104 100 104 C52 104 18 88 16 62 Z';
/** 황금 후보: 꼬리가 말려 올라가고 등지느러미가 솟는다 ("살짝 모양이 변한다") */
const FISH_CANDIDATE =
  'M16 62 C18 36 52 16 100 16 C128 16 148 26 160 42 L176 14 C184 6 198 10 196 24 L189 60 L197 89 C199 99 190 104 182 98 L160 78 C148 94 128 104 100 104 C52 104 18 88 16 62 Z';
const DORSAL = 'M80 22 C86 2 112 0 120 20 Z';

interface BunColors {
  top: string;
  bottom: string;
  stroke: string;
  detail: string;
}

const BUN_COLORS: Record<'raw' | 'good' | 'burnt' | 'golden', BunColors> = {
  raw: { top: '#f7e6b3', bottom: '#e9cd8a', stroke: '#c9a25c', detail: '#d4b06c' },
  good: { top: '#f6c063', bottom: '#cf7d27', stroke: '#93531a', detail: '#a9631f' },
  burnt: { top: '#6e4529', bottom: '#33200f', stroke: '#1d1108', detail: '#20130a' },
  golden: { top: '#fff3b0', bottom: '#f0a81e', stroke: '#a8650c', detail: '#c9850f' },
};

/** 비늘 무늬 */
function scales(color: string): string {
  let d = '';
  for (const [y, from, to] of [
    [46, 78, 146],
    [62, 72, 152],
    [78, 78, 146],
  ] as const) {
    for (let x = from; x <= to; x += 16) d += `M${x} ${y} a8 8 0 0 0 16 0 `;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>`;
}

/** 붕어빵 한 마리 (뒤집은 뒤 보이는 모습) */
function fishSvg(stage: 'raw' | 'good' | 'burnt' | 'golden', candidate: boolean): string {
  const c = BUN_COLORS[stage];
  const body = candidate ? FISH_CANDIDATE : FISH;
  const id = `g${stage}${candidate ? 'c' : ''}`;
  const dorsal = candidate ? `<path d="${DORSAL}" fill="url(#${id})" stroke="${c.stroke}" stroke-width="3" stroke-linejoin="round"/>` : '';
  const burntMarks =
    stage === 'burnt'
      ? `<ellipse cx="70" cy="40" rx="18" ry="9" fill="#120a04" opacity="0.6"/><ellipse cx="128" cy="78" rx="22" ry="10" fill="#120a04" opacity="0.55"/><ellipse cx="160" cy="58" rx="9" ry="14" fill="#120a04" opacity="0.5"/>`
      : '';
  const shine =
    stage === 'golden'
      ? `<path d="M40 34 C70 22 110 20 138 28" fill="none" stroke="#fffbe0" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
         <path d="M150 30 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z" fill="#fffef2"/>
         <path d="M58 82 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 Z" fill="#fffef2"/>`
      : `<path d="M44 36 C70 24 104 22 130 28" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="${stage === 'burnt' ? 0.12 : 0.35}"/>`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient></defs>
    ${dorsal}
    <path d="${body}" fill="url(#${id})" stroke="${c.stroke}" stroke-width="3.5" stroke-linejoin="round"/>
    ${scales(c.detail)}
    <path d="M64 30 C78 46 78 78 64 92" fill="none" stroke="${c.detail}" stroke-width="3" stroke-linecap="round"/>
    <path d="M172 ${candidate ? 34 : 40} L186 ${candidate ? 20 : 30} M172 60 L190 60 M172 80 L186 90" stroke="${c.detail}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="44" cy="50" r="8" fill="${stage === 'burnt' ? '#0c0703' : '#3a2410'}"/>
    <circle cx="41" cy="47" r="2.6" fill="#ffffff" opacity="${stage === 'burnt' ? 0.3 : 0.9}"/>
    <path d="M20 68 q6 4 12 0" fill="none" stroke="${c.stroke}" stroke-width="3" stroke-linecap="round"/>
    ${burntMarks}${shine}`;
}

/** 빵틀에 부은 반죽 (위에서 본 모습). 아랫면 익힘에 따라 가장자리 색이 바뀐다 */
function batterSvg(stage: SideStage): string {
  const edge = stage === 'raw' ? '#ead396' : stage === 'good' ? '#d68f38' : '#4a2c16';
  const middle = stage === 'burnt' ? '#b78a5a' : '#fbefcf';
  return `<defs>
      <radialGradient id="b${stage}" cx="0.45" cy="0.45" r="0.62"><stop offset="0.45" stop-color="${middle}"/><stop offset="1" stop-color="${edge}"/></radialGradient>
      <radialGradient id="bean${stage}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#9a4136"/><stop offset="1" stop-color="#4f1a17"/></radialGradient>
    </defs>
    <path d="${FISH}" fill="url(#b${stage})" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M78 52 C86 40 116 38 128 50 C138 60 128 76 106 78 C86 80 70 66 78 52 Z" fill="url(#bean${stage})"/>
    <path d="M90 50 C98 45 110 45 116 50" fill="none" stroke="#e08f86" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    <circle cx="58" cy="44" r="4" fill="#ffffff" opacity="0.5"/><circle cx="150" cy="72" r="3" fill="#ffffff" opacity="0.4"/>
    ${stage === 'burnt' ? `<path d="${FISH}" fill="#1a0e05" opacity="0.25"/>` : ''}`;
}

/** 무쇠 빵틀 한 칸 (위에서 본 모습, 붕어빵 모양 홈) */
function moldSvg(): string {
  const t = `translate(${MOLD_W / 2} ${MOLD_H / 2}) scale(${BUN_SCALE}) translate(${-BUN_W / 2} ${-BUN_H / 2})`;
  return `<defs>
      <linearGradient id="iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5f66"/><stop offset="1" stop-color="#2a2d32"/></linearGradient>
      <radialGradient id="hollow" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#2b2e33"/><stop offset="1" stop-color="#16181b"/></radialGradient>
    </defs>
    <rect x="3" y="5" width="${MOLD_W - 6}" height="${MOLD_H - 6}" rx="22" fill="#121315" opacity="0.55"/>
    <rect x="3" y="2" width="${MOLD_W - 6}" height="${MOLD_H - 8}" rx="22" fill="url(#iron)" stroke="#1b1d20" stroke-width="3"/>
    <rect x="12" y="8" width="${MOLD_W - 24}" height="10" rx="5" fill="#ffffff" opacity="0.08"/>
    <g transform="${t}">
      <path d="${FISH}" fill="url(#hollow)" stroke="#6b7179" stroke-width="5" stroke-linejoin="round"/>
      ${scales('#3a3e44')}
      <circle cx="44" cy="50" r="7" fill="#3a3e44"/>
    </g>
    <circle cx="16" cy="18" r="5" fill="#80868e"/><circle cx="${MOLD_W - 16}" cy="18" r="5" fill="#80868e"/>
    <circle cx="16" cy="${MOLD_H - 22}" r="5" fill="#4a4f56"/><circle cx="${MOLD_W - 16}" cy="${MOLD_H - 22}" r="5" fill="#4a4f56"/>`;
}

/** 진열대의 작은 붕어빵. 품질은 색과 모양(별, 점선, 연기)으로 같이 보여 준다 */
function shelfSvg(q: Quality): string {
  const stage = q === 'golden' ? 'golden' : q;
  const c = BUN_COLORS[stage];
  const marker =
    q === 'golden'
      ? `<path d="M168 8 l9 20 l22 2 l-17 14 l6 22 l-20 -12 l-20 12 l6 -22 l-17 -14 l22 -2 Z" fill="#fff6c2" stroke="#c9850f" stroke-width="5" stroke-linejoin="round"/>`
      : q === 'raw'
        ? `<path d="${FISH}" fill="none" stroke="#ffffff" stroke-width="7" stroke-dasharray="12 10" opacity="0.95"/>`
        : q === 'burnt'
          ? `<path d="M70 14 q-12 -12 0 -24 q12 -12 0 -24 M110 16 q-12 -12 0 -24 q12 -12 0 -24" fill="none" stroke="#5c5c5c" stroke-width="7" stroke-linecap="round" transform="translate(0 20)"/>`
          : '';
  return `<g transform="scale(${SHELF_W / 200} ${SHELF_H / 120})">
      <path d="${FISH}" fill="${c.bottom}" stroke="${c.stroke}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M30 40 C60 26 100 24 130 30" fill="none" stroke="${c.top}" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
      <circle cx="44" cy="52" r="10" fill="#2c1a0a"/>
      ${marker}
    </g>`;
}

// ---------------------------------------------------------------- 펌프·아이콘·효과

/** 펌프 몸통 (100 × 200): 빨간 통 + 불꽃 무늬 */
function pumpBodySvg(): string {
  return `<defs><linearGradient id="pb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9f1c22"/><stop offset="0.45" stop-color="#e5414a"/><stop offset="1" stop-color="#8a1219"/></linearGradient></defs>
    <rect x="44" y="4" width="12" height="40" rx="4" fill="#9aa0a8"/>
    <rect x="18" y="36" width="64" height="140" rx="22" fill="url(#pb)" stroke="#5e0d12" stroke-width="4"/>
    <rect x="26" y="44" width="10" height="120" rx="5" fill="#ffffff" opacity="0.25"/>
    <circle cx="50" cy="106" r="22" fill="#ffd34d" stroke="#8a4b0c" stroke-width="3"/>
    <path d="M50 92 C58 102 60 110 54 118 C52 112 48 110 46 106 C44 112 42 116 44 120 C36 112 40 100 50 92 Z" fill="#e5414a"/>
    <rect x="12" y="172" width="76" height="20" rx="8" fill="#3a3d42"/>`;
}

/** 펌프 손잡이 (100 × 60) */
function pumpHandleSvg(): string {
  return `<rect x="44" y="20" width="12" height="40" fill="#b7bcc3"/>
    <rect x="6" y="6" width="88" height="22" rx="11" fill="#2f3237" stroke="#16181b" stroke-width="3"/>
    <rect x="14" y="10" width="70" height="6" rx="3" fill="#ffffff" opacity="0.2"/>`;
}

/** 아이콘 (64 × 64) */
function iconSvg(name: IconName): string {
  switch (name) {
    case 'pause':
      return `<rect x="16" y="12" width="12" height="40" rx="4" fill="currentColor"/><rect x="36" y="12" width="12" height="40" rx="4" fill="currentColor"/>`;
    case 'trash':
      return `<rect x="12" y="14" width="40" height="7" rx="3" fill="#6b6f76"/><rect x="25" y="8" width="14" height="7" rx="3" fill="#6b6f76"/>
        <path d="M16 24 h32 l-3 32 h-26 Z" fill="#8a8f96" stroke="#4b4f55" stroke-width="3" stroke-linejoin="round"/>
        <path d="M26 30 v20 M32 30 v20 M38 30 v20" stroke="#4b4f55" stroke-width="3" stroke-linecap="round"/>`;
    case 'clock':
      return `<circle cx="32" cy="32" r="24" fill="#ffffff" stroke="#3b4a6b" stroke-width="5"/><path d="M32 18 v15 l10 7" fill="none" stroke="#3b4a6b" stroke-width="5" stroke-linecap="round"/>`;
    case 'plusOne':
      return `<rect x="4" y="12" width="56" height="40" rx="20" fill="#ff8a3d" stroke="#b85512" stroke-width="3"/>
        <path d="M14 32 h16 M22 24 v16" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
        <path d="M40 26 l6 -4 v22" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'noBurnt':
      return `<g transform="translate(6 18) scale(0.26)"><path d="${FISH}" fill="#4b2f1c" stroke="#1d1108" stroke-width="8"/></g>
        <circle cx="32" cy="34" r="24" fill="none" stroke="#e5414a" stroke-width="6"/><path d="M15 51 L49 17" stroke="#e5414a" stroke-width="6" stroke-linecap="round"/>`;
    case 'camera':
      return `<rect x="6" y="18" width="38" height="30" rx="8" fill="#5b46c9"/><path d="M44 28 l14 -8 v26 l-14 -8 Z" fill="#5b46c9"/>
        <circle cx="25" cy="33" r="8" fill="#ffffff"/><circle cx="25" cy="33" r="4" fill="#5b46c9"/><circle cx="12" cy="14" r="5" fill="#e5414a"/>`;
    case 'star':
      return `<path d="M32 6 l8 17 l18 2 l-14 12 l4 18 l-16 -9 l-16 9 l4 -18 l-14 -12 l18 -2 Z" fill="#ffc83d" stroke="#c9850f" stroke-width="3" stroke-linejoin="round"/>`;
    case 'heart':
      return `<path d="M32 54 C10 40 6 24 16 16 C24 10 30 14 32 20 C34 14 40 10 48 16 C58 24 54 40 32 54 Z" fill="#ff5d7a" stroke="#c22b4b" stroke-width="3"/>`;
    case 'flame':
      return `<path d="M32 6 C44 20 50 30 46 44 C44 52 38 58 32 58 C24 58 16 52 16 42 C16 32 22 28 24 20 C28 26 28 30 30 32 C32 24 30 14 32 6 Z" fill="#ff7a2f" stroke="#c2410c" stroke-width="3" stroke-linejoin="round"/>
        <path d="M32 30 C38 38 40 44 36 50 C34 54 28 54 26 50 C24 46 28 40 32 30 Z" fill="#ffd34d"/>`;
    case 'store':
      return `<path d="M8 26 l6 -14 h36 l6 14 Z" fill="#e5414a"/><rect x="12" y="26" width="40" height="28" fill="#f3e3c3" stroke="#8a5a26" stroke-width="3"/><rect x="26" y="36" width="12" height="18" fill="#8a5a26"/>`;
    case 'back':
      return `<path d="M38 14 L20 32 L38 50" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

/** 동전 (64 × 64) */
function coinSvg(): string {
  return `<circle cx="32" cy="32" r="26" fill="#f2b632" stroke="#a8650c" stroke-width="4"/><circle cx="32" cy="32" r="17" fill="none" stroke="#fff0a6" stroke-width="3" opacity="0.8"/>
    <path d="M20 22 C26 16 36 15 42 18" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
}

/** 간판의 까치 (자체 그림, 128 × 96) */
function magpieSvg(): string {
  return `<path d="M20 58 C22 40 40 30 58 34 L72 22 C78 18 86 22 84 30 L80 40 C94 42 104 52 120 56 C104 60 94 62 82 64 C70 78 46 82 32 74 C26 70 20 66 20 58 Z" fill="#1d2433"/>
    <path d="M44 58 C52 48 66 48 76 56 C68 66 52 68 44 58 Z" fill="#ffffff"/>
    <path d="M82 40 C92 38 104 44 120 56 C104 52 94 50 84 52 Z" fill="#2c7a8a"/>
    <path d="M20 52 l-12 -2 l12 -4 Z" fill="#1d2433"/><circle cx="30" cy="48" r="3" fill="#ffffff"/>`;
}

// ---------------------------------------------------------------- 캔버스로 그리는 효과

/** 부드러운 원 (김·연기·빛) */
function softDot(size: number, rgb: string, alpha: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** 네 갈래 반짝이 */
function sparkle(size: number): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const h = size / 2;
  ctx.fillStyle = '#fff8d6';
  ctx.beginPath();
  ctx.moveTo(h, 0);
  ctx.quadraticCurveTo(h, h, size, h);
  ctx.quadraticCurveTo(h, h, h, size);
  ctx.quadraticCurveTo(h, h, 0, h);
  ctx.quadraticCurveTo(h, h, h, 0);
  ctx.fill();
  return c;
}

/** 모든 텍스처를 굽는다. 화면이 뜨기 전에 한 번 */
export async function buildTextures(iconColor: string): Promise<TextureSet> {
  const set: TextureSet = new Map();
  const jobs: Promise<void>[] = [];
  /** SVG를 구워 넣는다 */
  const bake = (key: string, body: string, w: number, h: number) =>
    jobs.push(
      rasterize(body, w, h).then((c) => {
        set.set(key, c);
      }),
    );

  bake(TEX.mold, moldSvg(), MOLD_W, MOLD_H);
  for (const s of ['raw', 'good', 'burnt'] as const) bake(TEX.batter(s), batterSvg(s), BUN_W, BUN_H);
  for (const s of ['raw', 'good', 'burnt', 'golden'] as const) bake(TEX.fish(s), fishSvg(s, false), BUN_W, BUN_H);
  for (const s of ['raw', 'good', 'burnt'] as const) bake(TEX.candidate(s), fishSvg(s, true), BUN_W, BUN_H);
  for (const q of ['golden', 'good', 'raw', 'burnt'] as const) bake(TEX.shelf(q), shelfSvg(q), SHELF_W, SHELF_H);
  bake(TEX.pumpBody, pumpBodySvg(), 100, 200);
  bake(TEX.pumpHandle, pumpHandleSvg(), 100, 60);
  bake(TEX.coin, coinSvg(), ICON, ICON);
  bake(TEX.magpie, magpieSvg(), 128, 96);
  for (const name of ['pause', 'trash', 'clock', 'plusOne', 'noBurnt', 'camera', 'star', 'heart', 'flame', 'store', 'back'] as const) {
    bake(TEX.icon(name), iconSvg(name).replaceAll('currentColor', iconColor), ICON, ICON);
  }
  for (const kind of PEOPLE_KINDS) {
    for (let v = 0; v < PEOPLE_VARIANTS; v += 1) {
      for (const face of PEOPLE_FACES) bake(TEX.person(kind, v, face), personSvg(kind, v, face), PERSON_W, PERSON_H);
    }
  }
  await Promise.all(jobs);

  set.set(TEX.steam, softDot(64, '255, 255, 255', 0.75));
  set.set(TEX.smoke, softDot(64, '70, 70, 70', 0.7));
  set.set(TEX.glow, softDot(160, '255, 214, 90', 0.85));
  set.set(TEX.sparkle, sparkle(32));
  return set;
}
