"""Finds limbs that pass through each other while the site interpolates between two steps.

    python3 tools/blender/transitions.py content/techniques/<slug>.json [--from 9 --to 13]

The viewer moves the hip linearly and turns each bone along a great circle (with a smoothstep in
time, which does not change the path); interpolate_fighter below does the same. Two segments that come within THRESHOLD cm of each other mid-transition while they are
clearly apart at both ends are reported: they cross, or brush through each other, on screen.
Pure Python (no Blender, no numpy).
"""

import json
import math
import sys

THRESHOLD_CM = 3.0
CLEARANCE_CM = 4.0  # how much closer than at both ends it must get to count
SAMPLES = 40

SEGMENTS = [
    ('neck', 'hip'), ('neck', 'head'),
    ('neck', 'elbowL'), ('elbowL', 'handL'), ('neck', 'elbowR'), ('elbowR', 'handR'),
    ('hip', 'kneeL'), ('kneeL', 'footL'), ('hip', 'kneeR'), ('kneeR', 'footR'),
]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def seg_dist(p1, q1, p2, q2):
    """Shortest distance between segments p1-q1 and p2-q2 (Ericson)."""
    d1, d2, r = sub(q1, p1), sub(q2, p2), sub(p1, p2)
    a, e, f = dot(d1, d1), dot(d2, d2), dot(d2, r)
    clamp = lambda v: min(1.0, max(0.0, v))  # noqa: E731
    if a < 1e-9 and e < 1e-9:
        return math.dist(p1, p2)
    if a < 1e-9:
        s, t = 0.0, clamp(f / e)
    else:
        c = dot(d1, r)
        if e < 1e-9:
            t, s = 0.0, clamp(-c / a)
        else:
            b = dot(d1, d2)
            den = a * e - b * b
            s = clamp((b * f - c * e) / den) if den > 1e-9 else 0.0
            t = (b * s + f) / e
            if t < 0:
                t, s = 0.0, clamp(-c / a)
            elif t > 1:
                t, s = 1.0, clamp((b - c) / a)
    pa = [p1[i] + d1[i] * s for i in range(3)]
    pb = [p2[i] + d2[i] * t for i in range(3)]
    return math.dist(pa, pb)


# Same as apps/web/src/features/viewer/interpolate.ts: the hip moves in a straight line, each
# bone turns along a great circle and changes length linearly, so limbs keep their length.
BONE_CHAIN = [
    ('hip', 'neck'), ('neck', 'head'),
    ('neck', 'elbowL'), ('elbowL', 'handL'), ('neck', 'elbowR'), ('elbowR', 'handR'),
    ('hip', 'kneeL'), ('kneeL', 'footL'), ('hip', 'kneeR'), ('kneeR', 'footR'),
]


def _slerp_unit(a, b, t, eps=1e-6):
    angle = math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b)))))
    if angle < eps:
        return a
    if angle > math.pi - eps:
        # Opposite directions: turn through a fixed perpendicular (as the viewer does).
        helper = (0, 1, 0) if abs(a[1]) < 0.9 else (1, 0, 0)
        axis = (a[1] * helper[2] - a[2] * helper[1], a[2] * helper[0] - a[0] * helper[2],
                a[0] * helper[1] - a[1] * helper[0])
        n = math.hypot(*axis)
        perp = [(axis[1] * a[2] - axis[2] * a[1]) / n, (axis[2] * a[0] - axis[0] * a[2]) / n,
                (axis[0] * a[1] - axis[1] * a[0]) / n]
        c, s = math.cos(math.pi * t), math.sin(math.pi * t)
        return [a[i] * c + perp[i] * s for i in range(3)]
    s = math.sin(angle)
    ka, kb = math.sin((1 - t) * angle) / s, math.sin(t * angle) / s
    return [a[i] * ka + b[i] * kb for i in range(3)]


def interpolate_fighter(a, b, t):
    out = {'hip': [a['hip'][i] + (b['hip'][i] - a['hip'][i]) * t for i in range(3)]}
    for parent, child in BONE_CHAIN:
        da = [a[child][i] - a[parent][i] for i in range(3)]
        db = [b[child][i] - b[parent][i] for i in range(3)]
        la, lb = math.hypot(*da), math.hypot(*db)
        if la == 0 or lb == 0:
            off = [da[i] + (db[i] - da[i]) * t for i in range(3)]
        else:
            u = _slerp_unit([x / la for x in da], [x / lb for x in db], t)
            off = [x * (la + (lb - la) * t) for x in u]
        out[child] = [out[parent][i] + off[i] for i in range(3)]
    return out


def shares_joint(s1, s2):
    return bool(set(s1) & set(s2))


def check_transition(step_a, step_b):
    """Pairs that pass through each other between two poses: [(label, min_cm, at_t, ends)]."""
    fa, fb = step_a['fighters'], step_b['fighters']
    pairs = []
    ids = ['me', 'opponent']
    for i, f1 in enumerate(ids):
        for f2 in ids[i:]:
            for k, s1 in enumerate(SEGMENTS):
                for s2 in SEGMENTS[k if f1 == f2 else 0:]:
                    if f1 == f2 and (s1 == s2 or shares_joint(s1, s2)):
                        continue
                    pairs.append((f1, s1, f2, s2))
    # Interpolated once per sample, shared by every pair.
    frames = [{f: interpolate_fighter(fa[f], fb[f], n / SAMPLES) for f in ids}
              for n in range(SAMPLES + 1)]
    found = []
    for f1, s1, f2, s2 in pairs:
        series = [seg_dist(g[f1][s1[0]], g[f1][s1[1]], g[f2][s2[0]], g[f2][s2[1]])
                  for g in frames]
        low = min(series)
        ends = min(series[0], series[-1])
        if low < THRESHOLD_CM and ends - low > CLEARANCE_CM:
            label = f'{f1}.{s1[0]}-{s1[1]} x {f2}.{s2[0]}-{s2[1]}'
            found.append((label, round(low, 1), round(series.index(low) / SAMPLES, 2),
                          (round(series[0], 1), round(series[-1], 1))))
    return sorted(found, key=lambda x: x[1])


def main(argv):
    path = argv[1]
    first = int(argv[argv.index('--from') + 1]) if '--from' in argv else 1
    with open(path, encoding='utf-8') as fh:
        steps = json.load(fh)['steps']
    last = int(argv[argv.index('--to') + 1]) if '--to' in argv else len(steps)
    total = 0
    for i in range(first, last):
        found = check_transition(steps[i - 1]['pose'], steps[i]['pose'])
        total += len(found)
        print(f'{i} -> {i + 1}: ' + ('OK' if not found else f'{len(found)} pass-through'))
        for label, low, at, ends in found:
            print(f'    {label}: {low} cm at t={at} (ends {ends[0]}, {ends[1]})')
    print(f'{total} pass-through(s)')
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
