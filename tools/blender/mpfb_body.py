"""Realistic body for the humanoid mannequin: a MakeHuman (MPFB) man, on our armature.

Run inside Blender after tatamap_rig.py and tatamap_humanoid.py, with the MPFB extension
installed (`blender -c extension install --enable mpfb`). MPFB's meshes are CC0, so the site's
.glb can be downloaded by anyone (ADR 0004).

    rig, body, rest = build_mpfb_humanoid('fighter', (1, 1, 1))

The bones, their names and the way they are posed from the 21 points do not change (the site's
rig.ts and the poses stay as they are). What changes is the skin and the rest pose it is bound
in:
- MPFB makes an athletic man, its proportions nudged towards the standard body of the poses
  (STANDARD_BODY_V2_21 and the median shoulder of the content) with its own sculpted targets,
  so the bones stretch little when posed;
- the rest pose is read off MPFB's own skeleton (game engine rig), so the skin is bound as it
  was modelled, not bent onto another skeleton;
- only the hands are moved: our fingers are procedural (`_hand_bones`), so MPFB's hand is
  turned onto our palm frame and each phalanx onto ours;
- MPFB's weights are renamed to our bones (upper arms and thighs cross-faded into their twist
  bones, as for the procedural body);
- grappling shorts: a fabric shell over the skin (same weights), coloured by a vertex colour;
  the buttock cleft and the crotch are smoothed under them.
"""

import math
import os
from importlib import import_module

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

MPFB = 'bl_ext.blender_org.mpfb'

# An athletic adult man (MPFB macro sliders, 0..1).
MACRO = {'gender': 1.0, 'age': 0.5, 'muscle': 0.8, 'weight': 0.55, 'proportions': 0.8,
         'height': 0.5, 'cupsize': 0.5, 'firmness': 0.5,
         'race': {'asian': 1 / 3, 'caucasian': 1 / 3, 'african': 1 / 3}}

# Proportions towards the poses' standard body (measured on MPFB's rig, cm):
# shoulder 20.2 -> 18.8 from the spine (poses: 16.6), upper arm 25.1 -> 28.3 (poses: 28.4),
# shin 44.2 -> 41 (42), pelvis -> neck 45.3 -> 50 (50), neck as is (22.8, poses: 22).
TARGETS = {
    'torso/measure-shoulder-dist-decr': 1.0,
    'arms/measure-upperarm-length-incr': 0.45,
    'legs/lowerlegs-height-decr': 0.55,
    'torso/measure-napetowaist-dist-incr': 0.6,
}

# Kept from the base mesh besides the skin: the eyeballs (or the sockets look empty).
KEEP_GROUPS = ('body', 'helper-l-eye', 'helper-r-eye')

FINGER_NAMES = ('index', 'middle', 'ring', 'pinky')
NECK_ABOVE_SHOULDERS_CM = 5  # poses: the shoulders sit ~5 cm below the neck point (median)
NOSE_CM = 11


def _mpfb():
    import addon_utils
    addon_utils.enable(MPFB, default_set=True)
    return (import_module(MPFB + '.services.humanservice').HumanService,
            import_module(MPFB + '.services.targetservice').TargetService,
            import_module(MPFB + '.services.locationservice').LocationService)


def _make_human():
    """MPFB man with its game engine rig and weights; helper geometry dropped."""
    HumanService, TargetService, LocationService = _mpfb()
    human = HumanService.create_human(mask_helpers=False, macro_detail_dict=MACRO)
    targets_dir = LocationService.get_mpfb_data('targets')
    for name, weight in TARGETS.items():
        TargetService.load_target(human, os.path.join(targets_dir, name + '.target.gz'),
                                  weight=weight)
    TargetService.bake_targets(human)
    mrig = HumanService.add_builtin_rig(human, 'game_engine', import_weights=True)
    keep = {human.vertex_groups[n].index for n in KEEP_GROUPS}
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = human
    for v in human.data.vertices:
        v.select = not any(g.group in keep for g in v.groups)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='VERT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for mod in list(human.modifiers):
        if mod.type != 'ARMATURE':
            human.modifiers.remove(mod)
    return human, mrig


