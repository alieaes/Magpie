<template>
  <main class="not-found">
    <h1>페이지를 찾을 수 없어요</h1>
    <p>주소가 바뀌었거나 아직 준비 중인 곳이에요.</p>
    <RouterLink to="/" class="home-link">메인으로</RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  max-width: 480px;
  margin: 0 auto;
  padding: 96px 20px;
  text-align: center;
}

h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-strong);
}

p {
  margin-top: 8px;
  color: var(--text-2);
}

.home-link {
  display: inline-flex;
  align-items: center;
  height: 36px;
  margin-top: 20px;
  padding: 0 16px;
  border-radius: var(--radius-control);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 14px;
  font-weight: 600;
}
</style>
