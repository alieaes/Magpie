<script setup lang="ts">
import LogoMark from './LogoMark.vue';
import UserMenu from './UserMenu.vue';

const links = [
  { to: '/', label: '메인', name: 'home' },
  { to: '/ranking', label: '랭킹', name: 'ranking' },
] as const;
</script>

<template>
  <header class="topbar">
    <div class="inner">
      <RouterLink to="/" class="brand" aria-label="Magpie 메인으로">
        <LogoMark class="mark" />
        <span class="wordmark">Magpie</span>
      </RouterLink>

      <nav class="nav" aria-label="주 메뉴">
        <RouterLink
          v-for="link in links"
          :key="link.name"
          :to="link.to"
          class="nav-link"
          active-class=""
          exact-active-class="is-active"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <UserMenu class="user" />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--topbar-height);
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: saturate(1.4) blur(10px);
  -webkit-backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--border);
}

.inner {
  max-width: var(--content-width);
  height: 100%;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-strong);
}

.mark {
  width: 24px;
  height: 24px;
  color: var(--accent);
}

.wordmark {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  position: relative;
  padding: 6px 10px;
  border-radius: var(--radius-control);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  transition: color 150ms ease, background-color 150ms ease;
}

.nav-link:hover {
  color: var(--text-strong);
  background: var(--surface-hover);
}

.nav-link.is-active {
  color: var(--text-strong);
  font-weight: 600;
}

.nav-link.is-active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -11px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

.user {
  margin-left: auto;
}

@media (max-width: 639px) {
  .inner {
    padding: 0 14px;
    gap: 14px;
  }

  .wordmark {
    font-size: 17px;
  }

  .nav-link {
    padding: 6px 8px;
  }
}
</style>
