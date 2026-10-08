// 관리자 지정. 화면에는 권한 주기 기능을 두지 않고 서버 PC·개발 PC에서 이 명령으로만 한다.
// 근거: docs/design/261008-02-admin.md §1. .env의 DB(개발 magpie-dev, 운영 magpie)에 적용된다.
//   pnpm admin:grant <닉네임>    관리자로 지정
//   pnpm admin:revoke <닉네임>   관리자 해제
//   pnpm admin:list              관리자 목록

import { loadConfig, loadEnvFile } from '../src/config';
import { createDb, type Db } from '../src/db';
import type { UserRole } from '../src/db/types';

const USAGE = '사용법: pnpm admin:grant <닉네임> | pnpm admin:revoke <닉네임> | pnpm admin:list';

/** 닉네임으로 유저의 권한을 바꾼다. 닉네임은 대소문자를 구분하지 않는다(DB 정렬 규칙) */
async function setRole(db: Db, nickname: string, role: UserRole): Promise<void> {
  const user = await db.selectFrom('users').select(['id', 'nickname', 'role']).where('nickname', '=', nickname).executeTakeFirst();
  if (!user) throw new Error(`닉네임이 "${nickname}"인 유저가 없다`);
  const label = role === 'admin' ? '관리자 지정' : '관리자 해제';
  if (user.role === role) {
    console.log(`[admin] 이미 ${role === 'admin' ? '관리자' : '일반 유저'}다: ${user.nickname} (#${user.id})`);
    return;
  }
  await db.updateTable('users').set({ role }).where('id', '=', user.id).execute();
  console.log(`[admin] ${label}: ${user.nickname} (#${user.id})`);
}

/** 관리자 목록을 찍는다 */
async function listAdmins(db: Db): Promise<void> {
  const admins = await db.selectFrom('users').select(['id', 'nickname']).where('role', '=', 'admin').orderBy('id').execute();
  if (admins.length === 0) {
    console.log('[admin] 관리자가 없다');
    return;
  }
  for (const a of admins) console.log(`#${a.id}\t${a.nickname ?? '(닉네임 없음)'}`);
}

/** 명령을 읽어 실행한다 */
async function main(): Promise<void> {
  const [command, nickname] = process.argv.slice(2);
  if (command !== 'list' && !(command === 'grant' || command === 'revoke')) throw new Error(USAGE);
  if (command !== 'list' && !nickname?.trim()) throw new Error(USAGE);

  loadEnvFile();
  const config = loadConfig();
  const db = createDb(config);
  try {
    console.log(`[admin] DB: ${config.DB_NAME}`);
    if (command === 'list') await listAdmins(db);
    else await setRole(db, nickname!.trim(), command === 'grant' ? 'admin' : 'user');
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[admin] 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
