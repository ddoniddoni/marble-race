# 맵, 엔진, 에디터 설계

이 문서는 물리 코어, 게시 가능한 맵 형식, 에디터 명령의 구현 계약이다. 모든 기능은 구현 후 테스트해야 하며 현재 검증된 구현은 아니다.

## 1. 좌표와 물리 프로필

월드 좌표는 미터에 해당하는 게임 단위로 통일한다. x는 오른쪽, y는 아래쪽이 양수다. 기본 중력은 `{ x: 0, y: 9.81 }`이다. 화면 픽셀과 월드 좌표는 카메라 어댑터에서만 변환한다. 예시 기본 배율은 1단위당 50 CSS 픽셀이며 확대/축소와 DPR은 물리와 무관하다.

초기 프로필 `classic-v1`은 구슬 반지름 0.22, 질량 1, 마찰 0.35, 반발력 0.25를 제안값으로 사용한다. 모든 참가자에게 동일하게 적용한다. 벽과 범퍼의 접촉 조합 규칙, solver 설정, CCD 설정도 프로필의 일부로 고정하고 실제 P0 튜닝 결과를 기록한다. 튜닝 후 출시한 프로필의 의미를 몰래 바꾸지 않는다.

물리 시간 간격은 1/60초다. 큰 구슬 수와 빠른 충돌에서 안정성이 부족하면 먼저 맵과 속도 범위를 제한하고 CCD, solver, timestep을 벤치마크한다. 1/120초 등으로 바꿀 경우 새 simulationVersion으로 취급한다.

## 2. 데이터 계약

다음 TypeScript는 데이터 모양의 기준이다. 실제 구현에서는 Zod 스키마를 먼저 만들고 `z.infer`로 타입을 파생해 런타임 검증과 타입이 어긋나지 않게 한다.

```ts
type ThemeId = 'neutral' | 'night' | 'pastel';
type Visibility = 'private' | 'unlisted' | 'public';

type Transform = {
  x: number;
  y: number;
  rotation: number; // radian, 화면 좌표계에서 시계 방향 양수
};

type ObjectBase = {
  id: string; // 문서 안에서 유일한 UUID
  transform: Transform;
  color: string; // #RRGGBB만 허용
};

type MapObject =
  | (ObjectBase & {
      kind: 'wall';
      width: number;
      height: number;
    })
  | (ObjectBase & {
      kind: 'circle';
      radius: number;
    })
  | (ObjectBase & {
      kind: 'bumper';
      radius: number;
      strength: 'soft' | 'normal' | 'strong';
    })
  | (ObjectBase & {
      kind: 'rotor';
      width: number;
      height: number;
      angularVelocity: number; // rad/s
      pivot?: 'right'; // 생략하면 중심축, right이면 transform은 오른쪽 끝 축
    })
  | (ObjectBase & {
      kind: 'moving-platform';
      width: number;
      height: number;
      end: { x: number; y: number };
      periodTicks: number;
      phaseTicks: number;
    });

type MapDocument = {
  schemaVersion: 1;
  finishPace?: 'dramatic-v1'; // arcade-flow-v1 전용 결승 접근 감속
  finishAir?: 'pulse-v1' | 'pulse-v2';
  physicsProfile: 'classic-v1' | 'arcade-flow-v1';
  world: {
    width: number;
    height: number;
  };
  theme: ThemeId;
  spawn: {
    x: number; // 좌상단
    y: number;
    width: number;
    height: number;
  };
  finish: {
    left: number;
    right: number;
    y: number;
  };
  objects: MapObject[];
};

type MarbleAppearance =
  | { kind: 'solid'; color: string }
  | { kind: 'pattern'; patternId: 'stripe' | 'dot'; color: string }
  | { kind: 'emoji'; emoji: string; color: string }
  | { kind: 'image'; assetId: string; fallbackColor: string };

type Participant = {
  id: string;
  name: string;
  appearance: MarbleAppearance;
};

type RaceRule =
  | { kind: 'first' }
  | { kind: 'rank'; targetRank: number }
  | { kind: 'last-finisher' };

type RaceConfig = {
  seed: number; // uint32
  prngVersion: 'mulberry32-v1';
  simulationVersion: string;
  participants: Participant[];
  rule: RaceRule;
  timeoutTicks: 7200;
};
```

