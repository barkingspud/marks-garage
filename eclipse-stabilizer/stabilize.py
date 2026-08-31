import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eclipselib.track import load_track, reject_outliers, smooth_positions
from eclipselib.video_io import frame_reader, ffprobe_info, FfmpegWriter

import cv2
import numpy as np


def main(argv=None):
    ap = argparse.ArgumentParser(description="Stabilize a timelapse by re-centering the detected disk every frame.")
    ap.add_argument("video")
    ap.add_argument("track_csv")
    ap.add_argument("-o", "--out", default="output/stabilized.mp4")
    ap.add_argument("--min-score", type=float, default=None, help="drop frames with edge_score below this (cuts cloud-obscured stretches)")
    ap.add_argument("--corridor-pct", type=float, default=2.0, help="percentile excluded from each end of the reachable corridor (default 2 = use the 2nd-98th percentile range)")
    ap.add_argument("--overshoot", type=float, default=None, help="how far the window may follow the disk beyond the corridor before it stops and lets the disk drift, in px (default: the disk radius)")
    ap.add_argument("--margin", type=float, default=1.15, help="extra fractional headroom around the corridor width/height (default 1.15 = 15% extra)")
    args = ap.parse_args(argv)

    video_path = Path(args.video)
    info = ffprobe_info(video_path)
    w, h, fps = info["width"], info["height"], info["fps"]

    rows = load_track(args.track_csv)
    rows, n_outliers = reject_outliers(rows)
    if n_outliers:
        print(f"rejected {n_outliers} position outliers (false locks on features other than the eclipsed disk)")
    rows = smooth_positions(rows)

    kept = [r for r in rows if args.min_score is None or r["edge_score"] >= args.min_score]
    if not kept:
        raise SystemExit("no frames survive --min-score; try a lower threshold")
    dropped = len(rows) - len(kept)
    if dropped:
        print(f"dropping {dropped}/{len(rows)} frames below min-score {args.min_score} (cloud-obscured)")

    anchor = [r for r in kept if r["found"]] or [r for r in rows if r["found"]]
    good_cx = np.array([r["cx_smooth"] for r in anchor])
    good_cy = np.array([r["cy_smooth"] for r in anchor])
    radius_typical = float(np.median([r["r"] for r in anchor]))
    overshoot = args.overshoot if args.overshoot is not None else radius_typical

    # The window follows the RAW measured position exactly while it's within
    # a "reachable corridor" (a robust percentile range, so a handful of rare
    # wide excursions -- e.g. the camera being physically repositioned mid-shoot
    # -- don't force the corridor, and therefore the canvas, to cover the full
    # range). Within the corridor the disk lands exactly centered every frame,
    # with zero lag error, however erratically it actually moved -- no
    # smoothing is applied (see track.smooth_positions for why). Beyond the
    # corridor the window is allowed to keep following for `overshoot` more
    # pixels (filled by border replication when that pushes past the source
    # edges) before it stops and lets the disk visibly drift off-center --
    # deliberately: on a timelapse a large excursion reads as what actually
    # happened in front of the camera, not as a defect to paper over with an
    # enormous canvas.
    bx_lo, bx_hi = np.percentile(good_cx, [args.corridor_pct, 100 - args.corridor_pct])
    by_lo, by_hi = np.percentile(good_cy, [args.corridor_pct, 100 - args.corridor_pct])
    print(f"corridor: x=[{bx_lo:.0f}, {bx_hi:.0f}]  y=[{by_lo:.0f}, {by_hi:.0f}]  overshoot={overshoot:.0f}px")

    min_w_for_disk = int(np.ceil(2 * radius_typical * 1.12))
    min_h_for_disk = int(np.ceil(2 * radius_typical * 1.12))
    out_w = max(min_w_for_disk, int(np.ceil((bx_hi - bx_lo) * args.margin)))
    out_h = max(min_h_for_disk, int(np.ceil((by_hi - by_lo) * args.margin)))
    out_w, out_h = min(out_w, w), min(out_h, h)
    if out_w % 2:
        out_w -= 1
    if out_h % 2:
        out_h -= 1

    # Padding needed so the moving crop window never reads outside the (padded)
    # frame, computed once from the worst-case clamped window position.
    win_x_lo, win_x_hi = bx_lo - overshoot, bx_hi + overshoot
    win_y_lo, win_y_hi = by_lo - overshoot, by_hi + overshoot
    pad_l = int(np.ceil(max(0.0, out_w / 2 - win_x_lo)))
    pad_r = int(np.ceil(max(0.0, (win_x_hi + out_w / 2) - w)))
    pad_t = int(np.ceil(max(0.0, out_h / 2 - win_y_lo)))
    pad_b = int(np.ceil(max(0.0, (win_y_hi + out_h / 2) - h)))

    print(f"output canvas: {out_w}x{out_h}  (source padded L{pad_l}/R{pad_r}/T{pad_t}/B{pad_b}px for overshoot)")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    kept_idx = {r["frame"] for r in kept}
    row_by_frame = {r["frame"]: r for r in rows}
    writer = FfmpegWriter(args.out, fps, out_w, out_h)
    written = 0
    for idx, frame in frame_reader(video_path):
        if idx not in kept_idx:
            continue
        r = row_by_frame[idx]
        window_cx = float(np.clip(r["cx_smooth"], win_x_lo, win_x_hi)) + pad_l
        window_cy = float(np.clip(r["cy_smooth"], win_y_lo, win_y_hi)) + pad_t
        crop_l = int(round(window_cx - out_w / 2))
        crop_t = int(round(window_cy - out_h / 2))

        if pad_l or pad_r or pad_t or pad_b:
            frame = cv2.copyMakeBorder(frame, pad_t, pad_b, pad_l, pad_r, cv2.BORDER_REPLICATE)
        cropped = frame[crop_t:crop_t + out_h, crop_l:crop_l + out_w]
        writer.write(cropped)
        written += 1
        if written % 200 == 0:
            print(f"  wrote {written} frames...")
    writer.close()
    print(f"wrote {written} frames to {args.out}")


if __name__ == "__main__":
    main()
