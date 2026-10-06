// db/ 폴더의 스키마 .sql 파일을 번호 순서대로 적용한다.
//   000_*.sql — 스키마 생성. 매번 실행한다 (IF NOT EXISTS)
//   그 외     — 한 번만 실행한다. 적용한 파일은 schema_migrations 표에 남는다
// 실행: pnpm db:migrate

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadConfig, loadEnvFile } from '../src/config';

const DB_DIR = fileURLToPath(new URL('../../db/', import.meta.url));
const FILE_PATTERN = /^\d{3}_[\w-]+\.sql$/;

/** SQL 안의 {{DB_NAME}} 자리를 실제 스키마 이름으로 바꾼다 */
function fillPlaceholders(text: string, dbName: string): string {
  return text.replaceAll('{{DB_NAME}}', dbName);
}

/** 스키마 파일 목록을 번호 순으로 읽는다 */
async function listSqlFiles(): Promise<string[]> {
  const names = await readdir(DB_DIR);
  return names.filter((n) => FILE_PATTERN.test(n)).sort();
}

/** 마이그레이션 전체를 실행한다 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const files = await listSqlFiles();

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

    for (const name of files.filter((n) => n.startsWith('000_'))) {
      const text = await readFile(path.join(DB_DIR, name), 'utf8');
      await conn.query(fillPlaceholders(text, config.DB_NAME));
      console.log(`[migrate] ${name} 실행`);
    }

    await conn.query(`USE \`${config.DB_NAME}\``);
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name as string));

    let count = 0;
    for (const name of files.filter((n) => !n.startsWith('000_'))) {
      if (applied.has(name)) continue;
      const text = await readFile(path.join(DB_DIR, name), 'utf8');
      await conn.query(fillPlaceholders(text, config.DB_NAME));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      console.log(`[migrate] ${name} 적용`);
      count += 1;
    }
    console.log(`[migrate] 완료: ${config.DB_NAME}, 새로 적용 ${count}개`);
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