맵 제목, 설명, 제작자, 공개 범위, 게시 시각은 DB 메타데이터로 분리한다. 참가자의 이름과 스킨은 MapDocument 안에 저장하지 않는다. Rapier handle, Pixi 객체, 함수, Blob, DOM 참조도 저장하지 않는다.

출발 구역과 결승선은 문서 루트에 각각 하나씩 존재한다. 초기 결승선은 수평이며 위에서 아래 방향의 통과만 인정한다. 다중 출발점, 회전 결승선, 체크포인트는 schemaVersion을 확장할 때 도입한다.

## 3. 제한과 검증

| 항목 | 초기 계약 |
|---|---|
| JSON 입력 | UTF-8 최대 256 KiB, 객체 최대 220개 |
| 정적 객체 | wall, circle, bumper 합계 최대 200개 |
| 움직이는 장애물 | rotor, moving-platform 합계 최대 20개 |
| 월드 | 너비 8~40, 높이 10~150 |
| 값 | 모든 수치 finite, NaN/Infinity 불가 |
| 변환 | 월드 안의 좌표, 게시 시 소수 4자리로 정규화 |
| 직사각형 | width와 height 0.15 이상, 월드 크기 이내 |
| 원형 | radius 0.1~5 |
| 회전 속도 | 절댓값 최대 3 rad/s |
| 왕복 주기 | 60~3600 tick의 정수, phase는 0 이상 period 미만 |
| 출발 | 최소 2개의 비중첩 슬롯, 선택 인원만큼 슬롯 필요 |
| 결승 | left < right, 너비 0.6 이상, spawn 아래쪽 |
| 참가자 | 2~100명, 이름 공백 정리 후 1~24 글자, 고유 participantId |
| 텍스트 | 제어 문자와 양방향 제어 문자 제한, HTML로 렌더링하지 않음 |
| 금지 | 임의 URL, base64 이미지, HTML, SVG, script, 함수 문자열 |

Zod의 엄격한 판별 유니온을 사용해 kind에 맞지 않는 필드와 알 수 없는 필드를 거부한다. `Object.assign`으로 검증되지 않은 객체를 내부 설정에 합치지 않는다. JSON byte 제한은 파싱 전에, 중첩/배열 제한은 파싱과 스키마 검증 과정에서 적용한다.

좌표의 유효성은 도형 전체의 외접 범위와 운동 경로도 확인한다. 원점만 안에 있고 나머지가 월드 밖인 객체를 허용하지 않는다. 출발 슬롯은 초기 collider와 겹치지 않아야 한다. 벽끼리의 교차처럼 정상적으로 필요한 도형 중첩은 무조건 오류로 처리하지 않는다.

스키마 오류는 `objectId`, `field`, `code`, 사용자 메시지를 반환한다. 에디터는 해당 객체를 선택하고 문제 위치를 표시한다. `schemaVersion`이 지원 범위보다 높으면 억지로 변환하지 말고 지원하지 않는 버전이라고 안내한다.

## 4. 실행 파이프라인

```text
검증된 MapDocument + RaceConfig
→ 문서 정규화와 canonical hash
→ 참가자 ID 검증, 이름과 외형 준비
→ 출발 슬롯 생성과 seeded shuffle
→ Rapier world를 새로 생성
→ 고정 순서로 body와 collider 생성
→ 시작 전 준비 화면
→ countdown
→ 고정 tick 실행
→ 완료 이벤트 누적
→ results
→ dispose
```

