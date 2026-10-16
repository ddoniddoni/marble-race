"use client";
import RaceOverlay from "./RaceOverlay";
import type { RefObject } from "react";
import type { Snapshot } from "@/game/runtime/GameRuntime";
import { CAMERA_ZOOM, type ViewMode } from "@/game/renderer/camera";
const phaseLabels = {
  ready: "출발 대기",
  countdown: "출발 카운트다운",
  finished: "경기 종료",
  running: "진행 중",
  paused: "일시정지",
  disposed: "종료",
};
export default function GameBoard({
  host,
  snapshot,
  error,
  count,
  onRetry,
  onView,
  onNames,
  onZoom,
  onRegion,
  onSound,
}: {
  host: RefObject<HTMLDivElement | null>;
  snapshot: Snapshot | null;
  error: string | null;
  count: number;
  onRetry: () => void;
  onView: (mode: ViewMode) => void;
  onNames: (visible: boolean) => void;
  onZoom: (zoom: number) => void;
  onRegion: (id: string) => void;
  onSound: () => void;
}) {
  const ready = snapshot !== null && !error;
  const overview = snapshot?.camera.mode === "overview";
  return (
    <section className="board-panel" aria-label="구슬 레이스">
      <div className="stage-status">
        <span
          className={`status-dot ${snapshot?.phase === "running" ? "is-running" : ""}`}
        />
        <span>
          {error
            ? "화면 오류"
            : snapshot
              ? phaseLabels[snapshot.phase]
              : "준비 중"}
        </span>
        <span className="status-divider" />
        <span data-testid="sim-time">
          {snapshot?.simulationSeconds.toFixed(2) ?? "0.00"} s
        </span>
        <span className="count-chip">{count} MARBLES</span>
      </div>
      <ViewControls
        ready={Boolean(ready)}
        snapshot={snapshot}
        count={count}
        onView={onView}
        onNames={onNames}
        onZoom={onZoom}
        onRegion={onRegion}
        onSound={onSound}
      />
      <div className="playfield">
        <div className="canvas-host" ref={host} />
        {ready && snapshot && <RaceOverlay snapshot={snapshot} />}
        {!ready && (
          <div className="board-message" role={error ? "alert" : "status"}>
            {error ? (
              <>
                <strong>장면을 불러오지 못했습니다.</strong>
                <p>{error}</p>
                <button onClick={onRetry}>다시 불러오기</button>
              </>
            ) : (
              <p>구슬을 준비하고 있습니다…</p>
            )}
          </div>
        )}
      </div>
      <div className="tracking-bar">
        <span>{overview ? (snapshot.camera.zoom > 1 ? "자유 탐색 · 드래그로 이동" : "전체 코스 · 휠로 확대") : count > 100 && snapshot?.tick === 0 ? "출발 구슬 전체 보기" : "선두 그룹 따라가기"}</span>
        <span>
          {Math.round(snapshot?.camera.top ?? 0)} /{" "}
          {snapshot?.camera.worldHeight ?? 72}
        </span>
      </div>
    </section>
  );
}

function ViewControls({
  ready,
  snapshot,
  count,
  onView,
  onNames,
  onZoom,
  onRegion,
  onSound,
}: {
  ready: boolean;
  snapshot: Snapshot | null;
  count: number;
  onView: (mode: ViewMode) => void;
  onNames: (visible: boolean) => void;
  onZoom: (zoom: number) => void;
  onRegion: (id: string) => void;
  onSound: () => void;
}) {
  const namesVisible = snapshot?.namesVisible ?? count <= 20;
  const zoom = snapshot?.camera.zoom ?? 1;
  const overview = snapshot?.camera.mode === "overview";
  const limits = overview ? CAMERA_ZOOM.overview : CAMERA_ZOOM.follow;
  return (
    <div className="view-controls" aria-label="화면 보기 설정">
      <button disabled={!ready} aria-pressed={snapshot?.soundEnabled ?? false} onClick={onSound}>
        소리 {snapshot?.soundEnabled ? "켜짐" : "꺼짐"}
      </button>
      <button
        onClick={() => onView(overview ? "follow" : "overview")}
        disabled={!ready}
      >
        <span aria-hidden="true">{overview ? "◎" : "⊞"}</span>{" "}
        {overview ? "구슬 따라가기" : "전체 코스 보기"}
      </button>
      <button
        aria-pressed={namesVisible}
        disabled={!ready}
        onClick={() => onNames(!namesVisible)}
      >
        {namesVisible ? "이름표 숨기기" : "이름표 표시"}
      </button>
      <div className="zoom-controls">
        <button
          aria-label="화면 축소"
          disabled={!ready || zoom <= limits.min}
          onClick={() => onZoom(overview ? zoom / 1.25 : zoom - 0.25)}
        >
          −
        </button>
        <output aria-label="확대 배율">{zoom.toFixed(2)}×</output>
        <button
          aria-label="화면 확대"
          disabled={!ready || zoom >= limits.max}
          onClick={() => onZoom(overview ? zoom * 1.25 : zoom + 0.25)}
        >
          +
        </button>
      </div>
      {overview && (
        <button disabled={!ready} onClick={() => onView("overview")} aria-label="전체 코스에 맞추기">
          전체 맞춤
        </button>
      )}
      {overview && (
        <div className="course-navigation" role="group" aria-label="구역별 확대">
          <span className="course-navigation-label">구역 이동</span>
          {snapshot?.cameraRegions.map((region) => (
            <button
              key={region.id}
              disabled={!ready}
              aria-label={`${region.label} 확대`}
              aria-pressed={snapshot.camera.regionId === region.id}
              title={region.title}
              onClick={() => onRegion(region.id)}
            >
              {region.label}
            </button>
          ))}
          <span className="course-gesture-hint">휠 확대 · 드래그 이동</span>
        </div>
      )}
    </div>
  );
}
