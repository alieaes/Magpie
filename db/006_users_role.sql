-- --- 006: 관리자 ---
-- 관리자 지정은 화면이 아니라 명령(pnpm admin:grant)으로만 한다. 근거: docs/design/261008-02-admin.md
-- admin_actions는 관리자가 한 일의 기록이다. 대상 유저가 탈퇴해도 기록은 남아야 해서 외래 키를 걸지 않는다(번호만 남는다).

ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user' COMMENT '관리자 여부' AFTER nickname;

CREATE TABLE admin_actions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'UTC',
  admin_user_id   BIGINT UNSIGNED NOT NULL COMMENT '처리한 관리자',
  action          ENUM('remove_play', 'reset_nickname') NOT NULL,
  target_user_id  BIGINT UNSIGNED NULL     COMMENT '대상 유저',
  play_id         BIGINT UNSIGNED NULL     COMMENT '기록 삭제의 대상 판',
  detail          JSON            NULL     COMMENT '처리 전 값 (지운 점수, 이전 닉네임 등)',
  PRIMARY KEY (id),
  KEY ix_admin_actions_created (created_at),
  KEY ix_admin_actions_target (target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
