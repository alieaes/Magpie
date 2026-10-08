<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from './components/TopBar.vue';
import NicknameDialog from './components/NicknameDialog.vue';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const notice = ref('');

// 로그인에서 돌아왔을 때 서버가 붙인 ?login= 값에 맞춰 짧게 알려준다
const LOGIN_NOTICES: Record<string, string> = {
  failed: '로그인하지 못했어요. 다시 시도해 주세요.',
  unavailable: '로그인은 아직 열리지 않았어요.',
};

/** ?login= 안내를 띄우고 주소에서는 지운다 */
async function showLoginNotice(): Promise<void> {
  await router.isReady();
  const key = route.query.login;
  if (typeof key !== 'string') return;
  notice.value = LOGIN_NOTICES[key] ?? '';
  const { login: _drop, ...rest } = route.query;
  void router.replace({ query: rest });
  if (notice.value) setTimeout(() => (notice.value = ''), 5000);
}

onMounted(() => {
  void auth.load();
  void showLoginNotice();
});
</script>

<template>
  <TopBar />
  <p v-if="notice" class="notice" role="status">{{ notice }}</p>
  <RouterView />
  <NicknameDialog />
</template>

<style scoped>
.notice {
  max-width: var(--content-width);
  margin: 12px auto 0;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 14px;
}

@media (max-width: 1240px) {
  .notice {
    margin: 12px 14px 0;
  }
}
</style>
