// db/ 폴더의 스키마 .sql 파일을 번호 순서대로 적용한다. 서버도 시작할 때 같은 일을 한다(AUTO_MIGRATE).
// 실행: pnpm db:migrate

import { loadConfig, loadEnvFile } from '../src/config';
import { runMigrations } from '../src/db/migrate';

/** 마이그레이션을 실행하고 결과를 찍는다 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const applied = await runMigrations(config);
  console.log(`[migrate] 완료: ${config.DB_NAME}, 새로 적용 ${applied.length}개`);
}

main().catch((err: unknown) => {
  console.error('[migrate] 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
