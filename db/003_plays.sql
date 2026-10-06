-- --- 003: 판 기록 ---
-- 한 판 = plays 한 줄. 입력 기록은 크기가 커서 play_replays에 따로 둔다.
-- 랭킹 조회는 이 표가 아니라 best_daily / best_alltime(004)을 본다.

CREATE TABLE plays (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  game_id     VARCHAR(32)     NOT NULL,
  seed        VARCHAR(64)     NOT NULL COMMENT '서버가 발급한 시드',
  score       INT             NULL     COMMENT '서버가 다시 계산한 점수. 검증 전에는 NULL',
  status      ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  started_at  DATETIME(3)     NOT NULL COMMENT 'UTC',
  ended_at    DATETIME(3)     NULL     COMMENT 'UTC',
  PRIMARY KEY (id),
  KEY ix_plays_user_game (user_id, game_id, started_at),
  CONSTRAINT fk_plays_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE play_replays (
  play_id  BIGINT UNSIGNED NOT NULL,
  data     MEDIUMBLOB      NOT NULL COMMENT '압축한 입력 기록',
  PRIMARY KEY (play_id),
  CONSTRAINT fk_play_replays_play FOREIGN KEY (play_id) REFERENCES plays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
