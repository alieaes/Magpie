-- --- 010: 플레이 이력 (관리자 대시보드) ---
-- 근거: docs/design/261024-02-admin-play-history.md
-- plays.ip: 판을 연 IP(체험 이어받기는 받은 IP). 배포 전 판은 NULL.
-- ix_plays_game_ended: 게임별로 최근에 끝난 판부터 읽는다.
-- practice_plays: 비로그인(연습 모드·체험) 판. 점수는 화면이 보낸 값 그대로다(서버가 다시 계산하지 않는다). 유저와 이어지지 않는다.

ALTER TABLE plays
  ADD COLUMN ip VARCHAR(45) NULL COMMENT '판을 연 IP. 배포 전 판은 NULL' AFTER ended_at,
  ADD KEY ix_plays_game_ended (game_id, ended_at);

CREATE TABLE practice_plays (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_id     VARCHAR(32)     NOT NULL,
  score       INT             NOT NULL COMMENT '화면이 보낸 점수 (검증하지 않음)',
  ip          VARCHAR(45)     NULL,
  created_at  DATETIME(3)     NOT NULL COMMENT 'UTC. 받은 시각',
  PRIMARY KEY (id),
  KEY ix_practice_plays_game (game_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
