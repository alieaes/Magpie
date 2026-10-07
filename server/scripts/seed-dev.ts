// 개발 DB에 가짜 유저와 기록을 넣는다. 점수 제출(사과게임)을 만들기 전에 랭킹 화면을 확인하기 위한 것이다.
// DB_NAME이 '-dev'로 끝나지 않으면 실행하지 않는다. 다시 돌리면 이전 테스트 데이터를 지우고 새로 넣는다.
// 실행: pnpm db:seed-dev

import { kstDayKey, kstDayStart } from '@magpie/shared';
import { loadConfig, loadEnvFile } from '../src/config';
import { createDb, type Db } from '../src/db';

const SEED_PREFIX = 'dev-seed:';
const USER_COUNT = 20;

/** 같은 결과가 나오는 간단한 난수 생성기 (테스트 데이터용) */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 이전에 넣은 테스트 데이터를 지운다 */
async function clearSeed(db: Db): Promise<void> {
  const ids = (await db.selectFrom('users').select('id').where('google_sub', 'like', `${SEED_PREFIX}%`).execute()).map(
    (r) => r.id,
  );
  if (ids.length === 0) return;
  await db.deleteFrom('best_daily').where('user_id', 'in', ids).execute();
  await db.deleteFrom('best_alltime').where('user_id', 'in', ids).execute();
  await db.deleteFrom('plays').where('user_id', 'in', ids).execute();
  await db.deleteFrom('users').where('id', 'in', ids).execute();
}

/** 판 하나와 그 판을 가리키는 최고 기록을 넣는다 */
async function insertBest(
  db: Db,
  row: { userId: number; gameId: string; score: number; achievedAt: Date; day?: string },
): Promise<void> {
  const play = await db
    .insertInto('plays')
    .values({
      user_id: row.userId,
      game_id: row.gameId,
      seed: 'dev-seed',
      score: row.score,
      status: 'accepted',
      started_at: new Date(row.achievedAt.getTime() - 120_000),
      ended_at: row.achievedAt,
    })
    .executeTakeFirstOrThrow();
  const playId = Number(play.insertId);
  if (row.day) {
    await db
      .insertInto('best_daily')
      .values({ user_id: row.userId, game_id: row.gameId, day: row.day, score: row.score, achieved_at: row.achievedAt, play_id: playId })
      .execute();
  } else {
    await db
      .insertInto('best_alltime')
      .values({ user_id: row.userId, game_id: row.gameId, score: row.score, achieved_at: row.achievedAt, play_id: playId })
      .execute();
  }
}

/** 테스트 데이터를 만든다: 사과게임의 오늘 기록과 역대 기록 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  if (!config.DB_NAME.endsWith('-dev')) {
    throw new Error(`개발 DB가 아니다: ${config.DB_NAME}. 테스트 데이터는 -dev 스키마에만 넣는다.`);
  }
  const db = createDb(config);
  const random = makeRandom(20261006);
  const now = new Date();
  const today = kstDayKey(now);
  const todayStart = kstDayStart(today).getTime();
  /** 오늘 0시부터 지금 사이의 아무 시각 */
  const todayAt = () => new Date(todayStart + Math.floor(random() * (now.getTime() - todayStart)));
  /** 지난 30일 안의 아무 시각 */
  const pastAt = () => new Date(todayStart - Math.floor(random() * 30 * 86_400_000));

  try {
    await clearSeed(db);
    let daily = 0;
    let alltime = 0;
    for (let i = 1; i <= USER_COUNT; i += 1) {
      const num = String(i).padStart(2, '0');
      const user = await db
        .insertInto('users')
        .values({ google_sub: `${SEED_PREFIX}${num}`, nickname: `테스트${num}` })
        .executeTakeFirstOrThrow();
      const userId = Number(user.insertId);

      // 사과게임: 0~170개. 거의 모두 역대 기록이 있고, 4명 중 3명꼴로 오늘도 했다
      const appleBest = 70 + Math.floor(random() * 95);
      await insertBest(db, { userId, gameId: 'apple-ten', score: appleBest, achievedAt: pastAt() });
      alltime += 1;
      if (random() < 0.75) {
        await insertBest(db, { userId, gameId: 'apple-ten', score: appleBest - Math.floor(random() * 30), achievedAt: todayAt(), day: today });
        daily += 1;
      }
      // 숨긴(준비 중) 게임의 기록은 넣지 않는다. 총합 환산은 서버 통합 테스트가 여러 게임으로 확인한다
    }
    console.log(`[seed-dev] ${config.DB_NAME}: 유저 ${USER_COUNT}명, 오늘(${today}) 기록 ${daily}개, 역대 기록 ${alltime}개`);
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[seed-dev] 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
