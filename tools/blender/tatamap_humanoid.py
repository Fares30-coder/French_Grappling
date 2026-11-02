"""Humanoid mannequins for Tatamap videos, driven by the 11 v1-11 joints.

Run inside Blender after tatamap_rig.py (it reuses its helpers):

    exec(open('/path/to/tools/blender/tatamap_rig.py').read())
    exec(open('/path/to/tools/blender/tatamap_humanoid.py').read())
    build_humanoids()                         # one organic body per fighter
    bake_humanoids('content/techniques/<slug>.json')  # keys every frame, site timing

v1-11 has no shoulders, no hip joints, no hands or feet, and no torso orientation. They are
derived per frame (ADR 0004's problem, solved here only for rendering):
- up = hip -> neck; forward = the thighs' direction across the spine (knees are in front of the
  body in nearly every grappling pose); left = up x forward, as in `mirroredFighters`.
- shoulders = neck +/- 17 cm sideways, 5 cm down; hip joints = hip +/- 9 cm, 5 cm down;
  wrist 7 cm before the hand point; toes along the forward direction, across the shin.
- limb twist: arms turn with the direction the elbow points to, legs with the knee's; the thumb
  is opposite the elbow point, the top of the foot faces the knee.
Hands (palm, four fingers, thumb) and feet (heel, arch, five toes) are rigid, in a relaxed
shape. Body weights are computed here, not by Blender's automatic weights: each vertex follows
the bones whose surface it is on, so a bent thigh or arm no longer drags the pelvis or the back.
The animation follows the site: each step held DEFAULT_HOLD_MS, then a smoothstep transition
of the next step's transitionMs, bones turned as on the site (_interpolate_fighter).
"""

import json
import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

HUMANOID_SUFFIX = '_humanoid'


# --- Derived points (Tatamap cm, y up) ------------------------------------------------------

def _v(p):
    return Vector(p)


MAX_TURN_DEG = 15  # per frame (30 fps): a pop in the derived facing or roll becomes a quick turn


def _turn_towards(a, b, max_deg):
    """Unit vector b, or a turned towards b by at most max_deg."""
    if a.angle(b, 0.0) <= math.radians(max_deg):
        return b.copy()
    axis = a.cross(b)
    if axis.length < 1e-6:
        axis = a.orthogonal()
    return Matrix.Rotation(math.radians(max_deg), 3, axis.normalized()) @ a


def _frame(f, prev_forward=None):
    """Orthonormal body frame (up, forward, left) of a v1-11 fighter."""
    hip, neck = _v(f['hip']), _v(f['neck'])
    up = (neck - hip).normalized()
    thighs = _v(f['kneeL']) + _v(f['kneeR']) - 2 * hip
    fwd = thighs - up * thighs.dot(up)
    if fwd.length < 3:
        fwd = prev_forward.copy() if prev_forward is not None else Vector((1, 0, 0))
        fwd -= up * fwd.dot(up)
    fwd.normalize()
    if prev_forward is not None:  # the torso turns at most MAX_TURN_DEG per frame
        before = prev_forward - up * prev_forward.dot(up)
        if before.length > 1e-3:
            fwd = _turn_towards(before.normalized(), fwd, MAX_TURN_DEG)
    left = up.cross(fwd).normalized()
    fwd = left.cross(up).normalized()
    return up, fwd, left


def _bend_dir(root, mid, end, straight_dir, fade_cm=6):
    """Where a mid joint (elbow, knee) points; `straight_dir` when the limb is straight."""
    off = mid - (root + end) / 2
    w = min(1.0, off.length / fade_cm)
    d = (off.normalized() if off.length > 1e-6 else straight_dir) * w + straight_dir * (1 - w)
    return d.normalized() if d.length > 1e-6 else straight_dir


UPPER_ARM_CM = (21, 36)  # shoulder -> elbow kept in this range (v1-11 measures from the neck)
SHOULDER_SHIFT_CM = 7


