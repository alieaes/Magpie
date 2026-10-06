<script setup lang="ts">
import { computed } from 'vue';
import type { Game, GameSummary } from '@magpie/shared';
import { formatNumber } from '../format';
import GameThumb from './GameThumb.vue';

const props = defineProps<{
  game: Game;
  summary: GameSummary | null;
  loggedIn: boolean;
}>();

const playable = computed(() => props.game.status === 'playable');
const unit = computed(() => props.game.scoreUnit);
</script>

<template>
  <component
    :is="playable ? 'RouterLink' : 'div'"
    :to="playable ? `/play/${game.id}` : undefined"
    class="card"
    :class="{ 'is-soon': !playable }"
    :aria-disabled="playable ? undefined : 'true'"
  >
    <div class="thumb">
      <GameThumb :game-id="game.id" />
    </div>

    <div class="body">
      <div class="title-row">
        <h3 class="name">{{ game.name }}</h3>
        <span v-if="!playable" class="badge">준비 중</span>
      </div>
      <p class="tagline">{{ game.tagline }}</p>

      <dl v-if="playable" class="stats">
        <div class="stat">
          <dt>오늘 1위</dt>
          <dd v-if="summary?.todayTop" class="num">{{ formatNumber(summary.todayTop.score) }}{{ unit }}</dd>
          <dd v-else class="empty">첫 기록에 도전</dd>
        </div>
        <div v-if="loggedIn" class="stat">
          <dt>내 최고</dt>
          <dd v-if="summary?.myAllTimeBest != null" class="num">{{ formatNumber(summary.myAllTimeBest) }}{{ unit }}</dd>
          <dd v-else class="empty">기록 없음</dd>
        </div>
      </dl>
    </div>
  </component>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  transition: box-shadow 200ms ease, border-color 200ms ease, transform 200ms var(--ease-out);
}

a.card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

a.card:active {
  transform: scale(0.99);
}

.thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  border-bottom: 1px solid var(--border);
}

.is-soon .thumb :deep(svg) {
  opacity: 0.55;
  filter: saturate(0.4);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 9999px;
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px 16px;
}

.name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-strong);
}

.is-soon .name {
  color: var(--text-2);
}

.tagline {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 8px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.stat {
  display: flex;
  gap: 6px;
}

dt {
  color: var(--text-3);
}

dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
}

dd.empty {
  font-weight: 500;
  color: var(--text-2);
}

@media (max-width: 639px) {
  .body {
    padding: 12px 12px 14px;
  }

  .name {
    font-size: 15px;
  }
}
</style>
