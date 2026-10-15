export type Summary = {
  frames: number;
  elapsedMs: number;
  fps: number;
  meanFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  longFrames: number;
  meanCpuMs: number;
  meanPhysicsMs: number;
};
export function summarize(
  frames: readonly number[],
  cpu: readonly number[],
  physics: readonly number[],
): Summary {
  const total = frames.reduce((sum, value) => sum + value, 0);
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = (values: readonly number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  return {
    frames: frames.length,
    elapsedMs: total,
    fps: total ? (frames.length * 1000) / total : 0,
    meanFrameMs: mean(frames),
    p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    maxFrameMs: sorted.at(-1) ?? 0,
    longFrames: frames.filter((value) => value > 50).length,
    meanCpuMs: mean(cpu),
    meanPhysicsMs: mean(physics),
  };
}
