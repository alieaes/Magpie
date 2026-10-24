<script setup lang="ts">
// 관리자 대시보드의 플레이 이력 한 칸(로그인 또는 비로그인). 50개씩, [더 보기]로 이어 받는다.
// 근거: docs/design/261024-02-admin-play-history.md §5
import { ref, watch } from 'vue';
import { findGame, type AdminGuestPlay, type AdminMemberPlay, type AdminPlayWho, type GameId, type PlayRejectReason } from '@magpie/shared';
import { fetchAdminPlays } from '../api';
import { formatKstDateTime, formatNumber } from '../format';

const props = defineProps<{
  gameId: GameId;
  who: AdminPlayWho;
}>();

/** 거절 사유 문구 */
const REJECT_LABELS: Record<PlayRejectReason, string> = {
  bad_input: '입력 이상',
  time: '시간 안 맞음',
  mismatch: '점수 다름',
  stale_save: '저장 바뀜',
  admin: '관리자가 지움',
  abandoned: '버려짐',
};

/** 한 줄: 로그인 판이면 닉네임·거절 사유가 있다 */
type Row = { key: number; at: string; ip: string | null; score: number | null; nickname?: string | null; rejectReason?: PlayRejectReason | null };

const rows = ref<Row[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const failed = ref(false);
let requestId = 0;

/** 응답 줄을 화면 줄로 바꾼다 */
function toRows(items: AdminMemberPlay[] | AdminGuestPlay[]): Row[] {
  return items.map((item) =>
    'playId' in item
      ? { key: item.playId, at: item.at, ip: item.ip, score: item.score, nickname: item.nickname, rejectReason: item.rejectReason }
      : { key: item.id, at: item.at, ip: item.ip, score: item.score },
  );
}

/** 처음부터(cursor 없음) 또는 이어서 불러온다. 게임이 바뀐 뒤 늦게 온 응답은 버린다 */
async function load(more: boolean): Promise<void> {
  const id = ++requestId;
  if (more) loadingMore.value = true;
  else {
    loading.value = true;
    rows.value = [];
    nextCursor.value = null;
  }
  failed.value = false;
  try {
    const page = await fetchAdminPlays(props.gameId, props.who, more ? nextCursor.value : null);
    if (id !== requestId) return;
    rows.value = [...rows.value, ...toRows(page.items)];
    nextCursor.value = page.nextCursor;
  } catch (err) {
    if (id !== requestId) return;
    console.warn('[admin] 플레이 이력을 불러오지 못했다', err);
    failed.value = true;
  } finally {
    if (id === requestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

watch(
  () => [props.gameId, props.who],
  () => void load(false),
  { immediate: true },
);

/** 점수에 게임 단위를 붙인다 */
function scoreText(score: number): string {
  return `${formatNumber(score)}${findGame(props.gameId)?.scoreUnit ?? '점'}`;
}
</script>

<template>
  <div class="play-list">
    <ul v-if="loading" class="rows" aria-busy="true">
      <li v-for="i in 5" :key="i" class="row skeleton"><span class="bar" /></li>
    </ul>

    <template v-else>
      <ul v-if="rows.length > 0" class="rows">
        <li v-for="row in rows" :key="row.key" class="row">
          <span class="time num">{{ formatKstDateTime(row.at) }}</span>
          <span class="who">
            <template v-if="who === 'member'">
              <span class="nickname" :class="{ 'is-empty': !row.nickname }">{{ row.nickname ?? '이름 없음' }}</span>
              <span class="ip num">({{ row.ip ?? '-' }})</span>
            </template>
            <span v-else class="ip-only num">{{ row.ip ?? '-' }}</span>
          </span>
          <span v-if="row.rejectReason" class="rejected">거절 · {{ REJECT_LABELS[row.rejectReason] }}</span>
          <span v-else-if="row.score !== null" class="score num">{{ scoreText(row.score) }}</span>
        </li>
      </ul>
      <p v-else-if="!failed" class="empty">아직 없어요.</p>

      <div v-if="failed" class="failed">
        <p>불러오지 못했어요.</p>
        <button type="button" class="more-button" @click="load(rows.length > 0)">다시 시도</button>
      </div>
      <button v-else-if="nextCursor" type="button" class="more-button is-wide" :disabled="loadingMore" @click="load(true)">
        {{ loadingMore ? '불러오는 중' : '더 보기' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 4px 10px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.time {
  font-size: 13px;
  color: var(--text-2);
}

.who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 6px;
  min-width: 0;
}

.nickname {
  overflow: hidden;
  font-weight: 600;
  color: var(--text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nickname.is-empty {
  font-weight: 400;
  color: var(--text-3);
}

.ip {
  font-size: 13px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.ip-only {
  color: var(--text);
  overflow-wrap: anywhere;
}

.score {
  font-weight: 600;
  color: var(--text-strong);
  white-space: nowrap;
}

.rejected {
  font-size: 13px;
  color: #d9564a;
  white-space: nowrap;
  opacity: 0.85;
}

.skeleton {
  display: block;
}

.skeleton .bar {
  display: block;
  height: 18px;
  border-radius: 6px;
  background: var(--skeleton);
}

.empty {
  padding: 24px 0;
  font-size: 14px;
  color: var(--text-3);
  text-align: center;
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

.more-button {
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

.more-button.is-wide {
  display: block;
  width: 100%;
  margin-top: 12px;
}

.more-button:hover:not(:disabled) {
  background: var(--surface-hover);
}

.more-button:disabled {
  color: var(--text-3);
  cursor: default;
}
</style>
