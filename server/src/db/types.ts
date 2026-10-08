// DB 표 타입. 표를 추가·변경하면 db/ 폴더의 .sql과 같이 고친다.

import type { ColumnType, Generated } from 'kysely';

/** 유저 권한 */
export type UserRole = 'user' | 'admin';

/** 001_users.sql, 006_users_role.sql */
export interface UsersTable {
  id: Generated<number>;
  google_sub: string;
  nickname: string | null;
  role: ColumnType<UserRole, UserRole | undefined, UserRole>;
  created_at: ColumnType<Date, Date | undefined, never>;
}

/** 002_sessions.sql */
export interface SessionsTable {
  id_hash: string;
  user_id: number;
  created_at: ColumnType<Date, Date | undefined, never>;
  expires_at: Date;
}

/** 판 검증 상태 */
export type PlayStatus = 'pending' | 'accepted' | 'rejected';

/** 003_plays.sql, 005_plays_reason.sql */
export interface PlaysTable {
  id: Generated<number>;
  user_id: number;
  game_id: string;
  seed: string;
  score: number | null;
  /** 클라이언트가 보낸 점수 (분석용) */
  client_score: ColumnType<number | null, number | null | undefined, number | null>;
  status: ColumnType<PlayStatus, PlayStatus | undefined, PlayStatus>;
  /** 거절 사유 (PlayRejectReason). 통과·대기면 NULL */
  reject_reason: ColumnType<string | null, string | null | undefined, string | null>;
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

/** 관리자 작업 종류 */
export type AdminActionKind = 'remove_play' | 'reset_nickname';

/** 006_users_role.sql. 대상 유저·판에 외래 키가 없다(탈퇴해도 기록은 남는다) */
export interface AdminActionsTable {
  id: Generated<number>;
  created_at: ColumnType<Date, Date | undefined, never>;
  admin_user_id: number;
  action: AdminActionKind;
  target_user_id: number | null;
  play_id: number | null;
  /** 처리 전 값. 넣을 때는 JSON 문자열, 읽으면 드라이버가 객체로 풀어 줄 수 있다(MariaDB JSON 열) */
  detail: ColumnType<unknown, string | null, string | null>;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  plays: PlaysTable;
  play_replays: PlayReplaysTable;
  best_daily: BestDailyTable;
  best_alltime: BestAlltimeTable;
  admin_actions: AdminActionsTable;
}
