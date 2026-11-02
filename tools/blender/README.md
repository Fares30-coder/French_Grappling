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

## Humanoid mannequins (videos)

`tatamap_humanoid.py` (run after `tatamap_rig.py`) builds one organic body per fighter: a stick
figure turned into a smooth mesh by the Skin and Subdivision modifiers (pelvis, waist, chest,
shoulders, arms, neck, thighs, calves), a head, and rigid hands (palm, four curled fingers,
thumb) and feet (heel, arch, five toes), on an armature that follows the 11 joints. Shoulders
(which follow the arm a little, like a shoulder blade), hip joints, the torso's facing
(forward = the thighs' direction across the spine) and the limbs' twist (towards the elbow and
knee points) are derived from the joints. Body weights are computed from each vertex's distance
to the bones, scaled by the part's radius, so a bent thigh or arm does not drag the torso.
Upper arms and thighs have a twist bone (the twist spreads along the limb instead of pinching
the shoulder or the hip), a deltoid bone halfway between the clavicle and the upper arm rounds the
shoulder over a raised arm, the skin keeps its volume at the joints (dual quaternions), and the
derived rolls and facing turn at most 15 degrees per frame, so they never pop.
Each finger has three phalanx bones and the thumb three. A hand follows the pose's `hands`
(`grip`: fist, `push`: flat, `free`: relaxed; set in the editor, ADR 0002 addendum). A hand left
out is automatic: it closes when its point is within 3 cm of the opponent's body (or of the
fighter's other hand) and relaxes beyond 10 cm. During a transition the hand takes the next
step's shape, changing at most 0.12 per frame.

```python
build_humanoids()                    # hides the stick mannequins from renders
bake_humanoids('content/techniques/<slug>.json')  # every frame, the site's timing
```

## Transitions check

`python3 tools/blender/transitions.py content/techniques/<slug>.json` lists the limbs that pass
through each other while the site interpolates between two steps (exit code 1 if any).
