# Codex 단계별 개발 계획

설계 기준일: 2026-10-14
원칙: 한 번에 전체 사이트를 생성하지 않는다. 위험한 기술부터 검증하고 기능 단위로 구현과 테스트를 완료한다.

## 1. 문서 사용 순서

프로젝트 루트에 AGENTS.md와 docs 폴더를 둔다. 빈 저장소와 기존 Next.js 저장소 모두 지원하되 기존 사용자 파일과 설정을 먼저 확인한다. 문서가 있는 디렉터리를 무조건 삭제하고 create-next-app을 다시 실행하지 않는다. 새 scaffold가 필요하면 기존 문서를 보존하면서 필요한 설정을 병합한다.

Codex는 AGENTS.md를 프로젝트 지침으로 읽을 수 있다. 공식 문서도 공통 지침과 프로젝트별 지침의 계층 구성을 설명한다. 이 패키지에서는 루트 지침을 짧게 두고 상세 설계와 구현 상태를 docs로 분리한다. [C1]

첫 작업에서는 01~04 문서를 모두 읽어 계약을 이해한다. 이후에는 AGENTS.md, PROGRESS.md, 현재 Phase, 관련 명세만 우선 확인한다. 필요한 맥락을 얻기 위해 미관련 파일 전체를 반복해서 읽지 않는다.

## 2. 개발 순서와 Gate

| Phase | 목적 | 선행 조건 | 완료 Gate |
|---|---|---|---|
| P0 | 개발 기반과 물리 PoC | 없음 | Next 프로덕션 빌드, Pixi/Rapier 로드, 20개와 100개 구슬 계측, 정리 검증 |
| P1 | 맵과 실행 계약 | P0 | Zod, canonical serialization, 버전, 제한, 템플릿, 정상/비정상 fixture 테스트 |
| P2 | 실제 레이스 | P1 | 장애물, 고정 tick, 상태 전이, 시드, 결승/공동순위/DNF, 재실행 |
| P3 | 맵 에디터 | P2 | 명령 기반 편집, Undo/Redo, 좌표 변환, 로컬 저장, 테스트 모드 |
| P4 | 커스텀 구슬 | P3 | 색/패턴/이모지/로컬 사진, 크롭, 텍스처 캐시, 외형과 물리 분리 |
| P5 | Supabase 저장과 보안 | P4 | Auth, migrations, 제한된 RPC, RLS, 클라우드 저장, 서버 이미지 검증 |
| P6 | 공유와 탐색 | P5 | 불변 게시, 공개/링크전용/비공개, 철회, 설정/결과 공유, 리믹스 |
| P7 | 출시 검증 | P6 | 모바일, 접근성, 성능, 실패 복구, 신고/차단/삭제, 배포 runbook |

P0~P4는 운영 DB나 외부 키 없이 로컬에서 재현 가능해야 한다. P5 이후도 로컬 플레이 경로는 Supabase 장애에 끌려 중단되지 않아야 한다.

각 Phase는 여러 작은 작업과 세션으로 나눌 수 있다. Gate를 통과하지 못했다고 근거 없이 다음 단계에서 해결했다고 가정하지 않는다. 필요한 API 키나 실제 기기가 없으면 가능한 부분과 미검증 부분을 명시한다.

## 3. 공통 작업 절차

작업 시작 시 현재 저장소 상태, 진행 Phase, 기존 테스트를 확인한다. 구현 범위와 완료 조건을 적고 관련 계약 테스트부터 추가한다. 변경 뒤 테스트, 타입 검사, 린트, 빌드를 수행한다. 실패는 수정하거나 환경 제약을 구분해 보고한다.

AGENTS.md는 방향을 안내하는 문서이지 보안 경계를 강제하는 도구가 아니다. 비밀키 보호, 운영 DB 변경 제한, 테스트 실패 차단은 실제 환경 권한과 CI에서도 적용한다.

