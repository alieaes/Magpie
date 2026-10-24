// 방문자 수 통합 테스트. 개발 DB(-dev)의 되돌림 트랜잭션 안에서 GET /api/me로 방문을 세고 관리자 API로 읽는다.
// 근거: docs/design/261024-01-admin-dashboard.md

import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { AdminVisitorsResponse } from '@magpie/shared';
import { isVisitorId } from '../src/visits/service';
import { TEST_T0, canRunDb, withTestApp, type TestApp } from './helpers';

const HOUR_MS = 3_600_000;

/** 응답이 준 방문자 쿠키 값. 주지 않았으면 null */
function visitorCookie(res: Response): string | null {
  const line = res.headers.getSetCookie().find((c) => c.startsWith('magpie_vid='));
  return line ? line.slice('magpie_vid='.length).split(';')[0]! : null;
}

/** 방문자 쿠키를 들고(없으면 없이) GET /api/me를 부른다 */
function visit(app: TestApp, visitorId?: string): Promise<Response> {
  return app.get('/api/me', visitorId ? `magpie_vid=${visitorId}` : undefined);
}

/** 그날 visits 줄 수 */
async function countDay(app: TestApp, day: string): Promise<number> {
  const row = await app.trx.selectFrom('visits').select((eb) => eb.fn.countAll<number>().as('n')).where(sql<boolean>`day = ${day}`).executeTakeFirstOrThrow();
  return Number(row.n);
}

describe('방문자 값', () => {
  it('22자 base64url만 방문자 값으로 본다', () => {
    expect(isVisitorId('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isVisitorId('Ab-_0123456789abcdefgh')).toBe(true);
    expect(isVisitorId(undefined)).toBe(false);
    expect(isVisitorId('short')).toBe(false);
    expect(isVisitorId('AAAAAAAAAAAAAAAAAAAAA=')).toBe(false);
  });
});

describe.skipIf(!canRunDb)('방문자 (개발 DB)', () => {
  it('처음 오면 쿠키를 주고 한 줄 센다. 같은 쿠키로 다시 오면 그대로, 모양이 틀리면 새 쿠키', async () => {
    await withTestApp(async (app) => {
      const day = '2000-01-02';
      const before = await countDay(app, day);

      const first = await visit(app);
      expect(first.status).toBe(200);
      const id = visitorCookie(first);
      expect(isVisitorId(id ?? undefined)).toBe(true);
      expect(first.headers.getSetCookie().find((c) => c.startsWith('magpie_vid='))).toMatch(/HttpOnly/i);
      expect(await countDay(app, day)).toBe(before + 1);

      const again = await visit(app, id!);
      expect(visitorCookie(again)).toBeNull();
      expect(await countDay(app, day)).toBe(before + 1);

      const broken = await visit(app, 'not-a-visitor');
      const fresh = visitorCookie(broken);
      expect(fresh).not.toBeNull();
      expect(fresh).not.toBe(id);
      expect(await countDay(app, day)).toBe(before + 2);
    });
  });

  it('KST 자정을 넘기면 같은 방문자도 다음 날 다시 센다', async () => {
    await withTestApp(async (app) => {
      const id = visitorCookie(await visit(app))!;
      // TEST_T0은 KST 12:00. UTC 14:59:59(KST 23:59:59)까지는 같은 날, 15:00(KST 00:00)부터 다음 날
      const lastSecond = new Date('2000-01-02T14:59:59Z').getTime() - TEST_T0.getTime();
      app.advance(lastSecond);
      await visit(app, id);
      expect(await countDay(app, '2000-01-03')).toBe(0);
      app.advance(1000);
      await visit(app, id);
      const rows = await app.trx.selectFrom('visits').select('first_at').where('visitor_id', '=', id).orderBy('first_at').execute();
      expect(rows.map((r) => r.first_at.toISOString())).toEqual(['2000-01-02T03:00:00.000Z', '2000-01-02T15:00:00.000Z']);
    });
  });

  it('관리자 API: 비로그인 401, 일반 유저 403', async () => {
    await withTestApp(async (app) => {
      expect((await app.get('/api/admin/visitors')).status).toBe(401);
      const user = await app.login();
      expect((await app.get('/api/admin/visitors', user.cookie)).status).toBe(403);
    });
  });

  it('관리자 API: 오늘 KST 시간별 방문자, 합이 오늘 방문자. 전체는 지난날까지 합친 수', async () => {
    await withTestApp(async (app) => {
      const admin = await app.login({ admin: true });
      const read = async () => (await (await app.get('/api/admin/visitors', admin.cookie)).json()) as AdminVisitorsResponse;
      const start = await read();
      expect(start.today.day).toBe('2000-01-02');
      expect(start.today.hourly).toHaveLength(24);

      // KST 12시에 둘, 13시에 하나(그중 하나는 12시에 왔던 방문자라 다시 세지 않는다)
      const a = visitorCookie(await visit(app))!;
      await visit(app);
      app.advance(HOUR_MS);
      await visit(app, a);
      await visit(app);

      const now = await read();
      expect(now.today.hourly[12]).toBe(start.today.hourly[12]! + 2);
      expect(now.today.hourly[13]).toBe(start.today.hourly[13]! + 1);
      expect(now.today.total).toBe(now.today.hourly.reduce((x, y) => x + y, 0));
      expect(now.today.total).toBe(start.today.total + 3);
      expect(now.allTime).toBe(start.allTime + 3);

      // 다음 날: 오늘은 새로 시작하고 전체는 쌓인다
      app.advance(24 * HOUR_MS);
      await visit(app, a);
      const next = await read();
      expect(next.today.day).toBe('2000-01-03');
      expect(next.allTime).toBe(start.allTime + 4);
    });
  });
});