def _rest_fighter(mrig):
    """A v2-21 fighter (Tatamap cm) on MPFB's skeleton: the rest pose to bind the skin in."""
    m = mrig.matrix_world
    head = {b.name: m @ b.head_local for b in mrig.data.bones}
    tail = {b.name: m @ b.tail_local for b in mrig.data.bones}
    up = Vector((0, 0, 1))
    fwd = Vector((0, -1, 0))  # MPFB faces -y in Blender (+z in Tatamap)
    hips = (head['thigh_l'] + head['thigh_r']) / 2
    pelvis = hips + up * 0.05
    shoulders_z = (head['upperarm_l'].z + head['upperarm_r'].z) / 2
    neck = head['neck_01'].copy()
    neck.x = pelvis.x
    neck.z = shoulders_z + NECK_ABOVE_SHOULDERS_CM / 100
    head_c = (head['head'] + tail['head']) / 2
    f = {
        'pelvis': pelvis, 'neck': neck, 'head': head_c, 'nose': head_c + fwd * NOSE_CM / 100,
        'chest': pelvis.lerp(neck, 34 / 50),
    }
    for s in 'LR':
        m_ = s.lower()
        wrist, elbow = head[f'hand_{m_}'], head[f'lowerarm_{m_}']
        hand = wrist + (wrist - elbow).normalized() * 0.07  # rig: wrist = hand - 7 cm
        f.update({
            'shoulder' + s: head[f'upperarm_{m_}'], 'elbow' + s: elbow, 'hand' + s: hand,
            'handTip' + s: hand + (tail[f'middle_03_{m_}'] - hand).normalized() * 0.08,
            'hip' + s: head[f'thigh_{m_}'], 'knee' + s: head[f'calf_{m_}'],
            'foot' + s: head[f'foot_{m_}'], 'toe' + s: tail[f'ball_{m_}'],
        })
    return {k: from_bl(v) for k, v in f.items()}


def _hand_frame(y, across):
    """Rotation matrix with columns (x, y, z): y along the hand, z towards the index side."""
    y = y.normalized()
    z = (across - y * across.dot(y)).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def _pose_hands(mrig, hand_rest, q):
    """Turns MPFB's hands onto our palm frames and its phalanges onto ours (rest pose)."""
    bpy.context.view_layer.objects.active = mrig
    bpy.ops.object.mode_set(mode='EDIT')
    for b in mrig.data.edit_bones:
        b.use_connect = False
        b.parent = None
    bpy.ops.object.mode_set(mode='POSE')
    inv = mrig.matrix_world.inverted()
    bones = mrig.data.bones
    for s in 'LR':
        m_ = s.lower()
        hb = {n: tuple(inv @ to_bl(p) for p in (h, t)) for n, (h, t, _z) in hand_rest[s].items()}
        wrist = bones[f'hand_{m_}'].head_local
        src = _hand_frame(bones[f'middle_01_{m_}'].head_local - wrist,
                          bones[f'index_01_{m_}'].head_local - bones[f'pinky_01_{m_}'].head_local)
        our_wrist = inv @ to_bl(q['wrist' + s])
        dst = _hand_frame(hb[f'finger1_0.{s}'][0] - our_wrist,
                          hb[f'finger0_0.{s}'][0] - hb[f'finger3_0.{s}'][0])
        turn = dst @ src.transposed()
        scale = ((hb[f'finger1_0.{s}'][0] - our_wrist).length
                 / (bones[f'middle_01_{m_}'].head_local - wrist).length)
        rest = bones[f'hand_{m_}'].matrix_local
        full = (turn @ rest.to_3x3() * scale).to_4x4()
        full.translation = our_wrist
        mrig.pose.bones[f'hand_{m_}'].matrix = full
        phalanges = {f'{finger}_0{k + 1}_{m_}': f'finger{i}_{k}.{s}'
                     for i, finger in enumerate(FINGER_NAMES) for k in range(3)}
        phalanges.update({f'thumb_0{k + 1}_{m_}': f'thumb_{k}.{s}' for k in range(3)})
        for name, ours in phalanges.items():
            h, t = hb[ours]
            rest = bones[name].matrix_local
            base = turn @ rest.to_3x3()  # carried by the hand, then aimed at our phalanx
            rot = base.col[1].rotation_difference(t - h).to_matrix() @ base
            full = (rot @ Matrix.Diagonal((scale, (t - h).length / bones[name].length, scale))).to_4x4()
            full.translation = h
            mrig.pose.bones[name].matrix = full
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()


