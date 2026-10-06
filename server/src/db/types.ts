// DB 표 타입. 표를 추가·변경하면 db/ 폴더의 .sql과 같이 고친다.

import type { ColumnType, Generated } from 'kysely';

/** 001_users.sql */
export interface UsersTable {
  id: Generated<number>;
  google_sub: string;
  nickname: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

/** 판 검증 상태 */
export type PlayStatus = 'pending' | 'accepted' | 'rejected';

/** 003_plays.sql */
export interface PlaysTable {
  id: Generated<number>;
  user_id: number;
  game_id: string;
  seed: string;
  score: number | null;
  status: ColumnType<PlayStatus, PlayStatus | undefined, PlayStatus>;
  started_at: Date;
  ended_at: Date | null;
}

/** 003_plays.sql */
export interface PlayReplaysTable {
  play_id: number;
  data: Buffer;
}

/** 004_bests.sql. day는 KST 날짜(YYYY-MM-DD)로 넣는다 */
export interface BestDailyTable {
  user_id: number;
  game_id: string;
  day: ColumnType<Date, string, string>;
  score: number;
  achieved_at: Date;
  play_id: number;
}

/** 004_bests.sql */
export interface BestAlltimeTable {
  user_id: number;
  game_id: string;
  score: number;
  achieved_at: Date;
  play_id: number;
}

export interface Database {
  users: UsersTable;
  plays: PlaysTable;
  play_replays: PlayReplaysTable;
  best_daily: BestDailyTable;
  best_alltime: BestAlltimeTable;
}
