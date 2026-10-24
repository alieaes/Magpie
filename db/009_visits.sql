-- --- 009: 방문자 ---
-- 관리자 대시보드의 방문자 수. 근거: docs/design/261024-01-admin-dashboard.md §1
-- 방문자 = 방문자 쿠키(브라우저 하나)가 KST 하루에 한 번. 앱이 뜰 때 부르는 GET /api/me에서 INSERT IGNORE로 센다.
-- IP·유저 번호는 남기지 않는다.

CREATE TABLE visits (
  day         DATE        NOT NULL COMMENT 'KST 날짜',
  visitor_id  CHAR(22)    NOT NULL COMMENT '방문자 쿠키 값 (무작위 16바이트 base64url)',
  first_at    DATETIME(3) NOT NULL COMMENT 'UTC. 그날 처음 온 시각',
  PRIMARY KEY (day, visitor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
