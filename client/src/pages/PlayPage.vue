<script setup lang="ts">
// 게임 화면 (/play/:gameId). 시작·결과 화면과 점수·시간 막대는 셸이 그리고, 판은 게임 패키지가 그린다.
// 로그인하고 닉네임이 있으면 기록 모드(서버가 시드를 주고 끝난 판을 다시 계산), 아니면 연습 모드.
// 성장형 게임은 GrowthPlayView가 맡는다(가게·정산 화면을 게임이 그린다).
// 근거: docs/design/261006-08-play-submission.md, docs/design/261006-09-apple-ten.md §3, docs/design/261021-04-game-save.md §6
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { PhArrowClockwise, PhFlagCheckered, PhPlay, PhSpeakerHigh, PhSpeakerSlash, PhTrophy, PhVibrate } from '@phosphor-icons/vue';
import { findGame, isGameId, randomSeed, type FinishPlayResponse, type Game, type PlayRejectReason } from '@magpie/shared';
import type { GameInstance, HudState, PlayResult } from '@magpie/shared/game-module';
import { ApiError, finishPlay, startPlay } from '../api';
import { useHaptics } from '../composables/useHaptics';
import { useSound } from '../composables/useSound';
import { formatNumber } from '../format';
import { hasGameModule, loadGameModule } from '../games/registry';
import { useAuthStore } from '../stores/auth';
import GrowthPlayView from './GrowthPlayView.vue';
import NotFoundPage from './NotFoundPage.vue';

type Phase = 'ready' | 'loading' | 'playing' | 'submitting' | 'ended' | 'error';

const REJECT_MESSAGES: Record<PlayRejectReason, string> = {
  time: '게임 시간이 맞지 않아 기록되지 않았어요.',
  bad_input: '기록을 확인하지 못해 저장하지 않았어요.',
  mismatch: '기록을 확인하지 못해 저장하지 않았어요.',
  abandoned: '새 판을 시작해서 이 판은 기록되지 않았어요.',
  admin: '관리자가 지운 기록이에요.',
  stale_save: '다른 곳에서 저장이 바뀌어 기록되지 않았어요.',
};

const route = useRoute();
const auth = useAuthStore();
const { user } = storeToRefs(auth);
const host = ref<HTMLElement | null>(null);
const phase = ref<Phase>('ready');
const hud = ref<HudState>({ score: 0 });
const result = shallowRef<PlayResult | null>(null);
const errorMessage = ref('');
/** 지금 판이 기록 모드인지. 판을 시작할 때 정한다 */
const recording = ref(false);
const submission = shallowRef<FinishPlayResponse | null>(null);
const submitFailed = ref(false);
let instance: GameInstance | null = null;
let playId: number | null = null;

// 소리 끄기·음량 (브라우저에 저장)
const { muted, volume, attach: attachSound, onVolume, toggleMuted } = useSound();
// 진동 켜기·끄기 (진동이 되는 폰에서만 버튼이 보인다)
const { supported: hapticsSupported, enabled: hapticsOn, toggle: toggleHaptics } = useHaptics();

/** 주소의 게임. 플레이할 수 있고 코드가 등록된 게임만 */
const game = computed<Game | null>(() => {
  const id = String(route.params.gameId ?? '');
  if (!isGameId(id) || !hasGameModule(id)) return null;
  const meta = findGame(id);
  return meta?.status === 'playable' ? meta : null;
});

/** 개발 중에는 ?seed=로 같은 판을 다시 띄울 수 있다. 이때는 연습 모드다 */
const fixedSeed = computed(() => {
  const seed = route.query.seed;
  return import.meta.env.DEV && typeof seed === 'string' && seed ? seed : null;
});
/** 기록 모드로 시작할 수 있는지: 로그인 + 닉네임 */
const canRecord = computed(() => Boolean(user.value?.nickname) && fixedSeed.value === null);
/** 시작 화면의 모드 안내 */
const modeNote = computed(() => {
  if (!auth.loaded) return '';
  if (fixedSeed.value) return '연습 모드 · 시드 고정(개발용)';
  if (!user.value) return '연습 모드 · 로그인하면 기록이 남아요';
  if (!user.value.nickname) return '연습 모드 · 닉네임을 정하면 기록이 남아요';
  return '기록 모드 · 점수가 랭킹에 올라가요';
});

