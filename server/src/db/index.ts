import { CompiledQuery, Kysely, MysqlDialect, sql } from 'kysely';
import { createPool } from 'mysql2';
import type { Config } from '../config';
import type { Database } from './types';

export type Db = Kysely<Database>;

/** MariaDB 연결 풀을 만든다. 모든 연결의 시간대를 UTC로 맞춘다 */
export function createDb(config: Config): Db {
  const pool = createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectionLimit: 10,
    connectTimeout: 3000,
  });
  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool,
      // DB 쪽 CURRENT_TIMESTAMP도 UTC가 되도록 세션 시간대를 맞춘다
      onCreateConnection: async (conn) => {
        await conn.executeQuery(CompiledQuery.raw("SET time_zone = '+00:00'"));
      },
    }),
  });
}

/**
 * fn을 트랜잭션 안에서 돌린다. 이미 트랜잭션 안이면 그 트랜잭션을 그대로 쓴다
 * (Kysely는 트랜잭션 안에서 다시 트랜잭션을 열 수 없다. 테스트가 되돌림 트랜잭션 안에서 부를 때도 이 경우다).
 */
export function inTransaction<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  return db.isTransaction ? fn(db) : db.transaction().execute(fn);
}

/** DB가 응답하는지 확인한다. timeoutMs 안에 답이 없으면 실패로 본다 */
export async function pingDb(db: Db, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('DB 응답 시간 초과')), timeoutMs);
  });
  try {
    await Promise.race([sql`SELECT 1`.execute(db), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