각 작업의 종료 보고는 구현 내용, 변경 파일, 실행한 명령과 결과, 미실행 검증, 남은 위험, 다음 작업을 포함한다. PROGRESS.md에는 동일한 내용을 짧게 남기되 실행하지 않은 테스트에 PASS를 쓰지 않는다.

초기 스크립트 계약은 다음과 같다.

```text
npm run dev          # Next.js 개발 서버
npm run build        # 프로덕션 빌드
npm run start        # 빌드 결과 실행
npm run lint         # ESLint 검사
npm run typecheck    # tsc --noEmit
npm run test         # Vitest run, watch 아님
npm run test:e2e     # Playwright
npm run test:db      # 로컬 Supabase DB/RLS 테스트
```

P0에서 기본 명령을 만들고, DB 명령은 P5에서 실제 테스트를 연결한다. 미구현 검증을 빈 스크립트로 성공 처리하지 않는다. CI는 lockfile을 기반으로 npm ci를 사용한다.

## 4. P0: 기술 위험 검증

### 작업

Next.js App Router, TypeScript strict, npm, 기본 스타일과 검사 도구를 구성한다. `/play`에 GameClient 경계를 만들고 PixiJS와 Rapier compat를 지연 로드한다. 경사 벽, 범퍼, 회전봉과 구슬이 실제 물리로 움직이는 작은 장면을 만든다. 단순 CSS 애니메이션으로 대체하면 안 된다.

main thread 코어를 분리하고 고정 dt 루프, 최소 pause/reset/dispose를 만든다. 20개 구슬 장면과 100개 구슬의 스트레스 장면을 제공한다. 구슬 수, body/collider 수, FPS와 frame time을 확인하는 개발 모드 HUD를 만든다.

### Gate

프로덕션 빌드에서 캔버스가 로드되고 wasm 경로 오류가 없어야 한다. 20회 재시작과 경로 왕복 후 ticker, listener, body가 누적되지 않아야 한다. 브라우저별 초기화 검증 결과와 측정 기기, 성능을 기록한다. 조합이 동작하지 않으면 원인을 보고하고 최소 변경 대안을 제안한다. Matter.js나 Box2D로 조용히 바꾸지 않는다.

### 실행 프롬프트

```text
AGENTS.md와 docs/01_PRODUCT.md부터 docs/05_CODEX_PLAN.md,
docs/PROGRESS.md를 읽고 현재 저장소를 확인해 줘.
이번에는 P0만 구현해 줘. npm, Next.js App Router, TypeScript strict,
PixiJS 8 계열, Rapier 2D compat를 사용해 실제 물리 PoC를 만들어 줘.
React UI와 게임 코어를 분리하고 고정 dt, pause/reset/dispose를 구현해 줘.
20개와 100개 구슬의 계측 장면을 제공하고 프로덕션 빌드에서도 확인해 줘.
Supabase, 로그인, 에디터 전체, 공유는 아직 구현하지 마.
실행한 검사와 실제 성능 측정, 미실행 검증을 구분해 보고하고
PROGRESS.md에 설치 버전, 결정사항, 다음 작업을 갱신해 줘.
```

## 5. P1: 맵 계약과 템플릿

### 작업

03_ENGINE_EDITOR.md의 strict discriminated union을 Zod로 구현한다. 맵 JSON, 참가자, 외형, 실행 설정을 분리한다. 문서의 유한 숫자, 좌표, 형상 범위, 배열 수량, 출발 슬롯, 결승선과 ID 중복을 검증한다. canonical serialization과 hash 함수를 만들고 fixture로 출력 안정성을 확인한다.

독자 템플릿은 완만한 지그재그, 범퍼 경로, 회전봉 경로 3종으로 시작한다. 외부 맵을 무단으로 복사하지 않는다. 각 템플릿은 지원 인원과 난이도를 메타데이터로 표시하되 완료 가능성과 재미는 테스트로 확인한다.

### Gate

정상 맵의 import/export 왕복이 안정적이며 알 수 없는 schemaVersion, kind, 외부 URL, 중복 ID, NaN, 과도한 오브젝트가 거부되어야 한다. 오류가 objectId와 field를 포함해야 한다.

