import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { skinPoint, TEXELS_PER_BONE, writeBone } from './dq-skinning';

const rigid = (axis: Vector3, angle: number, t: Vector3) =>
  new Matrix4().compose(
    t,
    new Quaternion().setFromAxisAngle(axis.normalize(), angle),
    new Vector3(1, 1, 1),
  );
const data = (bones: Array<[Matrix4, Matrix4]>) => {
  const out = new Float32Array(bones.length * TEXELS_PER_BONE * 4);
  bones.forEach(([r, s], i) => {
    writeBone(out, i, r, s);
  });
  return out;
};

describe('dual quaternion skinning', () => {
  const p = new Vector3(3, 20, -4);

  it('applies the stretch then the rigid move of a single bone', () => {
    const r = rigid(new Vector3(1, 2, 3), 1.1, new Vector3(10, -5, 7));
    const s = new Matrix4().makeScale(1, 1.3, 1).setPosition(0, -2, 0);
    const got = skinPoint(data([[r, s]]), p, [[0, 1]]);
    const want = p.clone().applyMatrix4(s).applyMatrix4(r);
    expect(got.distanceTo(want)).toBeLessThan(1e-4);
  });

  it('keeps a limb round where its two halves twist half a turn apart', () => {
    // A point 5 cm off the y axis, half on a bone turned 170 degrees about y: linear blending
    // would bring it almost onto the axis (the candy wrapper).
    const off = new Vector3(5, 10, 0);
    const still = rigid(new Vector3(0, 1, 0), 0, new Vector3());
    const turned = rigid(new Vector3(0, 1, 0), (170 * Math.PI) / 180, new Vector3());
    const id = new Matrix4();
    const got = skinPoint(
      data([
        [still, id],
        [turned, id],
      ]),
      off,
      [
        [0, 0.5],
        [1, 0.5],
      ],
    );
    expect(Math.hypot(got.x, got.z)).toBeCloseTo(5, 3);
    const linear = off
      .clone()
      .applyMatrix4(still)
      .add(off.clone().applyMatrix4(turned))
      .multiplyScalar(0.5);
    expect(Math.hypot(linear.x, linear.z)).toBeLessThan(0.5);
  });

  it('blends like linear skinning when the bones only move together', () => {
    const r = rigid(new Vector3(0, 0, 1), 0.4, new Vector3(1, 2, 3));
    const s1 = new Matrix4().makeScale(1, 1.2, 1);
    const s2 = new Matrix4();
    const got = skinPoint(
      data([
        [r, s1],
        [r, s2],
      ]),
      p,
      [
        [0, 0.3],
        [1, 0.7],
      ],
    );
    const want = p
      .clone()
      .applyMatrix4(s1)
      .multiplyScalar(0.3)
      .add(p.clone().applyMatrix4(s2).multiplyScalar(0.7))
      .applyMatrix4(r);
    expect(got.distanceTo(want)).toBeLessThan(1e-4);
  });
});
