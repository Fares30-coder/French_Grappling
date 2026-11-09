"""Exports the humanoid mannequin as the site's skinned model (ADR 0004, step 1).

    blender -b --factory-startup -P tools/blender/export_site_model.py -- out.glb

Needs the MPFB extension (`blender -c extension install --enable mpfb`): the skin is a
MakeHuman man (CC0), see mpfb_body.py. One white body (the viewer tints it per fighter) on its
armature, at rest (MPFB's skeleton, read as a v2-21 pose). The shorts are a vertex colour
(COLOR_0) the viewer multiplies the fighter's colour by. The bones are
independent (no hierarchy) and the viewer places each one from the joints like
`pose_humanoid`, so it needs each bone's rest frame: they are written in the scene's extras
(`tatamapRest`: bone -> [head, tail, z axis], Tatamap cm), with `tatamapModel` (the version).
Compress with gltfpack afterwards (see README), keeping names and extras.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, 'tatamap_rig.py')).read())
exec(open(os.path.join(HERE, 'tatamap_humanoid.py')).read())
exec(open(os.path.join(HERE, 'mpfb_body.py')).read())

MODEL_VERSION = 3


def rest_frames(rest):
    """Each bone's (head, tail, z) at rest, as `bone_frames` gives them (hands relaxed), for
    the v2-21 rest pose `rest`."""
    q, refs = derived_points(rest)
    bones = {n: (q[h], q[t], _axes(q[h], q[t], refs[r])[2]) for n, (h, t, r) in HBONES.items()}
    for s, sign in (('L', 1), ('R', -1)):
        bones['deltoid.' + s] = _deltoid(bones['clavicle.' + s], bones['upper_arm.' + s])
        bones.update(_hand_bones(q['wrist' + s], q['finger' + s], refs['thumb' + s], s, sign, 0.0))
    return {n: [[round(c, 4) for c in v] for v in frame] for n, frame in bones.items()}


def export(path):
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    col = bpy.data.collections.new(COLLECTION)
    scene.collection.children.link(col)
    rig, body, rest_pose = build_mpfb_humanoid('fighter', (1.0, 1.0, 1.0))
    body.modifiers['Armature'].use_deform_preserve_volume = False  # glTF skins are linear
    body.data.materials.clear()
    body.data.materials.append(_tinted_material(_material('fighter_skin', (1.0, 1.0, 1.0), 0.55)))
    rest = rest_frames(rest_pose)
    missing = set(rest) ^ {b.name for b in rig.data.bones}
    assert not missing, f'rest frames and armature differ: {missing}'
    scene['tatamapModel'] = MODEL_VERSION
    scene['tatamapRest'] = rest
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    body.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_extras=True,
        export_yup=True, export_skins=True, export_animations=False, export_morph=False,
        export_def_bones=False, export_texcoords=False, export_vertex_color='ACTIVE',
        export_cameras=False, export_lights=False)
    print(f'exported {path}: {len(body.data.vertices)} vertices, {len(body.data.polygons)} faces')


if __name__ == '__main__':
    export(os.path.abspath(sys.argv[sys.argv.index('--') + 1]))
