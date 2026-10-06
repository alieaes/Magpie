-- --- 001: 유저 ---
-- 로그인 설계가 주인인 표다. 랭킹을 먼저 만들어서 최소 열로 먼저 만들고, 로그인 설계에서 보탠다.
-- 개인정보 최소화: Google 고유 ID(sub)만 저장한다. 이메일·실명·프로필 사진은 저장하지 않는다.

CREATE TABLE users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  google_sub  VARCHAR(255)    NOT NULL COMMENT 'Google 계정 고유 ID',
  nickname    VARCHAR(20)     NULL     COMMENT '랭킹에 보이는 이름. 처음 로그인 후 정하기 전에는 NULL',
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'UTC',
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_google_sub (google_sub),
  UNIQUE KEY uq_users_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
