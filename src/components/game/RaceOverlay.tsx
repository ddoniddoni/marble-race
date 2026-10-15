"use client";
import { useEffect, useRef, useState } from "react";
import type { Snapshot, RaceSnapshot } from "@/game/runtime/GameRuntime";
const colors = ["#ff687b", "#ffd45e", "#8ff07a", "#66e8f1", "#a78bfa", "#f67cde"];
const ROW_HEIGHT = 42;

function Standings({ race, total, finished }: { race: RaceSnapshot; total: number; finished: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(420);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const last = Math.min(race.standings.length, first + Math.ceil(height / ROW_HEIGHT) + 9);
  const rows = race.standings.slice(first, last);
  return (
    <aside className="ranking-panel" aria-label="결승 통과 순위">
      <div className="ranking-heading"><span>{finished ? "FINAL RESULTS" : "LIVE RESULTS"}</span><b>결승 순위</b></div>
      <div className="ranking-counts" role="status">
        <strong>{race.completed.toLocaleString()}<small> / {total.toLocaleString()} 완주</small></strong>
        <span>남은 구슬 {race.remaining.toLocaleString()} </span>
        {race.dnf > 0 && <span>코스 이탈 {race.dnf.toLocaleString()}개 · DNF</span>}
      </div>
      {race.leaders.length > 0 && !finished && <div className="ranking-live-leaders">
        <small>현재 주행 선두 · 예상 순서</small>
        {race.leaders.map((leader, i) => <div key={leader.index}>
          <b>{i + 1}</b><span style={{ color: colors[leader.index % colors.length] }}>{leader.name}</span><small>#{leader.index + 1}</small>
        </div>)}
      </div>}
      <div className="ranking-columns"><span>순위</span><span>이름</span><span>통과 시간</span></div>
      <div className="ranking-scroll" ref={viewport} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        tabIndex={0} aria-label="전체 순위 목록, 스크롤하여 확인">
        {race.standings.length === 0 ? <p className="ranking-empty">결승선을 통과하면<br />순위가 여기에 쌓입니다.</p> :
          <ol className="ranking-list" style={{ height: race.standings.length * ROW_HEIGHT }}>
            {rows.map((entry, offset) => <li key={entry.index} aria-posinset={first + offset + 1}
              aria-setsize={race.standings.length} style={{ top: (first + offset) * ROW_HEIGHT, height: ROW_HEIGHT }}>
              <b className={entry.rank === 1 ? "is-first" : ""}>{entry.rank ?? "DNF"}</b>
              <span className="ranking-name" style={{ color: colors[entry.index % colors.length] }}>{entry.name}<small>#{entry.index + 1}</small></span>
              <time>{entry.seconds === null ? "코스 이탈" : `${entry.seconds.toFixed(3)}s`}</time>
            </li>)}
          </ol>}
      </div>
      <p className="ranking-caption">결승 통과 시 확정 · 동시 통과는 공동 순위</p>
    </aside>
  );
}
export default function RaceOverlay({ snapshot }: { snapshot: Snapshot }) {
  const race = snapshot.race;
  if (!race) return null;
  const finished = snapshot.phase === "finished";
  return (
    <>
      {(snapshot.tick > 0 || finished) && <Standings race={race} total={snapshot.count} finished={finished} />}
      {snapshot.tick > 0 && !finished && race.stageLabel && <div className="race-course-caption">{race.stageLabel}</div>}
      {race.countdown !== null && <div className="race-countdown" role="status" aria-live="polite">
        <span>{snapshot.phase === "paused" ? "출발 일시정지" : "READY TO ROLL"}</span>
        <strong key={race.countdown}>{race.countdown}</strong>
        <p>모든 구슬이 끝날 때까지 · 결승 순위 누적</p>
      </div>}
      {race.callout && !finished && snapshot.phase === "running" && <div className="race-callout" key={race.callout}>{race.callout}</div>}
      {race.slowMotion && <div className="final-stretch">첫 결승 진입 <span>0.4× SLOW MOTION</span></div>}
      {finished && <div className="all-race-summary" role="status" aria-live="polite">
        <span>RACE COMPLETE</span><strong>{race.completed.toLocaleString()}개 완주</strong>
        <p>{race.dnf > 0 ? `코스 이탈 ${race.dnf}개 · 전체 결과는 우측에서 확인하세요.` : "모든 구슬이 도착했습니다. 전체 순위는 우측에서 확인하세요."}</p>
        {race.winners[0] && <p>1위 <b style={{ color: colors[race.winners[0].index % colors.length] }}>{race.winners[0].name}</b>{race.winners.length > 1 ? ` 외 ${race.winners.length - 1}개 공동 1위` : ""}</p>}
      </div>}
    </>
  );
}