const timeLeftRatio = computed(() => {
  const { timeLeftTicks, timeLimitTicks } = hud.value;
  return timeLeftTicks !== undefined && timeLimitTicks ? timeLeftTicks / timeLimitTicks : null;
});
const secondsLeft = computed(() => Math.ceil((hud.value.timeLeftTicks ?? 0) / 60));
const timeUp = computed(() => {
  const limit = hud.value.timeLimitTicks;
  return limit !== undefined && result.value !== null && result.value.ticks >= limit;
});
/** 끝 화면의 기록 결과 한 줄 */
const recordNote = computed(() => {
  const s = submission.value;
  if (!s) return '';
  if (!s.accepted) return REJECT_MESSAGES[s.reason];
  return s.rank.today === null ? '기록했어요' : `기록했어요 · 오늘 ${formatNumber(s.rank.today)}위`;
});
/** 최고 기록을 바꿨으면 그 표시 */
const bestBadge = computed(() => {
  const s = submission.value;
  if (!s?.accepted) return '';
  if (s.best.allTime) return '역대 최고 기록';
  return s.best.today ? '오늘 최고 기록' : '';
});

/** 새 판을 띄운다. 기록 모드면 서버에서 판을 열어 시드를 받는다 */
async function start(): Promise<void> {
  const current = game.value;
  if (!current || !host.value) return;
  destroyGame();
  phase.value = 'loading';
  result.value = null;
  submission.value = null;
  submitFailed.value = false;
  hud.value = { score: 0 };
  try {
    // 게임 코드를 먼저 받고 판을 연다. 서버는 판을 연 때부터 시간을 재므로 내려받는 시간이 들어가지 않게 한다
    const module = await loadGameModule(current.id);
    if (module.kind === 'growth') throw new Error(`성장형 게임은 GrowthPlayView가 띄운다: ${current.id}`);
    const record = canRecord.value;
    let seed: string;
    if (record) {
      const play = await startPlay(current.id);
      playId = play.playId;
      seed = play.seed;
    } else {
      playId = null;
      seed = fixedSeed.value ?? randomSeed();
    }
    recording.value = record;
    instance = await module.mount(host.value, {
      seed,
      muted: muted.value,
      volume: volume.value / 100,
      onHud: (state) => (hud.value = state),
      onEnd: (r) => void onEnd(r),
    });
    attachSound(instance);
    if (phase.value === 'loading') phase.value = 'playing';
  } catch (err) {
    console.error('[play] 게임을 띄우지 못했다', err);
    errorMessage.value = err instanceof ApiError && err.status < 500 ? err.message : '게임을 불러오지 못했어요.';
    // 로그인이 풀렸으면 상태를 다시 받는다. 다시 시도하면 연습 모드로 시작한다
    if (err instanceof ApiError && err.status === 401) void auth.load();
    phase.value = 'error';
  }
}

/** 판이 끝났을 때. 기록 모드면 서버에 보낸다 */
async function onEnd(r: PlayResult): Promise<void> {
  result.value = r;
  if (recording.value) await submit();
  else phase.value = 'ended';
}

/** 끝난 판을 서버에 보낸다. 보내지 못하면 "다시 보내기"를 띄운다 */
async function submit(): Promise<void> {
  const r = result.value;
  if (!r || playId === null) return;
  phase.value = 'submitting';
  submitFailed.value = false;
  try {
    submission.value = await finishPlay(playId, { inputs: r.inputs, ticks: r.ticks, score: r.score });
  } catch (err) {
    console.warn('[play] 기록을 보내지 못했다', err);
    submitFailed.value = true;
  } finally {
    phase.value = 'ended';
  }
}

/** "끝내기" 버튼 */
function finish(): void {
  instance?.finish();
}

/** 띄운 게임을 내린다 */
function destroyGame(): void {
  instance?.destroy();
  instance = null;
  attachSound(null);
}

watch(
  () => route.params.gameId,
  () => {
    destroyGame();
    phase.value = 'ready';
    result.value = null;
    submission.value = null;
  },
);
onBeforeUnmount(destroyGame);
</script>

