import type { Kysely } from 'kysely';
import type { SessionUser } from '../app-env';
import type { Database } from '../db/types';

/** 이미 다른 유저가 쓰는 닉네임 */
export class DuplicateNicknameError extends Error {
  constructor() {
    super('이미 쓰는 닉네임');
  }
}

/** MariaDB 중복 키 오류인지 */
function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

/** Google 고유 ID로 유저를 찾고, 없으면 닉네임 없이 만든다 */
export async function findOrCreateUser(db: Kysely<Database>, googleSub: string): Promise<SessionUser> {
  const find = () =>
    db.selectFrom('users').select(['id', 'nickname']).where('google_sub', '=', googleSub).executeTakeFirst();
  const existing = await find();
  if (existing) return { id: Number(existing.id), nickname: existing.nickname };
  try {
    const inserted = await db.insertInto('users').values({ google_sub: googleSub, nickname: null }).executeTakeFirstOrThrow();
    return { id: Number(inserted.insertId), nickname: null };
  } catch (err) {
    // 같은 계정으로 거의 동시에 두 번 로그인한 경우: 먼저 만든 줄을 쓴다
    if (!isDuplicateKey(err)) throw err;
    const row = await find();
    if (!row) throw err;
    return { id: Number(row.id), nickname: row.nickname };
  }
}

/** 닉네임을 바꾼다. 규칙 검사는 부르는 쪽에서 끝낸다. 중복이면 DuplicateNicknameError */
export async function setNickname(db: Kysely<Database>, userId: number, nickname: string): Promise<void> {
  try {
    await db.updateTable('users').set({ nickname }).where('id', '=', userId).execute();
  } catch (err) {
    if (isDuplicateKey(err)) throw new DuplicateNicknameError();
    throw err;
  }
}
