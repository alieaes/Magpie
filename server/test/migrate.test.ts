import { describe, expect, it } from 'vitest';
import { fillPlaceholders, isSqlFileName, loadSqlFiles, runMigrations } from '../src/db/migrate';
import { canRunDb, devConfig } from './helpers';

describe('마이그레이션 파일', () => {
  it('db/ 폴더의 스키마 파일을 번호 순으로 읽는다', async () => {
    const files = await loadSqlFiles();
    const names = files.map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0]).toMatch(/^000_/);
    expect(names).toEqual([...names].sort());
    expect(names.every(isSqlFileName)).toBe(true);
    expect(files.every((f) => f.text.length > 0)).toBe(true);
  });

  it('규칙에 안 맞는 이름은 거른다', () => {
    expect(isSqlFileName('001_users.sql')).toBe(true);
    expect(isSqlFileName('1_users.sql')).toBe(false);
    expect(isSqlFileName('001_users.txt')).toBe(false);
  });

  it('{{DB_NAME}} 자리를 모두 바꾼다', () => {
    expect(fillPlaceholders('USE `{{DB_NAME}}`; -- {{DB_NAME}}', 'magpie')).toBe('USE `magpie`; -- magpie');
  });
});

describe.skipIf(!canRunDb)('마이그레이션 실행 (개발 DB)', () => {
  it('이미 적용된 DB에 다시 돌리면 새로 적용하는 게 없다', async () => {
    const logs: string[] = [];
    await runMigrations(devConfig!, (line) => logs.push(line));
    const again = await runMigrations(devConfig!, () => {});
    expect(again).toEqual([]);
  });

  it('동시에 두 번 돌려도 한 번만 적용되고 탈이 없다', async () => {
    const [a, b] = await Promise.all([runMigrations(devConfig!, () => {}), runMigrations(devConfig!, () => {})]);
    expect(a.length + b.length).toBe(0);
  });
});
