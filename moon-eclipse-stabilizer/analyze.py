import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from moonlib.detect import detect_moon, estimate_radius_from_area
from moonlib.video_io import frame_reader, ffprobe_info

import cv2


def estimate_radius(path, sample_count=150):
    info = ffprobe_info(path)
    total = info["nb_frames"] or 1000
    step = max(1, total // sample_count)
    grays = []
    for idx, frame in frame_reader(path):
        if idx % step == 0:
            grays.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        if idx > total:
            break
    return estimate_radius_from_area(grays)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Detect the moon in every frame and write a track CSV.")
    ap.add_argument("video")
    ap.add_argument("-o", "--out", default=None, help="output CSV path (default: <video>_track.csv)")
    ap.add_argument("--radius", type=float, default=None, help="expected moon radius in px (auto-estimated if omitted)")
    args = ap.parse_args(argv)

    video_path = Path(args.video)
    out_path = Path(args.out) if args.out else video_path.with_name(video_path.stem + "_track.csv")

    info = ffprobe_info(video_path)
    print(f"video: {info['width']}x{info['height']} @ {info['fps']:.3f}fps, ~{info['nb_frames']} frames")

    expected_r = args.radius
    if not expected_r:
        try:
            expected_r = estimate_radius(video_path)
        except ValueError as e:
            raise SystemExit(str(e))
    print(f"expected moon radius: {expected_r:.1f}px")

    prev = None
    rows = []
    for idx, frame in frame_reader(video_path):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        d = detect_moon(gray, expected_radius=expected_r, prev=prev)
        rows.append((idx, idx / info["fps"], d.found, d.cx, d.cy, d.r, d.edge_score, d.mean_brightness))
        if d.found:
            prev = d
        if idx % 200 == 0:
            print(f"  frame {idx}...")

    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["frame", "t_sec", "found", "cx", "cy", "r", "edge_score", "mean_brightness"])
        w.writerows(rows)

    found_count = sum(1 for r in rows if r[2])
    print(f"done: {found_count}/{len(rows)} frames had a detected moon")

    scores = sorted(r[6] for r in rows if r[2])
    if scores:
        p10 = scores[int(len(scores) * 0.10)]
        p30 = scores[int(len(scores) * 0.30)]
        p50 = scores[int(len(scores) * 0.50)]
        print(f"edge_score distribution: p10={p10:.1f} p30={p30:.1f} p50={p50:.1f} max={scores[-1]:.1f}")
        print("tip: pass --min-score (around p10-p30) to stabilize.py to cut cloud-obscured stretches")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
