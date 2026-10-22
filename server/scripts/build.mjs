// 서버를 JS 파일 하나(dist/server.mjs)로 묶는다. 버전 자리에 현재 커밋 해시를, SQL 자리에 db/*.sql 내용을 넣는다.

import { execSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';

/** 현재 커밋 해시를 읽는다. git이 없으면 'unknown' */
function readVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** db/*.sql을 번호 순으로 읽는다. 서버가 시작할 때 자동 마이그레이션에 쓰도록 번들에 넣는다 */
async function readSqlFiles() {
  const dir = new URL('../../db/', import.meta.url);
  const names = (await readdir(dir)).filter((n) => /^\d{3}_[\w-]+\.sql$/.test(n)).sort();
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(new URL(name, dir), 'utf8') })));
}

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  define: {
    __MAGPIE_VERSION__: JSON.stringify(readVersion()),
    __MAGPIE_SQL__: JSON.stringify(await readSqlFiles()),
  },
  // 묶은 ESM 안에서 CommonJS 의존성이 require를 쓸 수 있게 한다
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
