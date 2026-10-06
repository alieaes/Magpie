<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { PhCaretDown, PhPencilSimple, PhSignIn, PhSignOut } from '@phosphor-icons/vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const { user } = storeToRefs(auth);

const open = ref(false);
const root = ref<HTMLElement | null>(null);

/** 메뉴 바깥을 누르면 닫는다 */
function onDocumentPointerDown(e: PointerEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

/** Esc를 누르면 닫는다 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeydown);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeydown);
});

/** 아바타에 넣을 글자: 닉네임 첫 글자 */
function initial(nickname: string): string {
  return Array.from(nickname)[0] ?? '?';
}
</script>

<template>
  <div ref="root" class="user-menu">
    <button
      v-if="!user"
      type="button"
      class="login"
      :disabled="!auth.loginAvailable"
      :title="auth.loginAvailable ? undefined : '로그인은 곧 열려요'"
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
        <span class="nickname">{{ user.nickname }}</span>
        <PhCaretDown :size="14" weight="bold" class="caret" />
      </button>

      <div v-if="open" class="menu" role="menu">
        <button type="button" role="menuitem" class="menu-item" @click="open = false">
          <PhPencilSimple :size="16" weight="bold" />
          닉네임 변경
        </button>
        <button type="button" role="menuitem" class="menu-item" @click="open = false">
          <PhSignOut :size="16" weight="bold" />
          로그아웃
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

.caret {
  color: var(--text-2);
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