### 실행 프롬프트

```text
현재 진행 상태와 03_ENGINE_EDITOR.md를 읽고 P1만 구현해 줘.
Zod 계약을 기준으로 타입을 파생하고 strict map schema, geometry 검사,
canonical serialization/hash, 정상/비정상 fixture, 독자 템플릿 3개를 만들어 줘.
MapDocument에 참가자 정보나 엔진 handle, 임의 URL을 넣지 마.
초과 수량, 잘못된 필드, schemaVersion, 중복 ID, 좌표 오류 테스트를 추가해 줘.
기존 P0 장면을 계약 기반 로딩으로 연결하고 검사 결과를 PROGRESS.md에 기록해 줘.
```

## 6. P2: 게임 실행과 결과

### 작업

`idle → loading → ready → countdown → running → paused → finished/error` 상태와 허용 전이를 정의한다. 오브젝트 생성/제거 순서, seeded PRNG, spawn 슬롯 배정, 물리 프로필을 고정한다. wall, circle, bumper, rotor, moving-platform을 구현한다.

완주 판정은 sensor와 선분 통과 검사를 함께 사용한다. 공동 순위, 특정 순위, 마지막 완주, DNF와 오류를 구분한다. 0.5/1/2배속, 숨김 탭 일시정지, 카메라 추적, 새 시드 실행과 같은 조건 실행을 구현한다. UI에는 검증된 완료 순위만 확정 값으로 표시한다.

### Gate

같은 manifest의 반복 실행 결과가 같아야 한다. 렌더 프레임 수와 속도 변경이 같은 tick의 결과를 바꾸지 않아야 한다. 고속 결승선 통과와 공동 순위, 전원 미완주, 이미지 로딩 순서 변화가 테스트되어야 한다. 플랫폼 간 재현성은 실제 검증한 범위만 기록한다.

### 실행 프롬프트

```text
P2만 구현해 줘. 03_ENGINE_EDITOR.md의 고정 tick, PRNG 버전, 생성 순서,
kinematic 장애물, 결승선 교차와 공동순위, DNF 규칙을 따르도록 해 줘.
게임 상태와 화면 상태를 분리하고 React에 매 프레임 좌표를 저장하지 마.
같은 조건 재실행, 새 레이스, 0.5/1/2배속, 숨김 탭 정책을 구현해 줘.
레이스 결과를 서버 검증이나 균등 확률로 표현하지 마.
반복 실행, 고속 통과, 동시 도착, pause/reset 테스트와 실제 결과를 기록해 줘.
```

## 7. P3: 로컬 에디터

### 작업

좌측 팔레트, 중앙 Pixi 캔버스, 우측 속성, 상단 테스트/저장 패널을 구성한다. 오브젝트 생성, 선택과 다중 선택, 이동, 회전, 크기, 스냅, 복제, 삭제를 구현한다. 명령 기반 Undo/Redo를 적용하고 드래그 한 번을 한 명령으로 묶는다.

IndexedDB 초안, debounce 저장, 명시 저장, JSON 백업과 복원, 두 탭 revision 충돌을 구현한다. 테스트 모드에서는 문서 snapshot으로 별도 시뮬레이션을 실행한다. 복귀 시 초안과 선택 상태가 변하지 않아야 한다.

### Gate

줌과 카메라 이동 뒤에도 hit test와 드래그가 정확하다. Undo/Redo와 drag cancel이 문서를 복구한다. 새로고침으로 로컬 초안이 복원된다. 테스트 플레이가 초안을 변경하지 않는다. 텍스트 입력 중 단축키가 오작동하지 않는다.

### 실행 프롬프트

```text
P3의 로컬 맵 에디터만 구현해 줘. 기존 renderer와 MapDocument를 재사용하고
편집 명령, 선택 상태, 카메라, 문서 데이터를 분리해 줘.
배치/이동/회전/크기/복제/삭제, 다중 선택, 스냅, Undo/Redo를 구현해 줘.
IndexedDB 자동 저장, JSON import/export, 저장 실패와 revision 충돌을 처리해 줘.
테스트 플레이는 원본 문서를 변경하지 않는 별도 runtime으로 실행해 줘.
좌표 변환, 한 드래그 한 Undo, 입력 중 단축키, 테스트 복귀 E2E를 검증해 줘.
```

