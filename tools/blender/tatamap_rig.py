"""Tatamap rig for Blender: two fighters whose bones are exactly the v1-11 skeleton.

Run inside Blender (Python console, Text Editor, or the Blender MCP server):

    exec(open('/path/to/tools/blender/tatamap_rig.py').read())
    build_scene()                                  # two rigged mannequins on a mat
    load_technique('/path/to/content/techniques/prise-du-dos-sous-crochet.json')
    ...pose in Blender (move the *_ik / *_pole / root / neck_ctrl / head_ctrl bones)...
    export_technique('/path/to/content/techniques/prise-du-dos-sous-crochet.json')

Conventions (CLAUDE.md, ADR 0002):
- Tatamap: centimetres, y up, mat at y = 0. Blender: metres, z up. The mapping
  (x, y, z) -> (x, -z, y) / 100 is a rotation, so left stays left (handedness kept).
- Joints: head, neck, hip, elbowL, handL, elbowR, handR, kneeL, footL, kneeR, footR.
  `neck` doubles as the shoulder point, as in v1-11. Bone lengths = STANDARD_BODY_V1_11.
- Posing uses controllers: `root` (hip), `neck_ctrl`, `head_ctrl`, `hand_ik.L/R`,
  `elbow_pole.L/R`, `foot_ik.L/R`, `knee_pole.L/R`. The deform bones follow (IK + tracking),
  so exported poses always have standard bone lengths.
- Steps are timeline markers "step N" (keyframes on the controllers at those frames).
"""

import json
import math

import bpy
from mathutils import Matrix, Vector

JOINTS = ['head', 'neck', 'hip', 'elbowL', 'handL', 'elbowR', 'handR', 'kneeL', 'footL', 'kneeR', 'footR']
FIGHTERS = {'me': (0x1D / 255, 0x9E / 255, 0x75 / 255), 'opponent': (0xD8 / 255, 0x5A / 255, 0x30 / 255)}

# STANDARD_BODY_V1_11 in @tatamap/shared (cm).
LEN = {'neck-head': 22, 'neck-hip': 50, 'neck-elbow': 35, 'elbow-hand': 33, 'hip-knee': 43, 'knee-foot': 42}
HEAD_RADIUS_CM = 13

FPS = 30
HOLD_MS = 1200  # DEFAULT_HOLD_MS


def to_bl(p):
    """Tatamap cm (y up) -> Blender metres (z up)."""
    x, y, z = p
    return Vector((x / 100, -z / 100, y / 100))


def from_bl(v):
    """Blender metres (z up) -> Tatamap cm (y up), rounded to 0.1 cm."""
    return [round(v.x * 100, 1), round(v.z * 100, 1), round(-v.y * 100, 1)]


# --- Rest pose: standing, facing -y in Blender (+z in Tatamap), limbs slightly bent ----------

def _rest_joints():
    """A standing standard body, as Tatamap points (cm). Left side towards +x when facing +z."""
    hip = (0, 93, 0)
    neck = (0, 143, 0)
    head = (0, 165, 0)
    j = {'hip': hip, 'neck': neck, 'head': head}
    for side, sx in (('L', 1), ('R', -1)):
        # Arm: down and a little forward/out, elbow bent (so the IK knows the bend plane).
        j['elbow' + side] = (sx * 22, 117, 8)
        j['hand' + side] = (sx * 26, 94, 33)
        # Leg: knee a little forward.
        j['knee' + side] = (sx * 10, 51, 6)
        j['foot' + side] = (sx * 10, 9, 0)
    return j


def _fit(a, b, length):
    """Point at `length` cm from a towards b."""
    va, vb = Vector(a), Vector(b)
    return tuple(va + (vb - va).normalized() * length)


def _standardise(j):
    """Rest joints with exact standard lengths."""
    j = dict(j)
    j['neck'] = _fit(j['hip'], j['neck'], LEN['neck-hip'])
    j['head'] = _fit(j['neck'], j['head'], LEN['neck-head'])
    for s in 'LR':
        j['elbow' + s] = _fit(j['neck'], j['elbow' + s], LEN['neck-elbow'])
        j['hand' + s] = _fit(j['elbow' + s], j['hand' + s], LEN['elbow-hand'])
        j['knee' + s] = _fit(j['hip'], j['knee' + s], LEN['hip-knee'])
        j['foot' + s] = _fit(j['knee' + s], j['foot' + s], LEN['knee-foot'])
    return j


