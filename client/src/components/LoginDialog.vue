<script setup lang="ts">
// 로그인 창. 개발용 테스트 로그인이 켜져 있을 때(개발 빌드 + 개발 서버)만 뜬다.
// Google 로그인과 테스트 계정(테스트1~N) 로그인을 고른다. 근거: docs/design/261022-05-dev-login.md §4
import { nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { PhGoogleLogo, PhUser } from '@phosphor-icons/vue';
import { DEV_LOGIN_ACCOUNTS } from '@magpie/shared';
import { ApiError } from '../api';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const { loginDialog, loginAvailable } = storeToRefs(auth);

const accounts = Array.from({ length: DEV_LOGIN_ACCOUNTS }, (_, i) => i + 1);
const busy = ref<number | null>(null);
const error = ref('');
const firstButton = ref<HTMLButtonElement[]>([]);

watch(loginDialog, async (open) => {
  if (!open) return;
  error.value = '';
  busy.value = null;
  await nextTick();
  firstButton.value[0]?.focus();
});

/** 닫기. 로그인 중에는 닫지 않는다 */
function close(): void {
  if (busy.value === null) loginDialog.value = false;
}

/** 테스트 계정으로 로그인한다. 성공하면 화면을 다시 불러온다 */
async function loginAs(account: number): Promise<void> {
  if (busy.value !== null) return;
  busy.value = account;
  error.value = '';
  try {
    await auth.loginAsTest(account);
  } catch (err) {
    error.value = err instanceof ApiError && err.status < 500 ? err.message : '로그인하지 못했어요. 서버가 켜져 있는지 확인해 주세요.';
    busy.value = null;
  }
}
</script>

<template>
  <div v-if="loginDialog" class="backdrop" @click.self="close" @keydown.esc="close">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <h2 id="login-title" class="title">로그인</h2>

      <button type="button" class="google" :disabled="!loginAvailable || busy !== null" @click="auth.loginWithGoogle()">
        <PhGoogleLogo :size="18" weight="bold" />
        Google로 로그인
      </button>
      <p v-if="!loginAvailable" class="hint">Google 로그인 설정(GOOGLE_CLIENT_ID)이 없어요.</p>

      <div class="divider"><span>개발용 테스트 계정</span></div>
      <div class="accounts">
        <button
          v-for="n in accounts"
          :key="n"
          ref="firstButton"
          type="button"
          class="account"
          :disabled="busy !== null"
          @click="loginAs(n)"
        >
          <PhUser :size="16" weight="bold" />
          {{ busy === n ? '로그인 중' : `테스트${n}` }}
        </button>
      </div>
      <p class="hint">개발 서버에서만 보여요. 저장·강화·랭킹이 실제 계정처럼 동작해요.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="close" :disabled="busy !== null" @click="close">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  backdrop-filter: blur(3px);
}

.dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(380px, 100%);
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow-hover);
}

.title {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-strong);
}

.google,
.account,
.close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 42px;
  padding: 0 16px;
  border-radius: var(--radius-control);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.google {
  border: 0;
  background: var(--button-bg);
  color: var(--button-text);
}

.account,
.close {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
}

.account:hover:not(:disabled),
.close:hover:not(:disabled) {
  background: var(--surface-hover);
}

.google:disabled,
.account:disabled,
.close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.accounts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.account {
  padding: 0 8px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.hint {
  font-size: 12px;
  color: var(--text-2);
}

.error {
  font-size: 13px;
  color: #d9564a;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