## 8. P4: 커스텀 구슬

### 작업

단색, 패턴, 이모지, 로컬 사진을 제공한다. 사진은 파일 선택, 크롭, 프리뷰, 로컬 Blob 저장까지 먼저 구현한다. 스킨 저장소, asset ID 매핑, 텍스처 공유 캐시와 fallback을 만든다.

구슬 외형과 물리 body 생성 코드는 독립적으로 유지한다. 이미지가 로드되기 전후와 텍스처가 실패한 경우에도 manifest와 물리 결과가 같아야 한다.

### Gate

사진 스킨 적용 전후의 물리 결과가 동일하다. 원본 사진은 자동으로 서버에 전송되지 않는다. 여러 참가자가 같은 스킨을 써도 중복 텍스처가 계속 증가하지 않는다. 로컬 사진 삭제와 object URL 정리가 동작한다.

### 실행 프롬프트

```text
P4만 구현해 줘. 색상/패턴/이모지/로컬 사진 구슬과 크롭, 저장 스킨을 만들어 줘.
아직 클라우드 업로드하지 말고 사진 Blob을 IndexedDB에 저장해 줘.
appearance와 물리 프로필을 분리하고 image loading이나 실패가 결과를 바꾸지 않게 해 줘.
asset 기준 texture 캐시, 기본 외형 fallback, 삭제/정리를 구현해 줘.
스킨별 물리 결과 동일성과 자원 재사용을 검증하고 PROGRESS.md를 갱신해 줘.
```

## 9. P5: 인증, DB, 업로드

### 작업

Supabase SSR 인증과 사용자 경계를 연결한다. 이메일 로그인부터 시작하고 redirect URL을 allowlist로 제한한다. 04_DATA_SECURITY.md의 테이블, FK, CHECK, 인덱스, RLS와 grants, 서버 전용 RPC를 migrations로 구현한다.

로컬 초안을 로그인 후 명시적으로 클라우드에 복사하고 revision 저장을 연결한다. 게시 transaction의 기반과 idempotency 저장 구조도 만든다. 이미지 업로드는 서버 검증, private bucket, quota 예약, ready 상태, 실패 정리를 구현한다.

### Gate

회원 A/B/비회원의 읽기와 쓰기 거부 테스트가 통과한다. 관리용 키가 브라우저 번들에 없어야 한다. 파일 위장, 애니메이션, 초과 해상도, 초과 용량이 거부된다. 운영 키가 없을 때 가짜 성공을 반환하지 않는다. Supabase가 없어도 로컬 플레이는 가능하다.

### 실행 프롬프트

```text
P5만 구현해 줘. 04_DATA_SECURITY.md를 기준으로 Supabase Auth, SQL migrations,
RLS와 grants, 목적별 server-only RPC, 클라우드 revision 저장을 만들어 줘.
검증된 인증 사용자에서 actor ID를 얻고 요청 body의 owner_id를 신뢰하지 마.
이미지는 작은 파일을 서버에서 검증/재인코딩한 뒤 private bucket에 저장해 줘.
직접 DML/RPC 우회, 다른 사용자 접근, 잘못된 이미지, quota 동시 요청을 테스트해 줘.
로컬 Supabase와 필요한 환경 변수 예시를 제공하되 실제 비밀키는 기록하지 마.
외부 연결이나 DB 테스트를 실행하지 못했다면 미실행으로 명확히 보고해 줘.
```

## 10. P6: 게시, 공유, 리믹스

### 작업

게시 버튼과 불변 버전, 공개 상세와 고정 버전 상세, 공개 탐색, 제목 검색을 구현한다. private/public/unlisted 정책과 token resolver, 철회와 만료, no-store/noindex/로그 마스킹을 연결한다.

