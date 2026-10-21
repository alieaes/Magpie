// 손님 그림: 6종 × 생김새 2가지 × 표정 3가지(보통·기쁨·화남)를 SVG로 그린다 (200 × 220, 머리와 어깨).
// 원작 손님 그림·이름은 쓰지 않는다. 성격은 상황(바쁨, 방송 중, 리뷰)에서 오게 하고 성별·나이를 한쪽으로 몰지 않는다.
// 근거: docs/design/261021-02-fish-bun-customers.md §1-1

import type { CustomerKind } from '../logic/rules';

export type Face = 'normal' | 'happy' | 'angry';

export const PEOPLE_FACES: readonly Face[] = ['normal', 'happy', 'angry'];
export const PEOPLE_KINDS: readonly CustomerKind[] = ['regular', 'kid', 'office', 'elder', 'creator', 'reviewer'];
/** 종류마다 생김새 가짓수 */
export const PEOPLE_VARIANTS = 2;

const INK = '#2b1d14';

/** 어깨와 옷 */
function body(color: string, shade: string): string {
  return `<path d="M14 222 C18 172 58 150 100 150 C142 150 182 172 186 222 Z" fill="${color}" stroke="${shade}" stroke-width="3"/>
    <path d="M70 154 C80 166 120 166 130 154" fill="none" stroke="${shade}" stroke-width="3" opacity="0.6"/>`;
}

/** 목·머리·귀 */
function head(skin: string, shade: string): string {
  return `<path d="M84 124 h32 v34 h-32 Z" fill="${skin}"/><path d="M84 146 q16 8 32 0" fill="none" stroke="${shade}" stroke-width="2" opacity="0.5"/>
    <circle cx="45" cy="98" r="12" fill="${skin}" stroke="${shade}" stroke-width="2"/><circle cx="155" cy="98" r="12" fill="${skin}" stroke="${shade}" stroke-width="2"/>
    <ellipse cx="100" cy="92" rx="56" ry="58" fill="${skin}" stroke="${shade}" stroke-width="2.5"/>`;
}

