// db/ 폴더의 스키마 .sql 파일을 번호 순서대로 적용한다. 수동 스크립트(scripts/migrate.ts)와 서버 시작(main.ts)이 같이 쓴다.
//   000_*.sql — 스키마 생성. 매번 실행한다 (IF NOT EXISTS)
//   그 외     — 한 번만 실행한다. 적용한 파일은 schema_migrations 표에 남는다

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { Config } from '../config';

/** 스키마 파일 하나 */
export interface SqlFile {
  name: string;
  text: string;
}

// 빌드할 때 esbuild가 db/*.sql 내용을 넣는다 (scripts/build.mjs). 개발 중에는 정의되지 않아 db/ 폴더를 직접 읽는다.
declare const __MAGPIE_SQL__: SqlFile[] | undefined;

const DB_DIR = fileURLToPath(new URL('../../../db/', import.meta.url));
const FILE_PATTERN = /^\d{3}_[\w-]+\.sql$/;
const LOCK_NAME = 'magpie-migrate';
const LOCK_TIMEOUT_SEC = 30;

/** SQL 안의 {{DB_NAME}} 자리를 실제 스키마 이름으로 바꾼다 */
export function fillPlaceholders(text: string, dbName: string): string {
  return text.replaceAll('{{DB_NAME}}', dbName);
}

/** 스키마 파일 이름이 규칙에 맞는지 */
export function isSqlFileName(name: string): boolean {
  return FILE_PATTERN.test(name);
}

/** 스키마 파일을 번호 순으로 가져온다. 빌드본은 번들에 든 내용을, 개발 중에는 db/ 폴더를 읽는다 */
export async function loadSqlFiles(): Promise<SqlFile[]> {
  if (typeof __MAGPIE_SQL__ !== 'undefined') return [...__MAGPIE_SQL__].sort((a, b) => a.name.localeCompare(b.name));
  const names = (await readdir(DB_DIR)).filter(isSqlFileName).sort();
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(path.join(DB_DIR, name), 'utf8') })));
}

/**
 * 밀린 마이그레이션을 모두 적용한다. 서버가 동시에 여러 개 떠도 한 번에 하나만 돌도록 DB 락을 잡는다.
 * 새로 적용한 파일 이름을 돌려준다.
 */
export async function runMigrations(config: Config, log: (line: string) => void = console.log): Promise<string[]> {
  const files = await loadSqlFiles();

  const conn = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: true,
  });

  try {
    await conn.query("SET time_zone = '+00:00'");

    const [lockRows] = await conn.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS got', [LOCK_NAME, LOCK_TIMEOUT_SEC]);
    if (lockRows[0]?.got !== 1) throw new Error('다른 곳에서 마이그레이션을 하고 있어 기다리다 시간이 지났다');

    for (const file of files.filter((f) => f.name.startsWith('000_'))) {
      await conn.query(fillPlaceholders(file.text, config.DB_NAME));
      log(`[migrate] ${file.name} 실행`);
    }

    await conn.query(`USE \`${config.DB_NAME}\``);
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name as string));

    const applied: string[] = [];
    for (const file of files.filter((f) => !f.name.startsWith('000_'))) {
      if (done.has(file.name)) continue;
      await conn.query(fillPlaceholders(file.text, config.DB_NAME));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file.name]);
      log(`[migrate] ${file.name} 적용`);
      applied.push(file.name);
    }

    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    return applied;
  } finally {
    await conn.end();
  }
}
