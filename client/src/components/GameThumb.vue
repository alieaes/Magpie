<script setup lang="ts">
// 로비 카드 그림. 게임마다 인라인 SVG로 직접 그린다 (원작 그림·캐릭터는 쓰지 않는다).
// 칼날 위치처럼 각도가 필요한 값은 미리 계산해 둔 숫자를 쓴다.
import type { GameId } from '@magpie/shared';

defineProps<{ gameId: GameId }>();

// 칼날 모으기: 중심(120, 92) 반지름 44 원 위 칼날 4개의 각도
const bladeAngles = [20, 110, 200, 290];

// 복권 긁기: 3 × 3칸 중 드러난 칸(윗줄 까치 3개 + 한 칸)과 은박이 남은 칸
const scratchCells = Array.from({ length: 9 }, (_, i) => ({
  x: 79 + (i % 3) * 30,
  y: 66 + Math.floor(i / 3) * 30,
  open: i < 3 || i === 4,
}));
</script>

<template>
  <svg class="thumb" :class="`thumb-${gameId}`" viewBox="0 0 240 180" role="img" aria-hidden="true">
    <!-- 사과게임: 합이 10이 되는 사과 두 개(3, 7)를 사각형으로 묶는 장면 -->
    <template v-if="gameId === 'apple-ten'">
      <rect class="bg-red" width="240" height="180" />
      <rect class="select" x="30" y="30" width="120" height="62" rx="14" />
      <g v-for="(apple, i) in [
        { x: 60, y: 62, n: 3 },
        { x: 120, y: 62, n: 7 },
        { x: 180, y: 62, n: 5 },
        { x: 60, y: 126, n: 6 },
        { x: 120, y: 126, n: 4 },
        { x: 180, y: 126, n: 8 },
      ]" :key="i">
        <path class="leaf" :d="`M${apple.x + 2} ${apple.y - 22} q 8 -10 16 -6 q -6 8 -16 6z`" />
        <circle class="apple" :cx="apple.x" :cy="apple.y" r="21" />
        <text class="apple-num" :x="apple.x" :y="apple.y + 7">{{ apple.n }}</text>
      </g>
    </template>

    <!-- 복권 긁기: 반쯤 긁힌 복권에 까치 3개가 드러나고, 옆에 동전이 있다 -->
    <template v-else-if="gameId === 'lucky-scratch'">
      <rect class="bg-purple" width="240" height="180" />
      <g transform="rotate(-6 120 92)">
        <rect class="ticket" x="66" y="20" width="108" height="150" rx="10" />
        <rect class="ticket-band" x="76" y="30" width="88" height="22" rx="5" />
        <circle class="ticket-emblem" cx="88" cy="41" r="7" />
        <rect class="ticket-title" x="100" y="37" width="54" height="8" rx="4" />
        <g v-for="(cell, i) in scratchCells" :key="i">
          <rect :class="cell.open ? 'cell-open' : 'cell-foil'" :x="cell.x - 13" :y="cell.y - 13" width="26" height="26" rx="5" />
          <template v-if="cell.open && i < 3">
            <path class="mag-tail" :d="`M${cell.x - 2} ${cell.y + 3} l-9 8`" />
            <ellipse class="mag-body" :cx="cell.x" :cy="cell.y + 1" rx="6" ry="5" />
            <ellipse class="mag-belly" :cx="cell.x + 1.5" :cy="cell.y + 3" rx="3.5" ry="2.6" />
            <circle class="mag-body" :cx="cell.x + 4" :cy="cell.y - 5" r="3.6" />
            <path class="mag-beak" :d="`M${cell.x + 7} ${cell.y - 6} l4 1.2 l-4 1.2z`" />
          </template>
          <circle v-else-if="cell.open" class="clover" :cx="cell.x" :cy="cell.y" r="6" />
        </g>
        <path class="win-line" d="M68 66 H172" />
      </g>
      <circle class="coin" cx="190" cy="138" r="18" />
      <circle class="coin-ring" cx="190" cy="138" r="12" />
      <path class="flake" d="M182 58 l5 -3 l3 4 l-5 3z M196 74 l4 -2 l2 3 l-4 2z M44 128 l5 -2 l2 4 l-5 2z" />
    </template>

    <!-- 과일 합치기: 상자 안에 크기가 다른 과일이 쌓이고, 위에서 하나가 떨어진다 -->
    <template v-else-if="gameId === 'fruit-merge'">
      <rect class="bg-green" width="240" height="180" />
      <line class="danger" x1="58" y1="58" x2="182" y2="58" />
      <path class="box" d="M58 50 V158 H182 V50" />
      <circle class="fruit-big" cx="98" cy="122" r="33" />
      <path class="stripe" d="M78 104 q 20 18 40 0 M74 124 q 24 18 48 0" />
      <circle class="fruit-orange" cx="152" cy="133" r="22" />
      <circle class="fruit-grape" cx="140" cy="97" r="15" />
      <circle class="fruit-cherry" cx="167" cy="103" r="10" />
      <line class="drop" x1="120" y1="36" x2="120" y2="80" />
      <circle class="fruit-cherry" cx="120" cy="28" r="10" />
    </template>

    <!-- 칼날 모으기: 주인공 주위를 칼날이 돌고, 칼날 버블과 체력 있는 물체가 있다 -->
    <template v-else-if="gameId === 'blade-orbit'">
      <rect class="bg-blue" width="240" height="180" />
      <circle class="orbit" cx="120" cy="92" r="44" />
      <g v-for="angle in bladeAngles" :key="angle" :transform="`rotate(${angle} 120 92)`">
        <path class="blade" d="M120 44 q 16 4 14 22 q -6 -12 -14 -22z" />
      </g>
      <circle class="hero" cx="120" cy="92" r="15" />
      <circle class="bubble" cx="196" cy="44" r="18" />
      <text class="bubble-num" x="196" y="49">+3</text>
      <circle class="object" cx="46" cy="138" r="22" />
      <text class="object-num" x="46" y="144">12</text>
    </template>

    <!-- 숫자 던전: 나보다 작은 숫자만 잡아먹으며 길을 고른다 -->
    <template v-else-if="gameId === 'number-dungeon'">
      <rect class="bg-yellow" width="240" height="180" />
      <path class="path" d="M60 120 H120 V60 H180 M120 120 H180" />
      <g v-for="(tile, i) in [
        { x: 60, y: 120, n: '20', kind: 'hero' },
        { x: 120, y: 120, n: '8', kind: 'weak' },
        { x: 180, y: 120, n: '32', kind: 'strong' },
        { x: 120, y: 60, n: '×3', kind: 'item' },
        { x: 180, y: 60, n: '45', kind: 'strong' },
      ]" :key="i">
        <rect class="tile" :class="`tile-${tile.kind}`" :x="tile.x - 22" :y="tile.y - 22" width="44" height="44" rx="10" />
        <text class="tile-num" :class="`tile-num-${tile.kind}`" :x="tile.x" :y="tile.y + 6">{{ tile.n }}</text>
      </g>
    </template>

    <!-- 설원 캠프: 눈밭의 천막과 모닥불, 돈을 내고 여는 구매 칸 -->
    <template v-else>
      <rect class="bg-teal" width="240" height="180" />
      <path class="ground" d="M0 140 q 60 -14 120 -4 t 120 -6 V180 H0z" />
      <path class="tent" d="M58 132 L100 66 L142 132z" />
      <path class="tent-door" d="M92 132 L100 104 L108 132z" />
      <path class="flame" d="M176 128 q -12 -14 0 -32 q 4 14 10 10 q 6 12 -10 22z" />
      <rect class="log" x="160" y="128" width="34" height="7" rx="3" />
      <rect class="pad" x="22" y="30" width="54" height="34" rx="8" />
      <text class="pad-num" x="49" y="53">45</text>
      <circle class="snow" cx="160" cy="34" r="3" />
      <circle class="snow" cx="198" cy="58" r="2.5" />
      <circle class="snow" cx="128" cy="24" r="2" />
      <circle class="snow" cx="214" cy="26" r="2" />
    </template>
  </svg>
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  height: 100%;
}

