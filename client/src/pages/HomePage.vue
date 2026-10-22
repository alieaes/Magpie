<script setup lang="ts">
// 메인(로비). 게임 카드를 분류(미니게임 → 게임) 묶음으로 나눠 보여준다. 근거: docs/design/261022-07-game-categories.md §3
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { GAMES, GAME_KINDS, GAME_KIND_LABELS, gameKind, type GameKind, type GameSummary } from '@magpie/shared';
import { fetchGamesSummary } from '../api';
import { useAsyncData } from '../composables/useAsyncData';
import { useAuthStore } from '../stores/auth';
import GameCard from '../components/GameCard.vue';
import RankingPanel from '../components/RankingPanel.vue';

const { loggedIn } = storeToRefs(useAuthStore());
// 요약을 못 불러와도 카드는 그대로 보인다 (기록 줄만 빈다)
const { data: summaries } = useAsyncData(fetchGamesSummary, [loggedIn]);

const summaryById = computed(() => new Map<string, GameSummary>((summaries.value ?? []).map((s) => [s.gameId, s])));
/** 묶음 제목 옆 작은 설명 */
const SECTION_HINTS: Record<GameKind, string> = {
  minigame: '한 판으로 끝나요 · 랭킹은 매일 밤 12시에 새로 시작',
  growth: '하루씩 저장하며 키워요 · 랭킹은 이어져요',
};

// 준비 중(coming-soon) 게임은 로비에 보이지 않는다. 게임이 없는 묶음은 통째로 숨긴다
const playableGames = GAMES.filter((g) => g.status === 'playable');
const sections = GAME_KINDS.map((kind) => ({
  kind,
  title: GAME_KIND_LABELS[kind],
  hint: SECTION_HINTS[kind],
  games: playableGames.filter((g) => gameKind(g) === kind),
})).filter((s) => s.games.length > 0);
/** 카드가 차례로 떠오르는 순서. 묶음을 넘어 이어서 센다 */
const riseIndex = new Map(sections.flatMap((s) => s.games).map((g, i) => [g.id, i]));
</script>

<template>
  <main class="home">
    <section class="intro">
      <h1 class="headline">오늘은 어떤 게임?</h1>
      <p class="lede">한 판 승부 미니게임과 오래 키우는 게임이 있어요.</p>
    </section>

    <div class="layout">
      <div class="games">
        <section v-for="section in sections" :key="section.kind" class="group" :aria-labelledby="`games-${section.kind}`">
          <header class="section-head">
            <h2 :id="`games-${section.kind}`" class="section-title">{{ section.title }}</h2>
            <p class="section-hint">{{ section.hint }}</p>
          </header>
          <div class="grid">
            <GameCard
              v-for="game in section.games"
              :key="game.id"
              class="rise-in"
              :style="{ '--index': riseIndex.get(game.id) }"
              :game="game"
              :summary="summaryById.get(game.id) ?? null"
              :logged-in="loggedIn"
            />
          </div>
        </section>
      </div>

      <aside class="side">
        <RankingPanel class="rise-in" :style="{ '--index': 2 }" />
      </aside>
    </div>
  </main>
</template>

<style scoped>
.home {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 40px 20px 80px;
}

.intro {
  max-width: 640px;
  margin-bottom: 36px;
}

.headline {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.03em;
  color: var(--text-strong);
}

.lede {
  margin-top: 8px;
  font-size: 15px;
  color: var(--text-2);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 28px;
  align-items: start;
}

.group + .group {
  margin-top: 32px;
}

/* 설명이 길어 자리가 모자라면 제목 아래 줄로 내려간다 */
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-strong);
}

.section-hint {
  font-size: 13px;
  color: var(--text-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.side {
  position: sticky;
  top: calc(var(--topbar-height) + 20px);
  padding-top: 39px;
}

/* 태블릿: 게임 3열, 랭킹은 아래 */
@media (max-width: 1023px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .side {
    position: static;
    padding-top: 0;
  }
}

/* 모바일: 게임 2열 */
@media (max-width: 639px) {
  .home {
    padding: 24px 14px 56px;
  }

  .intro {
    margin-bottom: 24px;
  }

  .headline {
    font-size: 24px;
  }

  .lede {
    font-size: 14px;
  }

  .group + .group {
    margin-top: 24px;
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