맵 공유와 레이스 설정 공유를 분리하고 명단 포함은 기본 OFF로 만든다. 결과는 요약 링크로 제공하며 client_reported 표시를 강제한다. 리믹스는 원본의 허용 상태와 접근 권한을 검사하고 새 맵의 source_version_id를 저장한다.

### Gate

게시 v1 뒤 초안과 v2를 수정해도 v1 링크는 v1 코스를 반환한다. private 전환과 삭제/차단 이후 이전 링크는 문서 접근이 막힌다. unlisted UUID만으로 읽을 수 없다. 이름과 사진이 동의 없이 공유되지 않는다. 일반 사용자가 server_verified 결과를 만들 수 없다.

### 실행 프롬프트

```text
P6만 구현해 줘. 불변 맵 게시, 공개 탐색과 상세, 고정 버전 공유를 연결해 줘.
public/unlisted/private와 토큰 기반 최소 DTO, 철회/만료, no-store를 구현해 줘.
맵 공유에는 참가자 정보가 없어야 하고 설정/결과 공유의 이름과 사진은 기본 OFF로 해 줘.
리믹스는 새 소유자의 새 맵을 만들고 원본 버전 출처를 남겨 줘.
동시 게시, 기존 링크의 버전 고정, private 전환, unlisted 직접 접근 거부를 테스트해 줘.
실시간 동기화나 영상 리플레이, 서버 검증 기능은 추가하지 마.
```

## 11. P7: 출시 검증

### 작업

데스크톱과 모바일의 플레이/공유 흐름, 키보드와 화면 읽기용 DOM 결과, 모션 축소, 사진 실패, WebGL 미지원, 네트워크 장애, 초안 충돌을 마무리한다. 대표 기기에서 성능을 계측하고 필요하면 시각 효과와 초기 인원 상한을 조정한다. 엔진이나 물리 조건을 무단으로 변경하지 않는다.

신고, 관리자 노출 중단, 에셋 차단, 개인정보 기본값, 계정 삭제와 실패 재시도 절차를 검증한다. DB와 Storage의 삭제 실패를 추적하는 비공개 기록과 안전한 운영 경로를 마련한다. 약관과 개인정보 안내의 실제 수집 항목, 공유, 보존 정책을 서비스 구현과 일치시킨다. 법률 적합성을 자동으로 인증했다고 표시하지 않는다.

현재 게임은 GitHub Pages 정적 산출물에서 WASM·코스·이름 입력·재시작과 검색 메타데이터를 검증한다. P5 이후 인증 callback, signed asset, 공개 링크, 이미지 업로드는 02_ARCHITECTURE.md 9절에서 선택한 별도 서버 환경에서도 검증하고 preview와 production의 차이를 구분한다. 운영 플랜과 quota를 확인한다. 배포나 운영 DB 적용은 사용자 요청 전 실행하지 않는다.

### Gate

핵심 E2E와 DB 접근 제어 테스트, 빌드가 통과한다. 실제 측정 표와 미지원 범위가 문서에 남는다. 장애 시 초안과 게임이 망가지지 않고 오류가 보인다. 개인정보와 토큰이 로그나 OG에 노출되지 않는다. 운영 절차와 롤백 순서가 준비된다.

### 실행 프롬프트

```text
P7 출시 검증을 수행해 줘. 성능, 모바일 플레이, 접근성, 실패 복구, 개인정보,
신고/차단, 에셋 삭제와 계정 삭제 절차를 점검하고 필요한 구현을 마무리해 줘.
브라우저 자동화와 실제 모바일 기기 검증을 구분해서 기록해 줘.
측정하지 않은 성능이나 실행하지 않은 DB 테스트를 통과로 표시하지 마.
환경 변수, 마이그레이션 순서, 배포 확인, 복구 절차를 기존 문서에 정리해 줘.
사용자 요청 없이 운영 DB 변경, Git push, 실제 배포는 하지 마.
최종 출시 차단 항목과 남은 위험을 PROGRESS.md에 명확하게 표시해 줘.
```

