// 성장형 게임 저장 줄 읽기·쓰기. 하루 끝(판 기록)과 가게 행동이 같이 쓴다.
// 근거: docs/design/261021-04-game-save.md §4
//
// 잠금: 저장 줄은 (user_id, game_id) 기본 키로만 읽고 고친다. 바꿀 때는 트랜잭션 안에서 줄을 잠그고(FOR UPDATE)
// 버전을 확인한 뒤 버전을 1 올린다. 버전이 다르면 다른 곳(다른 기기·탭)에서 먼저 바꾼 것이다.

import type { Kysely } from 'kysely';
import { SAVE_MAX_BYTES, type GrowthLogic, type SaveSnapshot } from '@magpie/shared';
import type { Database } from '../db/types';

/** DB에서 읽은 JSON 열을 값으로 푼다. MariaDB의 JSON은 LONGTEXT라 문자열로 오기도 한다 */
export function parseJsonColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/** 저장 데이터를 게임 로직의 형식으로 읽는다. 예전 형식이면 고친다. 형식이 깨졌으면 예외 */
export function decodeState(logic: GrowthLogic, data: unknown): unknown {
  const raw = parseJsonColumn(data);
  return logic.stateSchema.parse(logic.migrate ? logic.migrate(raw) : raw);
}

/** 저장 상태를 JSON 문자열로 만든다. 크기 상한을 넘으면 게임 로직의 잘못이라 예외 */
export function encodeState(state: unknown): string {
  const text = JSON.stringify(state);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > SAVE_MAX_BYTES) throw new Error(`저장 상태가 상한(${SAVE_MAX_BYTES}바이트)보다 크다: ${bytes}바이트`);
  return text;
}

/** 저장이 없으면 시작 상태로 만든다(버전 1). 이미 있으면 그대로 둔다 */
export async function ensureSave(db: Kysely<Database>, userId: number, gameId: string, logic: GrowthLogic, now: Date): Promise<void> {
  await db
    .insertInto('game_saves')
    .ignore()
    .values({ user_id: userId, game_id: gameId, version: 1, data: encodeState(logic.initialState()), created_at: now, updated_at: now })
    .execute();
}

/** 저장 버전만 읽는다. lock이면 트랜잭션 안에서 줄을 잠근다. 없으면 undefined */
export async function readSaveVersion(db: Kysely<Database>, userId: number, gameId: string, lock = false): Promise<number | undefined> {
  let query = db.selectFrom('game_saves').select('version').where('user_id', '=', userId).where('game_id', '=', gameId);
  if (lock) query = query.forUpdate();
  const row = await query.executeTakeFirst();
  return row ? Number(row.version) : undefined;
}

/** 저장을 읽는다. lock이면 트랜잭션 안에서 줄을 잠근다. 없으면 undefined */
export async function readSave(
  db: Kysely<Database>,
  userId: number,
  gameId: string,
  logic: GrowthLogic,
  lock = false,
): Promise<SaveSnapshot | undefined> {
  let query = db.selectFrom('game_saves').select(['version', 'data']).where('user_id', '=', userId).where('game_id', '=', gameId);
  if (lock) query = query.forUpdate();
  const row = await query.executeTakeFirst();
  return row ? { version: Number(row.version), state: decodeState(logic, row.data) } : undefined;
}

/** 저장을 새 상태로 바꾸고 버전을 1 올린다. 버전이 expectedVersion일 때만 바꾸고, 바꿨으면 true */
export async function writeSave(
  db: Kysely<Database>,
  userId: number,
  gameId: string,
  expectedVersion: number,
  state: unknown,
  now: Date,
): Promise<boolean> {
  const result = await db
    .updateTable('game_saves')
    .set((eb) => ({ version: eb('version', '+', 1), data: encodeState(state), updated_at: now }))
    .where('user_id', '=', userId)
    .where('game_id', '=', gameId)
    .where('version', '=', expectedVersion)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
}
