# 스펙 목록

현재 구현된 시스템의 확정 규칙. 코드와 어긋나 보이면 코드가 정답이고 이 문서가 갱신 대상이다 (CLAUDE.md §2).

| 문서 | 내용 |
|---|---|
| [server.md](./server.md) | 저장소 구조, 실행·빌드 명령, 포트, 설정 키, `/health`, DB 스키마 관리 |
| [auth.md](./auth.md) | Google 로그인, 세션, 요청 위조 방지, 닉네임, 탈퇴 |
| [ranking.md](./ranking.md) | 랭킹 규칙(기간, 동점, 총합 환산), 표, 조회 API |
| [plays.md](./plays.md) | 판 기록과 점수 제출: 판 시작·끝 API, 서버 재계산 검사, 최고 기록 갱신, 연습·기록 모드 |
| [saves.md](./saves.md) | 성장형 게임 저장: 저장·가게 행동 API, 하루 검증, 체험, 셸 흐름(GrowthPlayView, GrowthSession) |
| [admin.md](./admin.md) | 관리자: 지정 명령, 기록 삭제, 닉네임 초기화, 작업 기록 |
| [main-page.md](./main-page.md) | 페이지 주소, 상단 바, 메인·랭킹 화면, 디자인 토큰 |
| [apple-ten.md](./apple-ten.md) | 사과게임 규칙·로직, 시드 난수, 게임·플레이 화면, 셸과 게임의 약속 |
| [lucky-scratch.md](./lucky-scratch.md) | 복권 긁기 규칙·당첨표·로직, 긁기·결과 연출·패널·소리 |
| [fish-bun.md](./fish-bun.md) | 붕어빵 가게(성장형): 하루 장사 규칙·손님·판매·강화·입력 기록, 장사·정산·가게 꾸리기 화면 |
| [snack-bar.md](./snack-bar.md) | 분식집(성장형): 격자·걷기·조리·쟁반 내기, 손님·기분·마감, 메뉴 등급·강화·직원 해금, 장사·정산·가게 꾸리기·직원 명부 화면 |
