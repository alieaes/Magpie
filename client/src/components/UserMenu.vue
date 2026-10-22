<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { PhCaretDown, PhPencilSimple, PhSignIn, PhSignOut, PhUserMinus } from '@phosphor-icons/vue';
import { useDismiss } from '../composables/useDismiss';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const { user } = storeToRefs(auth);

const open = ref(false);
const root = ref<HTMLElement | null>(null);

// 메뉴 바깥을 누르거나 Esc를 누르면 닫는다
useDismiss(open, (target) => root.value?.contains(target) ?? false);

/** 아바타에 넣을 글자: 닉네임 첫 글자. 닉네임 전이면 '?' */
function initial(nickname: string | null): string {
  return (nickname && Array.from(nickname)[0]) || '?';
}

/** 닉네임 창을 연다 (닉네임 전이면 정하기, 있으면 변경) */
function openNickname(): void {
  open.value = false;
  auth.nicknameDialog = user.value?.nickname ? 'change' : 'required';
}

/** 탈퇴 확인 창을 연다 */
function openDelete(): void {
  open.value = false;
  auth.deleteDialog = true;
}

/** 로그아웃 */
async function onLogout(): Promise<void> {
  open.value = false;
  try {
    await auth.logout();
  } catch (err) {
    console.warn('[auth] 로그아웃 실패', err);
  }
}
</script>

<template>
  <div ref="root" class="user-menu">
    <button
      v-if="!user"
      type="button"
      class="login"
      :disabled="!auth.canLogin"
      :title="auth.canLogin ? undefined : '로그인은 곧 열려요'"
      @click="auth.login()"
    >
      <PhSignIn :size="16" weight="bold" />
      <span>로그인</span>
    </button>

    <template v-else>
      <button
        type="button"
        class="profile"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="avatar" aria-hidden="true">{{ initial(user.nickname) }}</span>
        <span class="nickname" :class="{ 'is-empty': !user.nickname }">{{ user.nickname ?? '닉네임 정하기' }}</span>
        <span v-if="user.isAdmin" class="admin-badge">관리자</span>
        <PhCaretDown :size="14" weight="bold" class="caret" />
      </button>

      <div v-if="open" class="menu" role="menu">
        <button type="button" role="menuitem" class="menu-item" @click="openNickname">
          <PhPencilSimple :size="16" weight="bold" />
          {{ user.nickname ? '닉네임 변경' : '닉네임 정하기' }}
        </button>
        <button type="button" role="menuitem" class="menu-item" @click="onLogout">
          <PhSignOut :size="16" weight="bold" />
          로그아웃
        </button>
        <div class="menu-divider" aria-hidden="true" />
        <button type="button" role="menuitem" class="menu-item is-danger" @click="openDelete">
          <PhUserMinus :size="16" weight="bold" />
          탈퇴
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.login {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease, transform 100ms ease;
}

.login:hover:not(:disabled) {
  background: var(--button-bg-hover);
}

.login:active:not(:disabled) {
  transform: scale(0.98);
}

.login:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.profile {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 8px 0 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: none;
  cursor: pointer;
}

.profile:hover,
.profile[aria-expanded='true'] {
  background: var(--surface-hover);
}

.avatar {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 700;
}

.nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.nickname.is-empty {
  color: var(--accent-text);
}

.caret {
  color: var(--text-2);
}

.admin-badge {
  padding: 1px 6px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 160px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow-hover);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: none;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--surface-hover);
}

.menu-item.is-danger {
  color: #d9564a;
}

.menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

@media (max-width: 639px) {
  .nickname,
  .caret {
    display: none;
  }

  .profile {
    padding: 0 4px;
  }
}
</style>
