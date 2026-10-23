import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';

/** 페이지 주소. 근거: docs/design/261006-05-main-page.md §1 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/ranking', name: 'ranking', component: () => import('./pages/RankingPage.vue') },
    { path: '/play/:gameId', name: 'play', component: () => import('./pages/PlayPage.vue') },
    // 개발 빌드에서만: 진동 시험 화면 (docs/design/261023-01-haptics.md §6)
    ...(import.meta.env.DEV ? [{ path: '/dev/haptics', name: 'dev-haptics', component: () => import('./pages/dev/HapticsLab.vue') }] : []),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
