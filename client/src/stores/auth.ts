import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { deleteAccount as requestDeleteAccount, fetchMe, goToLogin, logout as requestLogout, updateNickname } from '../api';

/** 화면에 보여줄 로그인 유저. Google 프로필 사진·이메일은 받지 않는다 */
export interface SessionUser {
  /** 닉네임 전이면 null */
  nickname: string | null;
  /** 관리자면 관리 메뉴를 보여준다. 실제 권한 확인은 서버가 한다 */
  isAdmin: boolean;
}

/** 로그인 상태. 앱이 뜰 때 GET /api/me로 채운다. 근거: docs/design/261006-07-login.md */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loginAvailable = ref(false);
  const loaded = ref(false);
  /** 닉네임 창. 'required'는 처음 로그인해서 닉네임이 없을 때 */
  const nicknameDialog = ref<'closed' | 'required' | 'change'>('closed');
  /** 탈퇴 확인 창 */
  const deleteDialog = ref(false);

  const loggedIn = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.isAdmin === true);

  /** 서버에 로그인 상태를 묻는다. 닉네임이 없으면 닉네임 창을 연다 */
  async function load(): Promise<void> {
    try {
      const me = await fetchMe();
      user.value = me.user;
      loginAvailable.value = me.loginAvailable;
      if (me.user && me.user.nickname === null) nicknameDialog.value = 'required';
    } catch (err) {
      console.warn('[auth] 로그인 상태를 불러오지 못했다', err);
    } finally {
      loaded.value = true;
    }
  }

  /** Google 로그인으로 보낸다 */
  function login(): void {
    goToLogin(window.location.pathname + window.location.search);
  }

  /** 로그아웃한다 */
  async function logout(): Promise<void> {
    await requestLogout();
    user.value = null;
    nicknameDialog.value = 'closed';
  }

  /** 닉네임을 정한다. 실패하면 ApiError를 그대로 던진다 */
  async function saveNickname(nickname: string): Promise<void> {
    const saved = await updateNickname(nickname);
    if (user.value) user.value = { ...user.value, nickname: saved };
    nicknameDialog.value = 'closed';
  }

  /**
   * 탈퇴한다. 성공하면 메인으로 새로 들어가 화면에 남은 내 정보를 모두 비우고 "탈퇴했어요"를 띄운다.
   * 실패하면 ApiError를 그대로 던진다
   */
  async function deleteAccount(confirm: string): Promise<void> {
    await requestDeleteAccount(confirm);
    user.value = null;
    deleteDialog.value = false;
    window.location.assign('/?account=deleted');
  }

  return {
    user,
    loginAvailable,
    loaded,
    loggedIn,
    isAdmin,
    nicknameDialog,
    deleteDialog,
    load,
    login,
    logout,
    saveNickname,
    deleteAccount,
  };
});