def _shoulder(nominal, elbow, fwd, up):
    """Shoulder point, moved like a shoulder blade so the upper arm is never crushed or overlong:
    away from an elbow that comes too close (depression), towards one that is far (protraction),
    and a little forward / up with the arm."""
    # Mid-transition the elbow can still pass close to the shoulder (bones turn around the neck):
    # every shift fades out as it gets close, so the shoulder never jumps.
    near = min(1.0, (elbow - nominal).length / 8)
    reach = (elbow - nominal).normalized() * near
    s = nominal + (fwd * max(0.0, reach.dot(fwd)) + up * max(0.0, reach.dot(up))) * 3
    d = (elbow - s).length
    lo, hi = UPPER_ARM_CM
    shift = min(d - lo, 0.0) + max(d - hi, 0.0)  # < 0: move away from the elbow
    shift = max(-SHOULDER_SHIFT_CM, min(SHOULDER_SHIFT_CM, shift)) * min(1.0, d / 8)
    return s + (elbow - s).normalized() * shift


def _swing_ref(direction, up, fwd, left):
    """Roll of a limb's top half that only swings from "pointing forward", with no twist
    against the torso: the twist (elbow or knee direction) is taken by the bottom half."""
    local = Vector((direction.dot(left), direction.dot(up), direction.dot(fwd))).normalized()
    z = Vector((0, 0, 1)).rotation_difference(local) @ Vector((0, 1, 0))
    return left * z.x + up * z.y + fwd * z.z


def derived_points(f, prev_forward=None):
    """Humanoid points (cm) and bone roll references for a v1-11 fighter."""
    up, fwd, left = _frame(f, prev_forward)
    p = {k: _v(val) for k, val in f.items()}
    hip, neck, head = p['hip'], p['neck'], p['head']
    q = {
        'hip': hip,
        'waist': hip + up * 16,
        'chest': hip + up * 34,
        'neck': neck,
        'neck_top': neck + (head - neck) * 0.4,  # stays inside the head sphere
        'head': head,
        'head_top': head + (head - neck).normalized() * 11,
        'clav': neck - up * 3,
    }
    refs = {'up': up, 'fwd': fwd, 'left': left}
    for s, sign in (('L', 1), ('R', -1)):
        q['shoulder' + s] = _shoulder(neck + left * (17 * sign) - up * 5, p['elbow' + s], fwd, up)
        q['elbow' + s] = p['elbow' + s]
        fore = (p['hand' + s] - p['elbow' + s]).normalized()
        q['wrist' + s] = p['hand' + s] - fore * 7
        q['finger' + s] = p['hand' + s] + fore * 8
        q['hipj' + s] = hip + left * (9 * sign) - up * 5
        q['knee' + s] = p['knee' + s]
        q['ankle' + s] = p['foot' + s]
        shin = (p['foot' + s] - p['knee' + s]).normalized()
        foot_dir = fwd - shin * fwd.dot(shin)
        foot_dir = foot_dir.normalized() if foot_dir.length > 1e-3 else fwd
        q['toe' + s] = p['foot' + s] + foot_dir * 15
        elbow = _bend_dir(q['shoulder' + s], q['elbow' + s], q['wrist' + s], -fwd)
        refs['elbow' + s] = elbow
        refs['thumb' + s] = -elbow
        refs['knee' + s] = _bend_dir(q['hipj' + s], q['knee' + s], q['ankle' + s], fwd)
        refs['foot_top' + s] = q['knee' + s] - q['ankle' + s]
        refs['arm_swing' + s] = _swing_ref(q['elbow' + s] - q['shoulder' + s], up, fwd, left)
        refs['leg_swing' + s] = _swing_ref(q['knee' + s] - q['hipj' + s], up, fwd, left)
    return q, refs


# Bones: name -> (head point, tail point, roll reference in `refs`: the bone's Z axis)
HBONES = {
    'pelvis': ('hip', 'waist', 'fwd'),
    'abdomen': ('waist', 'chest', 'fwd'),
    'chest': ('chest', 'neck', 'fwd'),
    'neck': ('neck', 'neck_top', 'fwd'),
    'head': ('neck_top', 'head_top', 'fwd'),
}
for _s in 'LR':
    HBONES.update({
        f'clavicle.{_s}': ('clav', 'shoulder' + _s, 'fwd'),
        f'upper_arm.{_s}': ('shoulder' + _s, 'elbow' + _s, 'arm_swing' + _s),
        f'upper_arm_twist.{_s}': ('shoulder' + _s, 'elbow' + _s, 'elbow' + _s),
        f'forearm.{_s}': ('elbow' + _s, 'wrist' + _s, 'elbow' + _s),
        f'hand.{_s}': ('wrist' + _s, 'finger' + _s, 'thumb' + _s),
        f'thigh.{_s}': ('hipj' + _s, 'knee' + _s, 'leg_swing' + _s),
        f'thigh_twist.{_s}': ('hipj' + _s, 'knee' + _s, 'knee' + _s),
        f'shin.{_s}': ('knee' + _s, 'ankle' + _s, 'knee' + _s),
        f'foot.{_s}': ('ankle' + _s, 'toe' + _s, 'foot_top' + _s),
    })


