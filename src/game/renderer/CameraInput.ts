import type { CameraPoint } from "./camera";

type CameraActions = {
  zoom: (point: CameraPoint, factor: number) => void;
  pan: (delta: CameraPoint) => void;
  minimap: (point: CameraPoint) => boolean;
  fit: () => void;
  follow: () => void;
};

/** Canvas-only input. No additional RAF, document handlers or physics state. */
export class CameraInput {
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  private disposed = false;
  readonly listenerCount = 8;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly actions: CameraActions) {
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-description", "\ud720 \ub610\ub294 \ub450 \ubc88 \ud074\ub9ad\uc73c\ub85c \ud655\ub300\ud558\uace0 \ub4dc\ub798\uadf8\ub85c \uc774\ub3d9\ud569\ub2c8\ub2e4. \ubc29\ud5a5\ud0a4\ub85c \uc774\ub3d9, \ub354\ud558\uae30\u00b7\ube7c\uae30\ub85c \ud655\ub300\u00b7\ucd95\uc18c, 0 \ub610\ub294 Home\uc73c\ub85c \uc804\uccb4 \ub9de\ucda4, Escape\ub85c \uad6c\uc2ac \ub530\ub77c\uac00\uae30.");
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.end);
    canvas.addEventListener("pointercancel", this.end);
    canvas.addEventListener("lostpointercapture", this.end);
    canvas.addEventListener("dblclick", this.doubleClick);
    canvas.addEventListener("keydown", this.key);
  }
  private point(event: MouseEvent): CameraPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private wheel = (event: WheelEvent) => {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1;
    const pixels = Math.max(-400, Math.min(400, event.deltaY * unit));
    this.actions.zoom(this.point(event), Math.exp(-pixels * 0.002));
  };
  private down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    this.canvas.focus({ preventScroll: true });
    if (this.actions.minimap(this.point(event))) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const delta = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    if (!drag.moved && Math.hypot(delta.x, delta.y) < 3) return;
    drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    this.canvas.style.cursor = "grabbing";
    this.actions.pan(delta);
  };
  private end = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const id = this.drag.id;
    this.drag = null;
    this.canvas.style.cursor = "grab";
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  };
  private doubleClick = (event: MouseEvent) => {
    event.preventDefault();
    const point = this.point(event);
    if (this.actions.minimap(point)) return;
    this.actions.zoom(point, event.shiftKey ? 0.5 : 2);
  };
  private key = (event: KeyboardEvent) => {
    const distance = event.shiftKey ? 160 : 64;
    const pan: Record<string, CameraPoint> = {
      ArrowLeft: { x: distance, y: 0 }, ArrowRight: { x: -distance, y: 0 },
      ArrowUp: { x: 0, y: distance }, ArrowDown: { x: 0, y: -distance },
    };
    if (pan[event.key]) {
      event.preventDefault();
      this.actions.pan(pan[event.key]!);
    } else if (["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      this.actions.zoom({ x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 },
        event.key === "-" || event.key === "_" ? 1 / 1.25 : 1.25);
    } else if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      this.actions.fit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.actions.follow();
    }
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const drag = this.drag;
    this.drag = null;
    if (drag && this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.end);
    this.canvas.removeEventListener("pointercancel", this.end);
    this.canvas.removeEventListener("lostpointercapture", this.end);
    this.canvas.removeEventListener("dblclick", this.doubleClick);
    this.canvas.removeEventListener("keydown", this.key);
  }
}
