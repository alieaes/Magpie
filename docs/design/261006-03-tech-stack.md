# 설계: 기술 스택

CLAUDE.md에 적힌 스택(Vue 3 + Go + Fiber + MariaDB)은 형제 프로젝트 관례를 그대로 따른 가정이었다.
유저가 관례에 묶이지 않아도 된다고 해서, Magpie에 맞는 스택을 처음부터 다시 정한다.
서버는 지금 할 일만 보지 않고, 나중에 들어올 **멀티게임과 채팅**까지 감안해서 정한다.

---

## 1. 스택을 정하는 요구사항

| 요구사항 | 스택에 미치는 영향 |
|---|---|
| 게임이 많고 계속 늘어난다 | 게임 하나를 다른 게임과 독립적으로 추가하고, 고른 게임 코드만 내려받아야 한다 |
| **랭킹이 핵심이다** | 점수 조작을 막아야 한다. 가장 확실한 방법은 서버가 같은 게임 로직으로 판을 다시 돌려보는 것(시드 + 입력 기록 재생)이다 |
| **멀티게임 (나중)** | 실시간 대전은 서버가 게임 상태를 들고 판정해야 한다(권위 서버). 클라이언트도 반응성을 위해 같은 로직을 미리 돌린다(예측). **서버와 클라이언트가 같은 게임 로직을 돌려야 한다** |
| **채팅 (나중)** | WebSocket 연결을 많이 유지해야 한다. 서버가 여러 대가 되면 서버 사이에 메시지를 전달해야 한다 |
| 물리 게임 (수박, 선 그어 지키기, 핀 뽑기) | 서버에서 다시 돌리려면 기기가 달라도 결과가 같은(결정적) 물리 엔진이 필요하다 |
| 모바일 / PC, 세로 / 가로 | 화면 비율 맞춤을 게임 엔진이 해줘야 한다 |
| 기존 인프라 | **Windows 서버 PC 한 대**. nginx for Windows, NSSM 서비스, 앞단에 Cloudflare. MariaDB 10.6. **Redis 없음**. `/health` 규약(AviaryHub 공통) |

정리하면, 점수 재계산과 멀티게임이라는 두 요구사항이 모두 **"서버가 클라이언트와 똑같은 게임 로직을 돌린다"**로 모인다. 이것이 언어를 가르는 가장 큰 기준이다.

---

## 2. 결정 요약

| 영역 | 선택 | 검토한 대안 |
|---|---|---|
| 언어 | **TypeScript** (클라이언트·서버·게임 로직 전부) | Go 서버 유지, Go + TS 혼합 |
| 게임 엔진 | **Phaser 4** (4.2.x, MIT) | PixiJS, Kaplay, Excalibur |
| 물리 | **Rapier 2D 결정적 빌드** (`@dimforge/rapier2d-deterministic`, Apache-2.0) | Phaser 내장 Matter.js |
| 셸 UI (로비·랭킹·로그인) | **Vue 3 + Vite** | React, Svelte |
| 서버 런타임 | **Node.js LTS** (지금은 24, 26이 LTS가 되는 2026-10-28 이후 26으로) | Bun |
| API 서버 | **Hono** (MIT) | Fastify |
| 실시간 서버 (멀티게임·채팅, 나중) | **Colyseus** (0.18.x, MIT) | Socket.IO, ws 직접 구현 |
| 인증 | **Google OIDC** — `openid-client`(MIT) + 자체 세션(DB + httpOnly 쿠키) | Better Auth, arctic(2026-07 지원 종료) |
| DB | **MariaDB** (기존 서버) | PostgreSQL, SQLite |
| DB 접근 | **Kysely** (타입이 붙는 SQL 빌더, ORM 아님, MIT) + 번호 붙은 `.sql` 스키마 파일 | mysql2 직접, Drizzle |
| 서버 간 공유 상태 | **두지 않는다.** 작업 큐는 MariaDB, 캐시는 프로세스 메모리로 대신한다 (§3-3) | Redis (서버 PC에 없고 Windows 공식 지원이 없다) |
| 입력 검증 | **Zod** — 클라이언트·서버가 같은 스키마를 쓴다 | — |
| 테스트 | **Vitest** | — |
| 저장소 | **pnpm 워크스페이스** 하나에 클라이언트·서버·게임을 같이 둔다 | 저장소 분리 |
| 배포 | nginx(정적 파일, `/api`·`/ws`·`/health` 프록시) + Node 프로세스(NSSM 서비스). Docker 없음. 기존 프로젝트와 같은 방식 | — |

