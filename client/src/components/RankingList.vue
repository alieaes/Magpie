<script setup lang="ts">
import { computed } from 'vue';
import { PhArrowClockwise } from '@phosphor-icons/vue';
import type { RankingEntry } from '@magpie/shared';
import { formatNumber } from '../format';

const props = defineProps<{
  entries: RankingEntry[] | null;
  me?: { rank: number; score: number } | undefined;
  unit: string;
  loading: boolean;
  error: boolean;
  /** 불러오는 동안 보여줄 회색 막대 수 */
  skeletonRows?: number;
  emptyText: string;
  /** 내 순위가 목록 밖일 때 목록 아래에 붙일지. 랭킹 페이지는 하단 막대로 따로 보여줘서 끈다 */
  showMeBelow?: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

/** 내 순위가 목록 안에 있으면 그 줄을 강조하고, 밖이면 목록 아래에 따로 붙인다 */
const meOutside = computed(() => {
  if (!props.me || !props.entries) return false;
  const last = props.entries[props.entries.length - 1];
  return !last || props.me.rank > last.rank;
});
</script>

<template>
  <div class="ranking-list">
    <ol v-if="loading && !entries" class="rows" aria-busy="true">
      <li v-for="i in skeletonRows ?? 5" :key="i" class="row skeleton">
        <span class="bar bar-rank" />
        <span class="bar bar-name" :style="{ width: `${40 + ((i * 37) % 35)}%` }" />
        <span class="bar bar-score" />
      </li>
    </ol>

    <div v-else-if="error" class="state">
      <p>랭킹을 불러오지 못했어요</p>
      <button type="button" class="state-button" @click="emit('retry')">
        <PhArrowClockwise :size="15" weight="bold" />
        다시 시도
      </button>
    </div>

    <div v-else-if="entries && entries.length === 0" class="state">
      <p>{{ emptyText }}</p>
      <slot name="empty-action" />
    </div>

    <template v-else-if="entries">
      <ol class="rows" :class="{ 'is-refreshing': loading }">
        <li
          v-for="entry in entries"
          :key="entry.rank"
          class="row"
          :class="{ 'is-top': entry.rank <= 3, 'is-me': me?.rank === entry.rank }"
        >
          <span class="rank num">{{ entry.rank }}</span>
          <span class="nickname">{{ entry.nickname }}</span>
          <span class="score num">{{ formatNumber(entry.score) }}<small>{{ unit }}</small></span>
        </li>
      </ol>
      <template v-if="me && meOutside && showMeBelow !== false">
        <div class="divider" aria-hidden="true" />
        <div class="row is-me">
          <span class="rank num">{{ me.rank }}</span>
          <span class="nickname">나</span>
          <span class="score num">{{ formatNumber(me.score) }}<small>{{ unit }}</small></span>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  transition: opacity 150ms ease;
}

.rows.is-refreshing {
  opacity: 0.55;
}

.row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: var(--radius-control);
  font-size: 14px;
}

.row + .row {
  margin-top: 2px;
}

.rank {
  font-weight: 700;
  color: var(--text-3);
}

.is-top .rank {
  color: var(--accent);
}

.nickname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-strong);
  font-weight: 500;
}

.score {
  font-weight: 700;
  color: var(--text-strong);
}

.score small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

.is-me {
  background: var(--accent-soft);
}

.is-me .nickname {
  color: var(--accent-text);
  font-weight: 700;
}

.divider {
  height: 1px;
  margin: 8px 10px;
  background: var(--border);
}

.skeleton .bar {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: var(--skeleton);
}

.bar-rank {
  width: 16px;
}

.bar-score {
  width: 48px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 12px;
  text-align: center;
  color: var(--text-2);
  font-size: 14px;
}

.state-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.state-button:hover {
  background: var(--surface-hover);
}
</style>
