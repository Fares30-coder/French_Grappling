import { type CameraHint, DEFAULT_CAMERA } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { fitStepCamera, frameCamera, REFERENCE_ASPECT, type Vec3 } from './camera';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.hypot(...a);

describe('frameCamera', () => {
  it("'step' without hint is the default camera, in perspective", () => {
    const f = frameCamera('step', undefined, 800);
    expect(f.projection).toBe('perspective');
    expect(f.position).toEqual(DEFAULT_CAMERA.position);
    expect(f.target).toEqual(DEFAULT_CAMERA.target);
    expect(f.zoom).toBeUndefined();
  });

  it("'step' uses the hint when there is one", () => {
    const hint: CameraHint = { position: [1, 2, 3], target: [4, 5, 6] };
    const f = frameCamera('step', hint, 800);
    expect(f.position).toEqual([1, 2, 3]);
    expect(f.target).toEqual([4, 5, 6]);
  });

  it("'front' looks along -z towards the target", () => {
    const f = frameCamera('front', undefined, 800);
    expect(f.projection).toBe('orthographic');
    const dir = sub(f.target, f.position);
    expect(dir[0]).toBeCloseTo(0);
    expect(dir[1]).toBeCloseTo(0);
    expect(dir[2]).toBeLessThan(0);
  });

  it("'side' looks along -x towards the target", () => {
    const f = frameCamera('side', undefined, 800);
    const dir = sub(f.target, f.position);
    expect(dir[0]).toBeLessThan(0);
    expect(dir[1]).toBeCloseTo(0);
    expect(dir[2]).toBeCloseTo(0);
  });

  it("'top' has an up vector that is not collinear with the view direction", () => {
    const f = frameCamera('top', undefined, 800);
    const dir = sub(f.target, f.position);
    expect(dir[1]).toBeLessThan(0);
    expect(norm(cross(dir, f.up))).toBeGreaterThan(1e-6);
  });

  it('orthographic views are centred on the target', () => {
    const hint: CameraHint = { position: [10, 10, 10], target: [30, 40, 50] };
    for (const view of ['front', 'side', 'top'] as const) {
      const f = frameCamera(view, hint, 800);
      expect(f.target).toEqual([30, 40, 50]);
    }
  });

  it('orthographic zoom is proportional to the viewport width', () => {
    const narrow = frameCamera('front', undefined, 400).zoom ?? 0;
    const wide = frameCamera('front', undefined, 800).zoom ?? 0;
    expect(narrow).toBeGreaterThan(0);
    expect(wide / narrow).toBeCloseTo(2);
  });
});

describe('fitStepCamera', () => {
  const position: Vec3 = [100, 100, 100];
  const target: Vec3 = [0, 50, 0];

  it('keeps the camera at the reference aspect without margin', () => {
    expect(fitStepCamera(position, target, REFERENCE_ASPECT)).toEqual(position);
    expect(fitStepCamera(position, target, 2.5)).toEqual(position);
  });

  it('pulls back along the line of sight for a margin or a narrower viewport', () => {
    const away = fitStepCamera(position, target, REFERENCE_ASPECT, 1.2);
    expect(away[0]).toBeCloseTo(120);
    expect(away[1]).toBeCloseTo(110);
    const narrow = fitStepCamera(position, target, REFERENCE_ASPECT / 2);
    expect(narrow[0]).toBeCloseTo(200);
    expect(narrow[1]).toBeCloseTo(150);
  });
});
