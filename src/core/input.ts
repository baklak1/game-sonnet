// Дотики й миша: тап, перетягування (пан), щипок (зум), колесо.
import type { Camera } from './camera';

export interface InputHandlers {
  tap(x: number, y: number): void;
  longPress?(x: number, y: number): void;
  drag?(x: number, y: number): boolean; // true — перетягування перехоплено (наприклад, привид будівлі)
}

export function attachInput(el: HTMLElement, cam: Camera, h: InputHandlers): void {
  const pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  let pinchDist = 0, pinchZoom = 1;
  let moved = false;
  let dragCaptured = false;
  let lpTimer: number | undefined;

  const rel = (e: PointerEvent): [number, number] => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const [x, y] = rel(e);
    pts.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now() });
    moved = false;
    dragCaptured = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchZoom = cam.zoom;
      clearTimeout(lpTimer);
    } else if (pts.size === 1 && h.longPress) {
      lpTimer = window.setTimeout(() => {
        if (!moved && pts.size === 1) {
          moved = true;
          h.longPress!(x, y);
        }
      }, 550);
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const [x, y] = rel(e);
    const dx = x - p.x, dy = y - p.y;
    p.x = x;
    p.y = y;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) cam.setZoom(pinchZoom * (d / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true;
      return;
    }
    if (!moved && Math.hypot(x - p.sx, y - p.sy) > 8) {
      moved = true;
      clearTimeout(lpTimer);
    }
    if (moved) {
      if (dragCaptured || (h.drag && h.drag(x, y))) {
        dragCaptured = true;
        return;
      }
      cam.pan(dx, dy);
    }
  });

  const end = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    clearTimeout(lpTimer);
    if (!p) return;
    pts.delete(e.pointerId);
    if (!moved && pts.size === 0 && performance.now() - p.t < 600) h.tap(p.x, p.y);
    if (pts.size < 2) pinchDist = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => {
    pts.delete(e.pointerId);
    clearTimeout(lpTimer);
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    cam.setZoom(cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
}