def _axes(head, tail, ref):
    """Unit axes (x, y, z) of a bone: y from head to tail, z towards `ref`."""
    y = (tail - head).normalized()
    z = ref - y * ref.dot(y)
    if z.length < 1e-4:  # ref along the bone: any perpendicular
        z = y.orthogonal()
    z.normalize()
    return y.cross(z).normalized(), y, z


def _bone_matrix(head, tail, ref, rest_length):
    """Armature-space matrix of a bone from head to tail, Z towards `ref`, Y scaled to length."""
    x, y, z = _axes(head, tail, ref)
    m = Matrix((x, y * ((tail - head).length / rest_length), z)).transposed().to_4x4()
    m.translation = head
    return m


# --- Rest pose: standing, arms in an A, so limbs are far from each other when weighting -------

def _humanoid_rest():
    j = {'hip': (0, 93, 0), 'neck': (0, 143, 0), 'head': (0, 165, 0)}
    for s, sx in (('L', 1), ('R', -1)):
        j['elbow' + s] = (sx * 30, 119, -6)
        j['hand' + s] = (sx * 45, 97, 8)
        j['knee' + s] = (sx * 13, 51, 5)
        j['foot' + s] = (sx * 15, 9, -1)
    return _standardise(j)


# --- Body mesh ------------------------------------------------------------------------------

# Skin radius (cm) at each point: (across, front-back).
RADII = {
    'hip': (16, 12.5), 'waist': (13, 10), 'chest': (17, 11.5), 'neck': (6.5, 6.5),
    'neck_top': (6, 6), 'clav': (8, 7),
}
for _s in 'LR':
    RADII.update({
        'shoulder' + _s: (6.5, 6.5), 'elbow' + _s: (4.2, 4.2), 'wrist' + _s: (2.6, 2.3),
        'hipj' + _s: (9.5, 9.5), 'knee' + _s: (5.5, 5.5), 'ankle' + _s: (3.6, 3.6),
        'arm_mid' + _s: (5.2, 5.2), 'fore_mid' + _s: (4.3, 4.0),
        'thigh_mid' + _s: (7.5, 7.5), 'calf' + _s: (5.8, 5.8),
    })

EDGES = [('hip', 'waist'), ('waist', 'chest'), ('chest', 'clav'), ('clav', 'neck'),
         ('neck', 'neck_top')]
for _s in 'LR':
    EDGES += [('clav', 'shoulder' + _s), ('shoulder' + _s, 'arm_mid' + _s),
              ('arm_mid' + _s, 'elbow' + _s), ('elbow' + _s, 'fore_mid' + _s),
              ('fore_mid' + _s, 'wrist' + _s),
              ('hip', 'hipj' + _s), ('hipj' + _s, 'thigh_mid' + _s),
              ('thigh_mid' + _s, 'knee' + _s), ('knee' + _s, 'calf' + _s),
              ('calf' + _s, 'ankle' + _s)]

# Typical radius (cm) of each body part, to compare a vertex's distance to several bones.
PART_RADIUS = {'pelvis': 14, 'abdomen': 12, 'chest': 14, 'neck': 6}
for _s in 'LR':
    PART_RADIUS.update({f'clavicle.{_s}': 7, f'upper_arm.{_s}': 5.5, f'forearm.{_s}': 4.2,
                        f'thigh.{_s}': 8.5, f'shin.{_s}': 5.5})
# Limbs take over a little below their joint with the torso: buttocks follow the pelvis and
# the top of the shoulder the clavicle, so a bent thigh or a raised arm does not fold the torso.
WEIGHT_START = {f'{b}.{s}': f for s in 'LR' for b, f in (('upper_arm', 0.2), ('thigh', 0.25))}
# Upper arm and thigh: the top follows the torso without twist, the bottom the elbow or knee;
# their weights cross-fade along the bone, so the twist spreads over its whole length.
TWIST = {f'{b}.{s}': f'{b}_twist.{s}' for s in 'LR' for b in ('upper_arm', 'thigh')}
WEIGHT_BAND = 0.45  # blend zone at joints, in part radii


