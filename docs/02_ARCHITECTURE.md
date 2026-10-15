# 기술 아키텍처

설계 기준일: 2026-10-14. 제품 범위는 `01_PRODUCT.md`, 엔진 계약은 `03_ENGINE_EDITOR.md`를 따른다.

## 1. 기술 결정

| 영역 | 선택 | 이 프로젝트에서의 이유 |
|---|---|---|
| 프레임워크 | Next.js App Router, React, TypeScript strict | 공개 맵 페이지와 회원 기능, 브라우저 게임의 통합 |
| 패키지 관리 | npm, 단일 package-lock.json | 기존 개발 방식 유지, 초기 모노레포 생략 |
| 렌더링 | PixiJS 8 계열, WebGL 우선 | 2D 게임과 에디터를 같은 렌더러로 처리 |
| 물리 | Rapier 2D, 초기 `@dimforge/rapier2d-compat` | WASM 초기 도입 경로 단순화, 센서와 운동학적 장애물 사용 |
| UI 상태 | Zustand | 선택 도구, 에디터 명령, 저빈도 게임 상태 |
| 입력 검증 | Zod | 폼과 JSON, 서버 요청의 동일 계약 |
| 스타일 | Tailwind CSS, CSS 변수 | 편집 패널과 반응형 화면 |
| 로컬 저장 | IndexedDB, 얇은 idb 어댑터 | JSON 초안과 사진 Blob 저장 |
| 백엔드 | Supabase Auth, Postgres, Storage | 사용자, 게시 버전, 스킨, 공유 데이터 |
| 이미지 처리 | 서버 Node.js 런타임의 Sharp | 입력 검사, 크롭, 작은 래스터 이미지로 재인코딩 |
| 테스트 | Vitest, Playwright, Supabase DB 테스트 | 도메인, 브라우저 흐름, 접근 제어 |
| 배포 | Vercel + Supabase | 웹과 데이터 분리. 운영 플랜은 별도 검토 |

위 조합은 추천 설계이며 가장 빠르다는 벤치마크 결론이 아니다. P0에서 실제 프로젝트와 브라우저에서 확인한다. Rapier의 compat 패키지는 WASM을 JS 안에 포함하는 대가로 초기 전송량 부담이 있으므로 게임 경로에서만 지연 로드한다. 추후 일반 WASM 패키지로 바꿀 때는 번들 출력, CSP, 로딩 실패, 재현성 테스트를 다시 수행한다. [A1]

PixiJS 8은 `Application` 생성 후 비동기 `init()`을 사용하는 API를 제공한다. v7 초기화 예제를 그대로 섞지 않는다. WebGL을 기본 경로로 사용하고 WebGPU는 첫 출시 조건에 넣지 않는다. [A2]

정확한 Next.js, React, Rapier, PixiJS 버전은 문서의 날짜만 보고 추측하지 않는다. P0 시점의 공식 지원 범위와 실제 빌드를 확인하고 exact 버전과 Node 런타임, npm 버전을 `PROGRESS.md`에 기록한다. lockfile을 저장하고 CI는 `npm ci`를 사용한다.

## 2. 전체 구조

```text
브라우저
  Next.js Client UI
    ├─ React 패널 / 접근 가능한 목록 / 폼
    ├─ Zustand: editorStore, raceUiStore
    ├─ LocalRepository: IndexedDB
    └─ GameRuntime
        ├─ SimulationCore: Rapier 2D + 고정 tick
        ├─ PixiRenderer: 맵, 구슬, 카메라, 선택 표시
        └─ 이벤트 연결: 저빈도 UI 통지

Next.js 서버
  Server Components: 공개 페이지와 메타데이터
  Route Handlers: 인증 검증, 입력 검증, 소유권, 공유, 이미지
    └─ Supabase
        ├─ Auth
        ├─ Postgres + RLS + 제한된 RPC
        └─ Private Storage
```

클라이언트는 물리 시뮬레이션을 실행하고 서버는 콘텐츠와 권한을 관리한다. 첫 출시에는 WebSocket 서버, Supabase Realtime, Redis, 별도의 게임 서버를 도입하지 않는다. 공유는 저장된 콘텐츠 접근이며 실시간 동기화가 아니다.

## 3. Server/Client 경계

공개 탐색, 맵 설명, 제작자 정보, 검색 메타데이터는 Server Components를 기본으로 한다. 브라우저 캔버스, 사진 크롭, IndexedDB, 포인터 입력은 Client Components로 분리한다. Next.js 문서상 `ssr: false`는 Client Component에서 사용해야 하므로 서버 페이지에서 직접 지정하지 않는다. [A3]

