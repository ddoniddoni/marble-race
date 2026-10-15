# 데이터, API, 보안 설계

설계 기준일: 2026-10-14. 아래는 구현할 스키마와 권한 계약이다. 완성된 SQL migration은 포함하지 않으며 P5에서 작성하고 실제 DB 테스트로 검증한다.

## 1. 데이터 모델

| 테이블 | 핵심 필드 | 목적과 제약 |
|---|---|---|
| `profiles` | id, display_name, created_at | Auth 사용자 ID 연결. 이메일과 관리자 역할은 공개 프로필에 두지 않음 |
| `maps` | id, owner_id, title, description, tags, visibility, published_version_id, source_version_id, allow_remix, moderation_status, deleted_at | 서비스 메타데이터와 최신 게시 포인터 |
| `map_drafts` | map_id, document jsonb, revision, updated_at | 소유자 전용 가변 초안. map_id PK |
| `map_versions` | id, map_id, version_no, document jsonb, content_hash, schema_version, simulation_version, thumbnail_asset_id, created_at | 불변 게시 콘텐츠. unique(map_id, version_no) |
| `assets` | id, owner_id, kind, storage_path, mime, byte_size, width, height, content_hash, status, created_at | 검증 후 생성한 스킨/썸네일 에셋만 등록 |
| `skins` | id, owner_id, name, appearance jsonb, asset_id, created_at | 외형 프리셋. 물리 속성 금지 |
| `race_presets` | id, owner_id, map_version_id, config_snapshot jsonb, consent_flags, created_at, deleted_at | 공유 시 확정된 레이스 설정. 변경은 새 preset |
| `race_runs` | id, owner_id, map_version_id, manifest jsonb, result_summary jsonb, verification_status, created_at, deleted_at | 결과 요약. 초기 status는 client_reported만 |
| `share_links` | id, owner_id, kind, map_version_id?, preset_id?, run_id?, token_hash, expires_at, revoked_at, created_at | 원본 토큰을 저장하지 않는 공유 접근 기록 |
| `reports` | id, reporter_id, target_kind, target_id, reason, status, created_at | 신고와 처리. 타 사용자 신고 내용은 공개하지 않음 |

첫 출시에 좋아요, 댓글, 팔로우, 결제 테이블을 선행 생성하지 않는다. 운영상 필요한 보안 감사 기록과 삭제 재시도 기록은 비공개 스키마에 한정해 P7에서 추가한다.

share_links의 대상 컬럼 3개에는 `num_nonnulls(...) = 1`에 해당하는 CHECK를 적용하고 kind와 실제 대상 컬럼의 조합도 검사한다. 대상을 문자열 하나로만 저장하는 느슨한 다형성 FK는 사용하지 않는다.

maps의 published_version_id는 반드시 해당 map의 버전을 가리켜야 한다. `map_versions(map_id, id)`에 unique를 두고 `(maps.id, maps.published_version_id)`의 복합 FK 등으로 이를 강제한다. source_version_id는 리믹스 출처이며 소유권을 전달하지 않는다.

본문 크기, 배열 길이, 버전 번호와 revision의 양수 여부, visibility enum, content_hash 형식은 DB 제약으로도 확인한다. DB에는 사용자 제공 raw owner_id를 신뢰해 넣지 않는다.

추천 인덱스는 `maps(owner_id, updated_at DESC)`, 공개/활성 맵의 `(created_at DESC, id)`, `map_versions(map_id, version_no)`, `assets(owner_id)`, `share_links(token_hash)` unique, `reports(status, created_at)`이다. updated_at은 maps에도 생성한다. 검색은 제목 기반 단순 검색부터 시작하고 실제 조회량을 보고 FTS나 trigram을 선택한다.

## 2. 초안 저장과 게시 트랜잭션

초안은 서버가 검증한 document를 expectedRevision 조건으로 갱신하고 revision을 1 증가시킨다. 조건에 맞는 행이 없으면 소유권 실패와 저장 충돌을 구분하되 타인 데이터 존재를 노출하지 않는다.

게시 요청은 다음을 포함한다.

```json
{
  "mapId": "uuid",
  "expectedDraftRevision": 12,
  "idempotencyKey": "uuid"
}
```

서버는 인증된 사용자, 소유권, 검증된 draft revision을 확인한다. Zod 검증과 geometry 검증을 거친 동일 문서의 canonical hash를 계산한다. 썸네일 준비가 필요한 경우 검증된 asset만 사용한다.

하나의 DB 트랜잭션 안에서 다음 순서로 처리한다.

