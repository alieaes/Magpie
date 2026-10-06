<script setup lang="ts">
import { RANKING_PERIODS, type RankingPeriod } from '@magpie/shared';
import { periodLabel } from '../format';

const period = defineModel<RankingPeriod>({ required: true });
</script>

<template>
  <div class="toggle" role="radiogroup" aria-label="랭킹 기간">
    <button
      v-for="p in RANKING_PERIODS"
      :key="p"
      type="button"
      role="radio"
      class="option"
      :aria-checked="period === p"
      @click="period = p"
    >
      {{ periodLabel(p) }}
    </button>
  </div>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
}

.option {
  min-width: 52px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.option:hover {
  color: var(--text-strong);
}

.option[aria-checked='true'] {
  background: var(--surface);
  color: var(--text-strong);
  box-shadow: 0 0 0 1px var(--border);
}
</style>
