// 개발용 테스트 로그인: 개발 PC에서만 Google 없이 테스트 계정(테스트1~3)으로 로그인한다.
// 운영에서 켜지지 않도록 -dev DB, localhost 사이트, DEV_LOGIN≠0을 모두 만족할 때만 켠다.
// 근거: docs/design/261022-05-dev-login.md

import type { Kysely } from 'kysely';
import { DEV_LOGIN_ACCOUNTS } from '@magpie/shared';
import type { SessionUser } from '../app-env';
import type { Config } from '../config';
import type { Database } from '../db/types';
import { DuplicateNicknameError, findOrCreateUser, setNickname } from './users';

/** 테스트 계정 수 (테스트1~N) */
export const DEV_ACCOUNTS = DEV_LOGIN_ACCOUNTS;

/** 테스트 계정의 google_sub 앞머리. Google의 sub는 숫자만이라 실제 계정·개발 시드(dev-seed:)와 겹치지 않는다 */
const SUB_PREFIX = 'dev-login:';

/** 개발용 로그인을 켤지: -dev DB, localhost 사이트, DEV_LOGIN≠0을 모두 만족할 때만 */
export function devLoginEnabled(config: Config): boolean {
  if (config.DEV_LOGIN?.trim() === '0') return false;
  if (!config.DB_NAME.endsWith('-dev')) return false;
  const host = new URL(config.SITE_URL).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** 테스트 계정 유저를 찾거나 만든다. 처음 만들 때 닉네임 "테스트N"을 채운다(이미 누가 쓰는 이름이면 비워 둔다) */
export async function findOrCreateDevUser(db: Kysely<Database>, account: number): Promise<SessionUser> {
  const sub = `${SUB_PREFIX}${account}`;
  const existed = await db.selectFrom('users').select('id').where('google_sub', '=', sub).executeTakeFirst();
  const user = await findOrCreateUser(db, sub);
  if (existed || user.nickname !== null) return user;
  const nickname = `테스트${account}`;
  try {
    await setNickname(db, user.id, nickname);
    return { ...user, nickname };
  } catch (err) {
    if (err instanceof DuplicateNicknameError) return user;
    throw err;
  }
}
