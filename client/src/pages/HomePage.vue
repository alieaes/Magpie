<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { GAMES, type GameSummary } from '@magpie/shared';
import { fetchGamesSummary } from '../api';
import { useAsyncData } from '../composables/useAsyncData';
import { useAuthStore } from '../stores/auth';
import GameCard from '../components/GameCard.vue';
import RankingPanel from '../components/RankingPanel.vue';

const { loggedIn } = storeToRefs(useAuthStore());
// 요약을 못 불러와도 카드는 그대로 보인다 (기록 줄만 빈다)
const { data: summaries } = useAsyncData(fetchGamesSummary, [loggedIn]);

const summaryById = computed(() => new Map<string, GameSummary>((summaries.value ?? []).map((s) => [s.gameId, s])));
const playableCount = computed(() => GAMES.filter((g) => g.status === 'playable').length);
</script>

<template>
  <main class="home">
    <section class="intro">
      <h1 class="headline">오늘은 어떤 게임?</h1>
      <p class="lede">
        사과게임부터 광고에서만 보던 그 게임까지. 랭킹은 매일 밤 12시에 새로 시작해요.
      </p>
    </section>

    <div class="layout">
      <section class="games" aria-labelledby="games-title">
        <header class="section-head">
          <h2 id="games-title" class="section-title">게임</h2>
          <span class="count num">{{ playableCount }} / {{ GAMES.length }}</span>
        </header>
        <div class="grid">
          <GameCard
            v-for="(game, i) in GAMES"
            :key="game.id"
            class="rise-in"
            :style="{ '--index': i }"
            :game="game"
            :summary="summaryById.get(game.id) ?? null"
            :logged-in="loggedIn"
          />
        </div>
      </section>

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

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-strong);
}

.count {
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

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