---

## 3. 주요 결정 설명

### 3-1. 왜 TypeScript 하나로 가는가

서버가 할 일이 적어서 고른 것이 아니다. **서버가 클라이언트와 똑같은 게임 로직을 돌려야 하기 때문**이다.

- **점수 재계산**: 서버가 입력 기록을 재생해서 점수를 다시 낸다.
- **멀티게임**: 서버가 게임 상태를 들고 판정하고, 클라이언트는 같은 로직으로 미리 예측한다.

언어별로 보면:

- **TypeScript 서버**: 게임 로직 파일을 클라이언트와 서버가 그대로 같이 import한다. 로직은 한 벌이다.
- **Go 서버**: 둘 중 하나를 해야 한다.
  - 게임마다 로직을 Go로 한 번 더 짠다. 두 벌이 조금이라도 어긋나면 정상 점수가 거부되고, 멀티게임에서는 예측과 판정이 어긋나 화면이 튄다.
    게임이 늘어날수록 이 비용도 같이 커진다.
  - Go 안에서 JS 엔진(goja)으로 TS 로직을 돌린다. 느리고, Rapier(WASM)는 또 다른 런타임을 붙여야 돌릴 수 있다.

**Go가 나은 점도 분명히 있다.** 같은 하드웨어에서 Go가 더 빠르고 메모리를 적게 쓴다.
동시 연결이 수십만~수백만 단위인 실시간 서비스는 Go로 옮기는 사례가 있다(Scaledrone 사례).
Magpie가 그 규모가 되기 전까지는 Node로 충분하다고 본다. 부족해지면 §3-3처럼 프로세스를 늘려서 대응한다.
그래도 부족하면 채팅처럼 게임 로직과 무관한 부분만 떼어서 Go로 옮길 수 있다. 서버끼리는 프로토콜로만 연결되기 때문이다.

### 3-2. 게임 = 로직 + 화면, 둘로 나눈다

| 부분 | 내용 | 누가 쓰나 |
|---|---|---|
| `logic` | 순수 TypeScript. 시드와 입력을 받아 상태와 점수를 만든다. Phaser를 모른다 | 클라이언트, API 서버(재계산), 실시간 서버(멀티 판정) |
| `scene` | Phaser 씬. 로직 상태를 그리기만 하고, 입력은 로직에 넘긴다 | 클라이언트 |

**결정성 규칙** — 서버가 다시 돌리는 로직은 같은 입력이면 어느 기기에서든 같은 결과가 나와야 한다.
- `Math.random` 금지. 시드 난수 생성기만 쓴다.
- 시간은 실제 시각이 아니라 **고정 간격 틱 번호**로 센다(예: 1/60초). 입력 기록도 "몇 번째 틱에 무슨 입력"으로 남긴다.
- `Math.sin`, `Math.cos` 같은 초월함수는 쓰지 않는다. JS 스펙상 엔진마다 결과가 미세하게 다를 수 있다(Rapier 공식 문서도 같은 경고를 한다).
  필요하면 직접 구현한 함수나 미리 계산한 표를 쓴다.
- 결정성은 테스트로 지킨다: 같은 시드와 입력 기록을 넣으면 항상 같은 점수가 나오는지 Vitest로 확인한다.

### 3-3. 서버는 역할별로 나누고, 단계적으로 늘린다

서버를 처음부터 역할별로 나눠 둔다. 그러면 부하가 생긴 부분만 따로 늘릴 수 있다.

| 역할 | 하는 일 | 상태 | 늘리는 방법 (Redis 없이) |
|---|---|---|---|
| **API 서버** (Hono) | 로그인, 랭킹 조회, 점수 제출 | 없음 (세션은 DB에 있다) | 프로세스를 여러 개 띄우고 nginx로 나눈다. 랭킹 캐시는 프로세스마다 메모리에 짧게 둔다 |
| **실시간 서버** (Colyseus) | 멀티게임 방, 채팅 | 있음 (방마다 메모리에 상태가 있다) | 같은 서버를 복제하지 않고 **역할별로 나눈다**: 채팅 프로세스, 게임 종류별 방 프로세스. nginx가 경로(`/ws/chat`, `/ws/<게임>`)로 나눠 보낸다. 프로세스끼리 공유할 상태가 없어서 Redis가 필요 없다 |
| **재계산 작업** | 제출된 판을 다시 돌려 점수 확인 | 없음 | 처음에는 API 서버 안의 작업 스레드. 늘어나면 **MariaDB 테이블을 작업 큐**로 쓰고 별도 작업 프로세스로 뺀다. MariaDB 10.6의 `SELECT ... FOR UPDATE SKIP LOCKED`로 작업자 여러 개가 같은 작업을 겹쳐 가져가지 않는다 |