### GitHub Pages 출시 절차와 SEO/GEO 점검

현재는 준비 단계다. 아래 계정 설정·검색 등록·배포·외부 색인은 실행하지 않았다. 구현 파일은 `.github/workflows/pages.yml`, `.env.example`, `next.config.ts`, `src/lib/site.ts`이며 주소·서비스명 변경 시 메타데이터와 안내 본문을 함께 검토한다.

1. **릴리스 준비**: 실제 서비스명과 최종 도메인을 확정한다. 현재 기본 주소는 `https://ddoniddoni.github.io/marble-race/`. 보안 업데이트 경고가 있는 Next.js 16.4.0은 별도 의존성 작업에서 수정·회귀 검증한 뒤 공개 출시한다. 모바일 실제 기기·대규모 인원 성능과 P7 검증을 정적 빌드 통과로 대체하지 않는다.
2. **주소/검증 값**: 로컬은 `.env.example`을 참고해 공개 설정을 빌드 환경에 제공한다. Actions는 Settings → Secrets and variables → Actions → Variables의 `SITE_URL`을 사용한다. `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION`은 발급받은 meta content만 입력한다. 전부 공개 확인용 값이며 서버 비밀키가 아니다. 빈 값이면 태그를 생성하지 않는다. 네이버 루트 호스트 소유 확인 제약은 아키텍처 9절을 따른다.
3. **로컬 검증**: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run build:pages`, `npm run test:pages`를 수행한다. 커스텀 도메인을 시험할 때는 빌드와 `test:pages`에 같은 `SITE_URL`을 제공한다. `node scripts/serve-pages.mjs`는 정적 결과를 `http://127.0.0.1:3101/marble-race/`에 띄우는 로컬 확인용이다. `next start`로 정적 export를 확인하지 않는다.
4. **Git Flow**: 기능 PR은 develop으로 통합한다. 실제 공개 릴리스는 승인된 develop → main 전용 PR로 승격한다. 현재 main이 없으므로 최초 승격은 별도 Git 작업으로 진행한다. 커밋·push·PR·병합·배포는 이 문서만으로 자동 실행하지 않는다.
5. **Pages 최초 설정**: 저장소 Settings → Pages → Source를 GitHub Actions로 선택한다. `github-pages` environment의 배포 브랜치는 main으로 제한한다. 수동 workflow가 저장소 기본 브랜치에 있어야 Actions에 표시되므로 최초 릴리스 때 기본 브랜치 정책도 확인한다. 별도 도메인이 있으면 Pages/DNS/HTTPS를 먼저 구성한다.
6. **수동 배포**: Actions의 `Publish GitHub Pages`에서 main을 선택해 Run workflow를 실행한다. push만으로 배포되지 않으며 main 이외의 수동 실행은 건너뛴다. 워크플로는 lint·typecheck·단위·정적 빌드·데스크톱/모바일 Chromium E2E 후 `out/`만 업로드한다. 빌드 실패를 무시하거나 미완료 산출물을 수동 업로드하지 않는다.
7. **배포 직후**: 실제 HTTPS에서 루트/guide/play 직접 진입·새로고침, JS/CSS/PNG/SVG/WASM 로드, 게임 시작·일시정지·재시작, canonical/OG 이미지 절대 주소, sitemap XML, 잘못된 URL의 404를 확인한다. 루트 robots가 Googlebot/Bingbot/Yeti/OAI-SearchBot와 필요한 게임/스타일 리소스를 차단하지 않는지 확인한다. 프로젝트 하위 robots만 보고 통과 판정하지 않는다.
8. **검색 등록**: Google Search Console에 최종 URL-prefix 속성을 등록하고 소유 확인 후 `sitemap.xml`을 제출한다. 도메인을 소유한 경우 DNS Domain 속성도 선택 가능하다. URL 검사에서 초기 HTML·색인 가능 여부·Google 선택 canonical을 확인한다. Bing Webmaster Tools와 네이버 서치어드바이저에도 실제 지원 범위에 맞춰 소유 확인·사이트맵 제출을 진행한다. 계정 로그인과 외부 등록은 사용자가 요청한 시점에 수행한다.
9. **콘텐츠/품질 검증**: Schema.org Validator로 JSON-LD 문법을, Google Rich Results Test로 해당되는 검색 기능만 검사한다. 일반 WebApplication 표기가 전용 리치 결과를 보장하지 않는다. PageSpeed Insights와 실제 모바일에서 LCP/INP/CLS·초기 다운로드·게임 로딩을 측정하고 결과를 남긴다. 게임 리소스 지연 로딩을 유지하며 안내 경로에 물리/렌더러를 추가하지 않는다.
10. **배포 후 관측**: Search Console의 색인·제외 사유·검색어·노출·클릭·canonical, Bing/네이버 수집 상태를 확인한다. AI 답변의 인용 여부는 직접 관찰하되 등록·노출을 보장하지 않는다. 참가자 이름·사진·토큰을 분석 로그에 보내지 않는다. 실서비스 데이터 없이 검색 순위나 성능 점수를 완료로 기록하지 않는다.
11. **복구**: 실패한 배포는 재실행 전에 로그를 확인한다. 공개된 오류는 main의 수정 또는 승인된 revert PR을 검증하고 수동 재배포한다. 정상 커밋과 SITE_URL·검증 변수 변경 이력을 함께 남긴다. 도메인 이동 시 옛 주소에서 새 주소로의 리디렉션 가능 여부와 Search Console 이전 절차를 별도로 검토한다. GitHub Pages는 Next의 redirects 설정을 실행하지 않는다.

