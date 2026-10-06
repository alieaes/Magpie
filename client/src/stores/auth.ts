import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** 화면에 보여줄 로그인 유저 정보. Google 프로필 사진·이메일은 받지 않는다 */
export interface SessionUser {
  nickname: string;
}

/**
 * 로그인 상태. 로그인(Google OIDC)을 만들기 전까지는 항상 비로그인이다.
 * 로그인 설계에서 GET /api/me로 상태를 채우고 로그인·로그아웃 동작을 붙인다.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loggedIn = computed(() => user.value !== null);
  /** 로그인 기능이 열렸는지. 열리기 전에는 로그인 버튼을 누를 수 없다 */
  const loginAvailable = false;
  return { user, loggedIn, loginAvailable };
});
