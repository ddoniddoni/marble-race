export type ViewMode = "follow" | "overview";
export function cameraFrame(
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  frontY: number,
  mode: ViewMode,
  frontX = world.width / 2,
  zoom = 1,
) {
  const width = Math.max(1, viewport.width - 32);
  const height = Math.max(1, viewport.height - 32);
  const scale =
    mode === "overview"
      ? Math.min(width / world.width, height / world.height)
      : Math.max(width / world.width, height / Math.min(12, world.height)) *
        zoom;
  const visibleHeight = Math.min(world.height, height / scale);
  const visibleWidth = Math.min(world.width, width / scale);
  const top =
    mode === "follow"
      ? Math.max(
          0,
          Math.min(world.height - visibleHeight, frontY - visibleHeight * 0.4),
        )
      : 0;
  const left =
    mode === "follow"
      ? Math.max(
          0,
          Math.min(world.width - visibleWidth, frontX - visibleWidth / 2),
        )
      : 0;
  return {
    top,
    left,
    visibleHeight,
    visibleWidth,
    worldHeight: world.height,
    mode,
    zoom,
    scale,
    x: Math.max(16, (viewport.width - world.width * scale) / 2) - left * scale,
    y: Math.max(16, (viewport.height - world.height * scale) / 2) - top * scale,
  };
}


export function cameraFromTransform(
  world: { width: number; height: number }, viewport: { width: number; height: number },
  x: number, y: number, scale: number, zoom = 1,
) {
  const left = Math.max(0, -x / scale), top = Math.max(0, -y / scale);
  return { top, left, scale, x, y, zoom, mode: "follow" as const, worldHeight: world.height,
    visibleWidth: Math.max(0, Math.min(world.width, (viewport.width - x) / scale) - left),
    visibleHeight: Math.max(0, Math.min(world.height, (viewport.height - y) / scale) - top),
  };
}
export function startCameraFrame(
  world: { width: number; height: number }, viewport: { width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number }, expanded: boolean, zoom = 1,
) {
  const side = viewport.width < 600 ? 12 : 24;
  const top = viewport.width < 600 ? 96 : 84;
  const bottom = expanded ? Math.min(330, viewport.height * 0.47) : 95;
  const width = Math.max(1, viewport.width - side * 2);
  const height = Math.max(1, viewport.height - top - bottom);
  const scale = Math.max(0.0001, Math.min(width / (bounds.width + 0.8), height / (bounds.height + 0.8)) * zoom);
  return cameraFromTransform(world, viewport,
    side + width / 2 - (bounds.x + bounds.width / 2) * scale,
    top + height / 2 - (bounds.y + bounds.height / 2) * scale, scale, zoom);
}