# Deform bones: name -> (head joint, tail joint, parent)
BONES = {
    'spine': ('hip', 'neck', 'root'),
    'head': ('neck', 'head', 'spine'),
    'upper_arm.L': ('neck', 'elbowL', 'spine'),
    'forearm.L': ('elbowL', 'handL', 'upper_arm.L'),
    'upper_arm.R': ('neck', 'elbowR', 'spine'),
    'forearm.R': ('elbowR', 'handR', 'upper_arm.R'),
    'thigh.L': ('hip', 'kneeL', 'root'),
    'shin.L': ('kneeL', 'footL', 'thigh.L'),
    'thigh.R': ('hip', 'kneeR', 'root'),
    'shin.R': ('kneeR', 'footR', 'thigh.R'),
}
CONTROLLERS = ['root', 'neck_ctrl', 'head_ctrl'] + [
    f'{c}.{s}' for s in 'LR' for c in ('hand_ik', 'elbow_pole', 'foot_ik', 'knee_pole')
]
CTRL_SIZE = 0.08  # m


def _linear(c):
    """sRGB component (as in the site's hex colors) -> linear, what Blender materials expect."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _material(name, rgb, roughness=0.6):
    rgb = tuple(_linear(c) for c in rgb)
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    mat.diffuse_color = (*rgb, 1)
    return mat


def _pole_point(a, mid, b, distance=30):
    """A pole target in the bend plane of a-mid-b, `distance` cm out from the mid joint."""
    va, vm, vb = Vector(a), Vector(mid), Vector(b)
    line = vb - va
    t = (vm - va).dot(line) / max(line.length_squared, 1e-9)
    out = vm - (va + line * t)
    if out.length < 1e-3:  # straight limb: keep the bend direction of the rest pose
        return None
    return tuple(vm + out.normalized() * distance)


def _build_rig(fid, rgb):
    joints = _standardise(_rest_joints())
    arm_data = bpy.data.armatures.new(f'{fid}_armature')
    rig = bpy.data.objects.new(f'{fid}_rig', arm_data)
    bpy.context.scene.collection.children[COLLECTION].objects.link(rig)
    arm_data.display_type = 'STICK'
    rig.show_in_front = True

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    root = eb.new('root')
    root.head = to_bl(joints['hip'])
    root.tail = root.head + Vector((0, 0, -0.15))
    for name, (h, t, parent) in BONES.items():
        b = eb.new(name)
        b.head = to_bl(joints[h])
        b.tail = to_bl(joints[t])
        b.parent = eb[parent]
        b.use_connect = name in ('head', 'forearm.L', 'forearm.R', 'shin.L', 'shin.R')

    def ctrl(name, at):
        c = eb.new(name)
        c.head = to_bl(at)
        c.tail = c.head + Vector((0, 0, CTRL_SIZE))
        c.use_deform = False
        return c

    ctrl('neck_ctrl', joints['neck'])
    ctrl('head_ctrl', joints['head'])
    for s in 'LR':
        ctrl(f'hand_ik.{s}', joints['hand' + s])
        ctrl(f'foot_ik.{s}', joints['foot' + s])
        ctrl(f'elbow_pole.{s}', _pole_point(joints['neck'], joints['elbow' + s], joints['hand' + s]))
        ctrl(f'knee_pole.{s}', _pole_point(joints['hip'], joints['knee' + s], joints['foot' + s]))
    eb['root'].use_deform = False
    bpy.ops.object.mode_set(mode='POSE')

    pb = rig.pose.bones
    c = pb['spine'].constraints.new('DAMPED_TRACK')
    c.target, c.subtarget = rig, 'neck_ctrl'
    c = pb['head'].constraints.new('DAMPED_TRACK')
    c.target, c.subtarget = rig, 'head_ctrl'
    for s in 'LR':
        for low, target, pole in ((f'forearm.{s}', f'hand_ik.{s}', f'elbow_pole.{s}'),
                                  (f'shin.{s}', f'foot_ik.{s}', f'knee_pole.{s}')):
            ik = pb[low].constraints.new('IK')
            ik.target, ik.subtarget = rig, target
            ik.pole_target, ik.pole_subtarget = rig, pole
            ik.chain_count = 2
            ik.pole_angle = 0.0
    bpy.ops.object.mode_set(mode='OBJECT')
    _calibrate_poles(rig, joints)
    _build_body(rig, fid, rgb)
    return rig


def _calibrate_poles(rig, joints):
    """Picks each limb's IK pole angle so the rest pose is reproduced (depends on bone roll)."""
    pairs = [(f'forearm.{s}', 'elbow' + s) for s in 'LR'] + [(f'shin.{s}', 'knee' + s) for s in 'LR']
    for bone, joint in pairs:
        ik = rig.pose.bones[bone].constraints['IK']
        def error(angle):
            ik.pole_angle = angle
            bpy.context.view_layer.update()
            mid = rig.matrix_world @ rig.pose.bones[bone].head
            return (mid - to_bl(joints[joint])).length

        # Coarse search over the circle, then refine around the best angle down to ~0.1 degree.
        best = min((error(k * math.pi / 8), k * math.pi / 8) for k in range(-8, 8))
        step = math.pi / 16
        while step > math.radians(0.1):
            best = min([best] + [(error(best[1] + d), best[1] + d) for d in (-step, step)])
            step /= 2
        ik.pole_angle = best[1]
    bpy.context.view_layer.update()