1. map과 draft를 잠그고 owner와 revision을 다시 확인한다.
2. 동일 idempotencyKey의 성공 기록이 있으면 기존 결과를 반환한다.
3. 다음 version_no를 계산하고 불변 map_versions 행을 만든다.
4. maps.published_version_id를 새 버전으로 바꾼다.
5. idempotency 결과를 남기고 commit한다.

서버의 선행 검증과 DB transaction 사이에 draft가 바뀌면 새 문서를 임의로 게시하지 말고 충돌을 반환한다. 트랜잭션에 전달한 문서/hash와 잠근 revision이 일치해야 한다. JSON hash를 클라이언트가 보낸 값 그대로 믿지 않는다.

동시 게시 2건은 중복 버전을 만들지 않도록 idempotency, row lock, unique constraint로 검증한다. 네트워크 재시도로 같은 버튼이 두 번 처리되더라도 같은 게시 결과를 돌려준다.

map_versions.document와 hash는 일반 사용자 UPDATE/DELETE를 허용하지 않는다. 접근 상태와 관리자 차단은 부모 maps에서 관리한다. 계정 삭제에 따른 별도 보존/삭제 절차는 일반 편집 API와 분리한다.

## 3. 권한 경계

공개 스키마의 테이블에는 RLS를 활성화하고 역할별 GRANT도 최소로 제한한다. RLS만 만들고 기본 테이블 권한을 방치하지 않는다. Supabase 문서는 노출된 스키마의 RLS와 grants를 함께 점검하도록 설명한다. [D1]

초기 보안 구조는 다음으로 고정한다.

- 브라우저는 Supabase Auth와 허용된 읽기에만 접근한다. 공유 발급, 게시, 이미지 등록을 직접 DML로 수행하지 않는다.
- 민감한 쓰기는 Next.js Route Handler를 거친다. 서버는 검증된 JWT 사용자로부터 actor ID를 얻는다.
- 읽기는 가능한 한 사용자 JWT가 적용된 Supabase 클라이언트를 사용해 RLS를 유지한다.
- 쓰기는 목적별 server-only DB RPC를 사용하고 외부 `anon`, `authenticated`, `PUBLIC`의 실행 권한을 제거한다. 서버의 관리자 자격만 실행할 수 있다.
- 서버 전용 RPC는 검증된 actor ID, 대상 ID를 받아 DB 내부에서 소유권과 상태를 다시 검사한다. 요청 body의 owner_id를 actor로 사용할 수 없다.
- 브라우저의 직접 INSERT/UPDATE/DELETE 권한은 해당 테이블에서 철회한다. 검증되지 않은 JSON이 Route Handler를 우회해 게시될 경로를 남기지 않는다.

서버 관리자 자격은 RLS를 우회할 수 있으므로 RLS가 해당 경로를 대신 보호한다고 생각하면 안 된다. RPC 실행을 제한하더라도 actor와 target의 소유권 검증은 필수다. 관리자 클라이언트는 `server-only` 모듈에 격리하고 범용 `queryAnyTable` 형태의 API를 만들지 않는다.

`security definer`를 사용하는 함수는 필요한 경우에만 선택하고 `search_path = ''`, 명시적인 스키마 이름, 제한된 EXECUTE 권한, 함수 내부 소유권 검사를 적용한다. `search_path`만 설정하면 안전해지는 것은 아니다. [D2]

### 읽기 정책 요약

| 대상 | 비회원 | 로그인한 비소유자 | 소유자 |
|---|---|---|---|
| 공개 활성 map 메타데이터 | 읽기 | 읽기 | 읽기 |
| 공개 활성 map의 게시 버전 | 읽기 | 읽기 | 읽기 |
| map_drafts | 거부 | 거부 | 읽기 |
| private/unlisted map의 직접 조회 | 거부 | 거부 | 읽기 |
| skins와 원본 asset 정보 | 거부 | 거부 | 읽기 |
| race_presets, race_runs 직접 조회 | 거부 | 거부 | 읽기 |
| 공유 원본 토큰과 해시 | 거부 | 거부 | 원본/해시 반환 안 함, 링크 관리 DTO만 |
| 다른 사람의 신고 내용 | 거부 | 거부 | 본인 신고만 제한된 조회 |

unlisted 버전을 읽는 RLS 조건에 단순히 `visibility != 'private'`를 넣으면 안 된다. unlisted는 직접 조회가 금지되고 유효한 토큰으로 서버 resolver를 통과해야 한다. public map 조회도 최신 초안이 아니라 게시 버전만 반환한다.

public profiles는 display_name 등 공개 필드만 제공한다. 관리자 권한, 이메일, 로그인 제공자, 비공개 자산 경로를 포함한 view를 공개하지 않는다.