단계별 모습:

| 단계 | 언제 | 구성 |
|---|---|---|
| 1 | 지금 (싱글 게임 + 랭킹) | API 서버 1개 (재계산은 내부 작업 스레드), MariaDB |
| 2 | 채팅이나 첫 멀티게임을 넣을 때 | + 실시간 서버 1개. 로그인은 API 서버가 만든 세션을 같이 확인한다 |
| 3 | 부하가 커질 때 | API 서버 여러 개, 실시간 서버를 역할별로 여러 개, 재계산 작업 프로세스 분리 (DB 큐). **Redis 없음** |
| 4 | 한 역할이 프로세스 하나로 감당이 안 될 때 | 같은 역할의 실시간 서버를 여러 개 띄우려면 그때 공유 저장소가 필요하다 (§3-10) |

4단계는 이 서버 PC 한 대로는 오기 어렵다. 그 전에 §3-10의 서버 PC 한계에 먼저 걸린다.

### 3-4. 실시간 서버는 Colyseus

멀티게임에 필요한 것(방 만들기, 매치메이킹, 상태 동기화, 재접속, 여러 서버로 늘리기)을 다 갖춘 Node용 오픈소스 프레임워크다.
- 방 하나가 게임 한 판이다. 방 안에서 `games/<id>/logic`을 그대로 돌려 서버가 판정한다.
- 채팅도 방으로 만든다(로비 채팅방, 게임방 채팅).
- 프로세스 하나 안에서는 Redis 없이 돈다(기본 설정). 같은 역할의 서버를 여러 대로 복제할 때만 Redis가 필요하다(공식 방식). 3단계까지는 역할별로 나눠서 복제하지 않는다.
- 2026년 9월에도 꾸준히 업데이트되고 있다(0.18.x).
- Socket.IO는 채팅에는 충분하지만, 멀티게임 방·상태 동기화를 직접 만들어야 한다.

**지금은 설치하지 않는다.** 채팅이나 멀티게임 설계를 할 때 들인다. 이 문서는 그때 갈아엎지 않아도 되는 구조인지만 확인한다.

### 3-5. 물리: Rapier 2D를 쓴다

| | Matter.js (Phaser 내장) | Rapier 2D 결정적 빌드 |
|---|---|---|
| 도입 | 바로 쓴다 | 직접 연결해야 한다 (매 틱마다 물리 몸체 위치·회전을 스프라이트에 복사) |
| 결정성 | 보장 없음 | 같은 버전·같은 초기 조건이면 브라우저·OS·CPU가 달라도 같은 결과 (공식 문서) |
| 서버 재계산·멀티 판정 | 불가 | Node에서도 같은 패키지가 돌아서 가능 |
| 용량 | Phaser에 포함 | WASM 파일 추가. 물리 게임에 들어갈 때만 내려받는다 |
| 라이선스 | MIT | Apache-2.0 |

수박게임은 랭킹 경쟁이 가장 치열할 게임이다. 물리 엔진은 나중에 바꾸면 게임 손맛이 달라져서 다시 맞추는 비용이 크다.
그래서 처음부터 Rapier로 간다. 물리가 없는 게임(사과, 1to50, 블록 놓기 등)과 칼날 모으기(직접 거리 계산)는 Rapier를 쓰지 않는다.

### 3-6. 셸은 Vue 3, 게임은 Phaser 4

- **셸**은 작다: 로비 목록, 랭킹 표, 로그인, 게임을 띄우는 틀. 나중에 채팅 창도 셸에 붙는다. 익숙한 Vue 3를 그대로 쓴다.
- **게임 화면**은 전부 Phaser 4로 그린다. 격자 퍼즐(사과, 1to50)도 Phaser로 해서 모든 게임이 같은 방식으로 붙게 한다.
- 로비에서 게임을 고르면 **그 게임 코드만** 내려받는다(동적 import). Phaser 본체는 처음 게임에 들어갈 때 한 번 받는다.
- Phaser를 고른 이유: 2D 게임에 필요한 것(씬, 입력, 트윈, 사운드, 카메라, 화면 비율 맞춤)이 다 들어 있다.
  PixiJS는 그리기만 해서 나머지를 직접 만들어야 하고, Kaplay·Excalibur는 생태계가 작다. Bloom-World에서 이미 써봤다.