오브젝트 생성 순서는 canonical object ID 순서, 참가자 생성 순서는 저장된 participant 배열 순서로 고정한다. 이벤트 큐에서 받은 순서 그대로 body를 삭제하지 않는다. 해당 tick의 이벤트를 먼저 모으고 안정적으로 정렬한 뒤 적용한다.

매 실행은 새 world를 만든다. 이전 게임의 solver 상태와 collider handle을 재사용해 재시작 결과가 달라지는 문제를 피한다. 이미지 로딩 완료 시각은 물리 시작 순서나 구슬 생성 순서를 바꾸면 안 된다. 이미지가 늦으면 기본 외형으로 시작해도 동일한 물리를 유지한다.

## 5. 게임 루프

하나의 루프만 사용한다. Pixi 자동 ticker와 별도 RAF에서 각각 world.step을 호출하면 안 된다.

```text
매 렌더 프레임:
  숨김 상태이거나 paused면 물리 누적을 진행하지 않는다.
  monotonic clock의 경과를 얻는다.
  accumulator += min(realDelta, 0.1) * playbackSpeed
  최대 8회까지:
    accumulator >= fixedDt이면 simulation.stepOneTick()
    accumulator -= fixedDt
  너무 큰 backlog는 wall time만 버리고 느린 기기 안내를 표시한다.
  이전/현재 물리 snapshot 사이를 렌더 보간한다.
  renderer.render()
```

버리는 것은 현실 시간의 적체다. 물리 tick 자체를 건너뛰거나 상태를 순간 이동하지 않는다. 모든 결과 시간은 `tick * fixedDt`로 계산한다. 탭이 다시 보이면 사용자가 재개하고 현실 시간 기준의 backlog는 초기화한다.

재생 속도 0.5, 1, 2는 실행할 tick 수에만 영향을 준다. world timestep, gravity, collider 설정은 바꾸지 않는다. 렌더 FPS가 달라도 같은 tick에 도달한 물리 상태는 같아야 한다.

## 6. 장애물 구현

wall과 circle은 fixed collider를 사용한다. bumper도 fixed circle을 사용하고 strength는 프로필 내부의 검증된 반발력 프리셋에만 매핑한다. 초기에는 접촉마다 임의의 추가 impulse를 반복하는 구현을 피한다. 접촉력 조합 규칙까지 회귀 테스트에 포함한다.

rotor와 moving-platform은 kinematic body를 사용한다. position-based kinematic body는 다음 tick의 위치와 회전을 설정하는 API를 이용해 물리 엔진이 속도를 계산하도록 한다. 시뮬레이션 도중 위치를 무작위로 순간 변경하지 않는다. [E1]

`rotor.pivot`을 생략하면 기존 중심축 회전이다. `pivot: 'right'`이면 transform.x/y는 고정된 오른쪽 끝 축이며, 직사각형 collider의 local 중심을 `(-width/2, 0)`으로 둔다. 렌더러와 미니맵도 local x 범위 `[-width, 0]`을 쓰며, 초기 출발 슬롯 겹침은 실제 collider 중심으로 검사한다. 연속 회전의 월드 경계는 끝 축 기준 반경 `hypot(width, height/2)` 전체로 검사한다. 축 위치를 옮기는 확장 출발 장면에서도 같은 의미를 유지한다.

회전은 `initialRotation + angularVelocity * tick * fixedDt`, 왕복은 정수 tick 기반 삼각파와 선형 보간으로 계산한다. 물리 상태 계산에 `Date.now`, `Math.random`, 렌더 delta, 외부 네트워크 상태를 사용하지 않는다. 초기에는 사인파 운동을 사용하지 않는다.

빠른 구슬의 벽 관통 방지를 위해 구슬의 CCD를 검토하고 기본 프로필에서 켠 상태로 벤치마크한다. CCD를 켰다고 모든 센서 통과가 보장된다고 가정하지 않는다. 얇은 벽, 좁은 틈, 고속 회전봉과의 충돌 테스트가 필요하다. Rapier 문서는 CCD를 빠른 물체의 접촉 누락을 줄이기 위한 기법으로 설명한다. [E2]

