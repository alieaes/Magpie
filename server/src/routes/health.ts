import { Hono } from 'hono';
import { pingDb, type Db } from '../db';
import { VERSION } from '../version';

const DB_PING_TIMEOUT_MS = 1000;

/**
 * GET /health — AviaryHub 공통 가동 확인 규약.
 * DB가 1초 안에 답하면 200, 아니면 503. 캐시되면 안 되므로 no-store를 붙인다.
 */
export function healthRoutes(db: Db) {
  return new Hono().get('/health', async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      await pingDb(db, DB_PING_TIMEOUT_MS);
      return c.json({ status: 'ok' as const, name: 'Magpie', version: VERSION }, 200);
    } catch {
      return c.json({ status: 'error' as const }, 503);
    }
  });
}