<template>
  <NotFoundPage v-if="!game" />

  <GrowthPlayView v-else-if="game.kind === 'growth'" :key="game.id" :game="game" />

  <main v-else class="play">
    <header class="head">
      <h1 class="title">{{ game.name }}</h1>

      <div v-if="phase === 'playing' || phase === 'submitting' || phase === 'ended'" class="hud">
        <div v-if="timeLeftRatio !== null" class="timer" :class="{ 'is-low': secondsLeft <= 10 }">
          <div class="bar" role="progressbar" :aria-valuenow="secondsLeft" aria-valuemin="0" aria-label="남은 시간">
            <div class="fill" :style="{ transform: `scaleX(${timeLeftRatio})` }" />
          </div>
          <span class="seconds num">{{ secondsLeft }}초</span>
        </div>
        <div class="score">
          <span class="score-label">{{ game.scoreLabel ?? '점수' }}</span>
          <strong class="num">{{ formatNumber(hud.score) }}</strong><small>{{ game.scoreUnit }}</small>
        </div>
      </div>

      <button
        v-if="phase === 'playing'"
        type="button"
        class="ghost-button icon-only"
        :aria-label="muted ? '소리 켜기' : '소리 끄기'"
        :aria-pressed="muted"
        @click="toggleMuted"
      >
        <PhSpeakerSlash v-if="muted" :size="18" weight="bold" />
        <PhSpeakerHigh v-else :size="18" weight="bold" />
      </button>
      <input
        v-if="phase === 'playing'"
        v-model.number="volume"
        type="range"
        min="0"
        max="100"
        step="5"
        class="volume"
        aria-label="음량"
        @input="onVolume"
      />
      <button
        v-if="phase === 'playing' && hapticsSupported"
        type="button"
        class="ghost-button icon-only haptics-toggle"
        :class="{ 'is-off': !hapticsOn }"
        :aria-label="hapticsOn ? '진동 끄기' : '진동 켜기'"
        :aria-pressed="!hapticsOn"
        @click="toggleHaptics"
      >
        <PhVibrate :size="18" weight="bold" />
        <svg v-if="!hapticsOn" class="slash" viewBox="0 0 18 18" aria-hidden="true">
          <line x1="3" y1="15" x2="15" y2="3" />
        </svg>
      </button>

      <button v-if="phase === 'playing'" type="button" class="ghost-button" @click="finish">
        <PhFlagCheckered :size="16" weight="bold" />
        끝내기
      </button>
    </header>

    <div class="stage" :class="`is-${game.orientation}`">
      <div ref="host" class="host" />

      <div v-if="phase === 'ready'" class="overlay">
        <div class="card">
          <h2 class="card-title">{{ game.name }}</h2>
          <p class="how">{{ game.howTo ?? game.tagline }}</p>
          <p class="mode">{{ modeNote }}</p>
          <button type="button" class="primary-button" @click="start">
            <PhPlay :size="16" weight="fill" />
            시작
          </button>
        </div>
      </div>

      <div v-else-if="phase === 'loading'" class="overlay">
        <p class="loading">불러오는 중</p>
      </div>

      <div v-else-if="phase === 'error'" class="overlay">
        <div class="card">
          <p class="how">{{ errorMessage }}</p>
          <button type="button" class="primary-button" @click="start">
            <PhArrowClockwise :size="16" weight="bold" />
            다시 시도
          </button>
        </div>
      </div>

      <div v-else-if="(phase === 'submitting' || phase === 'ended') && result" class="overlay is-dim">
        <div class="card">
          <p class="end-label">{{ timeUp ? '시간 종료' : '게임 끝' }}</p>
          <p class="final num">{{ formatNumber(result.score) }}<small>{{ game.scoreUnit }}</small></p>
          <p v-if="bestBadge" class="best">{{ bestBadge }}</p>

          <p v-if="!recording" class="mode">연습 모드라 기록은 남지 않아요</p>
          <p v-else-if="phase === 'submitting'" class="mode">기록을 확인하는 중</p>
          <p v-else-if="submitFailed" class="mode is-error">기록을 보내지 못했어요.</p>
          <p v-else class="mode" :class="{ 'is-error': submission && !submission.accepted }">{{ recordNote }}</p>

          <div class="actions">
            <button v-if="submitFailed" type="button" class="primary-button" @click="submit">
              <PhArrowClockwise :size="16" weight="bold" />
              다시 보내기
            </button>
            <button
              type="button"
              :class="submitFailed ? 'secondary-button' : 'primary-button'"
              :disabled="phase === 'submitting'"
              @click="start"
            >
              <PhArrowClockwise :size="16" weight="bold" />
              다시 하기
            </button>
            <RouterLink :to="{ path: '/ranking', query: { target: game.id } }" class="secondary-button">
              <PhTrophy :size="16" weight="bold" />
              랭킹 보기
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
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

