"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Scene } from "@/game/core/types";
import type { GameRuntime, Snapshot } from "@/game/runtime/GameRuntime";
import type { MapDocument, Participant } from "@/game/contracts/schemas";
import { numberedParticipants, parseParticipantNames } from "@/game/contracts/participants";
import { validateMap } from "@/game/contracts/validation";
import ParticipantPanel from "./ParticipantPanel";
import GameBoard from "./GameBoard";
import { TEMPLATES } from "@/game/templates";
import { createBenchmarkMap } from "@/game/fixtures/scenes";
import MeasurementPanel from "./MeasurementPanel";
import MapContractPanel from "./MapContractPanel";
type Selection = { id: string; title: string; map?: MapDocument; stages?: Scene["stages"] };
const benchmarkSelection = { id: "benchmark", title: "물리 계측 장면" };

export default function GameCanvas() {
  const [participants, setParticipants] = useState(() => {
    const sample = parseParticipantNames("민수,지영,서준,하린,도윤,유나");
    if (!sample.ok) throw new Error(sample.message);
    return sample.participants;
  });
  const [startError, setStartError] = useState<string | null>(null);
  const count = participants.length;
  const [draft, setDraft] = useState(() =>
    participants.map((p) => p.name).join("\n"),
  );
  const [selection, setSelection] = useState<Selection>({
    id: TEMPLATES[0]!.id,
    title: TEMPLATES[0]!.title,
    map: TEMPLATES[0]!.map,
    stages: TEMPLATES[0]!.stages,
  });
  const [attempt, setAttempt] = useState(0);
  function loadMap(map: MapDocument) {
    selectCourse({ id: "imported-map", title: "불러온 맵", map });
    setAttempt((n) => n + 1);
  }
  function applyParticipants(next: Participant[], source = selection) {
    const leaveBenchmark = source.id === "benchmark" && next.length !== 20 && next.length !== 100;
    const selected = leaveBenchmark ? TEMPLATES[0]!.map :
      source.map ?? createBenchmarkMap(next.length === 100 ? 100 : 20);
    const result = validateMap(selected, next.length);
    if (!result.ok) return result.errors[0]!.message;
    if (leaveBenchmark)
      setSelection({
        id: TEMPLATES[0]!.id,
        title: TEMPLATES[0]!.title,
        map: TEMPLATES[0]!.map,
        stages: TEMPLATES[0]!.stages,
      });
    if (next.length !== participants.length || next.some((p, i) => p.name !== participants[i]!.name))
      setParticipants(next.map((p, i) => ({ ...p, id: participants[i]?.id ?? p.id })));
    return null;
  }
  function setCount(value: number) {
    const next = numberedParticipants(value);
    setDraft(next.map((p) => p.name).join("\n"));
    setStartError(applyParticipants(next));
  }
  function selectBenchmark() {
    if (count !== 20 && count !== 100) {
      const next = numberedParticipants(20);
      setParticipants(next);
      setDraft(next.map((p) => p.name).join("\n"));
    }
    setStartError(null);
    setSelection(benchmarkSelection);
  }
  function updateDraft(text: string) {
    setDraft(text);
    const parsed = parseParticipantNames(text, participants);
    setStartError(parsed.ok ? applyParticipants(parsed.participants) : parsed.message);
  }
  function selectCourse(next: Selection) {
    setSelection(next);
    const parsed = parseParticipantNames(draft, participants);
    setStartError(parsed.ok ? applyParticipants(parsed.participants, next) : parsed.message);
  }
  function requestStart() {
    const parsed = parseParticipantNames(draft, participants);
    if (!parsed.ok) { setStartError(parsed.message); return false; }
    if (startError) return false;
    if (parsed.participants.length !== participants.length ||
      parsed.participants.some((p, i) => p.name !== participants[i]!.name)) {
      setStartError("입력한 명단을 확인해 주세요. 아직 구슬에 반영되지 않았습니다.");
      return false;
    }
    return true;
  }
  return (
    <main className="roulette-studio">
      <header className="studio-header">
        <Link href="/" aria-label="구슬 유원지" className="brand">
          <span className="brand-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            구슬 유원지<small>MARBLE RUN</small>
          </span>
        </Link>
      </header>
      <LabSession
        attempt={attempt}
        count={count}
        startError={startError}
        onRequestStart={requestStart}
        participants={participants}
        setup={
          <ParticipantPanel
            draft={draft}
            onDraft={updateDraft}
            participants={participants}
            inputError={startError}
          />
        }
        selection={selection}
        onSelection={selectCourse}
        onCount={setCount}
        onBenchmarkScene={selectBenchmark}
        onRetry={() => { setAttempt((n) => n + 1); }}
        onLoadMap={loadMap}
      />
    </main>
  );
}

