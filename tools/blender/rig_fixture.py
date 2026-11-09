"""Reference bone frames for the site's rig solver (apps/web/src/features/viewer/rig.test.ts).

    blender -b --factory-startup -P tools/blender/rig_fixture.py -- poses.json out.json

`poses.json`: {"poses": [pose, ...]} (public data only: the fixture is committed; v1-11 poses
are upgraded to v2-21 first). For each pose and fighter, `bone_frames` with no previous frame
(the opponent given for automatic grips); then the transition from the first pose to the second
at 30 fps, with the previous frame passed on (rolls, facing and hand shapes rate-limited).
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, 'tatamap_rig.py')).read())
exec(open(os.path.join(HERE, 'tatamap_humanoid.py')).read())

from tatamap_pose import upgrade_pose  # noqa: E402

SEQUENCE_FRAMES = 12


def _plain(bones):
    return {n: [[round(c, 4) for c in v] for v in frame] for n, frame in sorted(bones.items())}


def _joints(f):
    return {n: [round(c, 4) for c in v] for n, v in f.items()}


def main(src, out):
    with open(src, encoding='utf-8') as fh:
        poses = [upgrade_pose(p) for p in json.load(fh)['poses']]
    other_of = {'me': 'opponent', 'opponent': 'me'}
    cases = []
    for i, pose in enumerate(poses):
        for fid in ('me', 'opponent'):
            f, other = pose['fighters'][fid], pose['fighters'][other_of[fid]]
            hands = (pose.get('hands') or {}).get(fid)
            thumbs = {s: {'dir': d, 'weight': 1.0}
                      for s, d in ((pose.get('thumbs') or {}).get(fid) or {}).items()}
            bones, _state = bone_frames(f, None, other, hands, thumbs)
            cases.append({'pose': i, 'fighter': fid, 'bones': _plain(bones)})
    a, b = poses[0]['fighters'], poses[1]['fighters']
    frames, prev = [], None
    for k in range(SEQUENCE_FRAMES + 1):
        t = _smoothstep(k / SEQUENCE_FRAMES)
        me = _joints(interpolate_fighter(a['me'], b['me'], t))
        opp = _joints(interpolate_fighter(a['opponent'], b['opponent'], t))
        bones, prev = bone_frames(me, prev, opp)
        frames.append({'me': _joints(me), 'opponent': _joints(opp), 'bones': _plain(bones)})
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'poses': poses, 'cases': cases, 'sequence': {'fps': 30, 'frames': frames}}, fh, separators=(',', ':'))
    print(f'wrote {out}: {len(cases)} cases, {len(frames)} sequence frames')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    main(args[0], args[1])
