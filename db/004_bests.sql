-- --- 004: 최고 기록 ---
-- 판이 검증을 통과하면 더 좋은 기록일 때만 갱신한다. 랭킹 조회는 이 두 표만 본다.
-- day는 한국 시간(KST) 날짜다. 일간 랭킹은 KST 00:00에 새로 시작한다.

CREATE TABLE best_daily (
  user_id      BIGINT UNSIGNED NOT NULL,
  game_id      VARCHAR(32)     NOT NULL,
  day          DATE            NOT NULL COMMENT 'KST 날짜',
  score        INT             NOT NULL,
  achieved_at  DATETIME(3)     NOT NULL COMMENT 'UTC. 동점이면 먼저 달성한 사람이 위',
  play_id      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, game_id, day),
  KEY ix_best_daily_rank (game_id, day, score),
  KEY ix_best_daily_day (day),
  CONSTRAINT fk_best_daily_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_best_daily_play FOREIGN KEY (play_id) REFERENCES plays (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE best_alltime (
  user_id      BIGINT UNSIGNED NOT NULL,
  game_id      VARCHAR(32)     NOT NULL,
  score        INT             NOT NULL,
  achieved_at  DATETIME(3)     NOT NULL COMMENT 'UTC. 동점이면 먼저 달성한 사람이 위',
  play_id      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, game_id),
  KEY ix_best_alltime_rank (game_id, score),
  CONSTRAINT fk_best_alltime_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_best_alltime_play FOREIGN KEY (play_id) REFERENCES plays (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
