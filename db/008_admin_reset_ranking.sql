-- --- 008: 관리자 게임 랭킹 초기화 ---
-- "게임" 분류(성장형)의 전체 랭킹을 관리자가 비운 기록. 근거: docs/design/261022-08-game-ranking-reset.md
-- 대상 유저·판이 없어 target_user_id·play_id는 NULL이고, detail에 { gameId, removed }(지운 줄 수)를 둔다.

ALTER TABLE admin_actions
  MODIFY COLUMN action ENUM('remove_play', 'reset_nickname', 'reset_ranking') NOT NULL;
