-- --- 000: Magpie 스키마 생성 ---
-- {{DB_NAME}}은 마이그레이션 스크립트가 .env의 DB_NAME(개발 magpie-dev, 운영 magpie)으로 바꿔 넣는다.
-- 직접 실행할 때는 이름을 손으로 바꾼다.

CREATE DATABASE IF NOT EXISTS `{{DB_NAME}}`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