서버는 `getSession()`에 있는 user 값을 인증 근거로 믿지 않는다. 현재 Supabase 공식 SSR 안내에 맞춰 `getClaims()`로 JWT를 검증하고, 삭제처럼 민감한 작업에는 `getUser()` 등 서버 확인과 필요한 재인증을 추가한다. 설치된 SSR 패키지의 실제 API를 확인한다. [D3]

## 4. 공유 토큰 설계

토큰은 서버 CSPRNG로 32바이트를 생성하고 base64url로 표현한다. DB에는 SHA-256 hash만 저장한다. token_hash에 unique index를 두고 만료 시각과 철회 시각을 검사한다. 토큰을 임의로 짧은 6자리 코드로 줄이지 않는다.

새 링크를 만들 때 원본 토큰은 응답에서 한 번 제공한다. 관리 화면에는 링크 종류, 대상 버전, 생성일, 만료, 철회 여부만 표시한다. 원본 링크를 잃어버린 경우 재발급한다. 토큰 복구용 평문 저장은 하지 않는다.

resolver는 다음을 모두 확인한다.

```text
token hash 일치
AND revoked_at 없음
AND expires_at이 없거나 미래
AND 대상이 삭제/차단되지 않음
AND 관련 맵이 게시된 버전임
AND 부모 맵 공개 정책이 이 공유를 허용함
AND 이름/사진 포함 동의가 snapshot에 기록됨
```

map 공유는 map document, 공개용 메타데이터와 허용된 썸네일만 반환한다. preset 공유는 해당 preset snapshot만 반환한다. result 공유는 결과 DTO만 반환한다. raw row 전체, draft, owner의 이메일, token_hash는 반환하지 않는다.

다른 사람의 public 맵을 preset에 사용할 수 있다. 다른 사람의 unlisted/private 맵 접근 권한을 자신의 새 링크로 재발급하는 것은 허용하지 않는다. 필요한 경우 리믹스가 허용된 버전을 본인 소유로 복제한 후 공유한다.

공개 맵을 private으로 바꾸면 현재 게시 포인터 여부와 무관하게 모든 외부 읽기를 차단하고 관련 링크를 같은 transaction에서 철회한다. 공유 resolver도 부모 map.visibility와 상태를 다시 검사하므로 철회 처리 누락만으로 접근이 허용되지 않아야 한다.

링크 응답과 개인 페이지는 `Cache-Control: private, no-store`, 관련 서버 fetch는 no-store로 처리한다. unlisted에는 noindex와 일반적인 OG 미리보기만 사용해 참가자 정보를 미리보기 봇에 노출하지 않는다. `/s/[token]`의 raw token은 접근 로그, 에러 추적, 분석 도구에서 마스킹한다. `Referrer-Policy: no-referrer`를 적용하고 이 경로에는 외부 분석 스크립트를 넣지 않는다.

다운로드된 파일이나 이미 전달된 결과를 회수할 수는 없다. 링크 전용 공유는 접근 통제이지 다운로드 방지 기능이 아니다.

## 5. 이미지 업로드와 저장

기본 구슬 이미지는 정적 자산으로 제공한다. 사용자 사진과 맵 썸네일은 모두 private bucket에 저장한다. private 객체는 권한이 있는 다운로드 또는 signed URL로 제공할 수 있고, public bucket은 다운로드 권한 모델이 다르므로 사용자 사진을 무조건 public에 올리지 않는다. [D4]

### 업로드 계약

| 항목 | 값 |
|---|---|
| 로그인 | 클라우드 업로드는 필수 |
| 원본 입력 | JPEG, PNG, 정적 WebP 하나 |
| 파일 제한 | 최대 2 MiB |
| 전체 요청 | 최대 3 MiB, 파일은 1개 |
| 디코딩 크기 | 최대 4096x4096 범위, 총 16,777,216 pixels 이하 |
| 출력 | 스킨 256x256 WebP, 썸네일 최대 960x540 WebP |
| 금지 | SVG, GIF, 애니메이션 WebP/APNG, 외부 URL import, 원본 파일 공개 |
| 에셋 저장 경로 | 서버 생성 UUID와 용도 기반, 사용자 입력 파일명 사용 안 함 |
| 기본 quota | 사용자당 이미지 100개, 처리 후 합계 20 MiB를 제안값으로 제한 |

