<script setup lang="ts">
// 메인 화면 오른쪽 랭킹 요약. 기본은 총합·일간, 상위 10명.
import { computed, ref } from 'vue';
import { PhArrowRight } from '@phosphor-icons/vue';
import type { RankingPeriod, RankingTarget } from '@magpie/shared';
import { fetchRanking } from '../api';
import { useAsyncData } from '../composables/useAsyncData';
import { useAuthStore } from '../stores/auth';
import { useCountdown } from '../composables/useCountdown';
import { scoreUnit } from '../format';
import { rankingTargetOptions } from '../rankingTargets';
import PeriodToggle from './PeriodToggle.vue';
import RankingList from './RankingList.vue';

const PANEL_LIMIT = 10;

const target = ref<RankingTarget>('total');
const period = ref<RankingPeriod>('daily');
const options = rankingTargetOptions();
const auth = useAuthStore();

const { data, loading, error, reload } = useAsyncData(
  () => fetchRanking(target.value, period.value, PANEL_LIMIT),
  // 로그인·로그아웃하면 내 순위가 바뀌므로 다시 불러온다
  [target, period, () => auth.loggedIn],
);
// 일간 랭킹은 KST 00:00에 새로 시작하므로 그때 다시 불러온다
useCountdown(() => data.value?.resetsAt, () => void reload());

const title = computed(() => (period.value === 'daily' ? '오늘의 랭킹' : '역대 랭킹'));
const moreLink = computed(() => ({ path: '/ranking', query: { target: target.value, period: period.value } }));
</script>

<template>
  <section class="panel" aria-labelledby="ranking-panel-title">
    <header class="head">
      <h2 id="ranking-panel-title" class="title">{{ title }}</h2>
      <div class="controls">
        <label v-if="options.length > 1" class="select-wrap">
          <span class="visually-hidden">랭킹 대상</span>
          <select v-model="target" class="select">
            <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <span v-else class="target-label">총합</span>
        <PeriodToggle v-model="period" />
      </div>
    </header>

    <RankingList
      :entries="data?.entries ?? null"
      :me="data?.me"
      :unit="scoreUnit(target)"
      :loading="loading"
      :error="error !== null"
      :skeleton-rows="PANEL_LIMIT"
      :empty-text="period === 'daily' ? '아직 오늘 기록이 없어요' : '아직 기록이 없어요'"
      @retry="reload"
    />

    <RouterLink :to="moreLink" class="more">
      전체 랭킹 보기
      <PhArrowRight :size="15" weight="bold" />
    </RouterLink>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 14px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 6px;
}

.title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-strong);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.select {
  height: 36px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  color: var(--text-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border-top: 1px solid var(--border);
  margin: 4px -14px -14px;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  border-radius: 0 0 var(--radius-card) var(--radius-card);
  transition: color 150ms ease, background-color 150ms ease;
}

.more:hover {
  color: var(--text-strong);
  background: var(--surface-hover);
}
</style>