공식 참고: [GitHub Pages 사용자 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Google Search Console 소유 확인](https://support.google.com/webmasters/answer/9008080), [사이트맵 제출](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Bing Webmaster Tools](https://www.bing.com/webmasters/), [네이버 서치어드바이저](https://searchadvisor.naver.com/guide/seo-basic-intro). 마지막 확인: 2026-10-24.

## 12. 완료 판정용 사용자 시나리오

출시 후보는 비회원이 템플릿을 골라 이름을 넣고 레이스를 완료할 수 있어야 한다. 이어서 에디터에서 장애물을 옮기고 되돌리고 테스트한 후 새로고침해 초안을 복원할 수 있어야 한다.

로그인한 사용자는 사진 스킨과 맵을 저장하고 새 버전을 게시할 수 있어야 한다. 다른 브라우저에서 공유 링크를 열어 동일한 코스를 플레이해야 한다. 원본을 수정해도 기존 버전 링크는 유지되어야 하고, 비공개 전환 후에는 외부 접근이 막혀야 한다.

다른 사용자는 초안과 비공개 사진을 직접 읽을 수 없어야 한다. 맵 공유에는 참가자 명단이 없어야 한다. 설정과 결과를 공유할 때 개인정보를 포함하기 전 미리보기가 나타나야 한다. 리믹스는 원본을 변경하지 않아야 한다.

테스트의 목적은 이 전체 흐름을 보장하는 것이다. 코드 파일 수나 UI 스크린샷만으로 완료를 선언하지 않는다.

## 13. 첫 출시 이후의 검토 항목

실시간 관전은 호스트가 authoritative 시뮬레이션을 수행하고 다른 기기는 snapshot을 보간하는 방식부터 검토한다. 연결 복구와 호스트 이탈, 권한, 비용을 별도 설계한다. 클라이언트마다 시드만 받아 돌리는 방식이 자동으로 동시 관전이 된다고 가정하지 않는다.

서버 검증 리플레이, 동영상 녹화, 모바일 완전 편집기, 토너먼트, 사용자 스킨 공개 갤러리, 후원과 수익화는 사용자 반응과 운영 여력을 본 뒤 선택한다. 현재 스키마와 Phase를 근거 없이 확장하지 않는다.

## 출처

- [C1] Codex AGENTS.md 공식 안내: https://developers.openai.com/codex/agent-configuration/agents-md
