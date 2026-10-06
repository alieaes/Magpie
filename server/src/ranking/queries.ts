// 랭킹 SQL. 규칙: docs/design/261006-06-ranking.md
//  - 게임별: 최고 기록 정렬, 동점이면 먼저 달성한 사람이 위 (ROW_NUMBER로 순위가 겹치지 않는다)
//  - 총합: 게임별 순위를 환산점(1위 1000점, 1000 × (N − 순위 + 1) / N)으로 바꿔 유저별로 더한다

import { sql, type Kysely, type RawBuilder } from 'kysely';
import { GAMES, TOTAL_POINTS_PER_GAME, type GameMeta, type RankingPeriod } from '@magpie/shared';
import type { Database } from '../db/types';

/** 순위가 매겨진 한 줄. 캐시에는 전체 순위를 통째로 둔다 */
export interface RankedRow {
  userId: number;
  nickname: string;
  score: number;
  rank: number;
}

const NO_NICKNAME = '이름 없음';

/** 기간에 맞는 최고 기록 표와 날짜 조건을 만든다 */
function periodSource(period: RankingPeriod, day: string) {
  return period === 'daily'
    ? { table: sql.table('best_daily'), where: sql`b.day = ${day}` }
    : { table: sql.table('best_alltime'), where: sql`1 = 1` };
}

/** 게임 하나의 순위를 전부 가져온다 */
export async function rankGame(
  db: Kysely<Database>,
  game: GameMeta,
  period: RankingPeriod,
  day: string,
): Promise<RankedRow[]> {
  const { table, where } = periodSource(period, day);
  const direction = game.sort === 'asc' ? sql`ASC` : sql`DESC`;
  const result = await sql<RankedRow>`
    SELECT b.user_id AS userId,
           COALESCE(u.nickname, ${NO_NICKNAME}) AS nickname,
           b.score AS score,
           ROW_NUMBER() OVER (ORDER BY b.score ${direction}, b.achieved_at ASC, b.user_id ASC) AS \`rank\`
      FROM ${table} b
      JOIN users u ON u.id = b.user_id
     WHERE b.game_id = ${game.id} AND ${where}
     ORDER BY \`rank\``.execute(db);
  return result.rows.map(toRankedRow);
}

/**
 * 총합 순위를 전부 가져온다. 게임마다 정렬 방향이 달라서,
 * 낮을수록 좋은 게임은 점수를 그대로, 높을수록 좋은 게임은 부호를 뒤집어 같은 오름차순으로 정렬한다.
 */
export async function rankTotal(
  db: Kysely<Database>,
  period: RankingPeriod,
  day: string,
): Promise<RankedRow[]> {
  const { table, where } = periodSource(period, day);
  const result = await sql<RankedRow>`
    WITH ranked AS (
      SELECT b.user_id, b.achieved_at,
             ROW_NUMBER() OVER (PARTITION BY b.game_id
                                ORDER BY ${sortKey()} ASC, b.achieved_at ASC, b.user_id ASC) AS rnk,
             COUNT(*) OVER (PARTITION BY b.game_id) AS n
        FROM ${table} b
       WHERE ${where}
    ), totals AS (
      SELECT user_id,
             CAST(SUM(ROUND(${TOTAL_POINTS_PER_GAME} * (n - rnk + 1) / n)) AS SIGNED) AS total,
             MAX(achieved_at) AS last_at
        FROM ranked
       GROUP BY user_id
    )
    SELECT t.user_id AS userId,
           COALESCE(u.nickname, ${NO_NICKNAME}) AS nickname,
           t.total AS score,
           ROW_NUMBER() OVER (ORDER BY t.total DESC, t.last_at ASC, t.user_id ASC) AS \`rank\`
      FROM totals t
      JOIN users u ON u.id = t.user_id
     ORDER BY \`rank\``.execute(db);
  return result.rows.map(toRankedRow);
}

/** 총합 계산에서 게임별 정렬 기준 식. 오름차순으로 정렬하면 좋은 기록이 앞에 온다 */
function sortKey(): RawBuilder<unknown> {
  const ascIds = GAMES.filter((g) => g.sort === 'asc').map((g) => g.id);
  if (ascIds.length === 0) return sql`-b.score`;
  return sql`(CASE WHEN b.game_id IN (${sql.join(ascIds)}) THEN b.score ELSE -b.score END)`;
}

/** DB 드라이버가 준 값을 숫자로 맞춘다 (BIGINT가 문자열로 올 때를 대비) */
function toRankedRow(row: RankedRow): RankedRow {
  return {
    userId: Number(row.userId),
    nickname: row.nickname,
    score: Number(row.score),
    rank: Number(row.rank),
  };
}
