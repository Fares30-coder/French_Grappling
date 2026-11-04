"""Tatamap pose format for the Python tools (pure Python: no Blender, no numpy).

The current skeleton is v2-21 (ADR 0004): 21 points in cm per fighter, y up. This mirrors
packages/shared: JOINTS / BONE_CHAIN (skeleton-v2-21.ts), upgrade_fighter / upgrade_pose
(upgrade-v1-v2.ts: an upgraded pose looks exactly as the v1-11 one did on the site and in the
videos) and interpolate_fighter (interpolate.ts). Keep them in step.

    from tatamap_pose import load_technique, interpolate_fighter
"""

import json
import math

SKELETON = 'v2-21'
JOINTS = [
    'head', 'nose', 'neck', 'chest', 'pelvis', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
    'handL', 'handR', 'handTipL', 'handTipR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR',
    'toeL', 'toeR',
]
# Drawn bones (skeleton-v2-21.ts BONES_V2_21).
BONES = [('pelvis', 'chest'), ('chest', 'neck')] + [
    b for s in 'LR' for b in (
        ('neck', 'shoulder' + s), ('shoulder' + s, 'elbow' + s), ('elbow' + s, 'hand' + s),
        ('hand' + s, 'handTip' + s))
] + [
    b for s in 'LR' for b in (
        ('pelvis', 'hip' + s), ('hip' + s, 'knee' + s), ('knee' + s, 'foot' + s),
        ('foot' + s, 'toe' + s))
]
# Interpolation chain, root (pelvis) first (BONE_CHAIN_V2_21).
ROOT = 'pelvis'
BONE_CHAIN = [('pelvis', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('head', 'nose')] + [
    b for s in 'LR' for b in (
        ('neck', 'shoulder' + s), ('shoulder' + s, 'elbow' + s), ('elbow' + s, 'hand' + s),
        ('hand' + s, 'handTip' + s))
] + [
    b for s in 'LR' for b in (
        ('pelvis', 'hip' + s), ('hip' + s, 'knee' + s), ('knee' + s, 'foot' + s),
        ('foot' + s, 'toe' + s))
]


# --- vectors ---------------------------------------------------------------------------------

def _add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _scale(a, k):
    return [a[0] * k, a[1] * k, a[2] * k]


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _len(a):
    return math.hypot(*a)


def _unit(a):
    n = _len(a)
    return _scale(a, 1 / n) if n > 1e-9 else [0.0, 0.0, 0.0]


# --- v1-11 -> v2-21 (upgrade-v1-v2.ts) ------------------------------------------------------

CHEST_CM, NOSE_CM = 34, 11
SHOULDER_SIDE_CM, SHOULDER_DROP_CM, UPPER_ARM_CM, SHOULDER_SHIFT_CM = 17, 5, (27, 34), 10
HIP_SIDE_CM, HIP_DROP_CM = 9, 5
FINGERS_CM, TOE_CM = 8, 15


def _frame_v1(f):
    up = _unit(_sub(f['neck'], f['hip']))
    thighs = _sub(_add(f['kneeL'], f['kneeR']), _scale(f['hip'], 2))
    fwd = _sub(thighs, _scale(up, _dot(thighs, up)))
    if _len(fwd) < 3:
        fwd = _sub([1, 0, 0], _scale(up, up[0]))
    fwd = _unit(fwd)
    left = _unit(_cross(up, fwd))
    return up, _unit(_cross(left, up)), left


def _bend_dir(root, mid, end, straight, fade_cm=6):
    off = _sub(mid, _scale(_add(root, end), 0.5))
    w = min(1.0, _len(off) / fade_cm)
    d = _add(_scale(_unit(off) if _len(off) > 1e-6 else straight, w), _scale(straight, 1 - w))
    return _unit(d) if _len(d) > 1e-6 else straight


def _shoulder(nominal, elbow, fwd, up):
    near = min(1.0, _len(_sub(elbow, nominal)) / 8)
    reach = _scale(_unit(_sub(elbow, nominal)), near)
    s = _add(nominal, _scale(_add(_scale(fwd, max(0.0, _dot(reach, fwd))),
                                  _scale(up, max(0.0, _dot(reach, up)))), 3))
    d = _len(_sub(elbow, s))
    lo, hi = UPPER_ARM_CM
    shift = min(d - lo, 0.0) + max(d - hi, 0.0)
    shift = max(-SHOULDER_SHIFT_CM, min(SHOULDER_SHIFT_CM, shift)) * min(1.0, d / 8)
    return _add(s, _scale(_unit(_sub(elbow, s)), shift))


def _on_the_mat(base, direction, cm, fwd):
    """Tilts a tip's direction up so its end rests on the mat instead of going through it."""
    if base[1] + direction[1] * cm >= 0:
        return direction
    y = max(-1.0, -base[1] / cm)
    flat = [direction[0], 0.0, direction[2]]
    if _len(flat) < 1e-6:
        flat = [fwd[0], 0.0, fwd[2]]
    if _len(flat) < 1e-6:
        flat = [1.0, 0.0, 0.0]
    return _add(_scale(_unit(flat), math.sqrt(1 - y * y)), [0.0, y, 0.0])


def upgrade_fighter(f):
    """A v1-11 fighter (11 joints) as a v2-21 one (21 points), placed like the humanoid did."""
    up, fwd, left = _frame_v1(f)
    out = {'head': f['head'], 'nose': _add(f['head'], _scale(fwd, NOSE_CM)), 'neck': f['neck'],
           'chest': _add(f['hip'], _scale(up, CHEST_CM)), 'pelvis': f['hip']}
    for s, sign in (('L', 1), ('R', -1)):
        elbow, hand, knee, foot = f['elbow' + s], f['hand' + s], f['knee' + s], f['foot' + s]
        nominal = _sub(_add(f['neck'], _scale(left, SHOULDER_SIDE_CM * sign)),
                       _scale(up, SHOULDER_DROP_CM))
        hip = _sub(_add(f['hip'], _scale(left, HIP_SIDE_CM * sign)), _scale(up, HIP_DROP_CM))
        knee_dir = _bend_dir(hip, knee, foot, fwd)
        shin = _unit(_sub(foot, knee))
        flat = _sub(knee_dir, _scale(shin, _dot(knee_dir, shin)))
        foot_dir = _unit(flat) if _len(flat) > 1e-3 else fwd
        out['shoulder' + s] = _shoulder(nominal, elbow, fwd, up)
        out['elbow' + s] = elbow
        out['hand' + s] = hand
        out['handTip' + s] = _add(hand, _scale(
            _on_the_mat(hand, _unit(_sub(hand, elbow)), FINGERS_CM, fwd), FINGERS_CM))
        out['hip' + s] = hip
        out['knee' + s] = knee
        out['foot' + s] = foot
        out['toe' + s] = _add(foot, _scale(_on_the_mat(foot, foot_dir, TOE_CM, fwd), TOE_CM))
    return {j: [out[j][0], max(0.0, out[j][1]), out[j][2]] for j in JOINTS}


def upgrade_pose(pose):
    """Any stored pose as a v2-21 pose (a v2-21 pose is returned as it is)."""
    if pose['skeleton'] == SKELETON:
        return pose
    if pose['skeleton'] != 'v1-11':
        raise ValueError(f"unknown skeleton {pose['skeleton']!r}")
    out = dict(pose, skeleton=SKELETON)
    out['fighters'] = {fid: upgrade_fighter(f) for fid, f in pose['fighters'].items()}
    return out


def load_technique(path):
    """A technique file with every pose upgraded to v2-21 (the file is not changed)."""
    with open(path, encoding='utf-8') as fh:
        technique = json.load(fh)
    for step in technique['steps']:
        step['pose'] = upgrade_pose(step['pose'])
    return technique


def to_v1_fighter(f):
    """The 11 v1-11 joints of a v2-21 fighter (pelvis -> hip), for tools still built on them."""
    keep = ['head', 'neck', 'elbowL', 'handL', 'elbowR', 'handR', 'kneeL', 'footL', 'kneeR',
            'footR']
    return dict({j: f[j] for j in keep}, hip=f['pelvis'])


# --- interpolation (interpolate.ts) ----------------------------------------------------------

def slerp_unit(a, b, t, eps=1e-6):
    angle = math.acos(max(-1.0, min(1.0, _dot(a, b))))
    if angle < eps:
        return a
    if angle > math.pi - eps:
        # Opposite directions: turn through a fixed perpendicular (as the viewer does).
        helper = (0, 1, 0) if abs(a[1]) < 0.9 else (1, 0, 0)
        axis = _cross(a, helper)
        perp = _scale(_cross(axis, a), 1 / _len(axis))
        return _add(_scale(a, math.cos(math.pi * t)), _scale(perp, math.sin(math.pi * t)))
    s = math.sin(angle)
    return _add(_scale(a, math.sin((1 - t) * angle) / s), _scale(b, math.sin(t * angle) / s))


def interpolate_fighter(a, b, t):
    """The root moves in a straight line, each bone of BONE_CHAIN turns along a great circle and
    changes length linearly; no joint goes lower than at both steps."""
    out = {ROOT: [a[ROOT][i] + (b[ROOT][i] - a[ROOT][i]) * t for i in range(3)]}
    for parent, child in BONE_CHAIN:
        da, db = _sub(a[child], a[parent]), _sub(b[child], b[parent])
        la, lb = _len(da), _len(db)
        if la == 0 or lb == 0:
            off = [da[i] + (db[i] - da[i]) * t for i in range(3)]
        else:
            off = _scale(slerp_unit(_scale(da, 1 / la), _scale(db, 1 / lb), t), la + (lb - la) * t)
        joint = _add(out[parent], off)
        joint[1] = max(joint[1], min(a[child][1], b[child][1]))  # never through the mat
        out[child] = joint
    return out
