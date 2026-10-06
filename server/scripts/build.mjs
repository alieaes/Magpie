// 서버를 JS 파일 하나(dist/server.mjs)로 묶는다. 버전 자리에 현재 커밋 해시를 넣는다.

import { execSync } from 'node:child_process';
import { build } from 'esbuild';

/** 현재 커밋 해시를 읽는다. git이 없으면 'unknown' */
function readVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  define: { __MAGPIE_VERSION__: JSON.stringify(readVersion()) },
  // 묶은 ESM 안에서 CommonJS 의존성이 require를 쓸 수 있게 한다
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
