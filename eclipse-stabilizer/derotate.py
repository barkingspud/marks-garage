import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eclipselib.rotation import estimate_rotation_increments, build_rotation_track
from eclipselib.video_io import frame_reader, ffprobe_info, FfmpegWriter

import cv2
import numpy as np


def main(argv=None):
    ap = argparse.ArgumentParser(description="Remove field rotation from an already translation-stabilized video.")
    ap.add_argument("video")
    ap.add_argument("-o", "--out", default="output/derotated.mp4")
    args = ap.parse_args(argv)

    video_path = Path(args.video)
    info = ffprobe_info(video_path)
    w, h, fps = info["width"], info["height"], info["fps"]

    print("estimating frame-to-frame rotation...")
    increments = estimate_rotation_increments(video_path)
    n_valid = sum(1 for _, a, _ in increments if a is not None)
    print(f"{n_valid}/{len(increments)} frame pairs gave a confident rotation estimate")

    cumulative = build_rotation_track(increments)
    print(f"total accumulated rotation: {cumulative[-1]:.1f} deg over {len(cumulative)} frames")

    # The stabilization target sits at the canvas center by construction, and
    # a circular disk centered on the rotation axis doesn't move when rotated
    # -- so correcting around (w/2, h/2) needs no extra crop; only the black
    # background sweeps, which is invisible against it.
    center = (w / 2.0, h / 2.0)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    writer = FfmpegWriter(args.out, fps, w, h)
    written = 0
    for idx, frame in frame_reader(video_path):
        # Verified empirically against a known synthetic rotation: estimate_rotation_increments
        # reports the angle in the sign convention that directly cancels the drift when passed
        # straight into getRotationMatrix2D -- no negation needed (confirmed against a negated
        # version, which measurably made things worse).
        angle = cumulative[idx] if idx < len(cumulative) else cumulative[-1]
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(frame, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        writer.write(rotated)
        written += 1
        if written % 200 == 0:
            print(f"  wrote {written} frames...")
    writer.close()
    print(f"wrote {written} frames to {args.out}")


if __name__ == "__main__":
    main()
