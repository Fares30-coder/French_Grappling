"""Humanoid mannequins for Tatamap videos, driven by the 11 v1-11 joints.

Run inside Blender after tatamap_rig.py (it reuses its helpers):

    exec(open('/path/to/tools/blender/tatamap_rig.py').read())
    exec(open('/path/to/tools/blender/tatamap_humanoid.py').read())
    build_humanoids()                         # one organic body per fighter, auto-weighted
    bake_humanoids('content/techniques/<slug>.json')  # keys every frame, site timing

v1-11 has no shoulders, no hip joints, no hands or feet, and no torso orientation. They are
derived per frame (ADR 0004's problem, solved here only for rendering):
- up = hip -> neck; forward = the thighs' direction across the spine (knees are in front of the
  body in nearly every grappling pose); left = up x forward, as in `mirroredFighters`.
- shoulders = neck +/- 17 cm sideways, 5 cm down; hip joints = hip +/- 9 cm, 5 cm down;
  wrist 7 cm before the hand point, fingertips 8 cm after; toes 15 cm along the forward
  direction, across the shin.
The animation follows the site: each step held DEFAULT_HOLD_MS, then a smoothstep transition
of the next step's transitionMs, joints interpolated linearly.
"""

import json
import math

import bpy
from mathutils import Matrix, Vector

HUMANOID_SUFFIX = '_humanoid'


# --- Derived points (Tatamap cm, y up) ------------------------------------------------------

def _v(p):
    return Vector(p)


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
    left = up.cross(fwd).normalized()
    fwd = left.cross(up).normalized()
    return up, fwd, left


def derived_points(f, prev_forward=None):
    """All humanoid points (cm) for a v1-11 fighter, and its forward vector."""
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
    for s, sign in (('L', 1), ('R', -1)):
        q['shoulder' + s] = neck + left * (17 * sign) - up * 5
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
    return q, (up, fwd, left)


# Bones: name -> (head point, tail point, roll reference: 'fwd' or 'up')
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
        f'upper_arm.{_s}': ('shoulder' + _s, 'elbow' + _s, 'fwd'),
        f'forearm.{_s}': ('elbow' + _s, 'wrist' + _s, 'fwd'),
        f'hand.{_s}': ('wrist' + _s, 'finger' + _s, 'up'),
        f'thigh.{_s}': ('hipj' + _s, 'knee' + _s, 'fwd'),
        f'shin.{_s}': ('knee' + _s, 'ankle' + _s, 'fwd'),
        f'foot.{_s}': ('ankle' + _s, 'toe' + _s, 'up'),
    })


def _bone_matrix(head, tail, ref, rest_length):
    """Armature-space matrix of a bone from head to tail, Z towards `ref`, Y scaled to length."""
    y = tail - head
    length = y.length
    y.normalize()
    z = ref - y * ref.dot(y)
    if z.length < 1e-4:  # ref along the bone: any perpendicular
        z = y.orthogonal()
    z.normalize()
    x = y.cross(z).normalized()
    m = Matrix((x, y * (length / rest_length), z)).transposed().to_4x4()
    m.translation = head
    return m


# --- Body mesh ------------------------------------------------------------------------------

# Skin radius (cm) at each point: (across, front-back).
RADII = {
    'hip': (16, 12.5), 'waist': (13, 10), 'chest': (17, 11.5), 'neck': (6.5, 6.5),
    'neck_top': (6, 6), 'clav': (8, 7),
}
for _s in 'LR':
    RADII.update({
        'shoulder' + _s: (6.5, 6.5), 'arm_mid' + _s: (5.2, 5.2), 'elbow' + _s: (4.2, 4.2),
        'fore_mid' + _s: (4.3, 4.0), 'wrist' + _s: (3.2, 2.5), 'finger' + _s: (3.4, 1.4),
        'hipj' + _s: (9.5, 9.5), 'thigh_mid' + _s: (7.5, 7.5), 'knee' + _s: (5.5, 5.5),
        'calf' + _s: (5.8, 5.8), 'ankle' + _s: (4.0, 4.0), 'toe' + _s: (4.2, 2.2),
    })

EDGES = [('hip', 'waist'), ('waist', 'chest'), ('chest', 'clav'), ('clav', 'neck'),
         ('neck', 'neck_top')]
