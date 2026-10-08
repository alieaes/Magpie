<script setup lang="ts">
// 랭킹 전체 페이지. 고른 대상·기간은 주소 쿼리(?target=&period=)에 남긴다.
// 관리자에게는 줄마다 관리 메뉴(기록 삭제·닉네임 초기화)가 생긴다. 근거: docs/design/261008-02-admin.md §5
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhClock } from '@phosphor-icons/vue';
import {
  RANKING_MAX_LIMIT,
  TOTAL_POINTS_PER_GAME,
  type RankingEntry,
  type RankingPeriod,
  type RankingTarget,
} from '@magpie/shared';
import { ApiError, adminRemovePlay, adminResetNickname, fetchRanking } from '../api';
import { useAsyncData } from '../composables/useAsyncData';
import { useAuthStore } from '../stores/auth';
import { useCountdown } from '../composables/useCountdown';
import { formatNumber, formatRemaining, scoreUnit, targetLabel } from '../format';
import { parsePeriod, parseTarget, rankingTargetOptions } from '../rankingTargets';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import PeriodToggle from '../components/PeriodToggle.vue';
import RankingList from '../components/RankingList.vue';
import TargetTabs from '../components/TargetTabs.vue';

const route = useRoute();
const router = useRouter();
const options = rankingTargetOptions();
const auth = useAuthStore();

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
  // 로그인·로그아웃하면 내 순위가, 관리자면 관리용 번호가, 닉네임을 바꾸면 보이는 이름이 바뀌므로 다시 불러온다
  [target, period, () => auth.loggedIn, () => auth.isAdmin, () => auth.user?.nickname],
);
const remaining = useCountdown(() => data.value?.resetsAt, () => void reload());
const unit = computed(() => scoreUnit(target.value));

/** 확인을 기다리는 관리 작업 */
const pending = ref<{ kind: 'removePlay' | 'resetNickname'; entry: RankingEntry } | null>(null);
const acting = ref(false);
const actionError = ref('');
const confirmCopy = computed(() => {
  const p = pending.value;
  if (!p) return { title: '', message: '', confirm: '' };
  const name = p.entry.nickname;
  if (p.kind === 'removePlay') {
    const record = `${targetLabel(target.value)} ${formatNumber(p.entry.score)}${unit.value}`;
    return { title: '기록 삭제', message: `${name}의 ${record} 기록을 지울까요? 되돌릴 수 없어요.`, confirm: '기록 삭제' };
  }
  return {
    title: '닉네임 초기화',
    message: `${name}의 닉네임을 초기화할까요? 그 유저는 다음 접속 때 닉네임을 다시 정해야 해요.`,
    confirm: '초기화',
  };
});

/** 관리 메뉴에서 고른 작업의 확인 창을 연다 */
function ask(kind: 'removePlay' | 'resetNickname', entry: RankingEntry): void {
  actionError.value = '';
  pending.value = { kind, entry };
}

/** 확인한 관리 작업을 서버에 보내고 랭킹을 다시 불러온다 */
async function runAction(): Promise<void> {
  const p = pending.value;
  if (!p) return;
  acting.value = true;
  actionError.value = '';
  try {
    if (p.kind === 'removePlay') await adminRemovePlay(p.entry.playId!);
    else await adminResetNickname(p.entry.userId!);
    pending.value = null;
    void reload();
    // 내 닉네임을 초기화했을 수도 있으니 로그인 상태도 다시 받는다
    if (p.kind === 'resetNickname') void auth.load();
  } catch (err) {
    actionError.value = err instanceof ApiError && err.status < 500 ? err.message : '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
  } finally {
    acting.value = false;
  }
}
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
      :manageable="auth.isAdmin"
      :empty-text="period === 'daily' ? '아직 오늘 기록이 없어요' : '아직 기록이 없어요'"
      @retry="reload"
      @remove-play="ask('removePlay', $event)"
      @reset-nickname="ask('resetNickname', $event)"
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

    <ConfirmDialog
      :open="pending !== null"
      :title="confirmCopy.title"
      :message="confirmCopy.message"
      :confirm-label="confirmCopy.confirm"
      danger
      :busy="acting"
      :error="actionError"
      @confirm="runAction"
      @cancel="pending = null"
    />
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