def _mesh_points(q):
    pts = {n: q[n] for n in RADII if n in q}
    for s in 'LR':
        pts['arm_mid' + s] = q['shoulder' + s].lerp(q['elbow' + s], 0.45)
        pts['fore_mid' + s] = q['elbow' + s].lerp(q['wrist' + s], 0.35)
        pts['thigh_mid' + s] = q['hipj' + s].lerp(q['knee' + s], 0.4)
        pts['calf' + s] = q['knee' + s].lerp(q['ankle' + s], 0.3)
    return pts


def _bake_modifiers(obj):
    """Applies all modifiers of an object, without operators."""
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def _new_object(name, verts_cm, edges=(), faces=()):
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_bl(v) for v in verts_cm], list(edges), list(faces))
    obj = bpy.data.objects.new(name, me)
    bpy.data.collections[COLLECTION].objects.link(obj)
    return obj


def _skin_object(name, chains, subsurf=2):
    """Smooth tubes along chains of (point cm, radius cm), by the Skin modifier."""
    verts, radii, edges, roots = [], [], [], []
    for chain in chains:
        roots.append(len(verts))
        for i, (pt, r) in enumerate(chain):
            if i:
                edges.append((len(verts) - 1, len(verts)))
            verts.append(pt)
            radii.append(r)
    obj = _new_object(name, verts, edges)
    obj.modifiers.new('Skin', 'SKIN')
    layer = obj.data.skin_vertices[0].data
    for i, r in enumerate(radii):
        layer[i].radius = (r / 100, r / 100)
    for i in roots:
        layer[i].use_root = True
    obj.modifiers.new('Smooth', 'SUBSURF').levels = subsurf
    _bake_modifiers(obj)
    return obj