def _weight_map():
    """MPFB bone -> {our bone: share}. Weights of unlisted MPFB bones are dropped."""
    w = {'pelvis': {'pelvis': 1}, 'spine_01': {'abdomen': 1},
         'spine_02': {'abdomen': 0.5, 'chest': 0.5}, 'spine_03': {'chest': 1},
         'neck_01': {'neck': 1}, 'head': {'head': 1}}
    for s in 'LR':
        m_ = s.lower()
        w.update({
            f'clavicle_{m_}': {f'clavicle.{s}': 1}, f'upperarm_{m_}': {f'upper_arm.{s}': 1},
            f'lowerarm_{m_}': {f'forearm.{s}': 1}, f'hand_{m_}': {f'hand.{s}': 1},
            f'thigh_{m_}': {f'thigh.{s}': 1}, f'calf_{m_}': {f'shin.{s}': 1},
            f'foot_{m_}': {f'foot.{s}': 1}, f'ball_{m_}': {f'foot.{s}': 1},
        })
        for i, finger in enumerate(FINGER_NAMES):
            for k in range(3):
                w[f'{finger}_0{k + 1}_{m_}'] = {f'finger{i}_{k}.{s}': 1}
        for k in range(3):
            w[f'thumb_0{k + 1}_{m_}'] = {f'thumb_{k}.{s}': 1}
    return w


TWIST_SEGMENT = {'upper_arm': ('shoulder', 'elbow'), 'thigh': ('hipj', 'knee')}


def _rename_weights(human, q):
    """MPFB groups -> our bones; upper arm and thigh cross-faded into their twist bones."""
    wmap = _weight_map()
    by_index = {g.index: g.name for g in human.vertex_groups}
    neck_top_z = to_bl(q['neck_top']).z
    ours = {}
    for v in human.data.vertices:
        acc = {}
        for g in v.groups:
            for bone, share in wmap.get(by_index[g.group], {}).items():
                acc[bone] = acc.get(bone, 0.0) + g.weight * share
        if sum(acc.values()) < 1e-4:  # eyes (no weight in MPFB's game engine rig)
            acc = {'head': 1.0} if v.co.z > neck_top_z else {'chest': 1.0}
        for n in [n for n in acc if n in TWIST]:
            a, b = (to_bl(q[p + n[-1]]) for p in TWIST_SEGMENT[n.split('.')[0]])
            _c, t = intersect_point_line(v.co, a, b)
            k = _smoothstep(min(1.0, max(0.0, t)))
            acc[TWIST[n]] = acc.get(TWIST[n], 0.0) + acc[n] * k
            acc[n] *= 1 - k
        total = sum(acc.values())
        ours[v.index] = {n: w / total for n, w in acc.items() if w / total > 1e-3}
    for g in list(human.vertex_groups):
        human.vertex_groups.remove(g)
    groups = {}
    for i, weights in ours.items():
        for n, w in weights.items():
            if n not in groups:
                groups[n] = human.vertex_groups.new(name=n)
            groups[n].add([i], w, 'REPLACE')


# Grappling shorts: a fabric shell over the skin (the faces under the shorts, duplicated, pushed
# off the skin, smoothed so no muscle shows through, given a thickness), on the same weights as
# the skin it covers. Snug at the waist, loose towards the hem (just above the knee), less so
# between the legs. The skin under it is tinted like the shorts, so wherever it pokes through in
# an extreme pose it reads as fabric. Colours are a vertex colour (COLOR_0) the viewer and
# Blender multiply the fighter's colour by: a darker shade, a darker waistband and a lighter
# panel down the outside of each leg.
SHORTS_SHADE = 0.3  # linear multiplier of the fighter's colour
WAISTBAND_SHADE = 0.1
PANEL_SHADE = 0.5
SHORTS_TOP_CM = 6  # waistband above the pelvis point
WAISTBAND_CM = 4.5
SHORTS_LEG = 0.62  # hem, as a fraction of hip joint -> knee
PANEL_HALF_ANGLE_DEG = 25  # side panel, around the outside of the thigh
FABRIC_GAP_CM = (0.45, 2.6)  # off the skin: at the waist, at the hem
FABRIC_LOOSE_FROM = 0.05  # fraction of the thigh where the leg starts to loosen
FABRIC_INNER = 0.35  # the inside of the thigh keeps this share of the looseness
FABRIC_SMOOTH = (6, 1.0)  # Laplacian iterations, factor: fabric bridges the muscles
FABRIC_MIN_GAP_CM = 0.35  # never closer to the skin (smoothing pulls it in over curves)
WAISTBAND_RAISE_CM = 0.15  # the waistband stands a little off the fabric
SKIN_TINT_INSET = (1.5, 0.04)  # tinted skin stops this far inside the shell: cm, thigh fraction
SHELL_MARGIN = (3, 0.08)  # the shell is cut from a larger piece: cm, thigh fraction
FABRIC_THICKNESS_CM = 0.35
SHORTS_BONES = ('pelvis', 'abdomen', 'thigh.L', 'thigh.R', 'thigh_twist.L', 'thigh_twist.R')
COLOR_ATTRIBUTE = 'Col'
# Under the fabric the buttock cleft and the crotch are smoothed away (fabric bridges them).
CLEFT_HALF_WIDTH_CM = 8
CLEFT_SMOOTH = (30, 0.5)  # iterations, factor
CLEFT_TOP_CM = 10  # up to the top of the buttocks, above the hip joints


