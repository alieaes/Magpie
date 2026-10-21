-- --- 007: 성장형 게임 저장 ---
-- 하루 단위로 저장하며 키우는 게임(성장형)의 저장. 근거: docs/design/261021-04-game-save.md
-- 저장은 검증된 하루 결과(plays + play_replays)와 가게 행동(save_actions)으로만 바뀐다.
-- 시작 상태에서 둘을 차례로 다시 적용하면 지금 저장을 다시 만들 수 있다.

CREATE TABLE game_saves (
  user_id     BIGINT UNSIGNED NOT NULL,
  game_id     VARCHAR(32)     NOT NULL,
  version     INT UNSIGNED    NOT NULL COMMENT '1부터, 저장이 바뀔 때마다 +1',
  data        JSON            NOT NULL COMMENT '저장 상태. 형식은 게임 로직이 정한다(최대 16KB)',
  created_at  DATETIME(3)     NOT NULL COMMENT 'UTC',
  updated_at  DATETIME(3)     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (user_id, game_id),
  CONSTRAINT fk_game_saves_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE save_actions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  game_id     VARCHAR(32)     NOT NULL,
  version     INT UNSIGNED    NOT NULL COMMENT '적용 전 저장 버전',
  action      JSON            NOT NULL COMMENT '가게 행동 (강화 구매 등)',
  created_at  DATETIME(3)     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (id),
  KEY ix_save_actions_user (user_id, game_id, id),
  CONSTRAINT fk_save_actions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE plays
  ADD COLUMN save_version INT UNSIGNED NULL COMMENT '성장형: 판을 연 때의 저장 버전. 미니게임은 NULL' AFTER seed;
