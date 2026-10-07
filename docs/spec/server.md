# 스펙: 저장소와 서버

설계: [261006-04-project-skeleton.md](../design/261006-04-project-skeleton.md)

## 저장소

pnpm 워크스페이스. TypeScript 6.0.3 고정 (vue-tsc가 TypeScript 7을 아직 못 씀).

| 패키지 | 경로 | 내용 |
|---|---|---|
| `@magpie/client` | `client/` | Vue 3 + Vite. 셸 화면 |
| `@magpie/server` | `server/` | Hono API |
| `@magpie/shared` | `shared/` | 게임 목록, 랭킹 응답 형식, KST 날짜 계산. 빌드 없이 소스를 바로 쓴다 |
| `@magpie/game-<id>` | `games/<id>/` | 게임 패키지 (아직 없음) |

## 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm dev` | 클라이언트(5480) + 서버(3473) |
| `pnpm build` | 전체 타입 검사 + 빌드. 서버는 `server/dist/server.mjs` 한 파일 |
| `pnpm test` | Vitest. 서버의 랭킹 SQL 테스트는 `.env`의 DB가 `-dev`일 때만 돈다 (트랜잭션 후 되돌림) |
| `pnpm db:migrate` | `db/*.sql`을 번호 순으로 적용 |
| `pnpm db:seed-dev` | 개발 DB에 테스트 유저 20명과 기록을 넣는다 (`-dev` 스키마에서만) |

## 포트

| 용도 | 포트 |
|---|---|
| 클라이언트 개발 서버 | 5480 (개발 PC 전용. 5473·5475는 개발 PC의 USB 공유 서비스가 사용) |
| API 서버 | 3473, `127.0.0.1`에만 연다 |
| 실시간 서버 (나중) | 3474 |

개발 중에는 Vite가 `/api`, `/auth`, `/health`를 3473으로 넘긴다.

## 실행 스크립트 (Windows)

| 파일 | 하는 일 |
|---|---|
| `run_dev.cmd` | `pnpm dev`. `server` / `client` 인자로 하나만 띄울 수 있다. pnpm이나 `server/.env`가 없으면 알려주고 멈춘다. `node_modules`가 없으면 설치부터 한다 |
| `run_build.cmd` | `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test`. `notest`로 테스트 생략, `nopause`로 끝에 멈추지 않음. 결과물 경로를 찍는다 |

배포 패키지(`release/`)는 아직 만들지 않는다. 배포 설계에서 정한다.
`.cmd` 파일은 CRLF여야 한다 (`.gitattributes`로 고정).

## VS Code 디버깅 (`.vscode/`)

| 구성 | 내용 |
|---|---|
| Magpie: API 서버 | `node --import tsx server/src/main.ts` (작업 폴더 `server/`). TS 파일에 바로 중단점 |
| Magpie: 브라우저 (Chrome) | 작업 `client: dev`로 Vite를 띄우고 "ready in"이 찍히면 Chrome으로 5480을 연다. Vue·TS 중단점 |
| Magpie: 전체 | 위 둘을 같이. 하나를 멈추면 둘 다 멈춘다 |
| Magpie: 현재 테스트 파일 | 열린 테스트 파일만 Vitest로 실행. 테스트는 `<패키지>/test/`에 있어야 한다 |

- 작업(`tasks.json`): `client: dev`, `build`(기본 빌드 작업), `test`(기본 테스트 작업), `db: migrate`, `db: seed-dev`.
- VS Code는 저장소의 TypeScript 6.0.3을 쓴다(`settings.json`). 추천 확장: Vue - Official, Vitest.

## 설정 (`server/.env`)

`.env`는 저장소에 올리지 않는다. 키 목록은 `server/.env.example`.

| 키 | 기본값 | 비고 |
|---|---|---|
| `PORT` | 3473 | |
| `SITE_URL` | `http://localhost:5480` | `BASE_URL`이 아니다 (Vitest가 `BASE_URL`을 미리 채워서 충돌) |
| `DB_HOST`, `DB_PORT`(3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME` | | `DB_NAME`: 개발 `magpie-dev`, 운영 `magpie` |

빠지거나 잘못된 키가 있으면 서버가 키 이름을 알려주고 시작하지 않는다.

## API 공통

- 오류 응답: `{ "error": { "code": "BAD_REQUEST", "message": "..." } }`. 코드는 `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL`.
- `/api/*` 응답에는 `Cache-Control: no-store`가 붙는다.
- 로그인 전이라 모든 요청은 비로그인으로 처리된다 (`server/src/auth/session.ts`).

## `GET /health`

- DB에 `SELECT 1`을 보내 1초 안에 답하면 `200 {"status":"ok","name":"Magpie","version":"<커밋 해시>"}`. 개발 중 버전은 `dev`.
- 1초 안에 답이 없으면 `503 {"status":"error"}`.
- 항상 `Cache-Control: no-store`.

## DB

- MariaDB 10.6, 문자셋 `utf8mb4`. 서버 연결은 Kysely + mysql2 풀(10개).
- **시각은 전부 UTC.** 연결마다 `SET time_zone = '+00:00'`을 걸어 `CURRENT_TIMESTAMP`도 UTC가 된다.
- 스키마 파일: `db/000_database.sql`(스키마 생성, 매번 실행), 그 외는 한 번만 적용하고 `schema_migrations` 표에 남긴다.
  `{{DB_NAME}}` 자리는 마이그레이션 스크립트가 바꿔 넣는다.

| 파일 | 표 |
|---|---|
| `001_users.sql` | `users` |
| `003_plays.sql` | `plays`, `play_replays` |
| `004_bests.sql` | `best_daily`, `best_alltime` |

`002`는 로그인 설계(세션 표)용으로 비워 두었다. 표의 열은 [ranking.md](./ranking.md) 참고.
