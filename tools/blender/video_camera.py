"""Camera of the vertical video that follows the fighters (pure Python, no bpy).

A vertical frame is narrow (37 degrees across with the 30 mm lens): two bodies lying on the mat
side by side overflow it, or end up tiny. So the camera looks along the fighters' footprint on
the mat (its long axis goes into depth and spreads over the height of the frame), from the end
closest to the step's camera hint, a little above, in three-quarter view, swaying slowly round them. Each frame it
backs off just enough for every joint to fit between the title (top) and the step caption
(bottom). Everything is smoothed over time; the distance is widened before smoothing, so a
fighter is never cut while the camera eases out.

    track = camera_track(frames, hints)   # frames: site_timeline(); hints: per-frame camera hint
    # track[k] = (target, position) in Tatamap cm, y up
"""

import math

LENS_MM = 30
SENSOR_MM = 36  # Blender's default; with sensor fit AUTO it spans the frame's height (portrait)
ASPECT = 1080 / 1920
ELEVATION_DEG = 32  # camera above the action
SWAY_DEG = 12  # slow orbit, each way
ALONG_WEIGHT = 0.6  # 0: the step's hint; 1: straight along the fighters (three quarters here)
SWAY_PERIOD_S = 14
# Part of the frame the fighters may use: the title sits in the top 15 %, the step caption in
# the bottom 22 % (centre heights 0.9 and 0.13 in setup_vertical_video).
SAFE_TOP, SAFE_BOTTOM = 0.84, 0.24
SAFE_SIDE = 0.9  # of the half width
MARGIN_CM = 14  # around each joint (the body has volume: the head is 13 cm round)
SMOOTH_S = 0.7  # Gaussian sigma of the smoothing
FPS = 30

_TAN_V = (SENSOR_MM / 2) / LENS_MM
_TAN_H = _TAN_V * ASPECT


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _unit(a):
    n = math.sqrt(_dot(a, a)) or 1.0
    return [a[0] / n, a[1] / n, a[2] / n]


def _points(poses):
    return [p for f in poses.values() for p in f.values()]


def footprint_axis(points):
    """Angle (rad, about y) of the long axis of the points' footprint on the mat (x/z), and how
    elongated it is (0 round .. 1 a line)."""
    n = len(points)
    mx = sum(p[0] for p in points) / n
    mz = sum(p[2] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points) / n
    szz = sum((p[2] - mz) ** 2 for p in points) / n
    sxz = sum((p[0] - mx) * (p[2] - mz) for p in points) / n
    angle = 0.5 * math.atan2(2 * sxz, sxx - szz)
    spread = math.sqrt((sxx - szz) ** 2 + 4 * sxz * sxz)
    return angle, spread / (sxx + szz or 1.0)


def _view(azimuth, elevation):
    """Unit vector from the target to the camera."""
    return [math.cos(elevation) * math.cos(azimuth), math.sin(elevation),
            math.cos(elevation) * math.sin(azimuth)]


def fit_distance(points, centre, azimuth, elevation):
    """Smallest camera distance (cm) from `centre` at which every point, grown by MARGIN_CM,
    fits in the safe band of the vertical frame (between the texts), and the tangent above the
    frame's middle at which `centre` must then be seen for the band to be centred on it."""
    back = _view(azimuth, elevation)
    right = _unit(_cross([0, 1, 0], back))
    up = _cross(back, right)
    top, bottom = (2 * SAFE_TOP - 1) * _TAN_V, (2 * SAFE_BOTTOM - 1) * _TAN_V
    shift = (top + bottom) / 2
    half_v = (top - bottom) / 2
    half_h = SAFE_SIDE * _TAN_H
    need = 0.0
    for p in points:
        d = _sub(p, centre)
        x, y, z = _dot(d, right), _dot(d, up), _dot(d, back)
        # Seen from distance D, the point is y / (D - z) above the centre's own direction.
        need = max(need, z + (abs(x) + MARGIN_CM) / half_h, z + (abs(y) + MARGIN_CM) / half_v)
    return need, shift


