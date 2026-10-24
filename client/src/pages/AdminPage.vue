<script setup lang="ts">
// 관리자 대시보드(/admin). 관리자가 아니면 없는 페이지 화면을 그린다. 실제 권한 확인은 서버가 한다.
// 근거: docs/design/261024-01-admin-dashboard.md §3
import { fetchAdminVisitors } from '../api';
import VisitorChart from '../components/VisitorChart.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { formatNumber } from '../format';
import { useAuthStore } from '../stores/auth';
import NotFoundPage from './NotFoundPage.vue';

const auth = useAuthStore();

// 관리자로 확인된 뒤에만 부른다. 로그인 상태를 받으면 다시 본다
const visitors = useAsyncData(() => (auth.isAdmin ? fetchAdminVisitors() : Promise.resolve(null)), [() => auth.isAdmin]);
</script>

<template>
  <template v-if="auth.loaded">
    <NotFoundPage v-if="!auth.isAdmin" />
    <main v-else class="admin-page">
      <h1 class="title">관리자 대시보드</h1>

      <section class="card" aria-labelledby="visitors-title">
        <h2 id="visitors-title" class="section-title">방문자</h2>

        <div v-if="visitors.error.value" class="failed">
          <p>방문자를 불러오지 못했어요.</p>
          <button type="button" class="retry" @click="visitors.reload()">다시 시도</button>
        </div>

        <template v-else>
          <dl class="stats">
            <div class="stat">
              <dt>오늘</dt>
              <dd v-if="visitors.data.value" class="num">{{ formatNumber(visitors.data.value.today.total) }}<small>명</small></dd>
              <dd v-else class="skeleton-text" />
            </div>
            <div class="stat">
              <dt>전체</dt>
              <dd v-if="visitors.data.value" class="num">{{ formatNumber(visitors.data.value.allTime) }}<small>명</small></dd>
              <dd v-else class="skeleton-text" />
            </div>
          </dl>

          <p class="chart-title">오늘 시간별 방문자</p>
          <VisitorChart v-if="visitors.data.value" :hourly="visitors.data.value.today.hourly" class="chart" />
          <div v-else class="chart skeleton-chart" />
        </template>
      </section>
    </main>
  </template>
</template>

<style scoped>
.admin-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 20px 96px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-strong);
}

.card {
  margin-top: 24px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 40px;
  margin: 16px 0 0;
}

.stat dt {
  font-size: 13px;
  color: var(--text-2);
}

.stat dd {
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.stat dd small {
  margin-left: 2px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-2);
}

.skeleton-text {
  width: 96px;
  height: 34px;
  border-radius: var(--radius-control);
  background: var(--skeleton);
}

.chart-title {
  margin-top: 24px;
  font-size: 13px;
  color: var(--text-2);
}

.chart {
  margin-top: 12px;
}

.skeleton-chart {
  height: 176px;
  border-radius: var(--radius-control);
  background: var(--skeleton);
}

.failed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-2);
}

.retry {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.retry:hover {
  background: var(--surface-hover);
}

@media (max-width: 480px) {
  .admin-page {
    padding: 28px 16px 80px;
  }

  .card {
    padding: 16px;
  }
}
</style>