.hud {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.timer {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.bar {
  flex: 1;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--surface-hover);
}

.fill {
  height: 100%;
  background: var(--accent);
  transform-origin: left center;
  transition: transform 100ms linear;
}

.is-low .fill {
  background: #d9564a;
}

.seconds {
  min-width: 40px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
  text-align: right;
}

.is-low .seconds {
  color: #d9564a;
}

.score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-strong);
}

.score-label {
  font-size: 13px;
  color: var(--text-2);
}

.score strong {
  font-size: 22px;
  font-weight: 800;
}

.score small,
.final small {
  font-size: 0.55em;
  font-weight: 600;
  color: var(--text-2);
  margin-left: 2px;
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

/* 캔버스가 글자처럼 줄에 놓이면 아래에 몇 px 틈이 생겨 페이지가 넘친다 */
.host :deep(canvas) {
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  border-radius: var(--radius-card);
}

.overlay.is-dim {
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  backdrop-filter: blur(2px);
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

.card-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-strong);
}

.how {
  font-size: 15px;
  color: var(--text);
}

.mode {
  font-size: 13px;
  color: var(--text-2);
}

.mode.is-error {
  color: #d9564a;
}

.best {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 700;
}

.loading {
  font-size: 14px;
  color: var(--text-2);
}

.end-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
}

.final {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}

.primary-button,
.secondary-button,
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

.secondary-button,
.ghost-button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
}

.secondary-button:hover,
.ghost-button:hover {
  background: var(--surface-hover);
}

.primary-button:active,
.secondary-button:active,
.ghost-button:active {
  transform: scale(0.98);
}

.volume {
  width: 84px;
  accent-color: var(--accent);
  cursor: pointer;
}

.ghost-button.icon-only {
  width: 34px;
  padding: 0;
}

/* 진동 버튼: 끄면 아이콘을 흐리게 하고 빗금을 긋는다 (소리 버튼의 스피커 빗금과 같은 뜻) */
.haptics-toggle {
  position: relative;
}

.haptics-toggle.is-off > :first-child {
  opacity: 0.45;
}

.haptics-toggle .slash {
  position: absolute;
  inset: 0;
  width: 18px;
  height: 18px;
  margin: auto;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.primary-button:disabled {
  cursor: default;
  opacity: 0.5;
  transform: none;
}

.ghost-button {
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
}

/* 폰: 머리줄을 뺀 나머지 높이를 무대가 채우고, 무대는 좌우 끝까지 (docs/design/261022-13-play-fill-screen.md) */
@media (max-width: 639px) {
  .play {
    display: flex;
    flex-direction: column;
    height: calc(100dvh - var(--topbar-height));
    padding: 10px 0 env(safe-area-inset-bottom);
  }

  .head {
    flex: none;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 8px;
    padding: 0 10px;
  }

  .title {
    font-size: 17px;
  }

  .hud {
    order: 3;
    flex-basis: 100%;
  }

  .ghost-button.icon-only {
    margin-left: auto;
  }

  .ghost-button.icon-only + .volume {
    margin-right: 0;
  }

  /* 소리 버튼만 오른쪽으로 민다. 진동 버튼은 음량 막대 바로 뒤에 붙는다 */
  .ghost-button.haptics-toggle {
    margin-left: 0;
  }

  .volume {
    width: 64px;
  }

  .stage {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    border-radius: 0;
  }
}
</style>
