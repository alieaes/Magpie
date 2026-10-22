# 서버 시작 때 DB 자동 마이그레이션

상태: 구현 완료 (유저 컨펌 후 설계대로 구현)

## 배경

- 지금은 `pnpm db:migrate`를 손으로 돌려야 테이블이 생긴다. 빠뜨리면 서버는 떠도 `Table ... doesn't exist`가 난다.
- 운영은 `run_build.cmd`로 만든 `server.mjs` 하나와 `.env`만 두고 돌린다. 이 폴더에는 `db/*.sql`과 `tsx`가 없을 수 있다.

## 제안

서버가 시작할 때 `.env`의 DB로 접속해 밀린 마이그레이션을 스스로 적용한다. 끝난 뒤에 포트를 연다.

1. **마이그레이션 로직을 공용 모듈로 뺀다** — `server/src/db/migrate.ts`.
   `scripts/migrate.ts`(수동 실행)와 `main.ts`(자동 실행)가 같은 함수를 쓴다. 같은 코드를 두 곳에 복사하지 않는다.
2. **SQL을 `server.mjs`에 넣는다.** 빌드 때(`scripts/build.mjs`) `db/*.sql`을 읽어 번들에 문자열로 포함한다.
   그러면 운영 폴더에 `db/`가 없어도 된다. 개발(`tsx watch`)에서는 `db/` 폴더를 직접 읽는다.
3. **적용 규칙은 지금과 같다.**
   - `000_*.sql`은 매번 실행한다(`CREATE DATABASE IF NOT EXISTS`).
   - 나머지는 한 번만 실행하고 `schema_migrations`에 기록한다.
4. **동시 실행 방지.** 서버 두 개가 동시에 뜨는 경우를 막으려고 `GET_LOCK('magpie-migrate', 30)`을 잡고 적용한 뒤 푼다.
5. **실패하면 서버를 띄우지 않는다.** 스키마가 어긋난 채로 요청을 받는 것보다 서비스 로그에 원인을 남기고 종료하는 편이 낫다.
6. **끌 수 있다.** `.env`의 `AUTO_MIGRATE=0`이면 건너뛴다(DB 권한을 따로 관리하는 경우). 기본은 켜짐.

## 로그

```
[magpie] 마이그레이션 완료: magpie, 새로 적용 0개
```

적용한 파일이 있으면 파일마다 `[migrate] 001_xxx.sql 적용` 줄이 나온다.

## 주의

- 접속 계정에 `CREATE`/`ALTER`/`INDEX` 권한이 있어야 한다. 서비스 계정을 최소 권한으로 쓰려면 `AUTO_MIGRATE=0`으로 두고 수동으로 돌린다.
- 이미 쓰는 `.sql`을 고쳐서는 안 된다(적용된 파일은 다시 실행되지 않는다). 스키마 변경은 새 번호 파일로 추가한다. 지금 규칙 그대로다.
- 되돌리기(롤백)는 하지 않는다.

## 바뀌는 파일

- `server/src/db/migrate.ts` (신규, 공용 로직)
- `server/scripts/migrate.ts` (공용 함수 호출로 줄임)
- `server/scripts/build.mjs` (SQL 포함)
- `server/src/main.ts` (시작 때 호출)
- `server/src/config.ts`, `server/.env.example` (`AUTO_MIGRATE`)
- 테스트: 빈 DB 적용, 재실행 시 0개, 번들 SQL 목록이 `db/`와 일치
- 스펙: 서버 실행·배포 스펙 갱신