for _s in 'LR':
    EDGES += [('clav', 'shoulder' + _s), ('shoulder' + _s, 'arm_mid' + _s),
              ('arm_mid' + _s, 'elbow' + _s), ('elbow' + _s, 'fore_mid' + _s),
              ('fore_mid' + _s, 'wrist' + _s), ('wrist' + _s, 'finger' + _s),
              ('hip', 'hipj' + _s), ('hipj' + _s, 'thigh_mid' + _s),
              ('thigh_mid' + _s, 'knee' + _s), ('knee' + _s, 'calf' + _s),
              ('calf' + _s, 'ankle' + _s), ('ankle' + _s, 'toe' + _s)]


def _mesh_points(q):
    pts = dict(q)
    for s in 'LR':
        pts['arm_mid' + s] = q['shoulder' + s].lerp(q['elbow' + s], 0.45)
        pts['fore_mid' + s] = q['elbow' + s].lerp(q['wrist' + s], 0.35)
        pts['thigh_mid' + s] = q['hipj' + s].lerp(q['knee' + s], 0.4)
        pts['calf' + s] = q['knee' + s].lerp(q['ankle' + s], 0.3)
    return pts


def _build_humanoid(fid, rgb):
    joints = _standardise(_rest_joints())
    q, (up, fwd, left) = derived_points(joints)
    pts = _mesh_points(q)
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
        b.align_roll(to_bl(fwd if ref == 'fwd' else up) - to_bl((0, 0, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')

    # Body: skin modifier on a stick figure, smoothed, then auto-weighted to the armature.
    names = list(pts)
    me = bpy.data.meshes.new(fid + '_body')
    me.from_pydata([to_bl(pts[n]) for n in names], [(names.index(a), names.index(b)) for a, b in EDGES], [])
    body = bpy.data.objects.new(fid + '_body', me)
    col.objects.link(body)
    skin = body.modifiers.new('Skin', 'SKIN')
    for i, n in enumerate(names):
        r = RADII.get(n, (5, 5))
        me.skin_vertices[0].data[i].radius = (r[0] / 100, r[1] / 100)
    me.skin_vertices[0].data[names.index('hip')].use_root = True
    body.modifiers.new('Smooth', 'SUBSURF').levels = 2
    bpy.context.view_layer.objects.active = body
    for mod in list(body.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Head: a slightly tall sphere.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=HEAD_RADIUS_CM / 100, location=to_bl(q['head']),
                                         segments=32, ring_count=16)
    head = bpy.context.active_object
    head.scale = (0.92, 0.98, 1.08)
    bpy.ops.object.transform_apply(scale=True)
    for c in head.users_collection:
        c.objects.unlink(head)
    col.objects.link(head)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    bpy.ops.object.shade_smooth()
    body.data.materials.append(_material(f'{fid}_skin', rgb, 0.55))

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError:
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
    rig.hide_viewport = False
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


def pose_humanoid(rig, f, prev_forward=None):
    """Poses a humanoid rig on a v1-11 fighter; returns the forward vector used."""
    q, (up, fwd, _left) = derived_points(f, prev_forward)
    inv = rig.matrix_world.inverted()
    for name, (h, t, ref) in HBONES.items():
        pb = rig.pose.bones[name]
        rest = rig.data.bones[name].length
        ref_v = to_bl(fwd if ref == 'fwd' else up) - to_bl((0, 0, 0))
        pb.matrix = inv @ _bone_matrix(to_bl(q[h]), to_bl(q[t]), ref_v, rest)
    return fwd


def _smoothstep(t):
    return t * t * (3 - 2 * t)


def _lerp_fighter(a, b, t):
    return {j: [a[j][i] + (b[j][i] - a[j][i]) * t for i in range(3)] for j in a}


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
                frames.append({fid: _lerp_fighter(here[fid], nxt[fid], t) for fid in here})
    return frames


def bake_humanoids(technique_path, start_frame=1):
    """Keys the humanoids on every frame of the technique, with the site's timing."""
    with open(technique_path, encoding='utf-8') as fh:
        technique = json.load(fh)
    frames = site_timeline(technique)
    rigs = {fid: bpy.data.objects[fid + HUMANOID_SUFFIX] for fid in FIGHTERS}
    for rig in rigs.values():
        rig.animation_data_clear()
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
    prev = {fid: None for fid in FIGHTERS}
    for k, poses in enumerate(frames):
        frame = start_frame + k
        for fid, rig in rigs.items():
            prev[fid] = pose_humanoid(rig, poses[fid], prev[fid])
            bpy.context.view_layer.update()
            for pb in rig.pose.bones:
                pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('scale', frame=frame)
    return {'frames': len(frames)}