def _loft_object(name, at, sections, exponent=2.6):
    """Smooth closed shape through rounded cross-sections (y, centre x, centre z, half x, half z),
    in a local frame mapped to Tatamap points by `at`."""
    n = 12
    verts, faces = [], []
    for y, cx, cz, hx, hz in sections:
        for k in range(n):
            a = 2 * math.pi * k / n
            c, s = math.cos(a), math.sin(a)
            verts.append(at(cx + hx * math.copysign(abs(c) ** (2 / exponent), c), y,
                            cz + hz * math.copysign(abs(s) ** (2 / exponent), s)))
    for i in range(len(sections) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            faces.append((i * n + k, i * n + k2, (i + 1) * n + k2, (i + 1) * n + k))
    faces.append(tuple(range(n)))
    faces.append(tuple(range(len(verts) - n, len(verts))))
    obj = _new_object(name, verts, faces=faces)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.modifiers.new('Smooth', 'SUBSURF').levels = 2
    _bake_modifiers(obj)
    return obj


def _local(origin, axes, sign):
    """(x, y, z) cm in a hand or foot frame -> Tatamap point; x is mirrored on the right side."""
    x, y, z = axes

    def at(lx, ly, lz):
        return origin + x * (lx * sign) + y * ly + z * lz
    return at


def _rotate(v, axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 3, axis) @ v


# Fingers, index to little finger: (knuckle offset towards the thumb cm, length cm,
# spread degrees, base radius cm). Relaxed curl at each knuckle, towards the palm.
FINGERS = [(2.75, 7.2, 5, 1.0), (0.95, 8.0, 0, 1.05), (-0.85, 7.5, -5, 0.98), (-2.5, 6.0, -11, 0.86)]
FINGER_CURL = (30, 35, 22)
PHALANX = (0.45, 0.32, 0.23)
THUMB = [((0.9, 1.6, 1.6), 1.4), ((1.8, 4.0, 3.0), 1.25), ((2.6, 6.0, 3.3), 1.05),
         ((3.4, 7.8, 2.8), 0.85)]
# Palm sections: (along, palm side, thumb side, half thickness, half width), cm.
PALM = [(-2.0, 0.0, 0.0, 1.4, 2.2), (-0.8, 0.0, 0.0, 1.55, 2.6), (2.5, 0.15, 0.2, 1.7, 3.3), (6.0, 0.1, 0.1, 1.55, 3.8),
        (9.2, 0.0, 0.1, 1.25, 3.85)]


# Closed hand (a grip): curl at each finger knuckle, and the thumb wrapped over the fingers.
FIST_CURL = (78, 95, 55)
THUMB_FIST = [(0.9, 1.6, 1.6), (2.6, 3.8, 2.4), (4.0, 5.6, 1.2), (4.6, 7.2, -0.6)]
# Flat hand (pushing, posted): fingers nearly straight, thumb spread in the palm's plane.
FLAT_CURL = (4, 6, 4)
THUMB_FLAT = [(0.9, 1.6, 1.6), (1.1, 3.8, 3.7), (1.2, 5.8, 5.1), (1.2, 7.6, 5.9)]
# Hand shape: -1 flat, 0 relaxed, 1 fist. Pose `hands` values; a hand left out is auto.
HAND_SHAPES = {'push': -1.0, 'free': 0.0, 'grip': 1.0}


def _finger_points(shape):
    """Local points (palm side x, along y, thumb side z) of the four fingers and the thumb, for a
    hand shape from -1 (flat) through 0 (relaxed) to 1 (fist). Each finger: inside the palm,
    knuckle, 3 joints."""
    curl_to, thumb_to = (FIST_CURL, THUMB_FIST) if shape >= 0 else (FLAT_CURL, THUMB_FLAT)
    amount = abs(shape)
    palm_side = Vector((1, 0, 0))
    fingers = []
    for across, length, spread, _r in FINGERS:
        d = _rotate(Vector((0, 1, 0)), palm_side, -spread)
        pt = Vector((0, 9.2, across))
        pts = [Vector((0, 7.0, across)), pt]
        for frac, relaxed, end in zip(PHALANX, FINGER_CURL, curl_to):
            d = _rotate(d, d.cross(palm_side).normalized(), relaxed + (end - relaxed) * amount)
            pt = pt + d * (length * frac)
            pts.append(pt)
        fingers.append(pts)
    thumb = [Vector(p).lerp(Vector(f), amount) for (p, _r), f in zip(THUMB, thumb_to)]
    return fingers, thumb


def _hand_bones(head, tail, z, s, sign, shape):
    """Finger and thumb bones (head, tail, z) in Tatamap cm, for a hand bone head -> tail."""
    axes = _axes(head, tail, z)
    at = _local(head, axes, sign)
    fingers, thumb = _finger_points(shape)
    bones = {}
    for i, pts in enumerate(fingers):
        for k in range(3):
            bones[f'finger{i}_{k}.{s}'] = (at(*pts[k + 1]), at(*pts[k + 2]), axes[2])
    for k in range(3):
        bones[f'thumb_{k}.{s}'] = (at(*thumb[k]), at(*thumb[k + 1]), axes[0] * sign)
    return bones


def _hand_objects(name, q, refs, s, sign):
    """Palm, fingers and thumb of one hand. Local: y along the hand, z thumb side, x palm side."""
    at = _local(q['wrist' + s], _axes(q['wrist' + s], q['finger' + s], refs['thumb' + s]), sign)
    fingers, thumb = _finger_points(0.0)
    chains = []
    for (_a, _l, _sp, r), pts in zip(FINGERS, fingers):
        chains.append([(at(*p), r * (1 - 0.1 * max(0, k - 1))) for k, p in enumerate(pts)])
    chains.append([(at(*p), r) for p, (_p, r) in zip(thumb, THUMB)])
    return _loft_object(name + '_palm', at, PALM), _skin_object(name + '_fingers', chains)


# Toes, big to little: (medial offset cm, length past the ball cm, radius cm)
TOES = [(3.0, 5.0, 1.35), (1.2, 4.0, 0.88), (-0.3, 3.5, 0.82), (-1.7, 3.0, 0.76), (-3.0, 2.5, 0.68)]
SOLE = -6.8  # cm below the ankle point


# Foot sections: (towards the toes, medial, up, half width, half height), cm from the ankle.
FOOT = [(-6.6, 0.0, -4.4, 2.5, 2.3), (-4.2, 0.1, -3.2, 3.1, 3.7), (0.0, 0.2, -2.4, 3.4, 4.5),
        (5.0, 0.3, -4.0, 3.7, 2.9), (10.0, 0.5, -5.0, 4.4, 1.9), (13.4, 0.5, -5.4, 4.5, 1.45)]


def _foot_objects(name, q, refs, s, sign):
    """Heel, arch and toes of one foot. Local: y towards the toes, z top of the foot, x medial."""
    at = _local(q['ankle' + s], _axes(q['ankle' + s], q['toe' + s], refs['foot_top' + s]), sign)
    pieces = [_loft_object(name + '_foot', at, FOOT)]
    chains = []
    for medial, length, r in TOES:
        z = SOLE + r
        chains.append([(at(medial, 10.5, z + 0.3), r), (at(medial, 12.0 + length * 0.55, z + 0.1), r),
                       (at(medial * 1.04, 12.0 + length, z - 0.1), r * 0.85)])
    pieces.append(_skin_object(name + '_toes', chains))
    return pieces


def _seg_weights(co, segments):
    """Weights of the bones whose surface a vertex is on (normalised, sharp blend at joints)."""
    scaled, along = {}, {}
    for name, (a, b, radius) in segments.items():
        closest, t = intersect_point_line(co, a, b)
        closest = a if t < 0 else b if t > 1 else closest
        scaled[name] = (co - closest).length / radius
        along[name] = min(1.0, max(0.0, t))
    best = min(scaled.values())
    w = {n: (1 - (d - best) / WEIGHT_BAND) ** 2 for n, d in scaled.items() if d - best < WEIGHT_BAND}
    total = sum(w.values())
    w = {n: x / total for n, x in w.items()}
    for n in [n for n in w if n in TWIST]:
        k = _smoothstep(along[n])
        w[TWIST[n]] = w[n] * k
        w[n] *= 1 - k
    return w


def _set_group(obj, bone):
    obj.vertex_groups.new(name=bone).add(range(len(obj.data.vertices)), 1.0, 'REPLACE')


def _build_humanoid(fid, rgb):
    q, refs = derived_points(_humanoid_rest())
    col = bpy.data.collections[COLLECTION]

    # Armature: independent bones (no hierarchy), each posed directly from the joints.
    arm = bpy.data.armatures.new(fid + HUMANOID_SUFFIX)
    rig = bpy.data.objects.new(fid + HUMANOID_SUFFIX, arm)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (h, t, ref) in HBONES.items():
        b = arm.edit_bones.new(name)
        b.head, b.tail = to_bl(q[h]), to_bl(q[t])
        b.align_roll(to_bl(refs[ref]) - to_bl((0, 0, 0)))
    hand_rest = {}
    for s, sign in (('L', 1), ('R', -1)):
        hand_rest[s] = _hand_bones(q['wrist' + s], q['finger' + s], refs['thumb' + s], s, sign, 0.0)
        for name, (h, t, z) in hand_rest[s].items():
            b = arm.edit_bones.new(name)
            b.head, b.tail = to_bl(h), to_bl(t)
            b.align_roll(to_bl(z) - to_bl((0, 0, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')

    # Body: skin modifier on a stick figure, smoothed; weights from the distance to each bone.
    pts = _mesh_points(q)
    names = list(pts)
    body = _new_object(fid + '_body', [pts[n] for n in names],
                       [(names.index(a), names.index(b)) for a, b in EDGES])
    body.modifiers.new('Skin', 'SKIN')
    for i, n in enumerate(names):
        body.data.skin_vertices[0].data[i].radius = (RADII[n][0] / 100, RADII[n][1] / 100)
    body.data.skin_vertices[0].data[names.index('hip')].use_root = True
    body.modifiers.new('Smooth', 'SUBSURF').levels = 2
    _bake_modifiers(body)
    segments = {}
    for n, r in PART_RADIUS.items():
        a, b = q[HBONES[n][0]], q[HBONES[n][1]]
        segments[n] = (to_bl(a.lerp(b, WEIGHT_START.get(n, 0))), to_bl(b), r / 100)
    groups = {n: body.vertex_groups.new(name=n) for n in list(segments) + list(TWIST.values())}
    for v in body.data.vertices:
        for n, w in _seg_weights(v.co, segments).items():
            groups[n].add([v.index], w, 'REPLACE')

    # Head, hands and feet: rigid pieces, each on one bone.
    head_axis = to_bl(q['head_top']) - to_bl(q['head'])
    bpy.ops.mesh.primitive_uv_sphere_add(radius=HEAD_RADIUS_CM / 100, segments=32, ring_count=16)
    head = bpy.context.active_object
    for c in head.users_collection:
        c.objects.unlink(head)
    col.objects.link(head)
    head.data.transform(Matrix.Translation(to_bl(q['head']))
                        @ head_axis.to_track_quat('Z', 'Y').to_matrix().to_4x4()
                        @ Matrix.Diagonal((0.92, 0.98, 1.08, 1)))
    _set_group(head, 'head')
    pieces = [head]
    for s, sign in (('L', 1), ('R', -1)):
        palm, fingers = _hand_objects(f'{fid}_hand.{s}', q, refs, s, sign)
        _set_group(palm, 'hand.' + s)
        # Fingers: each vertex on its phalanx; the part inside the palm stays on the hand.
        segs = {n: (to_bl(h), to_bl(t), (1.0 if n.startswith('finger') else 1.3) / 100)
                for n, (h, t, _z) in hand_rest[s].items()}
        segs['hand.' + s] = (to_bl(q['wrist' + s]), to_bl(q['wrist' + s].lerp(q['finger' + s], 0.5)), 0.02)
        groups = {n: fingers.vertex_groups.new(name=n) for n in segs}
        for v in fingers.data.vertices:
            for n, w in _seg_weights(v.co, segs).items():
                groups[n].add([v.index], w, 'REPLACE')
        pieces += [palm, fingers]
        for obj in _foot_objects(f'{fid}_foot.{s}', q, refs, s, sign):
            _set_group(obj, 'foot.' + s)
            pieces.append(obj)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces + [body]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    for poly in body.data.polygons:
        poly.use_smooth = True
    body.data.materials.append(_material(f'{fid}_skin', rgb, 0.55))

    body.parent = rig
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    mod.use_deform_preserve_volume = True  # dual quaternions: elbows and knees keep their volume
    rig.data.display_type = 'STICK'
    return rig, body


def build_humanoids():
    """Adds a humanoid per fighter and hides the stick mannequins from renders."""
    for fid in FIGHTERS:
        for name in (fid + HUMANOID_SUFFIX, fid + '_body'):
            if name in bpy.data.objects:
                bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    made = [_build_humanoid(fid, rgb)[0].name for fid, rgb in FIGHTERS.items()]
    for obj in bpy.data.collections[COLLECTION].objects:
        if obj.name.startswith(tuple(f'{fid}_' for fid in FIGHTERS)) and not obj.name.endswith(
                (HUMANOID_SUFFIX, '_body')):
            obj.hide_render = True  # stick rigs and capsule mannequins
    return made


GRIP_CM = (3, 10)  # hand point to the opponent's surface: closed below, relaxed above
GRIP_SPEED = 0.12  # most the hand shape changes per frame (about a quarter of a second to close)
# The opponent's volume, as capsules: (joint, joint, radius cm).
BODY_CAPSULES = [('hip', 'neck', 14), ('neck', 'head', 6), ('head', 'head', 12)] + [
    c for s in 'LR' for c in (('neck', 'elbow' + s, 5), ('elbow' + s, 'hand' + s, 4),
                              ('hip', 'knee' + s, 8), ('knee' + s, 'foot' + s, 5.5))]


def _segment_distance(p, a, b):
    closest, t = intersect_point_line(p, a, b) if (b - a).length > 1e-6 else (a, 0.0)
    return (p - (a if t < 0 else b if t > 1 else closest)).length


def grip_amount(f, s, other=None):
    """How closed hand s is (0 relaxed, 1 fist): it closes on the opponent's body, or on the
    fighter's other hand (hands clasped)."""
    hand = _v(f['hand' + s])
    gap = (hand - _v(f['hand' + ('R' if s == 'L' else 'L')])).length - 6
    if other:
        o = {k: _v(v) for k, v in other.items()}
        gap = min([gap] + [_segment_distance(hand, o[a], o[b]) - r for a, b, r in BODY_CAPSULES])
    lo, hi = GRIP_CM
    return _smoothstep(min(1.0, max(0.0, (hi - gap) / (hi - lo))))


def bone_frames(f, prev=None, other=None, hands=None):
    """Each bone's (head, tail, z axis) in Tatamap cm for a v1-11 fighter, and the state to
    pass as `prev` for the next frame: rolls then turn at most MAX_TURN_DEG per frame, and
    hand shapes change at most GRIP_SPEED per frame. `hands`: the fighter's entry of the pose's
    `hands` ({'L': 'grip' | 'push' | 'free'}); a hand left out closes on `other` (auto)."""
    q, refs = derived_points(f, prev['fwd'] if prev else None)
    bones = {}
    for name, (h, t, ref) in HBONES.items():
        _x, y, z = _axes(q[h], q[t], refs[ref])
        if prev:  # turn the previous roll about the bone towards the new one
            before = prev['z'][name] - y * prev['z'][name].dot(y)
            if before.length > 1e-3:
                before.normalize()
                angle = math.atan2(y.dot(before.cross(z)), before.dot(z))
                limit = math.radians(MAX_TURN_DEG)
                z = Matrix.Rotation(max(-limit, min(limit, angle)), 3, y) @ before
        bones[name] = (q[h], q[t], z)
    state = {'fwd': refs['fwd'], 'z': {n: b[2] for n, b in bones.items()}, 'hand': {}}
    for s, sign in (('L', 1), ('R', -1)):
        wanted = (hands or {}).get(s)
        shape = HAND_SHAPES[wanted] if wanted in HAND_SHAPES else grip_amount(f, s, other)
        if prev:
            before = prev['hand'][s]
            shape = before + max(-GRIP_SPEED, min(GRIP_SPEED, shape - before))
        state['hand'][s] = shape
        bones.update(_hand_bones(*bones['hand.' + s], s, sign, shape))
    return bones, state


def pose_humanoid(rig, f, prev=None, other=None, hands=None):
    """Poses a humanoid rig on a v1-11 fighter (`other`: the opponent's joints, for automatic
    grips; `hands`: its hand states); returns the state for the next frame."""
    bones, state = bone_frames(f, prev, other, hands)
    inv = rig.matrix_world.inverted()
    origin = to_bl((0, 0, 0))
    for name, (head, tail, z) in bones.items():
        pb = rig.pose.bones[name]
        pb.matrix = inv @ _bone_matrix(to_bl(head), to_bl(tail), to_bl(z) - origin,
                                       rig.data.bones[name].length)
    return state


def _smoothstep(t):
    return t * t * (3 - 2 * t)


# Same as packages/shared/src/pose/interpolate.ts: the hip moves in a straight line, each
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


def _interpolate_fighter(a, b, t):
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


def site_timeline(technique):
    """[(frame, poses)] for every frame, with the site's hold and smoothstep transitions."""
    steps = technique['steps']
    hold = round(HOLD_MS / 1000 * FPS)
    frames = []
    for i, step in enumerate(steps):
        here = step['pose']['fighters']
        frames += [here] * hold
        if i + 1 < len(steps):
            nxt = steps[i + 1]['pose']['fighters']
            n = max(1, round(steps[i + 1]['transitionMs'] / 1000 * FPS))
            for k in range(1, n + 1):
                t = _smoothstep(k / n)
                frames.append({fid: _interpolate_fighter(here[fid], nxt[fid], t) for fid in here})
    return frames


def site_hands(technique):
    """The pose's `hands` for every frame of site_timeline: a step's own while it is held, the
    next step's during the transition towards it (the shape then changes progressively)."""
    steps = technique['steps']
    hold = round(HOLD_MS / 1000 * FPS)
    frames = []
    for i, step in enumerate(steps):
        frames += [step['pose'].get('hands', {})] * hold
        if i + 1 < len(steps):
            n = max(1, round(steps[i + 1]['transitionMs'] / 1000 * FPS))
            frames += [steps[i + 1]['pose'].get('hands', {})] * n
    return frames


def bake_humanoids(technique_path, start_frame=1):
    """Keys the humanoids on every frame of the technique, with the site's timing."""
    with open(technique_path, encoding='utf-8') as fh:
        technique = json.load(fh)
    frames = site_timeline(technique)
    hands = site_hands(technique)
    rigs = {fid: bpy.data.objects[fid + HUMANOID_SUFFIX] for fid in FIGHTERS}
    for rig in rigs.values():
        rig.animation_data_clear()
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
    prev = {fid: None for fid in FIGHTERS}
    for k, poses in enumerate(frames):
        frame = start_frame + k
        for fid, rig in rigs.items():
            other = poses['opponent' if fid == 'me' else 'me']
            prev[fid] = pose_humanoid(rig, poses[fid], prev[fid], other, hands[k].get(fid))
            bpy.context.view_layer.update()
            for pb in rig.pose.bones:
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('scale', frame=frame)
    return {'frames': len(frames)}
