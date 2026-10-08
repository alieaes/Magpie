-- --- 002: 로그인 세션 ---
-- 세션 값은 쿠키에만 있고, DB에는 SHA-256 해시만 둔다 (DB가 새도 세션을 쓸 수 없게).
-- 30일짜리이고 남은 기간이 15일 아래면 요청이 올 때 다시 30일로 늘린다. 근거: docs/design/261006-07-login.md §2

CREATE TABLE sessions (
  id_hash     CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '세션 값의 SHA-256 (16진)',
  user_id     BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'UTC',
  expires_at  DATETIME(3)     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (id_hash),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