def _thigh_coord(co, q):
    """(side, fraction along hip joint -> knee, unit direction from the thigh's axis)."""
    s = 'L' if co.x > 0 else 'R'
    a, b = to_bl(q['hipj' + s]), to_bl(q['knee' + s])
    closest, t = intersect_point_line(co, a, b)
    radial = co - closest
    return s, t, radial.normalized() if radial.length > 1e-6 else Vector((0, 0, 0))


def _shorts(human, q, top_cm=SHORTS_TOP_CM, leg=SHORTS_LEG):
    """Indices of the vertices under the shorts (rest pose, weights already ours), with the
    waistband `top_cm` above the pelvis point and the hem at `leg` of the thigh."""
    names = {g.index: g.name for g in human.vertex_groups}
    top = to_bl(q['hip']).z + top_cm / 100
    inside = set()
    for v in human.data.vertices:
        if v.co.z > top:
            continue
        on_body = sum(g.weight for g in v.groups if names[g.group] in SHORTS_BONES)
        if on_body < 0.5:  # hands and forearms hanging by the thighs
            continue
        if _thigh_coord(v.co, q)[1] <= leg:
            inside.add(v.index)
    return inside


def _shade(co, q, top_z):
    """Colour of the shorts' fabric at a rest point."""
    if co.z > top_z - WAISTBAND_CM / 100:
        return WAISTBAND_SHADE
    s, _t, radial = _thigh_coord(co, q)
    radial.z = 0  # around the thigh's axis, seen from above: the panel runs waist to hem
    if radial.length > 1e-6:
        if radial.normalized().x * (1 if s == 'L' else -1) > math.cos(
                math.radians(PANEL_HALF_ANGLE_DEG)):
            return PANEL_SHADE
    return SHORTS_SHADE


def _ramp(x, lo, hi):
    return _smoothstep(min(1.0, max(0.0, (x - lo) / (hi - lo))))


def _cut(bm, shell, co, no):
    """Cuts the shell along a plane and drops what lies on the side `no` points to."""
    geom = list({e for v in shell for e in v.link_edges}) + list(
        {f for v in shell for f in v.link_faces}) + shell
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)


