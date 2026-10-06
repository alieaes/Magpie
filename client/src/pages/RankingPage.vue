<script setup lang="ts">
// 랭킹 전체 페이지. 고른 대상·기간은 주소 쿼리(?target=&period=)에 남긴다.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhClock } from '@phosphor-icons/vue';
import { RANKING_MAX_LIMIT, TOTAL_POINTS_PER_GAME, type RankingPeriod, type RankingTarget } from '@magpie/shared';
import { fetchRanking } from '../api';
import { useAsyncData } from '../composables/useAsyncData';
import { useCountdown } from '../composables/useCountdown';
import { formatNumber, formatRemaining, scoreUnit } from '../format';
import { parsePeriod, parseTarget, rankingTargetOptions } from '../rankingTargets';
import PeriodToggle from '../components/PeriodToggle.vue';
import RankingList from '../components/RankingList.vue';
import TargetTabs from '../components/TargetTabs.vue';

const route = useRoute();
const router = useRouter();
const options = rankingTargetOptions();

/** 주소 쿼리를 바꾼다. 기록이 쌓이지 않게 replace로 */
function setQuery(next: { target?: RankingTarget; period?: RankingPeriod }): void {
  void router.replace({ query: { ...route.query, ...next } });
}

const target = computed<RankingTarget>({
  get: () => parseTarget(route.query.target),
  set: (value) => setQuery({ target: value }),
});
const period = computed<RankingPeriod>({
  get: () => parsePeriod(route.query.period),
  set: (value) => setQuery({ period: value }),
});

const { data, loading, error, reload } = useAsyncData(
  () => fetchRanking(target.value, period.value, RANKING_MAX_LIMIT),
  [target, period],
);
const remaining = useCountdown(() => data.value?.resetsAt, () => void reload());
const unit = computed(() => scoreUnit(target.value));
</script>

<template>
  <main class="ranking-page">
    <h1 class="title">랭킹</h1>

    <TargetTabs v-model="target" :options="options" class="tabs" />

    <div class="toolbar">
      <PeriodToggle v-model="period" />
      <p v-if="period === 'daily' && data?.day" class="meta">
        <PhClock :size="15" weight="bold" />
        <span class="num">{{ data.day }}</span>
        <span v-if="remaining !== null"> · 초기화까지 {{ formatRemaining(remaining) }}</span>
      </p>
      <p v-else-if="period === 'alltime'" class="meta">전체 기간</p>
    </div>

    <p v-if="target === 'total'" class="note">
      게임마다 1위를 {{ formatNumber(TOTAL_POINTS_PER_GAME) }}점으로 환산해 더한 점수예요. 순위가 내려갈수록 점수가 줄어요.
    </p>

    <p v-if="data && data.participants > 0" class="participants num">
      {{ formatNumber(data.participants) }}명 참여
    </p>

    <RankingList
      class="list"
      :entries="data?.entries ?? null"
      :me="data?.me"
      :unit="unit"
      :loading="loading"
      :error="error !== null"
      :skeleton-rows="12"
      :show-me-below="false"
      :empty-text="period === 'daily' ? '아직 오늘 기록이 없어요' : '아직 기록이 없어요'"
      @retry="reload"
    >
      <template #empty-action>
        <RouterLink to="/" class="empty-link">게임하러 가기</RouterLink>
      </template>
    </RankingList>

    <div v-if="data?.me" class="me-bar" role="status">
      <span>내 순위</span>
      <strong class="num">{{ formatNumber(data.me.rank) }}위</strong>
      <span class="dot" aria-hidden="true">·</span>
      <strong class="num">{{ formatNumber(data.me.score) }}{{ unit }}</strong>
    </div>
  </main>
</template>

<style scoped>
.ranking-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 20px 96px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-strong);
}

.tabs {
  margin-top: 20px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-top: 16px;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}

.note {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-control);
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-2);
}

.participants {
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-3);
}

.list {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.empty-link {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-control);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 13px;
  font-weight: 600;
}

.me-bar {
  position: sticky;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-hover);
  font-size: 14px;
  color: var(--text-2);
}

.me-bar strong {
  color: var(--accent-text);
}

.dot {
  color: var(--text-3);
}

@media (max-width: 639px) {
  .ranking-page {
    padding: 24px 14px 88px;
  }

  .title {
    font-size: 24px;
  }
}
</style>
