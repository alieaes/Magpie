<script setup lang="ts">
// 성장형 게임 화면 (/play/:gameId 중 kind가 growth인 게임). 가게·하루 장사·정산 화면과 소리 설정은 게임이 그리고,
// 셸은 저장 창구(GrowthSession), 소리 값 저장, 장사 중 나가기 확인만 맡는다. 로그인 + 닉네임이면 서버에 저장하고, 아니면 체험.
// 몰입을 위해 머리줄 없이 상단 바 아래 전체를 게임 영역으로 쓴다. 나가기는 상단 바로 한다.
// 근거: docs/design/261021-04-game-save.md §3, §6, docs/design/261022-14-growth-play-immersive.md
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { PhArrowClockwise } from '@phosphor-icons/vue';
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

// 소리 끄기·음량 (브라우저에 저장, 미니게임과 같은 값). 바꾸는 곳은 게임 안 설정이다
const { muted, volume, setFromGame } = useSound();

/** 개발 중에는 ?seed=로 같은 하루를 다시 띄울 수 있다. 이때는 체험이다 */
const fixedSeed = computed(() => {
  const seed = route.query.seed;
  return import.meta.env.DEV && typeof seed === 'string' && seed ? seed : null;
});
/** 서버에 저장할 수 있는지: 로그인 + 닉네임 */
const canSave = computed(() => Boolean(user.value?.nickname) && fixedSeed.value === null);
/** 게임 안에 보일 체험 안내: 로그인 전이면 로그인, 닉네임 전이면 닉네임 */
const trialHint = computed(() => (user.value ? '닉네임을 정하면 가게가 저장돼요' : '로그인하면 가게가 저장돼요'));

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
    if (fixedSeed.value) console.info(`[growth] 체험 · 시드 고정(개발용): ${fixedSeed.value}`);
    const session = canSave.value
      ? createSavedSession(props.game.id, requestLogin)
      : createTrialSession(module.initialState(), requestLogin, fixedSeed.value, trialHint.value);
    const save = await session.load();
    if (seq !== mountSeq || !host.value) return;
    const created = await module.mount(host.value, {
      session,
      save,
      muted: muted.value,
      volume: volume.value / 100,
      onDayActive: (active) => (dayActive.value = active),
      onSoundChange: setFromGame,
    });
    if (seq !== mountSeq) {
      created.destroy();
      return;
    }
    instance = created;
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

// 장사 중에 다른 페이지로 가면(상단 바·뒤로 가기) 그날이 사라지므로 한 번 묻는다
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
  <main class="growth-play">
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
/* 루트 클래스 이름은 PlayPage의 .play와 겹치지 않게 한다(부모 scoped 스타일이 자식 루트에도 붙는다) */
.growth-play {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 16px 20px;
}

.stage {
  position: relative;
  /* 머리줄 없이 상단 바 아래 높이 전체를 게임 영역으로 쓴다(위아래 여백만 뺀다) */
  height: calc(100dvh - var(--topbar-height) - 32px);
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

.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease, transform 100ms ease;
}

.primary-button:hover {
  background: var(--button-bg-hover);
}

.primary-button:active {
  transform: scale(0.98);
}

/* 폰: 상단 바 아래 전체, 좌우 끝까지. 아래는 아이폰 홈 바 영역만 비운다 */
@media (max-width: 639px) {
  .growth-play {
    padding: 0 0 env(safe-area-inset-bottom);
  }

  .stage {
    height: calc(100dvh - var(--topbar-height) - env(safe-area-inset-bottom));
    border-radius: 0;
  }
}
</style>