`finishPace: 'dramatic-v1'`은 arcade-flow-v1에만 선택해서 적용하는 결승 접근 규칙이다. 결승 12단위 전부터 마지막 5단위까지 위치 기반 smoothstep으로 linear damping을 0→6으로 올리고, 마지막 5단위에서는 6을 유지한다. 매 fixed tick의 물리 step 전에 실제 활성 구슬 body에 설정한다. 구간 밖으로 돌아가거나 유효 통과 없이 결승 y 아래로 나간 활성 구슬은 감쇠를 0으로 되돌린다. 완주 body는 기존 규칙대로 비활성화한다. 참가자 이름/ID/순위는 감속 계산에 사용하지 않는다. 중력·장애물 회전·접촉 킥·정체 해소 규칙과 결승 판정 tick은 유지한다. 기존 맵에서 필드를 생략하면 감속하지 않으며, 규칙은 map hash와 simulationVersion에 구분해 기록한다. 실제 역전 빈도와 완주 시간은 별도 물리 검증 대상이다.

`finishAir: 'pulse-v1'`은 arcade-flow-v1의 선택 에어 팝 규칙이다. 결승 5~1.7단위 전, 결승 x 범위에 좌우 0.8을 더한 영역에 적격 활성 구슬이 있고 직전 분출 후 72tick이 지나면 해당 구슬들을 위로 띄운다. y 속도 -6.8을 목표로 최대 30의 위쪽 impulse와 바깥 방향 1.4의 측면 impulse를 적용한다. 이름/ID/순위를 사용하지 않고, 구슬마다 최대 한 번만 발동한다. 이미 위로 움직이는 구슬은 다음 분출을 기다릴 수 있다. 분출 후 24tick은 결승 감쇠를 풀고 18tick 동안 원래 감쇠로 복귀한다. core의 tick/위치/구슬 수 이벤트로 렌더러와 선택 효과음을 연결한다. 에어 팝 코스는 기존 결승 0.4배 연출을 해제해 회전봉이 정상 속도로 움직인다. 생략한 과거 맵은 종전 규칙을 유지한다. 실제 상승/역전/완주는 별도 검증 대상이다.

`finishAir: 'pulse-v2'`는 강화된 에어 팝이다. pulse-v1의 구슬별 1회 제한·영역·72tick 재충전을 유지하고, 목표 y 속도 -10.5·최대 위쪽 impulse 34·측면 impulse 1.8을 사용한다. 분출 후 36tick 동안 결승 감쇠를 풀고 24tick에 걸쳐 현재 위치의 감쇠로 복귀한다. pulse-v1의 원래 값은 보존하고 문서의 버전별 preset을 선택한다. 실제 상승 높이와 완주/역전은 별도 검증 대상이다.

## 7. 결승 판정과 결과

시각적인 결승 영역 및 sensor 외에, 각 tick에서 구슬 중심의 이전 위치와 현재 위치를 연결한 선분이 결승 수평선을 아래 방향으로 가로질렀는지 검사한다. sensor 이벤트만 기다리면 빠르게 통과한 경우를 놓칠 수 있으므로 선분 통과 판정을 병행한다.

통과 조건은 `previousY < finishY <= currentY`다. 해당 선분의 교차 x가 `[left, right]` 안이면 인정한다. 교차 비율은 `(finishY - previousY) / (currentY - previousY)`로 계산하고 0~1로 제한한다. 이미 완료된 participantId는 다시 처리하지 않는다.

정렬 키는 `(tick, round(crossingFraction * 1_000_000))`다. 같은 키는 공동 순위이며 다음 순위는 참가자 수만큼 건너뛴다. 예: 1, 1, 3. 동일 순위 내 출력 정렬은 ID로 안정화할 수 있지만 승자 결정에는 영향을 주지 않는다. 이 비율은 tick 안의 경로를 선형으로 근사한 판정이며 연속 시간의 절대적 실측값이라고 주장하지 않는다.

