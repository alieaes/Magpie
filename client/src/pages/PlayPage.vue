<script setup lang="ts">
// 게임 화면 (/play/:gameId). 시작·결과 화면과 점수·시간 막대는 셸이 그리고, 판은 게임 패키지가 그린다.
// 점수 제출(docs/design/261006-08-play-submission.md)이 아직 없어서 지금은 연습 모드만 있다.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PhArrowClockwise, PhFlagCheckered, PhPlay, PhTrophy } from '@phosphor-icons/vue';
import { findGame, isGameId, randomSeed, type Game } from '@magpie/shared';
import type { GameInstance, HudState, PlayResult } from '@magpie/shared/game-module';
import { formatNumber } from '../format';
import { hasGameModule, loadGameModule } from '../games/registry';
import NotFoundPage from './NotFoundPage.vue';

type Phase = 'ready' | 'loading' | 'playing' | 'ended' | 'error';

const route = useRoute();
const host = ref<HTMLElement | null>(null);
const phase = ref<Phase>('ready');
const hud = ref<HudState>({ score: 0 });
const result = shallowRef<PlayResult | null>(null);
let instance: GameInstance | null = null;

/** 주소의 게임. 플레이할 수 있고 코드가 등록된 게임만 */
const game = computed<Game | null>(() => {
  const id = String(route.params.gameId ?? '');
  if (!isGameId(id) || !hasGameModule(id)) return null;
  const meta = findGame(id);
  return meta?.status === 'playable' ? meta : null;
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

/** 개발 중에는 ?seed=로 같은 판을 다시 띄울 수 있다 */
function pickSeed(): string {
  const fixed = route.query.seed;
  return import.meta.env.DEV && typeof fixed === 'string' && fixed ? fixed : randomSeed();
}

/** 새 판을 띄운다 */
async function start(): Promise<void> {
  const current = game.value;
  if (!current || !host.value) return;
  destroyGame();
  phase.value = 'loading';
  result.value = null;
  hud.value = { score: 0 };
  try {
    const module = await loadGameModule(current.id);
    instance = await module.mount(host.value, {
      seed: pickSeed(),
      onHud: (state) => (hud.value = state),
      onEnd: (r) => {
        result.value = r;
        phase.value = 'ended';
      },
    });
    if (phase.value === 'loading') phase.value = 'playing';
  } catch (err) {
    console.error('[play] 게임을 띄우지 못했다', err);
    phase.value = 'error';
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
}

watch(
  () => route.params.gameId,
  () => {
    destroyGame();
    phase.value = 'ready';
    result.value = null;
  },
);
onBeforeUnmount(destroyGame);
</script>

<template>
  <NotFoundPage v-if="!game" />

  <main v-else class="play">
    <header class="head">
      <h1 class="title">{{ game.name }}</h1>

      <div v-if="phase === 'playing' || phase === 'ended'" class="hud">
        <div v-if="timeLeftRatio !== null" class="timer" :class="{ 'is-low': secondsLeft <= 10 }">
          <div class="bar" role="progressbar" :aria-valuenow="secondsLeft" aria-valuemin="0" aria-label="남은 시간">
            <div class="fill" :style="{ transform: `scaleX(${timeLeftRatio})` }" />
          </div>
          <span class="seconds num">{{ secondsLeft }}초</span>
        </div>
        <div class="score">
          <span class="score-label">점수</span>
          <strong class="num">{{ formatNumber(hud.score) }}</strong><small>{{ game.scoreUnit }}</small>
        </div>
      </div>

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
          <p class="mode">연습 모드 · 기록 저장은 곧 열려요</p>
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
          <p class="how">게임을 불러오지 못했어요.</p>
          <button type="button" class="primary-button" @click="start">
            <PhArrowClockwise :size="16" weight="bold" />
            다시 시도
          </button>
        </div>
      </div>

      <div v-else-if="phase === 'ended' && result" class="overlay is-dim">
        <div class="card">
          <p class="end-label">{{ timeUp ? '시간 종료' : '게임 끝' }}</p>
          <p class="final num">{{ formatNumber(result.score) }}<small>{{ game.scoreUnit }}</small></p>
          <p class="mode">연습 모드라 기록은 남지 않아요</p>
          <div class="actions">
            <button type="button" class="primary-button" @click="start">
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

.ghost-button {
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
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

  .hud {
    order: 3;
    flex-basis: 100%;
  }

  .ghost-button {
    margin-left: auto;
  }

  .stage {
    height: calc(100dvh - var(--topbar-height) - 110px);
  }
}
</style>