### 3-7. API 서버는 Node.js LTS + Hono

- **Node.js LTS**: 지금은 24가 Active LTS이고, 26이 2026-10-28에 LTS가 된다. 26이 LTS가 되면 그쪽으로 올린다.
  Bun은 빠르지만 Node 호환성 문제가 생길 수 있어서 안정성을 우선한다.
- **Hono**: TypeScript 우선이고 가볍다. Zod 검증 미들웨어가 들어 있다.
  서버 라우트 타입을 클라이언트가 그대로 가져다 쓰는 RPC 클라이언트가 있어서, 모노레포에서 API 타입을 따로 맞출 필요가 없다.
  Fastify도 충분하지만 이 규모에서는 Hono가 더 단순하다.
- API 서버는 상태를 갖지 않는다(세션은 DB). 그래서 프로세스를 늘리기만 하면 된다.

### 3-8. 인증은 Google OIDC + 자체 세션

- `openid-client`로 Google 로그인(인가 코드 + PKCE, ID 토큰 검증)을 처리한다.
- 로그인되면 DB 세션 테이블에 세션을 만들고, 세션 ID를 httpOnly 쿠키로 준다. 실시간 서버도 같은 세션으로 사용자를 확인한다.
- 처음 고려했던 arctic은 2026년 7월 지원 종료됐다. Better Auth는 기능이 많지만 Google 로그인 하나에는 과하다.
- **개인정보 최소화**: 유저 식별은 Google `sub`(고유 ID)로만 한다. 랭킹과 채팅에는 유저가 정한 닉네임만 보인다.
  이메일과 실명은 저장하지 않는다. 필요해지면 그때 설계를 추가한다.

### 3-9. DB는 기존 MariaDB 서버

- 따로 서버를 띄우지 않고, Crash·Project-RC가 쓰는 MariaDB 서버에 Magpie용 스키마를 만든다.
- 랭킹에 필요한 순위 함수(`RANK`, `PERCENT_RANK` 등 윈도우 함수)를 MariaDB가 지원한다.
- **Kysely**로 쿼리를 쓴다. SQL을 그대로 쓰는 느낌이고 결과에 타입이 붙는다. ORM이 아니라서 기존 관례(ORM 없음)와 맞다.
- 스키마는 Crash처럼 번호 붙은 `.sql` 파일(`001_users.sql` ...)을 순서대로 실행한다.
- 랭킹 조회가 무거워지면 API 프로세스 메모리에 몇 초~몇십 초 캐시한다. 랭킹은 몇 초 늦게 바뀌어도 문제가 없다.
- SQLite도 검토했다. 단순하지만 서버가 여러 대가 되면 쓰기 어렵고, 기존 DB 서버와 백업 체계를 그대로 쓰는 쪽이 운영이 편하다.

### 3-10. 배포 환경 제약 (Windows 서버 PC)

Node, Rapier(WASM), Colyseus는 모두 Windows에서 그대로 돈다. 서비스 등록은 기존 프로젝트처럼 NSSM으로 한다.
확장성의 실제 한계는 언어나 Redis가 아니라 **서버 PC 쪽**에 있다.

**nginx for Windows**
- 공식적으로 베타다. worker를 여러 개 띄워도 실제로 일하는 건 하나뿐이고, `select()`/`poll()`만 써서 "높은 성능과 확장성을 기대하면 안 된다"고 공식 문서에 적혀 있다.
- 지금 서버 설정은 `worker_processes 1`, `worker_connections 1024`이고, 이 1024를 서버의 **모든 사이트가 나눠 쓴다**.
  nginx가 프록시하는 연결은 유저 쪽 1개 + 백엔드 쪽 1개로 2칸을 차지한다. 그래서 WebSocket은 서버 전체를 통틀어 동시에 500개 남짓이 상한이다.
- 1단계(HTTP API)에서는 문제가 안 된다. 2단계(채팅·멀티)에서 걸릴 수 있다. 그때 실시간 서버 설계에서 다음 중 하나를 정한다:
  - (a) nginx 연결 수 설정을 올리고 실측한다.
  - (b) 실시간 서버만 nginx를 거치지 않고 Cloudflare에 바로 붙인다. Cloudflare는 모든 요금제에서 WebSocket을 프록시하고, 8443 같은 HTTPS 포트를 지원한다.
  - (c) 서버 전체의 앞단 프록시를 바꾼다. Magpie만의 문제가 아니라 서버 PC 전체의 결정이다.