Node.js Route Handler는 인증과 호출량 제한을 먼저 확인한다. body의 실제 바이트 수를 제한해서 읽고 Content-Length만 믿지 않는다. magic bytes와 디코더 형식이 허용 목록에 맞는지 확인한 다음 Sharp로 디코딩한다. 픽셀 수 제한, 애니메이션 여부, 크롭 영역, EXIF 방향을 검증하고 고정 크기로 재인코딩한다. 원본 metadata는 보존하지 않으며 테스트에서 실제 출력 metadata를 검사한다. 입력 픽셀 제한과 손상 데이터 처리 옵션은 설치된 Sharp API에 맞춘다. [D5]

Vercel Function의 공식 요청/응답 body 제한은 4.5 MB이므로 초기 업로드는 이보다 충분히 작게 유지한다. 큰 원본과 비디오 업로드를 추가하면 signed upload와 격리 저장소의 비동기 검증 경로를 별도로 설계해야 한다. [D6]

현재 스코프는 작은 파일을 서버에서 검사한 후 storage에 저장한다. 검사 전 원본을 곧바로 공개 bucket으로 업로드하거나 파일 확장자만 보고 승인하지 않는다.

### 이미지 접근

assetId 자체는 접근 권한이 아니다. 서버는 요청자 소유 에셋인지 또는 현재 유효한 공유 대상에 명시적으로 포함된 에셋인지 검사한다. 통과한 개별 경로에만 초기 60초 TTL의 signed URL을 발급한다. bucket 전체 목록이나 임의 경로 서명 API는 제공하지 않는다.

signed URL은 DB나 MapDocument에 영구 저장하지 않는다. URL 만료 시 렌더러가 에셋 manifest를 갱신하고 실패하면 기본 구슬로 대체한다. 공유 철회 후 이미 발급한 signed URL은 TTL 동안 유효할 수 있다. 즉시 모든 이미지 URL을 무효화한다고 약속하지 않는다. 차단/삭제한 에셋은 신규 URL 발급을 중단한다.

레이스 설정에 실명과 사진을 넣는 선택은 기본 OFF다. 맵 썸네일에는 참가자 이름과 사진을 넣지 않는다. 저장된 스킨 삭제가 이미 명시적으로 공유한 snapshot에 미치는 영향도 UI에서 설명하고, 삭제된 사진은 fallbackColor로 대체한다.

### DB와 Storage의 비원자성

DB transaction과 Storage 업로드를 하나의 원자적 transaction처럼 취급하지 않는다. 서버가 에셋 ID와 용량 예약을 만들고 `processing` 상태로 등록한 뒤 업로드한다. 성공하면 `ready`로 전환한다. 실패하면 예약을 해제하고 객체를 정리한다. ready가 아닌 에셋은 맵이나 preset에 연결할 수 없다.

정리 실패와 account deletion은 비공개 작업 기록에 남기고 idempotent 재시도 절차를 제공한다. quota는 단순 클라이언트 카운터가 아니라 DB에서 동시 요청을 고려해 예약/확정한다.

## 6. API 계약

모든 쓰기 응답은 표준 형태 `{ data, error, requestId }`를 사용한다. error에는 안정적인 code와 사용자 메시지를 넣되 내부 SQL, Storage path, 인증 토큰을 노출하지 않는다.

| 메서드와 경로 | 기능 | 필수 조건 |
|---|---|---|
| `POST /api/maps` | 새 클라우드 맵 | 로그인, 문서 검증, quota |
| `GET /api/maps/[id]/draft` | 내 초안 읽기 | 로그인, 소유권 |
| `PUT /api/maps/[id]/draft` | 조건부 초안 저장 | 로그인, 소유권, expectedRevision |
| `POST /api/maps/[id]/publish` | 불변 버전 게시 | 로그인, 소유권, 검증, idempotency |
| `PATCH /api/maps/[id]/visibility` | 공개 범위 변경 | 로그인, 소유권, 링크 철회 정책 |
| `DELETE /api/maps/[id]` | 접근 중단과 삭제 처리 | 로그인, 소유권 |
| `POST /api/maps/[id]/remix` | 게시 버전 리믹스 | 로그인, 접근 권한, allow_remix |
| `GET /api/maps` | 공개 탐색 | 공개/활성/게시만, cursor pagination |
| `POST /api/assets` | 작은 이미지 업로드 | 로그인, byte/pixel/형식 검증, quota |
| `POST /api/race-presets` | 공유용 실행 설정 저장 | 로그인, 버전 접근, 명단 동의 |
| `POST /api/race-runs` | 결과 요약 저장 | 로그인, 입력 검사, client_reported 고정 |
| `POST /api/shares` | 공유 링크 발급 | 로그인, 대상 소유권/공유 정책 |
| `GET /api/shares/[token]` | 공유 DTO 해석 | token, 만료/철회/부모 상태 검사 |
| `DELETE /api/shares/[id]` | 링크 철회 | 로그인, 소유권 |
| `POST /api/reports` | 콘텐츠 신고 | 로그인, target 제한, 호출량 제한 |

