# 설계: 프로젝트 골격

[기술 스택](./261006-03-tech-stack.md)대로 저장소와 서버 뼈대를 만든다.
메인 페이지·랭킹·로그인·사과게임이 모두 이 위에 올라간다. 이 문서는 "아무 기능 없이 돌아가는 빈 틀"까지만 다룬다.

---

## 1. 저장소 구조

pnpm 워크스페이스 하나에 패키지 넷을 둔다. 게임 패키지는 각 게임 설계에서 추가한다.

```
Magpie/
  package.json            워크스페이스 루트. 스크립트만 둔다
  pnpm-workspace.yaml
  tsconfig.base.json      공통 TypeScript 설정 (strict)
  client/                 @magpie/client  — Vue 3 + Vite
  server/                 @magpie/server  — Hono API
  shared/                 @magpie/shared  — 공통 타입, Zod 스키마, 게임 목록
  games/                  @magpie/game-<id> — 게임마다 하나 (사과게임 설계에서 첫 패키지)
  db/                     스키마 .sql 파일
  docs/
```

- pnpm을 쓰는 이유: 패키지가 의존성으로 선언하지 않은 다른 패키지를 import하면 실패한다. 게임끼리 몰래 import하는 것을 구조적으로 막아준다 (CLAUDE.md §4-3).
- 개발 PC에 pnpm 설치가 필요하다: `npm install -g pnpm`

---

## 2. 포트와 주소

| 용도 | 포트 |
|---|---|
| 클라이언트 개발 서버 (Vite) | 5480 |
| API 서버 | 3473 |
| 실시간 서버 (나중) | 3474 |

서버 PC에서 이미 쓰는 포트(3000, 3100, 3373, 5001~5005, 5173, 5273, 5373)와 겹치지 않는다.
클라이언트 개발 포트는 개발 PC에서만 쓴다(운영은 nginx가 정적 파일을 준다). 처음 정한 5473은 개발 PC의 USB 공유 서비스가 쓰고 있어서 5480으로 바꿨다.
운영 주소는 `magpie.aviaryhub.org`로 한다 (rc·crash·falcon과 같은 형식).

---

## 3. 개발 실행

```bash
pnpm install
pnpm dev          # client(5480) + server(3473) 동시 실행
```

- Vite 개발 서버가 `/api`, `/auth`, `/health`를 3473으로 넘긴다. 브라우저 입장에서 같은 주소라 CORS 설정이 필요 없다.
- `pnpm build` — 전체 타입 검사 + 빌드. `pnpm test` — Vitest.

---

## 4. API 서버 기본

- Hono + `@hono/node-server`. 진입점은 `server/src/main.ts`.
- 설정은 `server/.env`에서 읽는다. 저장소에는 `server/.env.example`만 올리고, `.env`는 `.gitignore`에 넣는다.
  비밀값(DB 비밀번호, Google 클라이언트 시크릿)은 저장소와 문서 어디에도 적지 않는다.

  | 키 | 예시 | 비고 |
  |---|---|---|
  | `PORT` | `3473` | |
  | `SITE_URL` | `http://localhost:5480` | 로그인 리디렉션 주소를 만들 때 쓴다 |
  | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | | `DB_NAME`은 개발 `magpie-dev`, 운영 `magpie` |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | 로그인 설계에서 쓴다 |

- 오류 응답은 한 가지 형식으로 통일한다: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`
- 함수마다 한글 주석을 단다 (CLAUDE.md §4-2).

### 4-1. `GET /health`

AviaryHub 공통 규약([health-endpoint.md](../../AviaryHub-Resource/docs/design/health-endpoint.md))을 따른다.

- 정상: `200`, `{"status":"ok","name":"Magpie","version":"<커밋 해시>"}`, `Cache-Control: no-store`
- DB 연결 확인을 넣는다. 1초 안에 응답이 없으면 `503`, `{"status":"error"}`.
  DB가 죽으면 랭킹·로그인이 모두 안 되므로, 이때는 offline으로 보이는 게 맞다.
- 운영에서는 nginx가 `location = /health`로 API 서버에 넘긴다 (SPA 폴백보다 먼저).

---

## 5. DB

- 기존 MariaDB 서버에 스키마를 만든다. 개발 `magpie-dev`, 운영 `magpie`. 문자셋은 `utf8mb4`.
- 스키마 파일은 `db/`에 번호 순으로 둔다. 이 문서에서는 `000_database.sql`(스키마 생성)만 만들고, 표는 각 기능 설계에서 추가한다.
  - `001_users.sql`, `002_sessions.sql` — 로그인 설계
  - `003_plays.sql`, `004_bests.sql` — 랭킹 설계
- 서버는 Kysely + `mysql2` 연결 풀로 접속한다. 표 타입은 `server/src/db/types.ts`에 직접 적는다.
- **시각은 전부 UTC로 저장한다.** 한국 시간 기준이 필요한 곳(일간 랭킹)은 계산할 때 바꾼다.

---

## 6. 게임 목록 (`shared/src/games.ts`)

로비(클라이언트)와 랭킹·점수 제출(서버)이 같은 게임 목록을 본다. 게임을 추가할 때 고치는 곳은 이 파일 하나다.

| 필드 | 예시 (사과게임) | 쓰는 곳 |
|---|---|---|
| `id` | `apple-ten` | URL, DB, 랭킹 |
| `name` | 사과게임 | 로비 카드, 랭킹 |
| `tagline` | 합이 10이 되게 사과를 묶어라 | 로비 카드 |
| `orientation` | `landscape` | 게임 화면 비율 |
| `scoreUnit` | 개 | 랭킹 점수 표시 |
| `sort` | `desc` (높을수록 좋음) | 랭킹 정렬. 1to50 같은 기록 게임은 `asc` |
| `status` | `playable` / `coming-soon` | 로비 카드 상태 |

게임 코드(`logic`, `scene`)는 이 목록에 넣지 않는다. 로비에서 게임을 고를 때 `games/<id>`를 따로 불러온다 (사과게임 설계에서 정한다).

---

## 7. 빌드와 배포 (요약)

AviaryHub 저장소의 배포 패키지 방식(`AviaryHub/docs/design/deploy-package.md`)을 따른다. 상세는 배포할 때 따로 설계한다.

```
release/
  www/          클라이언트 빌드 결과 (nginx 정적 루트)
  server/       서버 번들(JS 파일 하나) + .env
```

- 서버는 esbuild로 JS 파일 하나로 묶고, NSSM으로 `node server.js`를 서비스 등록한다.
- 빌드 파일명에 해시를 붙여 Cloudflare가 오래 캐시하게 한다 (기술 스택 §3-10).

---

## 8. 완료 기준

- [ ] `pnpm dev`로 클라이언트와 서버가 같이 뜬다
- [ ] 브라우저에서 빈 메인 화면이 보인다
- [ ] `GET /health`가 DB 연결 상태에 따라 200 / 503을 돌려준다
- [ ] `pnpm build`, `pnpm test`가 통과한다

## 9. 결정 (2026-10-06 컨펌)

- [x] 포트: 클라이언트 5480, API 3473, 실시간 3474 (개발 PC의 5473·5475는 USB 공유 서비스가 써서 5480으로 바꿨다)
- [x] 운영 주소: `magpie.aviaryhub.org`
- [x] DB 스키마 이름: 개발 `magpie-dev`, 운영 `magpie`