```tsx
// src/components/game/GameClient.tsx
'use client';

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <p role="status">레이스 화면을 준비하고 있습니다.</p>,
});

export default function GameClient() {
  return <GameCanvas />;
}
```

위 코드는 경계를 설명하는 예시이며 아직 프로젝트에 구현되어 있지 않다. 실제 컴포넌트는 검증된 맵과 실행 설정을 props로 받고 로드 실패, 재시도, 미지원 GPU 상태도 처리해야 한다.

런타임의 비동기 초기화가 끝나기 전에 컴포넌트가 unmount될 수 있다. 초기화 세대 ID나 취소 플래그를 두어 늦게 완료된 인스턴스를 즉시 정리한다. 개발 모드의 재마운트, 경로 이동, 웹GL 컨텍스트 상실도 테스트한다. 정리 대상은 ticker/RAF, 포인터 리스너, ResizeObserver, Pixi 객체와 독점 텍스처, Rapier world, object URL이다. 공유 텍스처는 참조 수를 관리해 다른 화면에서 쓰는 자원을 먼저 해제하지 않는다.

## 4. 디렉터리 구조

```text
AGENTS.md
docs/
  01_PRODUCT.md
  02_ARCHITECTURE.md
  03_ENGINE_EDITOR.md
  04_DATA_SECURITY.md
  05_CODEX_PLAN.md
  PROGRESS.md
src/
  app/
    (public)/
    (account)/
    editor/
    play/
    s/[token]/
    api/
  components/
    ui/
    game/
    editor/
  features/
    maps/
    skins/
    sharing/
    auth/
  game/
    core/          # DOM, React, Pixi, Supabase에 의존하지 않는 시뮬레이션
    physics/       # Rapier 어댑터와 collider 생성
    renderer/      # Pixi 구현
    runtime/       # 클라이언트 수명주기와 게임 루프 연결
    editor/        # 명령, 좌표 변환, 선택, 히스토리
    contracts/     # 맵, 이벤트, 입력, 결과의 타입과 Zod
    fixtures/      # 독자 템플릿과 회귀 테스트 맵
  lib/
    supabase/
    persistence/
    security/
    validation/
  stores/
supabase/
  migrations/
  tests/
tests/
  unit/
  e2e/
  fixtures/
public/
  textures/
```

physics 어댑터는 현재 필요한 create/step/read/dispose 동작만 제공한다. 여러 엔진을 동시에 지원하는 범용 프레임워크를 만들지 않는다. 루트 게임 코어를 순수하게 유지하는 이유는 테스트와 향후 Worker 또는 서버 검증으로 이동할 가능성 때문이다.

## 5. 상태 소유권

| 상태 | 소유 위치 | 업데이트 기준 |
|---|---|---|
| 구슬 위치, 속도, 접촉 정보 | SimulationCore | 매 tick |
| 스프라이트, 텍스처, 카메라 보간 | PixiRenderer | 렌더 프레임 |
| 선택 오브젝트, 도구, Undo/Redo | editorStore와 command history | 사용자 명령 |
| 레이스 상태, 완료 순위, 일시정지 | raceUiStore | 상태 전이 또는 이벤트 |
| 진행 표시용 순위와 시간 | UI snapshot | 초당 최대 5~10회 |
| 초안 문서 | EditorDocument | 확정 명령 단위 |
| 로컬 저장 | IndexedDB | 명령 후 debounce 1초, 명시 저장 |
| 클라우드 저장 | 서버 Repository | 로그인 후 debounce 3초, revision 조건부 저장 |
| 게시 맵과 결과 | DB | 게시/공유/결과 저장 시 |

매 프레임 React `setState`, JSON 직렬화, DB 요청, 전체 맵 재생성은 금지한다. 드래그 중에는 렌더러에서 프리뷰만 움직이고 pointerup 때 명령을 확정한다.

프레임 카메라 이동과 글자 가독성은 렌더링 문제이며 물리 좌표에 영향을 주지 않는다. 성능 저하 시 DPR, 그림자, 이펙트, 이름 표시 빈도만 낮춘다. 구슬 수를 레이스 중 몰래 줄이거나 물리 dt를 바꾸지 않는다.

## 6. 로컬 우선 저장

IndexedDB는 구조화된 데이터와 Blob 저장에 사용한다. 브라우저 저장은 용량 제한과 제거 가능성이 있으므로 영구 백업이라고 안내하지 않는다. JSON 내보내기와 명시적인 클라우드 저장 상태를 제공한다. [A4]