완주 구슬은 해당 tick의 결과를 모은 다음 고정 ID 순서로 collider를 제거하고 시각적인 결승 연출은 별도 renderer에서 처리한다. 결승에 먼저 도착한 구슬이 나머지 구슬의 통과를 막지 않도록 한다.

시간 초과, 월드 이탈, 비정상 숫자 상태는 별도 DNF 또는 실행 오류다. 실행 오류를 DNF로 숨겨서 정상 결과를 만들지 않는다. 정상 완료와 실패한 시뮬레이션은 구분한다. y 좌표로 정렬한 진행 순서는 `예상 진행 순서`로만 표시하며 확정 순위는 결승 통과 이후에만 제공한다.

## 8. 재현성과 공정성

같은 시드만 저장해서는 충분하지 않다. 실행 manifest는 다음을 함께 보관한다.

```ts
type RunManifest = {
  mapVersionId: string | null; // 로컬 실행은 null
  mapHash: string;
  mapSnapshot?: MapDocument; // 로컬 재실행에만 사용
  seed: number;
  prngVersion: 'mulberry32-v1';
  engineVersion: string; // 실제 설치된 Rapier 버전
  engineBuildHash: string;
  simulationVersion: string; // 규칙, spawn, 이벤트 순서의 버전
  physicsProfile: 'classic-v1' | 'arcade-flow-v1';
  fixedDt: number;
  participantOrder: string[];
  assignedSlots: Array<{ participantId: string; x: number; y: number }>;
  rule: RaceRule;
  timeoutTicks: number;
};
```

초기 seed는 `crypto.getRandomValues`로 생성하고 이후 난수는 테스트 벡터가 고정된 PRNG 모듈에서만 얻는다. 출발 슬롯에 Fisher-Yates 방식의 무작위 순열을 적용하고 bounded integer 변환에는 편향을 줄이는 rejection sampling을 사용한다. 결과를 보고 시드를 다시 뽑아 사용자가 원하는 당첨자를 만드는 기능은 제공하지 않는다.

Rapier JS/WASM은 동일한 버전과 초기 조건에 대한 플랫폼 간 결정성을 설명하지만, 객체 생성/제거 순서와 외부 계산이 동일해야 한다고 명시한다. 특히 Math.sin과 Math.cos 등은 플랫폼에 따라 초기 조건 차이를 만들 수 있다고 경고한다. [E3]

따라서 브라우저 간 반복 실행 결과를 직접 검증하기 전에는 완전히 동일한 리플레이라고 홍보하지 않는다. 엔진 버전이 지원되지 않는 과거 결과는 요약만 제공한다. 새 엔진으로 실행하려면 새로운 레이스로 구분한다.

hash와 seed 공개는 변조 방지나 균등 확률의 증명이 아니다. 자유 맵의 출발 위치, 형상, 장애물 구성은 결과에 편향을 만들 수 있고, 클라이언트는 조작될 수 있다. 좌우 위치별 승률을 여러 seed로 반복 측정해 설계 오류를 찾되 통계 테스트 통과를 법적 추첨 인증처럼 표시하지 않는다. 금전이나 경품이 걸린 검증 추첨과 서버 authoritative 실행은 별도 설계 범위다.

## 9. 에디터 모델

맵 문서와 편집 상태를 분리한다. selection, 도구, 카메라, 가이드선, history는 게시 JSON에 포함하지 않는다. 잠금과 숨김은 초기에는 편집 세션 설정이며 게임 실행 물체를 몰래 숨기는 기능이 아니다.

에디터 명령은 `AddObject`, `DeleteObjects`, `TransformObjects`, `UpdateProperties`, `DuplicateObjects`, `UpdateSpawn`, `UpdateFinish`, `ChangeTheme`로 시작한다. 각 명령은 적용과 되돌리기에 필요한 최소 before/after 상태를 가진다.

