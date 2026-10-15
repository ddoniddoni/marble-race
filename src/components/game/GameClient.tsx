"use client";
import dynamic from "next/dynamic";
const GameCanvas = dynamic(() => import("./GameCanvas"), {
  ssr: false,
  loading: () => (
    <main className="loading" role="status">
      구슬 실험실을 준비하고 있습니다…
    </main>
  ),
});
export default function GameClient() {
  return <GameCanvas />;
}