/** 눈·눈썹·입·볼 */
function face(f: Face, browColor = INK): string {
  const blush = `<ellipse cx="68" cy="114" rx="10" ry="6" fill="#ff8f8f" opacity="${f === 'happy' ? 0.7 : f === 'angry' ? 0.75 : 0.4}"/>
    <ellipse cx="132" cy="114" rx="10" ry="6" fill="#ff8f8f" opacity="${f === 'happy' ? 0.7 : f === 'angry' ? 0.75 : 0.4}"/>`;
  if (f === 'happy') {
    return `${blush}
      <path d="M68 98 q10 -12 20 0 M112 98 q10 -12 20 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M66 76 q12 -8 24 -2 M110 74 q12 -6 24 2" fill="none" stroke="${browColor}" stroke-width="4" stroke-linecap="round"/>
      <path d="M82 114 q18 26 36 0 Z" fill="#8a2b2b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M90 124 q10 8 20 0" fill="#ff8a8a"/>`;
  }
  if (f === 'angry') {
    return `${blush}
      <ellipse cx="78" cy="98" rx="5" ry="6" fill="${INK}"/><ellipse cx="122" cy="98" rx="5" ry="6" fill="${INK}"/>
      <path d="M64 78 L90 88 M136 78 L110 88" stroke="${browColor}" stroke-width="5" stroke-linecap="round"/>
      <path d="M86 130 q14 -12 28 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(148 40)" stroke="#e5414a" stroke-width="4" stroke-linecap="round" fill="none">
        <path d="M-10 -4 q6 2 8 -6 M10 -4 q-6 2 -8 -6 M-10 6 q6 -2 8 6 M10 6 q-6 -2 -8 6"/>
      </g>`;
  }
  return `${blush}
    <ellipse cx="78" cy="98" rx="6" ry="8" fill="${INK}"/><ellipse cx="122" cy="98" rx="6" ry="8" fill="${INK}"/>
    <circle cx="80" cy="95" r="2" fill="#ffffff"/><circle cx="124" cy="95" r="2" fill="#ffffff"/>
    <path d="M66 78 q12 -6 24 0 M110 78 q12 -6 24 0" fill="none" stroke="${browColor}" stroke-width="4" stroke-linecap="round"/>
    <path d="M88 120 q12 10 24 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
}

/** 안경 */
function glasses(color = '#33302d'): string {
  return `<g fill="none" stroke="${color}" stroke-width="4"><circle cx="78" cy="98" r="15"/><circle cx="122" cy="98" r="15"/><path d="M93 98 h14 M63 96 l-16 -4 M137 96 l16 -4"/></g>`;
}

/** 손님 한 명 */
export function personSvg(kind: CustomerKind, variant: number, f: Face): string {
  const v = variant % PEOPLE_VARIANTS;
  switch (kind) {
    case 'regular':
      return v === 0
        ? // 짧은 갈색 머리, 초록 후드티
          `${body('#5fae7a', '#3c7d52')}<path d="M84 160 l-6 30 M116 160 l6 30" stroke="#f3f0e6" stroke-width="4" stroke-linecap="round"/>
           ${head('#f6d2b5', '#d9a27f')}
           <path d="M44 86 C40 44 74 28 104 30 C136 32 162 54 156 90 C150 70 134 58 114 56 C98 66 72 66 56 62 C50 70 46 78 44 86 Z" fill="#7a4b2a"/>
           ${face(f, '#5a361c')}`
        : // 묶은 검은 머리, 주황 카디건
          `<path d="M150 70 C176 80 178 130 160 150 C168 120 160 96 150 90 Z" fill="#2d2420"/>
           ${body('#f08a3c', '#b85f1c')}<path d="M100 156 v66" stroke="#b85f1c" stroke-width="3"/><circle cx="108" cy="180" r="4" fill="#fff3e0"/><circle cx="108" cy="200" r="4" fill="#fff3e0"/>
           ${head('#eec29a', '#c9966c')}
           <path d="M44 90 C40 46 70 28 102 28 C136 28 162 50 158 92 C152 64 128 50 100 52 C78 54 60 64 50 78 C48 82 46 86 44 90 Z" fill="#2d2420"/>
           <circle cx="150" cy="56" r="14" fill="#2d2420"/><rect x="146" y="58" width="12" height="8" rx="3" fill="#e5414a"/>
           ${face(f, '#2d2420')}`;
    case 'kid':
      return v === 0
        ? // 노란 모자, 줄무늬 티
          `${body('#ffffff', '#c9c9c9')}<path d="M24 196 h152 M30 178 h140" stroke="#5aa5e8" stroke-width="10"/>
           ${head('#f9dcc4', '#e0b190')}
           <path d="M44 82 C44 36 156 36 156 82 Z" fill="#ffc83d" stroke="#c9850f" stroke-width="3"/>
           <path d="M96 80 C130 76 174 80 184 92 C150 96 118 92 96 88 Z" fill="#ffb31f" stroke="#c9850f" stroke-width="3"/>
           <circle cx="100" cy="42" r="6" fill="#e5414a"/>
           ${face(f, '#8a5a26')}`
        : // 양갈래 머리와 리본, 파란 멜빵
          `<circle cx="38" cy="78" r="20" fill="#5a3218"/><circle cx="162" cy="78" r="20" fill="#5a3218"/>
           ${body('#fbe3ef', '#e0a9c3')}<path d="M64 160 v62 M136 160 v62" stroke="#4a7bd1" stroke-width="12"/><rect x="62" y="190" width="76" height="32" fill="#4a7bd1"/>
           ${head('#f6d2b5', '#d9a27f')}
           <path d="M46 84 C46 46 72 32 100 32 C128 32 154 46 154 84 C140 66 120 58 100 58 C80 58 60 66 46 84 Z" fill="#5a3218"/>
           <path d="M28 62 l14 8 l-14 8 Z M58 62 l-14 8 l14 8 Z" fill="#ff5d7a" transform="translate(-6 0)"/>
           <path d="M148 62 l14 8 l-14 8 Z M178 62 l-14 8 l14 8 Z" fill="#ff5d7a" transform="translate(-4 0)"/>
           ${face(f, '#5a3218')}`;
    case 'office':
      return v === 0
        ? // 단정한 검은 머리, 안경, 남색 정장과 넥타이
          `${body('#2f3d63', '#1b2440')}<path d="M86 152 L100 176 L114 152 Z" fill="#ffffff"/><path d="M96 160 h8 l4 40 l-8 10 l-8 -10 Z" fill="#d6363f"/>
           <path d="M70 156 L94 200 M130 156 L106 200" stroke="#1b2440" stroke-width="3"/>
           ${head('#f1caa6', '#cf9f78')}
           <path d="M44 84 C44 46 72 30 100 30 C132 30 158 48 156 84 C146 62 118 50 90 54 C72 56 56 66 44 84 Z" fill="#1f1d1c"/>
           ${face(f, '#1f1d1c')}${glasses()}`
        : // 단발, 안경, 회색 재킷과 사원증
          `<path d="M42 92 C38 140 56 150 70 150 L70 96 Z M158 92 C162 140 144 150 130 150 L130 96 Z" fill="#3b2a22"/>
           ${body('#7d828c', '#565a62')}<path d="M86 152 L100 172 L114 152 Z" fill="#f3f0e6"/><path d="M84 156 L100 196 L116 156" fill="none" stroke="#2f6fd6" stroke-width="4"/>
           <rect x="90" y="194" width="20" height="24" rx="3" fill="#ffffff" stroke="#2f6fd6" stroke-width="3"/>
           ${head('#e8b98f', '#c48d62')}
           <path d="M42 96 C38 48 68 30 100 30 C134 30 162 48 158 96 C150 70 130 58 100 60 C76 60 56 70 42 96 Z" fill="#3b2a22"/>
           ${face(f, '#3b2a22')}${glasses('#7a2f2a')}`;
    case 'elder':
      return v === 0
        ? // 흰 옆머리, 둥근 안경, 콧수염, 갈색 카디건
          `${body('#8a5a3a', '#5e3b24')}<path d="M100 156 v66" stroke="#5e3b24" stroke-width="3"/><circle cx="108" cy="178" r="4" fill="#e9d9c4"/><circle cx="108" cy="200" r="4" fill="#e9d9c4"/>
           ${head('#f2cfb0', '#cf9f78')}
           <path d="M44 100 C36 76 44 62 56 58 C54 72 54 86 58 100 Z M156 100 C164 76 156 62 144 58 C146 72 146 86 142 100 Z" fill="#f2f2f2" stroke="#cfcfcf" stroke-width="2"/>
           <path d="M70 62 q30 -14 60 0" fill="none" stroke="#e2c3a6" stroke-width="3"/>
           ${face(f, '#bdbdbd')}
           <path d="M80 112 C88 106 96 108 100 112 C104 108 112 106 120 112 C112 118 104 116 100 114 C96 116 88 118 80 112 Z" fill="#f2f2f2" stroke="#cfcfcf" stroke-width="2"/>
           ${glasses('#8a6a3a')}`
        : // 흰 머리 쪽머리, 보라 카디건, 진주 목걸이
          `${body('#8e6bbf', '#64458f')}<path d="M70 160 q30 22 60 0" fill="none" stroke="#fffaf0" stroke-width="7" stroke-dasharray="1 9" stroke-linecap="round"/>
           ${head('#f6d6bd', '#d4a988')}
           <circle cx="100" cy="30" r="20" fill="#eeeeee" stroke="#cfcfcf" stroke-width="2"/>
           <path d="M44 92 C40 50 70 36 100 36 C130 36 160 50 156 92 C150 70 132 58 100 58 C70 58 52 70 44 92 Z" fill="#eeeeee" stroke="#cfcfcf" stroke-width="2"/>
           ${face(f, '#bdbdbd')}`;
    case 'creator':
      return `${body(v === 0 ? '#7b5cff' : '#ff6fae', v === 0 ? '#5236c9' : '#c93f7c')}
           <rect x="78" y="168" width="44" height="54" rx="10" fill="#ffffff" opacity="0.2"/>
           ${head(v === 0 ? '#f6d2b5' : '#d9a67e', v === 0 ? '#d9a27f' : '#b07a52')}
           <path d="M44 88 C38 46 70 26 102 28 C138 30 164 52 156 92 C150 66 128 54 104 56 C82 58 60 66 44 88 Z" fill="${v === 0 ? '#ff7eb6' : '#3ccfb4'}"/>
           ${face(f, v === 0 ? '#c94f86' : '#1f8f7a')}
           <path d="M40 92 C36 40 164 40 160 92" fill="none" stroke="#2b2b33" stroke-width="9"/>
           <rect x="28" y="82" width="22" height="34" rx="9" fill="#2b2b33"/><rect x="150" y="82" width="22" height="34" rx="9" fill="#2b2b33"/>
           <path d="M160 112 C156 128 140 134 124 132" fill="none" stroke="#2b2b33" stroke-width="4"/><circle cx="122" cy="132" r="6" fill="#e5414a"/>`;
    case 'reviewer':
      return v === 0
        ? // 베레모, 수첩과 펜, 줄무늬 셔츠
          `${body('#f3f0e6', '#c9c3b0')}<path d="M24 190 h152 M24 206 h152" stroke="#2f3d63" stroke-width="6"/>
           ${head('#f1caa6', '#cf9f78')}
           <path d="M46 84 C42 52 70 38 100 38 C130 38 158 52 154 84 C146 66 126 60 100 60 C76 60 56 68 46 84 Z" fill="#6b4226"/>
           <ellipse cx="100" cy="44" rx="58" ry="18" fill="#c0392b"/><circle cx="100" cy="26" r="6" fill="#c0392b"/>
           ${face(f, '#6b4226')}
           <g transform="translate(128 168) rotate(-10)"><rect width="46" height="54" rx="4" fill="#fff8d6" stroke="#8a6a3a" stroke-width="3"/><path d="M8 14 h30 M8 26 h30 M8 38 h20" stroke="#8a6a3a" stroke-width="3"/></g>
           <path d="M120 214 l40 -40" stroke="#2f3d63" stroke-width="6" stroke-linecap="round"/>`
        : // 곱슬머리, 안경, 목도리, 수첩
          `${body('#3c8d8a', '#25625f')}<path d="M54 158 C80 176 120 176 146 158 C140 172 126 180 100 182 C76 182 62 174 54 158 Z" fill="#ffd34d"/>
           ${head('#d9a67e', '#b07a52')}
           ${[50, 70, 92, 114, 134, 152].map((x, i) => `<circle cx="${x}" cy="${i === 0 || i === 5 ? 66 : 44}" r="18" fill="#2a1d18"/>`).join('')}
           ${face(f, '#2a1d18')}${glasses('#2a1d18')}
           <g transform="translate(26 172) rotate(8)"><rect width="44" height="50" rx="4" fill="#fff8d6" stroke="#8a6a3a" stroke-width="3"/><path d="M8 14 h28 M8 26 h28" stroke="#8a6a3a" stroke-width="3"/></g>`;
  }
}