function useGameRuntime(
  count: number,
  selection: Selection,
  participants: readonly Participant[],
  attempt: number,
) {
  const latestParticipants = useRef(participants);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const [view, setView] = useState<{
    count: number; selection: Selection; attempt: number;
    snapshot: Snapshot | null; error: string | null;
  } | null>(null);
  // Derive loading state from the current setup without an effect-driven render.
  const current = view?.count === count && view.selection === selection && view.attempt === attempt ? view : null;
  const snapshot = current?.snapshot ?? null;
  const error = current?.error ?? null;
  const [debug] = useState(
    () =>
      process.env.NODE_ENV === "development" ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("debug") === "1"),
  );
  useEffect(() => {
    latestParticipants.current = participants;
    if (runtime.current && runtime.current.snapshot().count === participants.length)
      runtime.current.setParticipants(participants);
  }, [participants]);
  useEffect(() => {
    const controller = new AbortController();
    const container = host.current!;
    let instance: GameRuntime | null = null;
    import("@/game/runtime/GameRuntime")
      .then(async ({ GameRuntime }) => {
        controller.signal.throwIfAborted();
        const created = await GameRuntime.create(
          container,
          count,
          controller.signal,
          debug,
          (next) => {
            if (!controller.signal.aborted)
              setView({ count, selection, attempt, snapshot: next, error: null });
          },
          (reason) => {
            if (!controller.signal.aborted)
              setView({ count, selection, attempt, snapshot: null, error: reason.message });
          },
          selection.map ? { map: selection.map, id: selection.id, stages: selection.stages } : undefined,
          latestParticipants.current,
        );
        if (controller.signal.aborted) {
          created.dispose();
          return;
        }
        instance = created;
        runtime.current = created;
        created.setParticipants(latestParticipants.current);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setView({ count, selection, attempt, snapshot: null,
            error: reason instanceof Error ? reason.message : String(reason) });
      });
    return () => {
      controller.abort();
      instance?.dispose();
      runtime.current = null;
    };
  }, [count, debug, selection, attempt]);
  return { host, runtime, snapshot, error, debug };
}
function LabSession({
  attempt,
  startError,
  onRequestStart,
  count,
  participants,
  setup,
  selection,
  onSelection,
  onCount,
  onBenchmarkScene,
  onRetry,
  onLoadMap,
}: {
  count: number;
  participants: readonly Participant[];
  attempt: number;
  startError: string | null;
  onRequestStart: () => boolean;
  setup: ReactNode;
  selection: Selection;
  onSelection: (selection: Selection) => void;
  onCount: (count: number) => void;
  onBenchmarkScene: () => void;
  onRetry: () => void;
  onLoadMap: (map: MapDocument) => void;
}) {
  const { host, runtime, snapshot, error, debug } = useGameRuntime(
    count,
    selection,
    participants,
    attempt,
  );
  const [expanded, setExpanded] = useState(true);
  const running = snapshot?.phase === "running" || snapshot?.phase === "countdown";
  const ready = snapshot !== null && !error;
  useEffect(() => { runtime.current?.setSetupExpanded(expanded); }, [expanded, ready, runtime]);
  const map = useMemo(
    () => selection.map ?? createBenchmarkMap(count === 100 ? 100 : 20),
    [selection.map, count],
  );
  return (
    <div
      className={`workspace ${expanded ? "settings-open" : "settings-closed"}`}
    >
      <GameBoard
        host={host}
        snapshot={snapshot}
        error={error}
        count={count}
        onRetry={onRetry}
        onView={(mode) => runtime.current?.setView(mode)}
        onNames={(visible) => runtime.current?.setNamesVisible(visible)}
        onZoom={(zoom) => runtime.current?.setZoom(zoom)}
        onSound={() => { void runtime.current?.toggleSound(); }}
      />
      <aside className="control-dock" aria-label="플레이 설정">
        <div className="dock-body" id="play-settings" hidden={!expanded}>
          {setup}
          <section className="course-settings" aria-labelledby="course-heading">
            <div className="section-heading">
              <h2 id="course-heading">코스 선택</h2>
              <span>길이 {map.world.height}</span>
            </div>
            <label className="sr-only" htmlFor="course-picker">코스 선택</label>
            <select id="course-picker" className="course-picker" value={selection.id}
              onChange={(event) => {
                const template = TEMPLATES.find((t) => t.id === event.target.value);
                if (template) onSelection(template);
              }}>
              {!TEMPLATES.some((t) => t.id === selection.id) && <option value={selection.id}>{selection.title}</option>}
              {TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
            </select>
            <div className="scene-options" aria-label="기본 번호로 채우기">
              <span>빠른 설정</span>
              {([20, 100, 1000, 5000] as const).map((value) => (
                <button
                  key={value}
                  className={`scene ${count === value ? "selected" : ""}`}
                  aria-pressed={count === value}
                  onClick={() => onCount(value)}
                  aria-label={`${value}개 ${value === 20 ? "가볍게 굴리기" : "가득 채워 굴리기"}`}
                >
                  {value.toLocaleString()}개
                </button>
              ))}
            </div>
            <p className="course-description">
              {TEMPLATES.find((t) => t.id === selection.id)?.description ??
                selection.title}
            </p>
            <details className="tools-panel">
              <summary>
                물리 계측실 <span>LAB</span>
              </summary>
              <button
                className="benchmark-select"
                aria-pressed={selection.id === "benchmark"}
                onClick={onBenchmarkScene}
              >
                P0 계측 장면 선택
              </button>
              <MeasurementPanel
                snapshot={snapshot}
                ready={Boolean(ready)}
                onBenchmark={() => runtime.current?.benchmark()}
              />
            </details>
            <MapContractPanel
              map={map}
              count={count}
              hash={snapshot?.mapHash}
              onLoad={onLoadMap}
            />
            {debug && snapshot && (
              <details className="debug">
                <summary>개발 계측 HUD</summary>
                <dl>
                  <div>
                    <dt>구슬 / 활성</dt>
                    <dd>
                      {count} / {snapshot.awake}
                    </dd>
                  </div>
                  <div>
                    <dt>body / collider</dt>
                    <dd>
                      {snapshot.bodies} / {snapshot.colliders}
                    </dd>
                  </div>
                  <div>
                    <dt>tick · 고정 dt</dt>
                    <dd>{snapshot.tick} · 1/60 s</dd>
                  </div>
                  <div>
                    <dt>초기화 / 버린 현실 시간</dt>
                    <dd>
                      {snapshot.initMs.toFixed(0)} /{" "}
                      {snapshot.droppedMs.toFixed(0)} ms
                    </dd>
                  </div>
                </dl>
              </details>
            )}
          </section>
        </div>
        <div className="transport">
          <button
            className="settings-toggle"
            aria-expanded={expanded}
            aria-controls="play-settings"
            onClick={() => setExpanded(!expanded)}
          >
            <span aria-hidden="true">{expanded ? "⌄" : "⚙"}</span>{" "}
            {expanded ? "설정 접기" : "설정 열기"}
          </button>
          <div className="run-caption">
            <strong>{selection.title}</strong>
            <span>
              {count}개 구슬 ·{" "}
              {snapshot?.phase === "running"
                ? "이름을 따라가 보세요"
                : "내 이름으로 굴려요"}
            </span>
          </div>
          <div className="actions">
            <button disabled={!ready} onClick={() => runtime.current?.reset()}>
              {snapshot?.race ? "새로 섞기" : "처음으로"}
            </button>
            <button
              className="primary"
              disabled={!ready}
              onClick={() => {
                if (running) runtime.current?.pause();
                else {
                  if (snapshot?.phase !== "paused" && !onRequestStart()) { setExpanded(true); return; }
                  runtime.current?.start();
                  setExpanded(false);
                }
              }}
            >
              {running
                ? "일시정지"
                : snapshot?.phase === "paused"
                  ? "재개"
                  : snapshot?.phase === "finished" ? "다시 한 판" : "시작"}
            </button>
          </div>
        </div>
        {startError && <p className="start-error" role="alert">{startError}</p>}
        <p className="notice" role="status">
          {snapshot?.notice ??
            (snapshot?.race
              ? (map.physicsProfile === "arcade-flow-v1"
                ? "전원 도착 후 종료 · 우측 순위 누적 · 구슬끼리는 통과"
                : "전원 도착 후 종료 · 결승 통과 순위가 누적됩니다.")
              : "물리 계측 · 동일한 출발 조건으로 실행합니다.")}
        </p>
      </aside>
    </div>
  );
}
