"use client";
import { useState } from "react";
import { serializeMap, canonicalizeMap } from "@/game/contracts/canonical";
import { parseMapJson, type ContractError } from "@/game/contracts/validation";
import type { MapDocument } from "@/game/contracts/schemas";

export default function MapContractPanel({
  map,
  count,
  hash,
  onLoad,
}: {
  map: MapDocument;
  count: number;
  hash?: string;
  onLoad: (map: MapDocument) => void;
}) {
  const [text, setText] = useState(() => serializeMap(map));
  const [errors, setErrors] = useState<ContractError[]>([]);
  const [message, setMessage] = useState("");
  function inspect(load: boolean) {
    const result = parseMapJson(text, count);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage("");
      return;
    }
    try {
      const normalized = canonicalizeMap(result.value, count);
      setText(serializeMap(normalized));
      setErrors([]);
      setMessage("검증 완료 · JSON을 canonical 형식으로 정리했습니다.");
      if (load) onLoad(normalized);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "정규화 후 검증에 실패했습니다.",
      );
    }
  }
  function exportJson() {
    const url = URL.createObjectURL(
      new Blob([serializeMap(map)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "marble-map-v1.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="contract-panel">
      <summary>
        맵 JSON 확인 <span>SCHEMA 01</span>
      </summary>
      <p className="helper">
        JSON을 검증해 장면으로 열거나 현재 맵을 내려받으세요. 최대 256 KiB.
      </p>
      <label htmlFor="map-json">맵 문서</label>
      <textarea
        id="map-json"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setErrors([]);
          setMessage("");
        }}
      />
      <div className="json-actions">
        <button onClick={() => inspect(false)}>검증·정규화</button>
        <button onClick={() => inspect(true)}>장면으로 열기</button>
        <button onClick={exportJson}>JSON 내보내기</button>
      </div>
      {errors.length > 0 && (
        <ul className="contract-errors" role="alert">
          {errors.slice(0, 8).map((error) => (
            <li
              key={`${error.objectId ?? "$"}:${error.field}:${error.code}:${error.message}`}
            >
              <strong>{error.field}</strong> · {error.message}
              {error.objectId && <small>객체 {error.objectId}</small>}
            </li>
          ))}
          {errors.length > 8 && <li>외 {errors.length - 8}개 오류</li>}
        </ul>
      )}
      {message && (
        <p role="status" className="contract-status">
          {message}
        </p>
      )}
      <p className="hash">
        <span>SHA-256 · 현재 장면</span>
        <code data-testid="map-hash">{hash || "계산 중…"}</code>
      </p>
    </details>
  );
}
