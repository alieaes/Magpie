-- --- 005: 판 거절 사유와 클라이언트 점수 ---
-- 점수 제출에서 쓴다. 근거: docs/design/261006-08-play-submission.md §4, §5
-- reject_reason: bad_input(형식·재계산 실패) / time(시간 안 맞음) / mismatch(점수 다름) / abandoned(안 끝내고 버려짐)
-- ix_plays_pending: 하루 지난 미완료 판을 정리할 때 쓴다

ALTER TABLE plays
  ADD COLUMN reject_reason VARCHAR(16) NULL COMMENT '거절 사유. 통과·대기면 NULL' AFTER status,
  ADD COLUMN client_score  INT         NULL COMMENT '클라이언트가 보낸 점수 (분석용)' AFTER score,
  ADD KEY ix_plays_pending (status, started_at);