def _dress(human, q):
    """Smooths the skin under the shorts, tints it and adds the shorts' fabric shell."""
    hip_z = (to_bl(q['hipjL']).z + to_bl(q['hipjR']).z) / 2
    top_z = to_bl(q['hip']).z + SHORTS_TOP_CM / 100
    tinted = _shorts(human, q, SHORTS_TOP_CM - SKIN_TINT_INSET[0], SHORTS_LEG - SKIN_TINT_INSET[1])
    piece = _shorts(human, q, SHORTS_TOP_CM + SHELL_MARGIN[0], SHORTS_LEG + SHELL_MARGIN[1])
    bm = bmesh.new()
    bm.from_mesh(human.data)
    bm.verts.ensure_lookup_table()
    between = [bm.verts[i] for i in piece
               if abs(bm.verts[i].co.x) < CLEFT_HALF_WIDTH_CM / 100
               and bm.verts[i].co.z < hip_z + CLEFT_TOP_CM / 100]
    iterations, factor = CLEFT_SMOOTH
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=between, factor=factor,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    skin = BVHTree.FromBMesh(bm)
    color = bm.verts.layers.float_color.new(COLOR_ATTRIBUTE)
    for v in bm.verts:
        c = SHORTS_SHADE if v.index in tinted else 1.0
        v[color] = (c, c, c, 1.0)

    # The shell: duplicated faces (weights come along), pushed off the skin, smoothed.
    faces = [f for f in bm.faces if all(v.index in piece for v in f.verts)]
    dup = bmesh.ops.duplicate(bm, geom=faces)
    shell = [e for e in dup['geom'] if isinstance(e, bmesh.types.BMVert)]
    lo, hi = FABRIC_GAP_CM
    for v in shell:
        _s, t, radial = _thigh_coord(v.co, q)
        loose = _ramp(t, FABRIC_LOOSE_FROM, SHORTS_LEG) if radial.length else 0.0
        inner = max(0.0, -radial.x * (1 if v.co.x > 0 else -1))
        gap = lo + (hi - lo) * loose * (1 - (1 - FABRIC_INNER) * inner)
        if v.co.z > top_z - WAISTBAND_CM / 100:
            gap += WAISTBAND_RAISE_CM
        d = v.normal.lerp(radial, loose) if radial.length else v.normal
        v.co += d.normalized() * gap / 100
    iterations, factor = FABRIC_SMOOTH
    for _ in range(iterations):
        bmesh.ops.smooth_laplacian_vert(bm, verts=shell, lambda_factor=factor,
                                        lambda_border=factor, use_x=True, use_y=True,
                                        use_z=True, preserve_volume=True)
    for v in shell:  # smoothing pulls the fabric in over convex skin: push it back out
        hit, normal, _i, dist = skin.find_nearest(v.co)
        if hit is None:
            continue
        out = (v.co - hit).dot(normal)
        if out < FABRIC_MIN_GAP_CM / 100:
            v.co += normal * (FABRIC_MIN_GAP_CM / 100 - out)

    # Clean edges: the waistband and each hem are plane cuts, not the mesh's staircase.
    _cut(bm, shell, Vector((0, 0, top_z)), Vector((0, 0, 1)))
    for s in 'LR':
        a, b = to_bl(q['hipj' + s]), to_bl(q['knee' + s])
        side = [v for v in shell if v.is_valid and (v.co.x > 0) == (s == 'L')]
        _cut(bm, side, a.lerp(b, SHORTS_LEG), (b - a).normalized())
    shell = [v for v in shell if v.is_valid]
    shell_faces = list({f for v in shell for f in v.link_faces})
    before = set(bm.verts)
    bmesh.ops.solidify(bm, geom=shell_faces, thickness=FABRIC_THICKNESS_CM / 100)
    fabric = shell + [v for v in bm.verts if v not in before]
    for v in fabric:
        c = _shade(v.co, q, top_z)
        v[color] = (c, c, c, 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=list({f for v in fabric for f in v.link_faces}))
    bm.to_mesh(human.data)
    bm.free()
    attrs = human.data.color_attributes
    attrs.active_color = attrs[COLOR_ATTRIBUTE]
    attrs.render_color_index = attrs.find(COLOR_ATTRIBUTE)
    return len(tinted), len(fabric)


def _tinted_material(mat):
    """A copy of `mat` whose base colour is multiplied by the vertex colour (the shorts)."""
    mat = mat.copy()
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = COLOR_ATTRIBUTE
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
    links.new(attr.outputs['Color'], mix.inputs['B'])
    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return mat


def build_mpfb_humanoid(fid, rgb):
    """Our humanoid armature with a MPFB skin, bound in MPFB's rest pose.
    Returns (rig, body, rest fighter v2-21)."""
    human, mrig = _make_human()
    rest = _rest_fighter(mrig)
    rig, body = _build_humanoid(fid, rgb, rest)
    q, refs = derived_points(rest)
    hand_rest = {s: _hand_bones(q['wrist' + s], q['finger' + s], refs['thumb' + s], s, sign, 0.0)
                 for s, sign in (('L', 1), ('R', -1))}
    _pose_hands(mrig, hand_rest, q)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = human
    human.select_set(True)
    for mod in list(human.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    world = human.matrix_world.copy()
    human.parent = None
    human.matrix_world = world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.data.objects.remove(mrig, do_unlink=True)
    _rename_weights(human, q)
    _dress(human, q)

    for c in list(human.users_collection):
        c.objects.unlink(human)
    bpy.data.collections[COLLECTION].objects.link(human)
    for poly in human.data.polygons:
        poly.use_smooth = True
    human.data.materials.clear()
    for mat in body.data.materials:
        human.data.materials.append(_tinted_material(mat))
    name = body.name
    preserve = body.modifiers['Armature'].use_deform_preserve_volume
    bpy.data.objects.remove(body, do_unlink=True)
    human.name = human.data.name = name
    human.parent = rig
    mod = human.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    mod.use_deform_preserve_volume = preserve
    return rig, human, rest
