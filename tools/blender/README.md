# Blender tools

`tatamap_rig.py` builds, in Blender 5.1+, two fighters whose bones are exactly the v1-11 skeleton
(standard body lengths), loads a technique JSON as an animation, writes the poses back, and sets up
a vertical video (1080x1920, TikTok / Reels).

## Setup

- Blender 5.1+ (`brew install --cask blender`).
- Optional, to let Claude Code drive Blender: the official [Blender MCP server](https://www.blender.org/lab/mcp-server/)
  (add-on installed and started in Blender; Preferences › System › Network › Allow Online Access).
  It runs LLM-written Python in Blender without guards: use a dedicated `.blend`.

## Use (Blender Python console, or through the MCP server)

```python
exec(open('/path/to/tools/blender/tatamap_rig.py').read())
build_scene()                                   # mat, me_rig (green), opponent_rig (orange)
load_technique('content/techniques/<slug>.json')  # one marker "step N" per step
# Pose by moving the controllers in Pose Mode: root (hip), neck_ctrl, head_ctrl,
# hand_ik.L/R, elbow_pole.L/R, foot_ik.L/R, knee_pole.L/R. Re-key them (I) at the step markers.
export_technique('content/techniques/<slug>.json')  # writes the poses at the markers back
setup_vertical_video('content/techniques/<slug>.json', '/path/out.mp4')
```

Render the video without blocking the UI: `blender -b file.blend -S video -a`.

After an export: `pnpm content:import`, `pnpm pose:check <slug>`, review in the editor. The first
and last steps of a technique must still equal the reference poses: re-export the references too,
or leave those steps untouched.

Axes: Tatamap is centimetres with y up; Blender is metres with z up. The mapping
`(x, y, z) -> (x, -z, y) / 100` is a rotation, so left stays left. A round trip
(load then export, nothing moved) changes no joint by more than 0.3 cm.
