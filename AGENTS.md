# 구슬 레이스 스튜디오 개발 규칙

사용자가 코스를 제작하고, 구슬을 꾸미고, 완성된 맵과 레이스 설정을 공유하는 독자적인 2D 웹 서비스다. 공식 서비스명은 미정이다.

## 먼저 읽을 문서

- 제품 범위: `docs/01_PRODUCT.md`
- 기술 구조: `docs/02_ARCHITECTURE.md`
- 물리, 맵, 에디터: `docs/03_ENGINE_EDITOR.md`
- 데이터, API, 보안: `docs/04_DATA_SECURITY.md`
- 단계별 구현과 검증: `docs/05_CODEX_PLAN.md`
- 현재 상태와 기술 결정: `docs/PROGRESS.md`

## 필수 규칙

- Next.js App Router, React, TypeScript strict, npm을 사용한다. 서버 저장소는 Supabase다.
- 패키지 버전은 구현 시 호환성을 확인하고 `package-lock.json`에 고정한다. 물리 엔진 업그레이드는 재현성 검증 없이 진행하지 않는다.
- React는 UI를, PixiJS는 게임 렌더링을, Rapier 2D는 물리를 담당한다. 프레임별 좌표를 React나 Zustand에 저장하지 않는다.
- `src/game/core`에는 React, DOM, PixiJS, Supabase 의존성을 넣지 않는다. 시뮬레이션은 고정 시간 간격으로 진행한다.
- 맵은 검증 가능한 JSON이다. 사용자 코드, 임의 외부 URL, HTML, SVG를 실행하거나 로드하지 않는다.
- 구슬 스킨은 외형만 변경한다. 스킨으로 크기, 질량, 마찰, 반발력을 바꾸지 않는다.
- 게시된 맵 버전은 변경하지 않는다. 초안, 게시 버전, 참가자 정보, 플레이 기록을 분리한다.
- 공유 링크는 버전을 고정한다. 비공개 데이터는 UI뿐 아니라 DB 권한과 서버에서 차단한다.
- 서버 비밀키를 클라이언트나 `NEXT_PUBLIC_*`에 넣지 않는다. 쓰기 요청은 인증, 소유권, 입력, 호출량을 검증한다.
- 초기 물리 엔진 검증은 Supabase 없이 실행 가능해야 한다. 로그인, 공유, 업로드는 해당 Phase에서만 구현한다.
- 문서는 한국어로 작성한다. 범위를 임의로 넓히거나 미구현 기능을 완료했다고 표시하지 않는다.
- 요청받은 Phase 또는 하위 작업만 진행한다. 테스트 결과와 실패, 미실행 항목을 구분해 `docs/PROGRESS.md`에 기록한다.
- 기본 검증은 `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`다. DB 변경은 RLS 테스트, 핵심 UI 변경은 E2E를 추가한다.
- 지시 없이 Git 커밋, 푸시, 배포, 운영 DB 변경, 비밀정보 조회를 실행하지 않는다.
- 새로운 Markdown 파일보다 기존 관련 문서를 우선 갱신한다.