드래그 시작에 기존 값을 기록하고, 움직이는 동안 renderer preview만 갱신한다. pointerup에 단일 명령을 커밋한다. Esc 또는 pointercancel은 프리뷰를 취소한다. 같은 드래그가 수백 개의 Undo 항목을 만들면 안 된다. Undo 후 새로운 명령이 들어오면 redo stack을 비운다. 초기 history 상한은 100개다.

multi-select는 shift 클릭과 선택 박스, 복제는 새 UUID 발급, 회전 스냅은 15도, 위치 스냅은 0.25 월드 단위를 초기값으로 한다. 수치 입력과 키보드 미세 이동을 제공한다. 모든 pointer 좌표는 screen→world 역변환 후 hit test한다. transform handle은 화면에서 일정한 크기로 유지한다.

테스트 모드 진입 시 문서를 deep snapshot으로 고정해 별도의 SimulationCore에 전달한다. 테스트 종료 시 편집 문서는 바뀌지 않고 카메라와 선택 상태를 복원한다. 테스트 중 편집 명령은 막는다. 수정한 맵으로 다시 테스트하려면 이전 런타임을 dispose하고 새로 시작한다.

## 10. 꾸미기와 텍스처

로컬 사진은 브라우저에서 미리보기와 크롭만 수행하고 Blob은 IndexedDB에 저장한다. 업로드되는 파일은 서버가 다시 검증한다. 엔진은 assetId를 보관하고 renderer가 권한 있는 URL로 texture를 읽는다. 일시적인 signed URL을 영구 JSON에 저장하지 않는다.

구슬마다 같은 사진을 중복 디코딩하지 않고 assetId와 콘텐츠 hash 기준으로 캐시한다. 256x256 WebP를 기본으로 하고 원형 마스크를 사용한다. 텍스처 실패, 삭제, 권한 만료 시 fallbackColor로 렌더링한다. 이때 물리와 레이스 결과는 변하지 않는다.

이모지는 OS별 렌더링 차이가 있을 수 있으므로 첫 출시에서 외형의 완전한 일치를 보장하지 않는다. 자체 이미지 세트를 추가할 때 해당 자산의 라이선스를 확인한다. 이름은 길이를 제한하고 작은 화면에서 확대 라벨이나 DOM 목록으로 보완한다.

## 11. 반드시 만드는 회귀 테스트

| 범주 | 사례 |
|---|---|
| 계약 | 잘못된 schemaVersion, 중복 ID, 무한값, 허용하지 않은 필드, 최대 수량 |
| 좌표 | 확대/축소/카메라 이동 뒤 hit test와 drag 이동 일치 |
| 물리 | 구슬-벽, 구슬-구슬, 범퍼, 회전봉, 왕복 발판, 얇은 벽 |
| 시간 | 30/60/120 렌더 FPS에서 같은 tick 결과, 0.5/1/2배속 동일 결과 |
| 완료 | 고속 결승선 통과, 동시 도착, 재진입, DNF, 모든 참가자 미완주 |
| 초기화 | 이미지 로딩 순서 변경, 20회 reset, mount/unmount 반복 |
| 재현 | 같은 맵/manifest 20회 반복, 브라우저별 hash와 결과 비교 |
| 에디터 | 각 명령 undo/redo, 드래그 취소, 테스트 종료 후 초안 불변 |
| 저장 | export/import 왕복, revision 충돌, 손상된 로컬 데이터 |

시뮬레이션 단위 테스트는 Canvas 없이 Rapier 코어를 실행한다. 브라우저 재현성 검증은 Chromium, Firefox, WebKit 자동화와 실제 iOS Safari를 구분해서 기록한다. Playwright WebKit 통과를 실제 iPhone 검증이라고 부르지 않는다.

## 출처

- [E1] Rapier rigid body와 kinematic 이동: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
- [E2] Rapier CCD: https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/
- [E3] Rapier 결정성 조건과 외부 수학 연산 주의: https://rapier.rs/docs/user_guides/javascript/determinism/
