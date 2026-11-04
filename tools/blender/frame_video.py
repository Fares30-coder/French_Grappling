"""Re-frames the vertical video's camera so it follows the fighters (video_camera.py).

    blender -b content/blender/tatamap.blend -P tools/blender/frame_video.py -- content/techniques/<slug>.json

After setup_vertical_video() (the 'video' scene) and bake_humanoids() on the same technique: the
camera no longer orbits a fixed centre; each frame it frames both fighters between the texts.
Saves the .blend.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'tatamap_rig.py')).read())
exec(open(os.path.join(HERE, 'tatamap_humanoid.py')).read())
sys.path.insert(0, HERE)
import video_camera  # noqa: E402


def step_hints(technique):
    """The camera hint shown at each frame of site_timeline: a step's own while it is held, the
    next step's during the transition towards it."""
    steps = technique['steps']
    hold = round(HOLD_MS / 1000 * FPS)
    hints = []
    for i, step in enumerate(steps):
        hints += [step['pose'].get('camera')] * hold
        if i + 1 < len(steps):
            n = max(1, round(steps[i + 1]['transitionMs'] / 1000 * FPS))
            hints += [steps[i + 1]['pose'].get('camera')] * n
    return hints


def frame_video(technique_path, start_frame=1):
    with open(technique_path, encoding='utf-8') as fh:
        technique = json.load(fh)
    frames = site_timeline(technique)
    track = video_camera.camera_track(frames, step_hints(technique), FPS)
    scene = bpy.data.scenes['Scene']
    cam = bpy.data.objects['video_cam']
    col = bpy.data.collections[COLLECTION]
    if 'video_orbit' in bpy.data.objects:  # the old fixed orbit
        bpy.data.objects.remove(bpy.data.objects['video_orbit'], do_unlink=True)
    aim = bpy.data.objects.get('video_aim') or bpy.data.objects.new('video_aim', None)
    if aim.name not in col.objects:
        col.objects.link(aim)
    cam.parent = None
    cam.constraints.clear()
    cam.animation_data_clear()
    aim.animation_data_clear()
    track_to = cam.constraints.new('TRACK_TO')
    track_to.target = aim
    track_to.track_axis, track_to.up_axis = 'TRACK_NEGATIVE_Z', 'UP_Y'
    cam.data.lens = video_camera.LENS_MM
    cam.data.sensor_width = video_camera.SENSOR_MM
    last = scene.frame_end
    for frame in range(start_frame, last + 1):
        target, position = track[min(frame - start_frame, len(track) - 1)]  # the outro holds
        aim.location = to_bl(target)
        cam.location = to_bl(position)
        aim.keyframe_insert('location', frame=frame)
        cam.keyframe_insert('location', frame=frame)
    scene.camera = cam
    bpy.ops.wm.save_mainfile()
    print(f'framed {last - start_frame + 1} frames of {technique["slug"]}')


if __name__ == '__main__':
    frame_video(os.path.abspath(sys.argv[sys.argv.index('--') + 1]))
