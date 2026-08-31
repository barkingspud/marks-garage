import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from moonlib.video_io import frame_reader
from moonlib.track import load_track

import cv2


def parse_indices(spec):
    out = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-")
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Extract individual frames from the timelapse as PNGs.")
    ap.add_argument("video")
    ap.add_argument("-o", "--out-dir", default="frames_extracted")
    ap.add_argument("--every", type=int, default=None, help="extract every Nth frame")
    ap.add_argument("--indices", default=None, help='e.g. "10,15,100-120"')
    ap.add_argument("--track", default=None, help="track CSV from analyze.py; required for --min-score / --best-per")
    ap.add_argument("--min-score", type=float, default=None, help="only extract frames at/above this edge_score (needs --track)")
    ap.add_argument("--best-per", type=int, default=None, help="within each window of this many frames, keep only the sharpest (needs --track)")
    args = ap.parse_args(argv)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    scores = {}
    if args.track:
        scores = {r["frame"]: r["edge_score"] for r in load_track(args.track)}

    wanted = parse_indices(args.indices) if args.indices else None

    if args.best_per:
        if not scores:
            raise SystemExit("--best-per requires --track")
        frames_sorted = sorted(scores.keys())
        wanted = set()
        for i in range(0, len(frames_sorted), args.best_per):
            window = frames_sorted[i:i + args.best_per]
            wanted.add(max(window, key=lambda f: scores[f]))

    written = 0
    for idx, frame in frame_reader(args.video):
        if wanted is not None and idx not in wanted:
            continue
        if args.every and idx % args.every != 0:
            continue
        if args.min_score is not None and scores.get(idx, -1) < args.min_score:
            continue
        cv2.imwrite(str(out_dir / f"frame_{idx:06d}.png"), frame)
        written += 1

    print(f"wrote {written} frames to {out_dir}")


if __name__ == "__main__":
    main()