관리자의 콘텐츠 차단과 계정 삭제는 별도 server-only 관리 함수로 구현하며 일반 사용자의 role 필드 변경과 연결하지 않는다.

오류 코드는 `VALIDATION_ERROR`, `UNAUTHENTICATED`, `NOT_FOUND`, `REVISION_CONFLICT`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `UNSUPPORTED_VERSION`, `ASSET_NOT_READY`, `INTERNAL_ERROR`를 기본으로 한다. 비인가 대상은 존재 여부가 노출되지 않도록 NOT_FOUND로 통일할 수 있다.

쿠키 인증으로 쓰기를 수행할 때 Origin과 요청 방식, Content-Type을 제한하고 적절한 CSRF 방어를 구현한다. 익명 token resolver는 읽기만 허용한다. 서버리스 인스턴스 메모리 Map만으로 rate limit을 구현하지 않는다. 초기에는 DB의 원자적 시간창 카운터와 짧은 보존 기간을 사용하고 user ID 또는 salt/pepper가 적용된 IP 식별값으로 제한한다. 추후 실제 부하가 커지면 별도 공유 저장소로 옮긴다.

## 7. 결과 신뢰도

서버는 저장 요청의 참가자 ID 중복, 순위 필드, 이름 길이, map version 관계, manifest 크기는 검사할 수 있다. 하지만 초기 버전은 실제 물리를 다시 실행하지 않으므로 레이스가 그 결과를 냈는지 증명하지 못한다.

`verification_status = 'client_reported'`는 서버만 설정한다. 요청에 `server_verified`가 들어오면 거부한다. hash 일치만으로 상태를 올리지 않는다. 통계와 공개 순위표에 클라이언트 결과를 검증된 기록처럼 집계하지 않는다.

향후 서버 검증이 필요하면 별도의 제한된 작업 실행기, 서버가 발급한 시드, 고정 엔진, 리소스 제한, 서명된 결과가 필요하다. 긴 시뮬레이션을 단일 Vercel 요청에 무제한으로 넣지 않는다. 이 기능은 첫 출시에서 구현하지 않는다.

## 8. 필수 보안 테스트

회원 A, 회원 B, 비회원 세 역할을 준비하고 다음을 API와 Supabase 직접 접근 양쪽에서 검사한다.

| 시험 | 기대 결과 |
|---|---|
| B가 A의 draft ID로 읽기 | 거부 |
| B가 A의 map 수정/게시/삭제 | 거부 |
| 비회원이 unlisted version UUID로 직접 조회 | 거부 |
| 유효한 token으로 해당 버전 조회 | 최소 DTO만 허용 |
| token의 대상 ID를 다른 asset ID로 바꿔 요청 | 거부 |
| revoked/expired token | 거부 |
| 공개 맵을 private으로 전환한 직후 이전 링크 조회 | 문서 접근 거부 |
| 일반 사용자가 server-only RPC 직접 호출 | 거부 |
| version document를 직접 UPDATE | 거부 |
| 큰 JSON, SVG 위장 파일, 초대형 해상도 이미지 | 거부 |
| 동시에 quota 한도 이상의 이미지 업로드 | 초과분 거부, 예약 누수 없음 |
| 같은 revision으로 동시 저장 | 한 요청만 성공, 나머지는 충돌 |
| 같은 idempotencyKey로 재게시 | 기존 버전 반환 |
| 요청 body의 owner_id 또는 verification_status 변조 | 거부 또는 서버 값 강제 |
| 에셋 업로드 성공 뒤 DB 실패 | orphan 정리 또는 재시도 기록 |

DB RLS 테스트는 migrations와 함께 버전 관리한다. 프런트 버튼이 안 보이는 것만으로 접근 제어 테스트를 통과시키지 않는다.

## 출처

- [D1] Supabase RLS와 grants: https://supabase.com/docs/guides/database/postgres/row-level-security
- [D2] DB 함수, definer와 invoker, 실행 권한: https://supabase.com/docs/guides/database/functions
- [D3] Supabase SSR 클라이언트와 JWT 검증: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- [D4] Storage bucket 접근 모델: https://supabase.com/docs/guides/storage/buckets/fundamentals
- [D5] Sharp 입력 제한: https://sharp.pixelplumbing.com/api-constructor/
- [D6] Vercel Function body 제한: https://vercel.com/docs/functions/limitations
