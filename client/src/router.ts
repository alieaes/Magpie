import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';

/** 페이지 주소. 근거: docs/design/261006-05-main-page.md §1 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/ranking', name: 'ranking', component: () => import('./pages/RankingPage.vue') },
    { path: '/play/:gameId', name: 'play', component: () => import('./pages/PlayPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
