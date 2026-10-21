<script setup lang="ts">
// 성장형 게임 화면 (/play/:gameId 중 kind가 growth인 게임). 가게·하루 장사·정산 화면은 게임이 그리고,
// 셸은 저장 창구(GrowthSession), 소리, "나가기"만 맡는다. 로그인 + 닉네임이면 서버에 저장하고, 아니면 체험.
// 근거: docs/design/261021-04-game-save.md §3, §6
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { PhArrowClockwise, PhSignOut, PhSpeakerHigh, PhSpeakerSlash } from '@phosphor-icons/vue';
import type { Game } from '@magpie/shared';
import type { GrowthInstance } from '@magpie/shared/game-module';
import { ApiError } from '../api';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useSound } from '../composables/useSound';
import { createSavedSession, createTrialSession } from '../games/growthSession';
import { loadGameModule } from '../games/registry';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ game: Game }>();

type Phase = 'loading' | 'ready' | 'error';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { user } = storeToRefs(auth);
const host = ref<HTMLElement | null>(null);
const phase = ref<Phase>('loading');
const errorMessage = ref('');
/** 하루 장사 중인지 (게임이 알려 준다). 장사 중에 나가면 그날은 저장되지 않는다 */
const dayActive = ref(false);
/** 장사 중에 나가려 할 때 묻는 창 */
const leaveOpen = ref(false);
let leaveTarget: string | null = null;
let leaveConfirmed = false;
let instance: GrowthInstance | null = null;
/** 띄우는 중에 다시 띄우면 먼저 것은 버린다 */
let mountSeq = 0;

// 소리 끄기·음량 (브라우저에 저장, 미니게임과 같은 값)
const { muted, volume, attach: attachSound, onVolume, toggleMuted } = useSound();

/** 개발 중에는 ?seed=로 같은 하루를 다시 띄울 수 있다. 이때는 체험이다 */
const fixedSeed = computed(() => {
  const seed = route.query.seed;
  return import.meta.env.DEV && typeof seed === 'string' && seed ? seed : null;
});
/** 서버에 저장할 수 있는지: 로그인 + 닉네임 */
const canSave = computed(() => Boolean(user.value?.nickname) && fixedSeed.value === null);
/** 머리줄의 체험 안내. 저장하는 중이면 없다 */
const modeNote = computed(() => {
  if (!auth.loaded || canSave.value) return '';
  if (fixedSeed.value) return '체험 · 시드 고정(개발용)';
  if (!user.value) return '체험 · 로그인하면 가게가 저장돼요';
  return '체험 · 닉네임을 정하면 가게가 저장돼요';
});

/** 체험 화면의 "로그인" 버튼. 비로그인이면 Google 로그인, 닉네임 전이면 닉네임 창 */
function requestLogin(): void {
  if (!user.value) auth.login();
  else if (!user.value.nickname) auth.nicknameDialog = 'required';
}

/** 가게를 띄운다. 저장할 수 있으면 서버 저장을, 아니면 시작 상태로 체험을 연다 */
async function mount(): Promise<void> {
  const seq = (mountSeq += 1);
  destroyGame();
  phase.value = 'loading';
  dayActive.value = false;
  try {
    const module = await loadGameModule(props.game.id);
    if (module.kind !== 'growth') throw new Error(`성장형 게임이 아니다: ${props.game.id}`);
    const session = canSave.value
      ? createSavedSession(props.game.id, requestLogin)
      : createTrialSession(module.initialState(), requestLogin, fixedSeed.value);
    const save = await session.load();
    if (seq !== mountSeq || !host.value) return;
    const created = await module.mount(host.value, {
      session,
      save,
      muted: muted.value,
      volume: volume.value / 100,
      onDayActive: (active) => (dayActive.value = active),
    });
    if (seq !== mountSeq) {
      created.destroy();
      return;
    }
    instance = created;
    attachSound(created);
    phase.value = 'ready';
  } catch (err) {
    if (seq !== mountSeq) return;
    console.error('[growth] 가게를 띄우지 못했다', err);
    errorMessage.value = err instanceof ApiError && err.status < 500 ? err.message : '가게를 불러오지 못했어요.';
    // 로그인이 풀렸으면 상태를 다시 받는다. 다시 시도하면 체험으로 연다
    if (err instanceof ApiError && err.status === 401) void auth.load();
    phase.value = 'error';
  }
}

/** 띄운 게임을 내린다 */
function destroyGame(): void {
  instance?.destroy();
  instance = null;
  attachSound(null);
}

/** "나가기" 버튼. 장사 중이면 이동 가드가 한 번 묻는다 */
function leave(): void {
  void router.push('/');
}

