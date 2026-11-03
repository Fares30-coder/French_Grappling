import {
  DataTexture,
  FloatType,
  type Material,
  Matrix4,
  Quaternion,
  RGBAFormat,
  Vector3,
} from 'three';

/**
 * Dual quaternion skinning with stretch, as Blender's "Preserve Volume" (the videos): three only
 * skins linearly, which collapses a limb whose two halves twist far apart (the upper arm's twist
 * bone), like a candy wrapper.
 *
 * Each bone's skin transform, in the mesh's own space, is split into a stretch along the bone's
 * rest axis (blended linearly, an affine 3x4) followed by a rigid move (a dual quaternion,
 * blended and normalised). The shader reads both from a float texture: 5 texels per bone (rigid
 * real part, rigid dual part, the 3 rows of the stretch).
 */

export const TEXELS_PER_BONE = 5;

export function createBoneTexture(boneCount: number): DataTexture {
  const texture = new DataTexture(
    new Float32Array(TEXELS_PER_BONE * 4 * boneCount),
    TEXELS_PER_BONE,
    boneCount,
    RGBAFormat,
    FloatType,
  );
  texture.needsUpdate = true;
  return texture;
}

const rigidPart = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

/**
 * Writes bone `index` of the texture data: `rigid` (rotation + translation) after `stretch`
 * (any affine), both mapping the rest mesh to the posed one in the mesh's space.
 */
export function writeBone(data: Float32Array, index: number, rigid: Matrix4, stretch: Matrix4) {
  rigidPart.copy(rigid).decompose(position, rotation, scale);
  const o = index * TEXELS_PER_BONE * 4;
  const [x, y, z, w] = [rotation.x, rotation.y, rotation.z, rotation.w];
  const [tx, ty, tz] = [position.x, position.y, position.z];
  // Dual part: 0.5 * (t, 0) * q.
  data.set(
    [
      x,
      y,
      z,
      w,
      0.5 * (tx * w + ty * z - tz * y),
      0.5 * (-tx * z + ty * w + tz * x),
      0.5 * (tx * y - ty * x + tz * w),
      -0.5 * (tx * x + ty * y + tz * z),
    ],
    o,
  );
  const e = stretch.elements; // column-major
  data.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], o + 8);
}

/** The shader's blend in JavaScript, for tests: a rest point and its 4 bone influences. */
export function skinPoint(
  data: Float32Array,
  point: Vector3,
  influences: ReadonlyArray<readonly [number, number]>,
): Vector3 {
  const fetch = (bone: number, texel: number) => {
    const o = (bone * TEXELS_PER_BONE + texel) * 4;
    return [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0, data[o + 3] ?? 0] as const;
  };
  const first = influences[0]?.[0] ?? 0;
  const pivot = fetch(first, 0);
  const real = [0, 0, 0, 0];
  const dual = [0, 0, 0, 0];
  const stretched = new Vector3();
  for (const [bone, weight] of influences) {
    const r = fetch(bone, 0);
    const d = fetch(bone, 1);
    const sign = r[0] * pivot[0] + r[1] * pivot[1] + r[2] * pivot[2] + r[3] * pivot[3] < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) {
      real[k] = (real[k] ?? 0) + (r[k] ?? 0) * weight * sign;
      dual[k] = (dual[k] ?? 0) + (d[k] ?? 0) * weight * sign;
    }
    const row = (texel: number) => {
      const m = fetch(bone, texel);
      return m[0] * point.x + m[1] * point.y + m[2] * point.z + m[3];
    };
    stretched.x += row(2) * weight;
    stretched.y += row(3) * weight;
    stretched.z += row(4) * weight;
  }
  const length = Math.hypot(real[0] ?? 0, real[1] ?? 0, real[2] ?? 0, real[3] ?? 0);
  const [rx, ry, rz, rw] = real.map((c) => c / length) as [number, number, number, number];
  const [dx, dy, dz, dw] = dual.map((c) => c / length) as [number, number, number, number];
  const q = new Quaternion(rx, ry, rz, rw);
  const t = new Vector3(
    2 * (-dw * rx + dx * rw - dy * rz + dz * ry),
    2 * (-dw * ry + dx * rz + dy * rw - dz * rx),
    2 * (-dw * rz - dx * ry + dy * rx + dz * rw),
  );
  return stretched.applyQuaternion(q).add(t);
}

const PARS = /* glsl */ `
uniform highp sampler2D dqBoneTexture;
vec4 dqTexel( const in float bone, const in int texel ) {
  return texelFetch( dqBoneTexture, ivec2( texel, int( bone ) ), 0 );
}
`;

// Runs where three computes the skinned normal (before the position): blends the rigid parts.
const BLEND = /* glsl */ `
#ifdef USE_SKINNING
  vec4 dqPivot = dqTexel( skinIndex.x, 0 );
  vec4 dqReal = vec4( 0.0 );
  vec4 dqDual = vec4( 0.0 );
  vec4 dqS0 = vec4( 0.0 );
  vec4 dqS1 = vec4( 0.0 );
  vec4 dqS2 = vec4( 0.0 );
  for ( int i = 0; i < 4; i ++ ) {
    float bone = skinIndex[ i ];
    float weight = skinWeight[ i ];
    vec4 r = dqTexel( bone, 0 );
    float signedWeight = dot( r, dqPivot ) < 0.0 ? - weight : weight;
    dqReal += r * signedWeight;
    dqDual += dqTexel( bone, 1 ) * signedWeight;
    dqS0 += dqTexel( bone, 2 ) * weight;
    dqS1 += dqTexel( bone, 3 ) * weight;
    dqS2 += dqTexel( bone, 4 ) * weight;
  }
  float dqLength = length( dqReal );
  dqReal /= dqLength;
  dqDual /= dqLength;
  vec3 dqT = 2.0 * ( dqReal.w * dqDual.xyz - dqDual.w * dqReal.xyz + cross( dqReal.xyz, dqDual.xyz ) );
  objectNormal = objectNormal + 2.0 * cross( dqReal.xyz, cross( dqReal.xyz, objectNormal ) + dqReal.w * objectNormal );
  #ifdef USE_TANGENT
    objectTangent = objectTangent + 2.0 * cross( dqReal.xyz, cross( dqReal.xyz, objectTangent ) + dqReal.w * objectTangent );
  #endif
#endif
`;

const MOVE = /* glsl */ `
#ifdef USE_SKINNING
  vec4 dqRest = vec4( transformed, 1.0 );
  vec3 dqStretched = vec3( dot( dqS0, dqRest ), dot( dqS1, dqRest ), dot( dqS2, dqRest ) );
  transformed = dqStretched + 2.0 * cross( dqReal.xyz, cross( dqReal.xyz, dqStretched ) + dqReal.w * dqStretched ) + dqT;
#endif
`;

/** Makes a skinned material use the dual quaternions of `texture` instead of three's bones. */
export function applyDualQuaternionSkinning(material: Material, texture: DataTexture) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.dqBoneTexture = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', `#include <skinning_pars_vertex>\n${PARS}`)
      .replace('#include <skinnormal_vertex>', BLEND)
      .replace('#include <skinning_vertex>', MOVE);
  };
  material.customProgramCacheKey = () => 'tatamap-dq-skinning';
}
