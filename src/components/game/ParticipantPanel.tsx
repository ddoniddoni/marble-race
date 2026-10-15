"use client";
import { useState } from "react";
import type { Participant } from "@/game/contracts/schemas";
import {
  numberedNames,
  expandParticipantNames,
} from "@/game/contracts/participants";
export default function ParticipantPanel({
  draft,
  onDraft,
  participants,
  inputError,
}: {
  draft: string;
  onDraft: (text: string) => void;
  participants: readonly Participant[];
  inputError: string | null;
}) {
  const [start, setStart] = useState("1");
  const [amount, setAmount] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const parsed = expandParticipantNames(draft);
  const draftCount = parsed.ok ? parsed.names.length : null;
  const message = error ?? inputError ?? (parsed.ok ? null : parsed.message);
  function fillNumbers() {
    try {
      if (!start.trim() || !amount.trim())
        throw new Error("시작 번호와 구슬 수를 입력해 주세요.");
      onDraft(numberedNames(Number(start), Number(amount)));
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "숫자를 확인해 주세요.",
      );
    }
  }
  return (
    <section
      className="participant-panel control-section"
      aria-labelledby="participants-heading"
    >
      <div className="section-heading">
        <h2 id="participants-heading">이름을 넣어 주세요</h2>
        <span>{draftCount === null ? "입력 확인" : `${draftCount}개 구슬`}</span>
      </div>
      <label htmlFor="participant-names">이름 · 숫자 · 짧은 문구</label>
      <p className="helper" id="names-help">
        입력한 이름·숫자가 바로 구슬에 새겨집니다. 민수*9는 민수 구슬 9개예요.
        쉼표·줄바꿈으로 구분하고 합계 2~10,000개까지 넣어 주세요.
      </p>
      <textarea
        id="participant-names"
        value={draft}
        maxLength={300000}
        aria-describedby="names-help names-status"
        aria-invalid={Boolean(inputError || !parsed.ok)}
        placeholder={"민수*9\n지영*3\n행운 7"}
        onChange={(event) => {
          onDraft(event.target.value);
          setError(null);
        }}
      />
      <div className="input-count">
        <button
          type="button"
          onClick={() => {
            onDraft("민수*9\n지영*3\n행운 7");
            setError(null);
          }}
        >
          이름 예시 넣기
        </button>
      </div>
      <details className="number-generator">
        <summary>연속 번호로 채우기</summary>
        <div className="number-fields">
          <label htmlFor="number-start">
            시작 번호
            <input
              id="number-start"
              type="number"
              min={-999999}
              max={999999}
              step="1"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label htmlFor="number-count">
            구슬 수
            <input
              id="number-count"
              type="number"
              min="2"
              max="10000"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <button onClick={fillNumbers}>번호 채우기</button>
        </div>
      </details>
      <p id="names-status" className={message ? "participant-error" : "participant-status"} role="status">
        {message ?? `${participants.length}개 구슬에 실시간 반영 중`}
      </p>
      <details className="applied-list">
        <summary>
          현재 적용된 구슬 <span>{participants.length}개</span>
        </summary>
        <ol>
          {participants.slice(0, 100).map((participant, index) => (
            <li key={participant.id}>
              <b>{index + 1}</b>
              <span>{participant.name}</span>
            </li>
          ))}
        </ol>
        {participants.length > 100 && <p className="helper">앞 100개 미리보기 · 경기 순위표에서 모든 결과를 볼 수 있어요.</p>}
      </details>
      <p className="helper">
        이름당 24글자. 구슬 수에 맞춰 출발 공간이 넓어지고 모두 함께 출발합니다. 잘못된 입력은 마지막 명단을 유지합니다.
        경기 중 명단을 수정하면 새 명단의 대기 화면으로 돌아갑니다.
      </p>
    </section>
  );
}