text {
  font-family: var(--font-sans);
  font-weight: 700;
  text-anchor: middle;
  font-variant-numeric: tabular-nums;
}

.bg-red { fill: var(--tint-red); }
.bg-green { fill: var(--tint-green); }
.bg-blue { fill: var(--tint-blue); }
.bg-yellow { fill: var(--tint-yellow); }
.bg-teal { fill: var(--tint-teal); }
.bg-purple { fill: var(--tint-purple); }

/* 사과게임 */
.select {
  fill: color-mix(in srgb, var(--accent) 10%, transparent);
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-dasharray: 7 5;
}
.apple { fill: #d9564a; }
.leaf { fill: #5e9b4f; }
.apple-num { fill: #ffffff; font-size: 20px; }

/* 복권 긁기 */
.ticket { fill: #1b2c5c; stroke: #e2ac3a; stroke-width: 3; }
.ticket-band { fill: rgba(5, 10, 28, 0.45); }
.ticket-emblem { fill: #e2ac3a; }
.ticket-title { fill: #e2ac3a; opacity: 0.85; }
.cell-open { fill: #fbf3df; }
.cell-foil { fill: #c3c9d2; stroke: #eef1f4; stroke-width: 1.2; }
.mag-body { fill: #151a22; }
.mag-belly { fill: #ffffff; }
.mag-tail { stroke: #1f6f7a; stroke-width: 3; stroke-linecap: round; }
.mag-beak { fill: #151a22; }
.clover { fill: #4cb85a; }
.win-line { stroke: #f2b632; stroke-width: 3; stroke-linecap: round; opacity: 0.9; }
.coin { fill: #f2c14e; stroke: #b47a14; stroke-width: 2.5; }
.coin-ring { fill: none; stroke: #c98a1a; stroke-width: 2; }
.flake { fill: #b8c0cb; }

/* 과일 합치기 */
.box { fill: none; stroke: var(--thumb-ink); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
.danger { stroke: #d9564a; stroke-width: 2; stroke-dasharray: 6 5; opacity: 0.7; }
.drop { stroke: var(--thumb-ink); stroke-width: 2; stroke-dasharray: 3 5; opacity: 0.35; }
.fruit-big { fill: #5f9e56; }
.stripe { fill: none; stroke: #3f7a39; stroke-width: 3; stroke-linecap: round; }
.fruit-orange { fill: #e8964a; }
.fruit-grape { fill: #8a6bb5; }
.fruit-cherry { fill: #d9564a; }

/* 칼날 모으기 */
.orbit { fill: none; stroke: var(--thumb-ink); stroke-width: 1.5; stroke-dasharray: 4 6; opacity: 0.3; }
.blade { fill: var(--thumb-ink); }
.hero { fill: var(--accent); }
.bubble { fill: var(--thumb-paper); stroke: var(--accent); stroke-width: 2.5; }
.bubble-num { fill: var(--accent-text); font-size: 15px; }
.object { fill: #e0b74a; }
.object-num { fill: #5a4410; font-size: 16px; }

/* 숫자 던전 */
.path { fill: none; stroke: var(--thumb-ink); stroke-width: 3; stroke-dasharray: 2 7; stroke-linecap: round; opacity: 0.45; }
.tile { fill: var(--thumb-paper); stroke: var(--thumb-ink); stroke-opacity: 0.12; stroke-width: 1.5; }
.tile-hero { fill: var(--accent); stroke: none; }
.tile-num { font-size: 17px; fill: var(--thumb-ink); }
.tile-num-hero { fill: #ffffff; }
.tile-num-weak { fill: #3f7a39; }
.tile-num-strong { fill: #b8473c; }
.tile-num-item { fill: #956400; }

/* 설원 캠프 */
.ground { fill: var(--thumb-paper); }
.tent { fill: #c9714f; }
.tent-door { fill: #6f3a26; }
.flame { fill: #e8964a; }
.log { fill: #7a5236; }
.pad { fill: var(--thumb-paper); stroke: #3f7a39; stroke-width: 2; stroke-dasharray: 5 4; }
.pad-num { fill: #3f7a39; font-size: 16px; }
.snow { fill: var(--thumb-paper); }
</style>