def _build_body(rig, fid, rgb):
    """Mannequin: capsules on the deform bones, spheres on the joints, rigidly skinned."""
    mat = _material(f'{fid}_skin', rgb)
    radius = {'spine': 0.12, 'head': 0.0}
    for name in BONES:
        bone = rig.data.bones[name]
        head, tail = rig.matrix_world @ bone.head_local, rig.matrix_world @ bone.tail_local
        if name == 'head':
            bpy.ops.mesh.primitive_uv_sphere_add(radius=HEAD_RADIUS_CM / 100, location=tail, segments=24, ring_count=12)
        else:
            r = radius.get(name, 0.055 if name.startswith(('upper_arm', 'thigh')) else 0.045)
            length = (tail - head).length
            bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, location=(head + tail) / 2, vertices=16)
            obj = bpy.context.active_object
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = (tail - head).to_track_quat('Z', 'Y')
        _skin(bpy.context.active_object, rig, name, mat, f'{fid}_{name}')
    for joint_bone, at_tail, r in [('spine', False, 0.07), ('spine', True, 0.07)] + [
        (f'{part}.{s}', True, 0.055) for s in 'LR' for part in ('upper_arm', 'forearm', 'thigh', 'shin')
    ]:
        bone = rig.data.bones[joint_bone]
        loc = rig.matrix_world @ (bone.tail_local if at_tail else bone.head_local)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
        _skin(bpy.context.active_object, rig, joint_bone, mat, f'{fid}_joint_{joint_bone}_{int(at_tail)}')


def _skin(obj, rig, bone_name, mat, name):
    obj.name = name
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    for col in obj.users_collection:
        col.objects.unlink(obj)
    bpy.context.scene.collection.children[COLLECTION].objects.link(obj)


COLLECTION = 'Tatamap'


def build_scene():
    """Clears the scene and builds the mat, the two rigs and a light. Returns the rigs' names."""
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object else None
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    col = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if COLLECTION not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.fps = FPS

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    mat_obj = bpy.context.active_object
    mat_obj.name = 'tatami'
    mat_obj.data.materials.append(_material('tatami', (0x1F / 255, 0x3B / 255, 0x35 / 255), 0.9))
    for o in mat_obj.users_collection:
        o.objects.unlink(mat_obj)
    col.objects.link(mat_obj)

    rigs = [_build_rig(fid, rgb).name for fid, rgb in FIGHTERS.items()]
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    col.objects.link(sun)
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.color = tuple(_linear(c) for c in (0x12 / 255, 0x1F / 255, 0x24 / 255))
    return rigs


# --- Poses <-> controllers ------------------------------------------------------------------

def _set_ctrl(rig, name, tatamap_point):
    if tatamap_point is None:
        return
    pb = rig.pose.bones[name]
    pb.matrix = Matrix.Translation(rig.matrix_world.inverted() @ to_bl(tatamap_point))


