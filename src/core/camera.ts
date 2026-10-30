// Камера: центр у світових координатах і ціле число пікселів пристрою на світовий піксель
// (тоді піксель-арт лишається чітким при будь-якому масштабі).
import { W, H } from '../sim/geo';

export class Camera {
  x = 350;
  y = 205;
  /** Бажаний масштаб: CSS px на світовий піксель. */
  zoom = 2;
  cssW = 800;
  cssH = 400;
  dpr = 1;
  /** Відступи інтерфейсу (CSS px), щоб центр карти не ховався під панелями. */
  padL = 0;
  padR = 0;
  padT = 0;
  padB = 0;

  get scale(): number {
    return Math.max(1, Math.round(this.zoom * this.dpr));
  }

  get effZoom(): number {
    return this.scale / this.dpr;
  }

  minZoom(): number {
    return Math.max(0.5, Math.min(this.cssW / W, this.cssH / H) * 0.95);
  }

  setZoom(z: number, ax?: number, ay?: number): void {
    const before = ax !== undefined && ay !== undefined ? this.toWorld(ax, ay) : null;
    this.zoom = Math.max(this.minZoom(), Math.min(6, z));
    if (before && ax !== undefined && ay !== undefined) {
      const after = this.toWorld(ax, ay);
      this.x += before[0] - after[0];
      this.y += before[1] - after[1];
    }
    this.clamp();
  }

  pan(dxCss: number, dyCss: number): void {
    const z = this.effZoom;
    this.x -= dxCss / z;
    this.y -= dyCss / z;
    this.clamp();
  }

  clamp(): void {
    const z = this.effZoom;
    const halfW = this.cssW / z / 2, halfH = this.cssH / z / 2;
    const m = 30;
    this.x = halfW * 2 >= W + m * 2 ? W / 2 : Math.max(halfW - m, Math.min(W + m - halfW, this.x));
    this.y = halfH * 2 >= H + m * 2 ? H / 2 : Math.max(halfH - m, Math.min(H + m - halfH, this.y));
  }

  /** Зсув у пікселях пристрою для setTransform. */
  origin(): [number, number] {
    const sc = this.scale;
    return [Math.round((this.cssW * this.dpr) / 2 - this.x * sc), Math.round((this.cssH * this.dpr) / 2 - this.y * sc)];
  }

  toWorld(cx: number, cy: number): [number, number] {
    const [ox, oy] = this.origin();
    const sc = this.scale;
    return [(cx * this.dpr - ox) / sc, (cy * this.dpr - oy) / sc];
  }

  toScreen(wx: number, wy: number): [number, number] {
    const [ox, oy] = this.origin();
    const sc = this.scale;
    return [(wx * sc + ox) / this.dpr, (wy * sc + oy) / this.dpr];
  }

  focus(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }
}