```ts
interface DraftRepository {
  load(id: string): Promise<StoredDraft | null>;
  save(input: {
    id: string;
    expectedRevision: number;
    document: MapDocument;
  }): Promise<SaveResult>;
  remove(id: string): Promise<void>;
}
```

위 인터페이스의 MapDocument 등 실제 타입은 `game/contracts`에서 정의한다. 로컬 초안을 로그인 후 자동으로 덮어쓰지 않는다. 사용자가 클라우드로 저장할 때 새 mapId를 만들고 로컬 origin ID로 중복 이전을 방지한다.

두 탭에서 같은 초안을 수정하면 expectedRevision이 맞지 않는 저장에 `REVISION_CONFLICT`를 반환한다. 충돌 UI는 새 복사본으로 저장 또는 서버 버전 다시 불러오기를 제공하며 마지막 저장 승리 방식으로 조용히 덮어쓰지 않는다.

unload 이벤트만 믿고 저장하지 않는다. 명령마다 debounce 저장하고 라우트 이탈 시 flush를 시도하되 성공 보장은 하지 않는다. 실패한 저장은 UI에 표시하고 로컬 사본을 유지한다.

## 7. 게임 성능과 Worker 도입 기준

초기에는 main thread에 순수한 시뮬레이션 코어와 Pixi 렌더러를 함께 두되 모듈은 분리한다. P0 벤치마크 없이 Worker와 OffscreenCanvas를 필수로 추가하지 않는다.

P0 측정 목표는 데스크톱 구슬 100개, static collider 200개 이하, 운동학적 장애물 20개 이하에서 원활한 플레이와 입력 반응이다. 이를 합산해 맵 오브젝트는 220개를 넘기지 않는다. 권장 모바일 테스트는 구슬 30개와 더 단순한 맵이다. desktop 평균 55fps 이상, mobile 평균 30fps 이상을 초기 검증 목표로 두되 평균만으로 승인하지 않고 p95 프레임 시간, 긴 멈춤, 재시작 누수를 함께 본다.

기기명, OS, 브라우저, DPR, 전원 상태, 맵 hash를 기록한다. 측정되지 않은 숫자를 달성했다고 쓰지 않는다. 대표 맵을 60초씩 세 번 실행하고 20회 재시작 후 자원 수가 기준으로 복귀하는지 확인한다.

physics가 실제 병목으로 확인되면 다음 순서로 Worker를 도입한다.

1. SimulationCore를 Web Worker에 옮기고 renderer는 main thread에 유지한다.
2. tick ID와 위치를 TypedArray로 전송하고 UI 이벤트는 별도 메시지로 보낸다.
3. 렌더러는 최신 두 snapshot을 보간하고 오래된 메시지를 버린다.
4. 전송량, 버퍼 재사용, 종료 정리, 숨김 탭 정책을 검증한다.

Worker 도입 여부는 근거와 함께 PROGRESS의 기술 결정에 기록한다. 물리 정밀도 저하를 최적화라고 대체하지 않는다.

## 8. 배포와 관측

환경 변수는 공개 Supabase URL/게시용 키와 서버 전용 관리자 키를 구분한다. 서버 전용 키는 `server-only` 모듈에서만 읽고 로그에 출력하지 않는다. 로컬 데모 모드에서는 Supabase 변수가 없어도 `/play`와 `/editor/new`가 작동해야 한다. 운영 모드에서 키가 빠진 경우 저장 성공을 가장하지 말고 명확히 실패시킨다.

오류 로그에는 engine init 실패, 맵 검증 코드, permission failure, 저장 충돌, DB/Storage 실패, renderer context loss를 기록한다. 참가자 이름과 사진 URL, 전체 맵 초안, 인증 토큰, 공유 토큰은 기본 로그에서 제외한다.

CI 명령은 `lint`, `typecheck`, `test`, `build`, 필요한 `test:e2e`, `test:db`다. 각 스크립트는 실제 도구를 실행해야 한다. 빈 테스트나 `echo passed`로 통과시키지 않는다. Supabase 로컬 통합 테스트에 필요한 Docker가 없는 환경은 미실행 사유를 기록한다.

## 출처

- [A1] Rapier JS 설치, 비동기 WASM과 compat 패키지: https://rapier.rs/docs/user_guides/javascript/getting_started_js/
- [A2] PixiJS 8 Application과 초기화: https://pixijs.com/8.x/guides/components/application
- [A3] Next.js Client Component 지연 로딩: https://nextjs.org/docs/app/guides/lazy-loading
- [A4] IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
