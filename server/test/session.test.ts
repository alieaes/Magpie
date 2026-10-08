// 세션 통합 테스트. 개발 DB(-dev)에 붙어서 트랜잭션 안에서 실행하고 되돌린다. DB 설정이 없으면 건너뛴다.

import { describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { loadConfig, loadEnvFile } from '../src/config';
import { createDb } from '../src/db';
import type { Database } from '../src/db/types';
import { createSession, deleteSession, hashToken, purgeExpiredSessions, resolveSession } from '../src/auth/session';
import { DuplicateNicknameError, findOrCreateUser, setNickname } from '../src/auth/users';

loadEnvFile();
const config = (() => {
  try {
    return loadConfig();
  } catch {
    return null;
  }
})();
const canRun = config !== null && config.DB_NAME.endsWith('-dev');
const ROLLBACK = new Error('rollback');
const DAY = 86_400_000;

/** 트랜잭션 안에서 테스트를 돌리고 항상 되돌린다 */
async function inRollback(fn: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
  const db = createDb(config!);
  try {
    await db.transaction().execute(async (trx) => {
      await fn(trx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await db.destroy();
  }
}

/** 테스트용 Google ID (실제 계정과 겹치지 않게) */
function fakeSub(): string {
  return `test-sub:${Date.now()}:${Math.random()}`;
}

describe.skipIf(!canRun)('세션 (개발 DB)', () => {
  it('만든 세션으로 유저를 찾고, DB에는 해시만 둔다', async () => {
    await inRollback(async (trx) => {
      const user = await findOrCreateUser(trx, fakeSub());
      expect(user.nickname).toBeNull();
      const { token } = await createSession(trx, user.id);
      const stored = await trx.selectFrom('sessions').select('id_hash').where('user_id', '=', user.id).execute();
      expect(stored.map((s) => s.id_hash)).toEqual([hashToken(token)]);
      expect(stored[0]!.id_hash).not.toBe(token);
      const session = await resolveSession(trx, token);
      expect(session).toEqual({ user: { id: user.id, nickname: null }, renewed: false });
    });
  });

  it('없는 값·만료된 세션은 null', async () => {
    await inRollback(async (trx) => {
      const user = await findOrCreateUser(trx, fakeSub());
      const start = new Date('2026-01-01T00:00:00Z');
      const { token } = await createSession(trx, user.id, start);
      expect(await resolveSession(trx, 'nope', start)).toBeNull();
      expect(await resolveSession(trx, token, new Date(start.getTime() + 31 * DAY))).toBeNull();
    });
  });

  it('남은 기간이 15일 아래면 30일로 다시 늘린다', async () => {
    await inRollback(async (trx) => {
      const user = await findOrCreateUser(trx, fakeSub());
      const start = new Date('2026-01-01T00:00:00Z');
      const { token } = await createSession(trx, user.id, start);
      // 10일 뒤: 20일 남음 → 그대로
      expect((await resolveSession(trx, token, new Date(start.getTime() + 10 * DAY)))?.renewed).toBe(false);
      // 20일 뒤: 10일 남음 → 늘림
      const later = new Date(start.getTime() + 20 * DAY);
      expect((await resolveSession(trx, token, later))?.renewed).toBe(true);
      // 늘린 뒤에는 처음 만료일(30일)이 지나도 살아 있다
      expect(await resolveSession(trx, token, new Date(start.getTime() + 35 * DAY))).not.toBeNull();
    });
  });

  it('로그아웃하면 세션이 사라지고, 만료 세션은 정리된다', async () => {
    await inRollback(async (trx) => {
      const user = await findOrCreateUser(trx, fakeSub());
      const a = await createSession(trx, user.id);
      await deleteSession(trx, a.token);
      expect(await resolveSession(trx, a.token)).toBeNull();

      const old = await createSession(trx, user.id, new Date('2020-01-01T00:00:00Z'));
      expect(await purgeExpiredSessions(trx)).toBeGreaterThanOrEqual(1);
      expect(await trx.selectFrom('sessions').select('id_hash').where('id_hash', '=', hashToken(old.token)).executeTakeFirst()).toBeUndefined();
    });
  });

  it('같은 Google ID면 같은 유저, 닉네임 중복은 막는다 (대소문자 무시)', async () => {
    await inRollback(async (trx) => {
      const sub = fakeSub();
      const a = await findOrCreateUser(trx, sub);
      expect((await findOrCreateUser(trx, sub)).id).toBe(a.id);
      const b = await findOrCreateUser(trx, fakeSub());
      const name = `Nick${Date.now() % 100000}`;
      await setNickname(trx, a.id, name);
      await expect(setNickname(trx, b.id, name.toLowerCase())).rejects.toBeInstanceOf(DuplicateNicknameError);
    });
  });
});