/** 묻는 창에서 "나가기" */
function confirmLeave(): void {
  leaveConfirmed = true;
  leaveOpen.value = false;
  void router.push(leaveTarget ?? '/');
}

/** 묻는 창에서 "취소" */
function cancelLeave(): void {
  leaveOpen.value = false;
  leaveTarget = null;
}

// 장사 중에 다른 페이지로 가면 그날이 사라지므로 한 번 묻는다
onBeforeRouteLeave((to) => {
  if (!dayActive.value || leaveConfirmed) return true;
  leaveTarget = to.fullPath;
  leaveOpen.value = true;
  return false;
});

/** 장사 중에 탭을 닫거나 새로 고치면 브라우저가 한 번 묻게 한다 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (dayActive.value) event.preventDefault();
}

// 로그인 상태를 받은 뒤 띄우고, 저장할 수 있는지가 바뀌면(로그인·닉네임) 다시 띄운다
watch(
  () => [auth.loaded, canSave.value] as const,
  ([loaded]) => {
    if (loaded) void mount();
  },
);
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
  if (auth.loaded) void mount();
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  mountSeq += 1;
  destroyGame();
});
</script>

<template>
  <main class="play">
    <header class="head">
      <h1 class="title">{{ game.name }}</h1>
      <p v-if="modeNote" class="mode">{{ modeNote }}</p>

      <button
        type="button"
        class="ghost-button icon-only"
        :aria-label="muted ? '소리 켜기' : '소리 끄기'"
        :aria-pressed="muted"
        @click="toggleMuted"
      >
        <PhSpeakerSlash v-if="muted" :size="18" weight="bold" />
        <PhSpeakerHigh v-else :size="18" weight="bold" />
      </button>
      <input v-model.number="volume" type="range" min="0" max="100" step="5" class="volume" aria-label="음량" @input="onVolume" />

      <button type="button" class="ghost-button" @click="leave">
        <PhSignOut :size="16" weight="bold" />
        나가기
      </button>
    </header>

    <div class="stage" :class="`is-${game.orientation}`">
      <div ref="host" class="host" />

      <div v-if="phase === 'loading'" class="overlay">
        <p class="loading">가게 여는 중</p>
      </div>

      <div v-else-if="phase === 'error'" class="overlay">
        <div class="card">
          <p class="how">{{ errorMessage }}</p>
          <button type="button" class="primary-button" @click="mount">
            <PhArrowClockwise :size="16" weight="bold" />
            다시 시도
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="leaveOpen"
      title="장사를 그만둘까요?"
      message="오늘 장사는 저장되지 않아요. 다음에 오면 오늘 아침부터 다시 해요."
      confirm-label="나가기"
      danger
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
  </main>
</template>

<style scoped>
.play {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 16px 20px 24px;
}

.head {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 48px;
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  white-space: nowrap;
}

.mode {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-2);
}

/* 안내가 없으면 소리 버튼부터 오른쪽으로 민다 */
.title + .ghost-button.icon-only {
  margin-left: auto;
}

.stage {
  position: relative;
  /* 상단 바·머리줄·여백을 뺀 나머지 화면을 게임 영역으로 쓴다 */
  height: calc(100dvh - var(--topbar-height) - 100px);
  min-height: 320px;
  border-radius: var(--radius-card);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.host {
  position: absolute;
  inset: 0;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  border-radius: var(--radius-card);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(420px, 100%);
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow-hover);
  text-align: center;
}

.how {
  font-size: 15px;
  color: var(--text);
}

.loading {
  font-size: 14px;
  color: var(--text-2);
}

.primary-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-control);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease, transform 100ms ease;
}

.primary-button {
  border: 0;
  background: var(--button-bg);
  color: var(--button-text);
}

.primary-button:hover {
  background: var(--button-bg-hover);
}

.ghost-button {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 13px;
}

.ghost-button:hover {
  background: var(--surface-hover);
}

.primary-button:active,
.ghost-button:active {
  transform: scale(0.98);
}

.ghost-button.icon-only {
  width: 34px;
  padding: 0;
}

.volume {
  width: 84px;
  accent-color: var(--accent);
  cursor: pointer;
}

@media (max-width: 639px) {
  .play {
    padding: 10px 10px 12px;
  }

  .head {
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 8px;
  }

  .title {
    font-size: 17px;
  }

  .mode {
    order: 3;
    flex-basis: 100%;
  }

  .ghost-button.icon-only {
    margin-left: auto;
  }

  .volume {
    width: 64px;
  }

  .stage {
    height: calc(100dvh - var(--topbar-height) - 110px);
  }
}
</style>
