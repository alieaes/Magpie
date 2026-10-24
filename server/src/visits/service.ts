// 방문자 수: 방문자 쿠키(브라우저 하나)가 KST 하루에 한 번. 근거: docs/design/261024-01-admin-dashboard.md §1

import { randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { kstDayKey, type AdminVisitorsResponse } from '@magpie/shared';
import type { Database } from '../db/types';

/** 방문자 쿠키 기간: 1년. 다시 와도 늘리지 않는다 */
export const VISITOR_MAX_AGE_SECONDS = 365 * 86_400;

// 무작위 16바이트를 base64url로 쓰면 22자다
const VISITOR_ID = /^[A-Za-z0-9_-]{22}$/;

/** 새 방문자 값을 만든다 */
export function newVisitorId(): string {
  return randomBytes(16).toString('base64url');
}

/** 쿠키 값이 방문자 값 모양인지 본다 */
export function isVisitorId(value: string | undefined): value is string {
  return value !== undefined && VISITOR_ID.test(value);
}

export interface VisitService {
  /** 방문을 하나 센다. 그날 이미 온 방문자면 아무 일도 없다 */
  record(visitorId: string): Promise<void>;
  /** 오늘 시간별 방문자와 전체 방문자 */
  summary(): Promise<AdminVisitorsResponse>;
}

/** 방문자 서비스를 만든다. now는 테스트에서 시각을 고정할 때 바꾼다 */
export function createVisitService(db: Kysely<Database>, now: () => Date = () => new Date()): VisitService {
  return {
    async record(visitorId) {
      const at = now();
      await db.insertInto('visits').ignore().values({ day: kstDayKey(at), visitor_id: visitorId, first_at: at }).execute();
    },

    async summary() {
      const day = kstDayKey(now());
      // first_at은 UTC라 9시간을 더해 KST 시로 묶는다
      const rows = await db
        .selectFrom('visits')
        .select([sql<number>`HOUR(first_at + INTERVAL 9 HOUR)`.as('hour'), (eb) => eb.fn.countAll<number>().as('count')])
        .where(sql<boolean>`day = ${day}`)
        .groupBy('hour')
        .execute();
      const hourly = Array.from({ length: 24 }, () => 0);
      for (const row of rows) hourly[Number(row.hour)] = Number(row.count);

      const all = await db.selectFrom('visits').select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();
      return { today: { day, total: hourly.reduce((a, b) => a + b, 0), hourly }, allTime: Number(all.count) };
    },
  };
}