def _gaussian(values, sigma_frames, wrap=None):
    if sigma_frames <= 0:
        return list(values)
    radius = int(3 * sigma_frames)
    weights = [math.exp(-0.5 * (k / sigma_frames) ** 2) for k in range(-radius, radius + 1)]
    out = []
    n = len(values)
    for i in range(n):
        total = acc = 0.0
        for k, w in zip(range(-radius, radius + 1), weights):
            j = min(n - 1, max(0, i + k))
            acc += values[j] * w
            total += w
        out.append(acc / total)
    return out


def _running_max(values, radius):
    n = len(values)
    return [max(values[max(0, i - radius):min(n, i + radius + 1)]) for i in range(n)]


def _hint_azimuth(hint):
    """Azimuth of a step's camera hint (from its target to its position), or None."""
    if not hint:
        return None
    d = _sub(hint['position'], hint['target'])
    return math.atan2(d[2], d[0])


def _closest_angle(angle, reference):
    """angle + k * pi closest to reference (the footprint axis has two ends)."""
    k = round((reference - angle) / math.pi)
    return angle + k * math.pi


def camera_track(frames, hints=None, fps=FPS):
    """[(target, position)] per frame, Tatamap cm. `frames`: [{fighter: {joint: [x, y, z]}}]
    (site_timeline); `hints`: per frame, the shown step's camera hint ({'position', 'target'})
    or None."""
    hints = hints or [None] * len(frames)
    sigma = SMOOTH_S * fps
    centres, azimuths = [], []
    previous = None
    for k, poses in enumerate(frames):
        pts = _points(poses)
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        centres.append([(lo[i] + hi[i]) / 2 for i in range(3)])
        axis, elongation = footprint_axis(pts)
        hint = _hint_azimuth(hints[k])
        reference = hint if hint is not None else (previous if previous is not None else axis)
        # Turn towards the footprint's long axis (into depth, so it spreads over the frame's
        # height), but only part of the way: straight along it, the front body hides the action.
        along = _closest_angle(axis, reference)
        weight = ALONG_WEIGHT * min(1.0, elongation * 1.5)
        azimuth = reference + (along - reference) * weight
        if previous is not None:  # unwrap, so smoothing never spins the long way round
            azimuth = previous + math.atan2(math.sin(azimuth - previous), math.cos(azimuth - previous))
        azimuths.append(azimuth)
        previous = azimuth
    centres = [list(c) for c in zip(*[_gaussian([c[i] for c in centres], sigma) for i in range(3)])]
    azimuths = _gaussian(azimuths, sigma * 1.5)
    elevation = math.radians(ELEVATION_DEG)
    sway = [math.radians(SWAY_DEG) * math.sin(2 * math.pi * k / (SWAY_PERIOD_S * fps))
            for k in range(len(frames))]
    distances, shifts = [], []
    for k, poses in enumerate(frames):
        d, shift = fit_distance(_points(poses), centres[k], azimuths[k] + sway[k], elevation)
        distances.append(d)
        shifts.append(shift)
    # Widen first (a running max over the smoothing window), then smooth: the camera starts
    # easing out before a limb reaches the edge, never after.
    distances = _gaussian(_running_max(distances, int(2 * sigma)), sigma)
    track = []
    for k in range(len(frames)):
        back = _view(azimuths[k] + sway[k], elevation)
        right = _unit(_cross([0, 1, 0], back))
        up = _cross(back, right)
        # The camera stands `distance` from the fighters' centre and aims a little below it,
        # so they sit in the band between the texts rather than at the frame's middle.
        position = [centres[k][i] + back[i] * distances[k] for i in range(3)]
        target = [centres[k][i] - up[i] * shifts[k] * distances[k] for i in range(3)]
        track.append((target, position))
    return track
