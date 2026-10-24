<script setup lang="ts">
// 랭킹 대상 탭. 분류(미니게임·게임) 묶음 사이에 세로 구분선을 둔다
import type { RankingTarget } from '@magpie/shared';
import type { TargetGroup } from '../rankingTargets';

withDefaults(defineProps<{ groups: TargetGroup[]; label?: string }>(), { label: '랭킹 대상' });
const target = defineModel<RankingTarget>({ required: true });
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <template v-for="(group, gi) in groups" :key="group.kind">
      <span v-if="gi > 0" class="divider" aria-hidden="true" />
      <button
        v-for="option in group.options"
        :key="option.value"
        type="button"
        role="tab"
        class="tab"
        :aria-selected="target === option.value"
        @click="target = option.value"
      >
        {{ option.label }}
      </button>
    </template>
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

.divider {
  flex: none;
  align-self: center;
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--border-strong);
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
