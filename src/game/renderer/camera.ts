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


export const CAMERA_ZOOM = {
  follow: { min: 0.75, max: 2 },
  overview: { min: 1, max: 64 },
} as const;
export type CameraPoint = { x: number; y: number };
export type CameraBounds = CameraPoint & { width: number; height: number };
export type CourseRegion = { id: string; label: string; title: string; bounds: CameraBounds };

export function overviewCameraFrame(
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  center: CameraPoint,
  zoom = 1,
) {
  const safeZoom = Math.max(CAMERA_ZOOM.overview.min, Math.min(CAMERA_ZOOM.overview.max, zoom));
  const scale = Math.max(0.0001, Math.min(
    Math.max(1, viewport.width - 32) / world.width,
    Math.max(1, viewport.height - 32) / world.height,
  ) * safeZoom);
  const position = (size: number, length: number, target: number) =>
    length * scale <= Math.max(1, size - 32)
      ? (size - length * scale) / 2
      : Math.max(size - 16 - length * scale, Math.min(16, size / 2 - target * scale));
  return {
    ...cameraFromTransform(world, viewport,
      position(viewport.width, world.width, center.x),
      position(viewport.height, world.height, center.y), scale, safeZoom),
    mode: "overview" as const,
  };
}

export function courseRegions(
  scene: import("../core/types").Scene,
  spawn?: CameraBounds,
): readonly CourseRegion[] {
  const offset = scene.startLayout?.courseOffset ?? { x: 0, y: 0 };
  const courseWidth = Math.max(1, scene.width - offset.x * 2);
  const launch = scene.startLayout?.bounds ?? spawn ?? {
    x: offset.x, y: 0, width: courseWidth, height: Math.min(8, scene.height),
  };
  const finishY = scene.finish?.y ?? scene.height - 1;
  const stageStart = launch.y + launch.height;
  const stages = scene.stages?.length ? scene.stages : Array.from({ length: 4 }, (_, index) => ({
    y: stageStart + Math.max(1, finishY - stageStart) * index / 4,
    title: `${index + 1}구역`,
  }));
  const regions: CourseRegion[] = [
    { id: "start", label: "출발", title: "출발 구역", bounds: launch },
    ...stages.map((stage, index) => {
      const top = Math.max(0, stage.y - 1);
      const bottom = stages[index + 1]?.y ?? Math.min(scene.height, finishY + 1);
      return { id: `stage-${index}`, label: `${index + 1}구역`, title: stage.title,
        bounds: { x: offset.x, y: top, width: courseWidth, height: Math.max(2, bottom - top) } };
    }),
  ];
  regions.push({ id: "finish", label: "결승", title: "결승 입구", bounds: {
    x: (scene.finish?.left ?? scene.width / 2) - 5,
    y: Math.max(0, finishY - 9),
    width: (scene.finish ? scene.finish.right - scene.finish.left : 2) + 10,
    height: Math.min(12, scene.height),
  } });
  return regions;
}
