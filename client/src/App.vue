<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from './components/TopBar.vue';
import AccountDeleteDialog from './components/AccountDeleteDialog.vue';
import NicknameDialog from './components/NicknameDialog.vue';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const notice = ref('');

// 로그인에서 돌아왔을 때(?login=, 서버가 붙임)와 탈퇴한 뒤(?account=)에 짧게 알려준다
const NOTICES: Record<'login' | 'account', Record<string, string>> = {
  login: {
    failed: '로그인하지 못했어요. 다시 시도해 주세요.',
    unavailable: '로그인은 아직 열리지 않았어요.',
  },
  account: {
    deleted: '탈퇴했어요.',
  },
};

/** ?login= / ?account= 안내를 띄우고 주소에서는 지운다 */
async function showNotice(): Promise<void> {
  await router.isReady();
  const { login, account, ...rest } = route.query;
  if (typeof login !== 'string' && typeof account !== 'string') return;
  notice.value = (typeof login === 'string' && NOTICES.login[login]) || (typeof account === 'string' && NOTICES.account[account]) || '';
  void router.replace({ query: rest });
  if (notice.value) setTimeout(() => (notice.value = ''), 5000);
}

onMounted(() => {
  void auth.load();
  void showNotice();
});
</script>

<template>
  <TopBar />
  <p v-if="notice" class="notice" role="status">{{ notice }}</p>
  <RouterView />
  <NicknameDialog />
  <AccountDeleteDialog />
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
