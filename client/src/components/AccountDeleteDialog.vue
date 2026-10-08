<script setup lang="ts">
// 탈퇴 확인 창. 닉네임(닉네임 전이면 "탈퇴")을 똑같이 입력해야 탈퇴 버튼이 켜진다.
// 근거: docs/design/261008-01-account-delete.md §1, §4
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { deleteConfirmText } from '@magpie/shared';
import { ApiError } from '../api';
import { useAuthStore } from '../stores/auth';
import ConfirmDialog from './ConfirmDialog.vue';

const auth = useAuthStore();
const { user, deleteDialog } = storeToRefs(auth);

const input = ref<HTMLInputElement | null>(null);
const value = ref('');
const busy = ref(false);
const error = ref('');

const expected = computed(() => deleteConfirmText(user.value?.nickname ?? null));
const matches = computed(() => value.value.trim() === expected.value);
const particle = computed(() => objectParticle(expected.value));

/** 목적격 조사: 마지막 글자가 받침 있는 한글이면 '을', 받침 없는 한글이면 '를', 한글이 아니면 '을(를)' */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '을(를)';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

watch(deleteDialog, async (open) => {
  if (!open) return;
  value.value = '';
  error.value = '';
  await nextTick();
  input.value?.focus();
});

/** 탈퇴 */
async function confirm(): Promise<void> {
  if (!matches.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await auth.deleteAccount(value.value);
  } catch (err) {
    error.value = err instanceof ApiError && err.status < 500 ? err.message : '탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.';
    busy.value = false;
  }
}
</script>

<template>
  <ConfirmDialog
    :open="deleteDialog && user !== null"
    title="탈퇴할까요?"
    message="되돌릴 수 없어요. 같은 Google 계정으로 다시 로그인하면 기록이 없는 새 유저로 시작해요."
    confirm-label="탈퇴"
    danger
    :busy="busy"
    :error="error"
    :confirm-disabled="!matches"
    :focus-cancel="false"
    @confirm="confirm"
    @cancel="deleteDialog = false"
  >
    <ul class="removed">
      <li>모든 게임 기록과 랭킹</li>
      <li>닉네임 (다른 사람이 쓸 수 있게 돼요)</li>
      <li>다른 기기의 로그인까지 모두</li>
    </ul>
    <label class="field">
      <span class="label">확인을 위해 <strong>{{ expected }}</strong>{{ particle }} 똑같이 입력해 주세요</span>
      <input
        ref="input"
        v-model="value"
        class="input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="expected"
        @input="error = ''"
      />
    </label>
  </ConfirmDialog>
</template>

<style scoped>
.removed {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface-2);
  font-size: 13px;
  color: var(--text);
}

.removed li + li {
  margin-top: 2px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.label {
  font-size: 13px;
  color: var(--text-2);
}

.label strong {
  color: var(--text-strong);
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
</style>
