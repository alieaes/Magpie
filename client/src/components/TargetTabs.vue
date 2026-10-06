<script setup lang="ts">
import type { RankingTarget } from '@magpie/shared';
import type { TargetOption } from '../rankingTargets';

defineProps<{ options: TargetOption[] }>();
const target = defineModel<RankingTarget>({ required: true });
</script>

<template>
  <div class="tabs" role="tablist" aria-label="랭킹 대상">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="target === option.value"
      @click="target = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  flex: none;
  padding: 10px 12px;
  border: 0;
  background: none;
  color: var(--text-2);
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.tab:hover {
  color: var(--text-strong);
}

.tab[aria-selected='true'] {
  color: var(--text-strong);
}

.tab[aria-selected='true']::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}
</style>
