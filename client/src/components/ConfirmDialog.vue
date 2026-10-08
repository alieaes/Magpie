<script setup lang="ts">
// 되돌릴 수 없는 일을 하기 전에 묻는 창. 관리자 기록 삭제·닉네임 초기화, 회원 탈퇴가 쓴다.
// 추가 입력이 필요하면 기본 슬롯에 넣는다(예: 탈퇴 확인 문구).
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** 확인 버튼을 빨갛게 (지우기 등) */
  danger?: boolean;
  /** 처리 중이면 버튼을 끄고 닫지 못하게 한다 */
  busy?: boolean;
  /** 처리하다 실패했을 때 보여줄 문구 */
  error?: string;
  /** 확인 버튼을 끈다 (추가 입력이 아직 안 맞을 때) */
  confirmDisabled?: boolean;
  /** 열릴 때 취소 버튼에 초점을 둔다. 슬롯의 입력칸에 초점을 줄 때는 끈다 */
  focusCancel?: boolean;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const cancelButton = ref<HTMLButtonElement | null>(null);

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen || props.focusCancel === false) return;
    await nextTick();
    cancelButton.value?.focus();
  },
);

/** 닫기. 처리 중에는 닫지 않는다 */
function cancel(): void {
  if (!props.busy) emit('cancel');
}
</script>

<template>
  <div v-if="open" class="backdrop" @keydown.esc="cancel">
    <form class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" @submit.prevent="emit('confirm')">
      <h2 id="confirm-title" class="title">{{ title }}</h2>
      <p class="message">{{ message }}</p>
      <slot />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button ref="cancelButton" type="button" class="secondary-button" :disabled="busy" @click="cancel">취소</button>
        <button type="submit" class="primary-button" :class="{ 'is-danger': danger }" :disabled="busy || confirmDisabled">
          {{ busy ? '처리 중' : confirmLabel }}
        </button>
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
  width: min(400px, 100%);
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

.message {
  font-size: 14px;
  color: var(--text);
}

.error {
  font-size: 13px;
  color: #d9564a;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
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

.primary-button.is-danger {
  background: #d9564a;
  color: #ffffff;
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
}

.secondary-button:hover:not(:disabled) {
  background: var(--surface-hover);
}
</style>