**업로드 회선**
- 서버 PC는 가정용 업로드 회선을 쓴다(Project-RC nginx 설정 메모). 게임 파일(Phaser, 게임별 코드, 그림, 소리)은 Cloudflare에 캐시되게 한다.
  빌드 파일명에 해시를 붙이고 캐시 기간을 길게 잡아서, 서버 PC에서는 처음 한 번만 나가게 한다.

**4단계가 오면 (공유 저장소가 필요해지면)**
- Windows에서 Redis를 쓰는 방법: Memurai(Redis와 제휴한 Windows용 Redis 호환 제품), Garnet(Microsoft의 오픈소스 Redis 호환 서버, Windows에서 그대로 돈다. 다만 Lua 스크립트를 지원하지 않아서 Colyseus가 쓰는 명령을 다 받는지 확인해야 한다), WSL2 안의 Redis.
- 그 규모면 서버 PC 한 대의 회선과 nginx가 먼저 한계다. 저장소를 붙이기보다 서버 이전을 먼저 검토하는 게 맞다.

---

## 4. 저장소 구조 (안)

```
Magpie/
  client/            Vue 셸 + 게임 로더 (Vite)
  server/            Hono API: 로그인, 랭킹, 점수 제출·재계산
  realtime/          Colyseus: 멀티게임 방, 채팅 (2단계에서 만든다)
  games/
    apple-ten/
      logic/         순수 TS. 서버도 import한다
      scene/         Phaser 씬
    fruit-merge/
    ...
  shared/            공통 타입, Zod 스키마, 시드 난수, 게임 인터페이스, 세션 확인
  db/                번호 붙은 스키마 .sql 파일
  docs/
```

게임끼리 서로 import하지 않는다. 여러 게임이 쓰는 코드는 `shared/`로 뺀다 (CLAUDE.md §4-3).
`server/`와 `realtime/`이 같이 쓰는 코드(세션 확인, DB 접근)도 `shared/`에 둔다.
게임 인터페이스와 등록 방식은 다음 설계(프로젝트 골격)에서 정한다.

---

## 5. 컨펌되면 같이 고칠 문서

- `CLAUDE.md` §1 스택 표 → 이 문서 기준으로 바꾼다. §4-3에 결정성 규칙(§3-2)을 짧게 추가한다.
- `261006-01-game-catalog.md` §3-2, §4 → "Phaser 내장 Matter.js"를 "Rapier 2D"로 바꾼다.
- `AviaryHub-Resource/Projects/Magpie/concept.md` → 스택 줄을 바꾼다 (서브모듈 커밋 후 포인터 커밋).

## 6. 결정 (2026-10-06 컨펌)

- [x] 언어: TypeScript 하나로 간다 (Go 서버를 쓰지 않는다)
- [x] 서버 구조: API / 실시간 / 재계산 작업으로 나누고 §3-3 단계대로 늘린다. Redis 없이 간다
- [x] 물리: Rapier 2D 결정적 빌드
- [x] DB: 기존 MariaDB 서버에 Magpie 스키마를 만든다

---

## 참고 자료

- Phaser 물리 문서: https://docs.phaser.io/phaser/concepts/physics
- Rapier 결정성 (JavaScript): https://rapier.rs/docs/user_guides/javascript/determinism
- Rapier 2D npm: https://www.npmjs.com/package/@dimforge/rapier2d
- Colyseus 확장 (여러 프로세스, Redis): https://docs.colyseus.io/scalability
- nginx for Windows 제약: https://nginx.org/en/docs/windows.html
- MariaDB 10.6 변경 사항 (SKIP LOCKED): https://mariadb.com/kb/en/changes-and-improvements-in-mariadb-10-6/
- Cloudflare WebSocket: https://developers.cloudflare.com/network/websockets
- Cloudflare 지원 포트: https://developers.cloudflare.com/fundamentals/reference/network-ports/
- Memurai (Windows용 Redis 호환): https://redis.io/partners/memurai/
- Garnet 호환성: https://github.com/microsoft/garnet/blob/main/website/docs/welcome/compatibility.md
- Node.js → Go 이전 사례 (Scaledrone): https://scaledrone.com/blog/nodejs-to-go
- Node.js 릴리스 일정 (endoflife.date): https://endoflife.date/nodejs
- Hono vs Fastify (Better Stack): https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/
- Arctic: https://arcticjs.dev/
- Lucia (세션 직접 구현 권장): https://github.com/lucia-auth/lucia
- Kysely: https://kysely.dev
