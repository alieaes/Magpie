<script setup lang="ts">
// 오늘 시간별 방문자 막대 24개. 근거: docs/design/261024-01-admin-dashboard.md §3
// 막대 폭이 화면 폭을 따라가도록 그릴 때 실제 폭을 재서 그 픽셀로 그린다(글자가 늘어나지 않게).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatNumber } from '../format';

const props = defineProps<{
  /** KST 0~23시에 처음 온 방문자 수 (24칸) */
  hourly: number[];
}>();

const LEFT = 32; // y축 숫자 자리
const TOP = 12;
const PLOT_H = 140;
const AXIS_H = 24;
const HEIGHT = TOP + PLOT_H + AXIS_H;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

const root = ref<HTMLElement | null>(null);
const width = ref(0);
/** 마우스를 올렸거나 누른 시간 */
const active = ref<number | null>(null);
let observer: ResizeObserver | null = null;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = entry.contentRect.width;
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

/** 1·2·5 × 10^k 중 n보다 작지 않은 가장 작은 수 */
function niceStep(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 5, 10].find((m) => m * power >= n) ?? 10;
  return step * power;
}

/** y축 맨 위 값. 눈금을 0·반·끝 셋으로 두므로 가장 큰 값의 반을 깔끔한 수로 올려 두 배 한다 (최소 4명) */
const top = computed(() => niceStep(Math.max(4, ...props.hourly) / 2) * 2);
const plotW = computed(() => Math.max(0, width.value - LEFT));
const slot = computed(() => plotW.value / 24);
const barW = computed(() => Math.max(2, Math.min(BAR_MAX, slot.value - GAP)));
const baseline = TOP + PLOT_H;

/** 위 끝만 둥근 막대 경로. 바닥은 네모 */
function barPath(i: number, value: number): string {
  const h = (value / top.value) * PLOT_H;
  const w = barW.value;
  const x = LEFT + i * slot.value + (slot.value - w) / 2;
  const y = baseline - h;
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${baseline}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${baseline}Z`;
}

const bars = computed(() =>
  props.hourly.map((value, hour) => ({ hour, value, path: value > 0 ? barPath(hour, value) : null })),
);
const yTicks = computed(() => [0, top.value / 2, top.value].map((v) => ({ value: v, y: baseline - (v / top.value) * PLOT_H })));
// 좁은 화면에서는 6시간마다, 넓으면 3시간마다 눈금 글자
const xTicks = computed(() => {
  const every = width.value < 420 ? 6 : 3;
  return Array.from({ length: 24 / every }, (_, k) => k * every).map((hour) => ({ hour, x: LEFT + (hour + 0.5) * slot.value }));
});

/** 말풍선 자리: 막대 위 가운데. 양 끝에서는 안쪽으로 밀어 넣는다 */
const tooltip = computed(() => {
  const hour = active.value;
  if (hour === null || width.value === 0) return null;
  const value = props.hourly[hour] ?? 0;
  const x = Math.min(Math.max(LEFT + (hour + 0.5) * slot.value, 48), width.value - 48);
  const y = baseline - (value / top.value) * PLOT_H - 8;
  return { hour, value, x, y };
});
</script>

<template>
  <div ref="root" class="visitor-chart">
    <svg v-if="width > 0" :width="width" :height="HEIGHT" :viewBox="`0 0 ${width} ${HEIGHT}`" aria-hidden="true" @pointerleave="active = null">
      <g class="grid">
        <line v-for="t in yTicks" :key="t.value" :x1="LEFT" :x2="width" :y1="t.y" :y2="t.y" />
      </g>
      <g class="y-labels">
        <text v-for="t in yTicks" :key="t.value" :x="LEFT - 8" :y="t.y" dy="0.32em" text-anchor="end">{{ formatNumber(t.value) }}</text>
      </g>
      <g class="x-labels">
        <text v-for="t in xTicks" :key="t.hour" :x="t.x" :y="baseline + 16" text-anchor="middle">{{ t.hour }}시</text>
      </g>
      <rect
        v-if="active !== null"
        class="column-hover"
        :x="LEFT + active * slot"
        :y="TOP"
        :width="slot"
        :height="PLOT_H"
        rx="4"
      />
      <g class="bars">
        <path v-for="b in bars" v-show="b.path" :key="b.hour" :d="b.path ?? ''" />
      </g>
      <!-- 막대보다 넓은 누름 자리: 그 시간 칸 전체 -->
      <g class="hits">
        <rect
          v-for="b in bars"
          :key="b.hour"
          :x="LEFT + b.hour * slot"
          :y="TOP"
          :width="slot"
          :height="PLOT_H"
          @pointerenter="active = b.hour"
          @click="active = b.hour"
        />
      </g>
    </svg>
    <div v-if="tooltip" class="tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }" role="status">
      <strong class="num">{{ formatNumber(tooltip.value) }}명</strong>
      <span>{{ tooltip.hour }}시</span>
    </div>
    <!-- 화면 읽기 프로그램용 표: 그래프의 값을 모두 담는다 -->
    <table class="visually-hidden">
      <caption>오늘 시간별 방문자</caption>
      <tbody>
        <tr v-for="b in bars" :key="b.hour">
          <th scope="row">{{ b.hour }}시</th>
          <td>{{ b.value }}명</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.visitor-chart {
  position: relative;
  width: 100%;
  min-height: 176px;
}

svg {
  display: block;
  overflow: visible;
}

.grid line {
  stroke: var(--border);
  stroke-width: 1;
  shape-rendering: crispEdges;
}

.y-labels text,
.x-labels text {
  fill: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.column-hover {
  fill: var(--surface-hover);
}

.bars path {
  fill: var(--accent);
}

.hits rect {
  fill: transparent;
  cursor: default;
}

.tooltip {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  box-shadow: var(--shadow-hover);
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, -100%);
}

.tooltip strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}
</style>