def apply_fighter_pose(rig, f):
    """Places the controllers of `rig` so its bones follow the v1-11 fighter pose `f`."""
    _set_ctrl(rig, 'root', f['hip'])
    bpy.context.view_layer.update()
    _set_ctrl(rig, 'neck_ctrl', f['neck'])
    _set_ctrl(rig, 'head_ctrl', f['head'])
    for s in 'LR':
        _set_ctrl(rig, f'hand_ik.{s}', f['hand' + s])
        _set_ctrl(rig, f'foot_ik.{s}', f['foot' + s])
        _set_ctrl(rig, f'elbow_pole.{s}', _pole_point(f['neck'], f['elbow' + s], f['hand' + s]))
        _set_ctrl(rig, f'knee_pole.{s}', _pole_point(f['hip'], f['knee' + s], f['foot' + s]))
    bpy.context.view_layer.update()


def read_fighter_pose(rig):
    """The rig's current joints as a v1-11 fighter (cm, Tatamap axes)."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones
    w = rig.matrix_world
    p = {
        'hip': w @ pb['spine'].head,
        'neck': w @ pb['spine'].tail,
        'head': w @ pb['head'].tail,
    }
    for s in 'LR':
        p['elbow' + s] = w @ pb[f'upper_arm.{s}'].tail
        p['hand' + s] = w @ pb[f'forearm.{s}'].tail
        p['knee' + s] = w @ pb[f'thigh.{s}'].tail
        p['foot' + s] = w @ pb[f'shin.{s}'].tail
    return {j: from_bl(p[j]) for j in JOINTS}


def _key_all(rig, frame):
    for name in CONTROLLERS:
        pb = rig.pose.bones[name]
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('rotation_quaternion', frame=frame)


def load_technique(path):
    """Keys every step of a technique JSON on the controllers; one marker per step."""
    with open(path, encoding='utf-8') as fh:
        technique = json.load(fh)
    scene = bpy.context.scene
    scene.timeline_markers.clear()
    rigs = {fid: bpy.data.objects[f'{fid}_rig'] for fid in FIGHTERS}
    for rig in rigs.values():
        rig.animation_data_clear()
    frame = 1
    for i, step in enumerate(technique['steps'], start=1):
        if i > 1:
            frame += round(step['transitionMs'] / 1000 * FPS)
        for fid, rig in rigs.items():
            apply_fighter_pose(rig, step['pose']['fighters'][fid])
            _key_all(rig, frame)
        scene.timeline_markers.new(f'step {i}', frame=frame)
        frame += round(HOLD_MS / 1000 * FPS)
        for rig in rigs.values():
            _key_all(rig, frame)  # hold
    scene.frame_start, scene.frame_end = 1, frame
    scene.frame_set(1)
    return {'slug': technique['slug'], 'steps': len(technique['steps']), 'frames': frame}


def export_technique(path):
    """Writes the poses at each 'step N' marker back into the technique JSON (titles untouched)."""
    with open(path, encoding='utf-8') as fh:
        technique = json.load(fh)
    scene = bpy.context.scene
    markers = sorted((m for m in scene.timeline_markers if m.name.startswith('step ')),
                     key=lambda m: int(m.name.split()[1]))
    if len(markers) != len(technique['steps']):
        raise ValueError(f"{len(markers)} step markers for {len(technique['steps'])} steps")
    rigs = {fid: bpy.data.objects[f'{fid}_rig'] for fid in FIGHTERS}
    for marker, step in zip(markers, technique['steps']):
        scene.frame_set(marker.frame)
        for fid, rig in rigs.items():
            step['pose']['fighters'][fid] = read_fighter_pose(rig)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(technique, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    return {'slug': technique['slug'], 'steps': len(markers)}


# --- Vertical video (TikTok / Reels) -------------------------------------------------------

VIDEO_SCENE = 'video'
OUTRO_FRAMES = 2 * FPS


def _engine(scene):
    for name in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = name
            return name
        except TypeError:
            continue
    return scene.render.engine


def setup_vertical_video(technique_path, output_path, orbit_degrees=50):
    """Builds a 1080x1920 'video' scene for the loaded technique: orbiting camera, the
    technique name on top, each step title at the bottom while it plays, a short outro.
    Render it with render_video() or `blender -b file.blend -S video -a`."""
    with open(technique_path, encoding='utf-8') as fh:
        technique = json.load(fh)
    main = bpy.context.scene
    markers = sorted((m for m in main.timeline_markers if m.name.startswith('step ')),
                     key=lambda m: int(m.name.split()[1]))
    if len(markers) != len(technique['steps']):
        raise ValueError('load_technique() first: step markers do not match the technique')

    # Centre of the action: mean hip of both fighters over the steps.
    centre = Vector()
    for m in markers:
        main.frame_set(m.frame)
        for fid in FIGHTERS:
            centre += to_bl(read_fighter_pose(bpy.data.objects[f'{fid}_rig'])['hip'])
    centre /= 2 * len(markers)
    centre.z = 0.38
    main.frame_end = markers[-1].frame + round(HOLD_MS / 1000 * FPS) + OUTRO_FRAMES

    col = bpy.data.collections[COLLECTION]
    for name in ('video_orbit', 'video_cam'):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    orbit = bpy.data.objects.new('video_orbit', None)
    orbit.location = centre
    col.objects.link(orbit)
    cam = bpy.data.objects.new('video_cam', bpy.data.cameras.new('video_cam'))
    cam.data.lens = 30
    col.objects.link(cam)
    cam.parent = orbit
    cam.location = (0, -2.9, 0.85)  # in front of the action, a little above
    track = cam.constraints.new('TRACK_TO')
    track.target = orbit
    track.track_axis, track.up_axis = 'TRACK_NEGATIVE_Z', 'UP_Y'
    orbit.rotation_euler = (0, 0, math.radians(-orbit_degrees / 2))
    orbit.keyframe_insert('rotation_euler', index=2, frame=main.frame_start)
    orbit.rotation_euler = (0, 0, math.radians(orbit_degrees / 2))
    orbit.keyframe_insert('rotation_euler', index=2, frame=main.frame_end)
    for fc in orbit.animation_data.action.fcurves if hasattr(orbit.animation_data.action, 'fcurves') else []:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    main.camera = cam
    _engine(main)
    main.render.resolution_x, main.render.resolution_y = 1080, 1920
    main.render.resolution_percentage = 100
    world = main.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.018, 0.035, 0.042, 1)
        bg.inputs['Strength'].default_value = 1.0

    # The 'video' scene: the 3D scene as a strip, with the texts on top.
    video = bpy.data.scenes.get(VIDEO_SCENE) or bpy.data.scenes.new(VIDEO_SCENE)
    video.render.fps = FPS
    video.render.resolution_x, video.render.resolution_y = 1080, 1920
    video.render.resolution_percentage = 100
    video.frame_start, video.frame_end = main.frame_start, main.frame_end
    seq = video.sequence_editor or video.sequence_editor_create()
    for strip in list(seq.strips):
        seq.strips.remove(strip)
    strips = seq.strips
    strips.new_scene('action', main, channel=1, frame_start=main.frame_start)

    def text(name, body, start, end, channel, y, size, box=True):
        t = strips.new_effect(name, 'TEXT', channel=channel, frame_start=start, length=max(1, end - start))
        t.text = body
        t.font_size = size
        t.location = (0.5, y)
        t.wrap_width = 0.86
        t.color = (0.91, 0.94, 0.93, 1)
        t.use_shadow = not box
        t.use_box = box
        if box:
            t.box_color = (0.06, 0.1, 0.12, 0.82)
        return t

    text('title', technique['name'], main.frame_start, main.frame_end, 2, 0.9, 74, box=False)
    for i, (m, step) in enumerate(zip(markers, technique['steps'])):
        end = markers[i + 1].frame if i + 1 < len(markers) else main.frame_end - OUTRO_FRAMES
        text(f'step {i + 1}', f"{i + 1}. {step['title']}", m.frame, end, 3, 0.13, 50)
    text('outro', 'Tatamap\nle jiu-jitsu en 3D et en français', main.frame_end - OUTRO_FRAMES,
         main.frame_end, 3, 0.13, 56)

    out = video.render
    out.use_sequencer = True
    out.image_settings.media_type = 'VIDEO'
    out.image_settings.file_format = 'FFMPEG'
    out.ffmpeg.format = 'MPEG4'
    out.ffmpeg.codec = 'H264'
    out.ffmpeg.constant_rate_factor = 'HIGH'
    out.filepath = output_path
    return {'frames': main.frame_end, 'seconds': round(main.frame_end / FPS, 1), 'centre': list(centre)}
