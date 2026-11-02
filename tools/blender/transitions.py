"""Finds limbs that pass through each other while the site interpolates between two steps.

    python3 tools/blender/transitions.py content/techniques/<slug>.json [--from 9 --to 13]

The viewer interpolates each joint linearly (with a smoothstep in time, which does not change the
path). Two segments that come within THRESHOLD cm of each other mid-transition while they are
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


def lerp_fighter(a, b, t):
    return {j: [a[j][i] + (b[j][i] - a[j][i]) * t for i in range(3)] for j in a}


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
    found = []
    for f1, s1, f2, s2 in pairs:
        series = []
        for n in range(SAMPLES + 1):
            t = n / SAMPLES
            g1 = lerp_fighter(fa[f1], fb[f1], t)
            g2 = lerp_fighter(fa[f2], fb[f2], t)
            series.append(seg_dist(g1[s1[0]], g1[s1[1]], g2[s2[0]], g2[s2[1]]))
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
