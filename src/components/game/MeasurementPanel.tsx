import type { Snapshot } from "@/game/runtime/GameRuntime";
export default function MeasurementPanel({
  snapshot,
  ready,
  onBenchmark,
}: {
  snapshot: Snapshot | null;
  ready: boolean;
  onBenchmark: () => void;
}) {
  const measuring = snapshot?.measurementSeconds != null;
  return (
    <section className="control-section measure">
      <p className="eyebrow">60초 계측</p>
      <h2>움직임을 숫자로 확인</h2>
      <p className="helper">
        새 장면으로 시작해 60초 동안 측정합니다. 측정 중에는 이 탭을 열어
        두세요.
      </p>
      <button
        className="measure-button"
        disabled={!ready || measuring}
        onClick={onBenchmark}
      >
        {measuring
          ? `측정 중 · ${Math.floor(snapshot?.measurementSeconds ?? 0)} / 60초`
          : "60초 측정 시작"}
        <span aria-hidden="true">↗</span>
      </button>
      <dl className="metrics">
        <div>
          <dt>평균 FPS</dt>
          <dd data-testid="fps">
            {snapshot && snapshot.fps > 0 ? snapshot.fps.toFixed(1) : "—"}
          </dd>
        </div>
        <div>
          <dt>p95 프레임</dt>
          <dd>
            {snapshot && snapshot.p95Ms > 0 ? snapshot.p95Ms.toFixed(1) : "—"}
            <small> ms</small>
          </dd>
        </div>
      </dl>
      <p className="metric-note">위 수치는 최근 최대 240프레임 기준입니다.</p>
      {snapshot?.results.length ? (
        <div className="results">
          <h3>완료된 60초 측정</h3>
          <ol>
            {snapshot.results.map((result) => (
              <li key={result.runId}>
                <strong>{result.fps.toFixed(1)} FPS</strong>
                <span>
                  p95 {result.p95FrameMs.toFixed(1)} ms · 긴 프레임{" "}
                  {result.longFrames}회
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
