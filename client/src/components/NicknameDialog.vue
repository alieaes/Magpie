<script setup lang="ts">
// 닉네임 정하기·변경 창. 규칙은 shared의 checkNickname으로 바로 알려주고, 중복은 서버가 알려준다.
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { NICKNAME_MAX, NICKNAME_MIN, checkNickname } from '@magpie/shared';
import { ApiError } from '../api';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const { user, nicknameDialog } = storeToRefs(auth);

const input = ref<HTMLInputElement | null>(null);
const value = ref('');
const serverError = ref('');
const saving = ref(false);

const mode = computed(() => nicknameDialog.value);
const check = computed(() => checkNickname(value.value));
/** 입력 중에는 길이 부족은 알리지 않는다 (막 치기 시작했을 때 빨간 글씨가 뜨지 않게) */
const ruleError = computed(() => {
  if (!value.value.trim() || check.value.ok) return '';
  return check.value.reason === 'length' && value.value.trim().length < NICKNAME_MIN ? '' : check.value.message;
});
const canSave = computed(() => check.value.ok && !saving.value && value.value.trim() !== (user.value?.nickname ?? ''));

watch(mode, async (m) => {
  if (m === 'closed') return;
  value.value = user.value?.nickname ?? '';
  serverError.value = '';
  await nextTick();
  input.value?.focus();
  input.value?.select();
});

/** 저장 */
async function save(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  serverError.value = '';
  try {
    await auth.saveNickname(value.value);
  } catch (err) {
    serverError.value = err instanceof ApiError && err.status < 500 ? err.message : '저장하지 못했어요. 잠시 뒤 다시 해 주세요.';
  } finally {
    saving.value = false;
  }
}

/** 닫기 ("나중에" / "취소") */
function close(): void {
  nicknameDialog.value = 'closed';
}
</script>

<template>
  <div v-if="mode !== 'closed'" class="backdrop" @keydown.esc="close">
    <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="nickname-title" @submit.prevent="save">
      <h2 id="nickname-title" class="title">{{ mode === 'required' ? '닉네임을 정해 주세요' : '닉네임 변경' }}</h2>
      <p class="desc">
        랭킹에는 닉네임만 보여요.
        <template v-if="mode === 'required'">정하기 전에는 연습만 할 수 있어요.</template>
      </p>

      <label class="field">
        <span class="visually-hidden">닉네임</span>
        <input
          ref="input"
          v-model="value"
          class="input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :maxlength="NICKNAME_MAX + 4"
          placeholder="닉네임"
          @input="serverError = ''"
        />
      </label>
      <p class="hint" :class="{ 'is-error': ruleError || serverError }">
        {{ serverError || ruleError || `${NICKNAME_MIN}~${NICKNAME_MAX}자, 한글·영문·숫자·밑줄(_)` }}
      </p>

      <div class="actions">
        <button type="button" class="secondary-button" @click="close">{{ mode === 'required' ? '나중에' : '취소' }}</button>
        <button type="submit" class="primary-button" :disabled="!canSave">{{ saving ? '저장 중' : '저장' }}</button>
      </div>
    </form>
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

.desc {
  font-size: 14px;
  color: var(--text-2);
}

.field {
  margin-top: 6px;
}

.input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  color: var(--text-strong);
  font: inherit;
  font-size: 16px;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.hint {
  min-height: 20px;
  font-size: 13px;
  color: var(--text-2);
}

.hint.is-error {
  color: #d9564a;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.primary-button,
.secondary-button {
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-control);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-button {
  border: 0;
  background: var(--button-bg);
  color: var(--button-text);
}

.primary-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
}

.secondary-button:hover {
  background: var(--surface-hover);
}
</style>
