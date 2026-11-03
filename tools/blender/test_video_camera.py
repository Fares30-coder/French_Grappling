"""python3 -m unittest tools/blender/test_video_camera.py"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import video_camera as vc  # noqa: E402


def lying(x0, z, length=170):
    """A fighter lying along x at depth z: 11 joints from x0 to x0 + length."""
    names = ['head', 'neck', 'hip', 'elbowL', 'handL', 'elbowR', 'handR', 'kneeL', 'footL',
             'kneeR', 'footR']
    return {n: [x0 + length * i / 10, 15, z + (8 if n.endswith('L') else -8 if n.endswith('R') else 0)]
            for i, n in enumerate(names)}


def project(point, target, position):
    """Tangents (across, up) of a point seen from `position` aiming at `target`."""
    fwd = vc._unit(vc._sub(target, position))
    right = vc._unit(vc._cross(fwd, [0, 1, 0]))
    up = vc._cross(right, fwd)
    d = vc._sub(point, position)
    depth = vc._dot(d, fwd)
    return vc._dot(d, right) / depth, vc._dot(d, up) / depth


class CameraTrack(unittest.TestCase):
    def test_footprint_axis(self):
        angle, elongation = vc.footprint_axis([[x, 0, 0] for x in range(0, 200, 10)])
        self.assertAlmostEqual(math.sin(angle), 0, places=6)
        self.assertGreater(elongation, 0.99)

    def test_looks_along_lying_fighters_and_fits_them(self):
        poses = {'me': lying(0, 0), 'opponent': lying(20, 30)}
        track = vc.camera_track([poses] * 60)
        target, position = track[30]
        view = vc._sub(position, target)
        # Turned towards x (the bodies' length) rather than across them.
        self.assertGreater(abs(view[0]), abs(view[2]))
        for f in poses.values():
            for p in f.values():
                across, up = project(p, target, position)
                self.assertLess(abs(across), vc._TAN_H)
                self.assertLess(up, (2 * vc.SAFE_TOP - 1) * vc._TAN_V)
                self.assertGreater(up, (2 * vc.SAFE_BOTTOM - 1) * vc._TAN_V)

    def test_follows_fighters_that_move(self):
        frames = [{'me': lying(k * 3, 0), 'opponent': lying(k * 3 + 20, 30)} for k in range(120)]
        first, last = vc.camera_track(frames)[0][0], vc.camera_track(frames)[-1][0]
        self.assertGreater(last[0] - first[0], 200)


if __name__ == '__main__':
    unittest.main()
