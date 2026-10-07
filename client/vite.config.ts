import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 개발 중에는 API·로그인·가동 확인 요청을 API 서버(3473)로 넘긴다.
// 브라우저 입장에서 같은 주소라 CORS 설정이 필요 없다.
const API = 'http://127.0.0.1:3473';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5480,
    strictPort: true,
    proxy: {
      '/api': API,
      '/auth': API,
      '/health': API,
    },
  },
  build: {
    // 파일명에 해시가 붙으므로 Cloudflare가 오래 캐시해도 된다
    assetsDir: 'assets',
    // Phaser가 1MB를 넘는다. 게임 화면에 들어갈 때만 받는 덩어리라 경고 기준을 올린다
    chunkSizeWarningLimit: 1600,
  },
});
