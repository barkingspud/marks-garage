import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eclipselib.detect import detect_disk, estimate_radius_from_area
from eclipselib.video_io import FfmpegWriter

import cv2
import numpy as np


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build a stabilized, deflickered video from a folder of individual frames.")
    ap.add_argument("frames_dir")
    ap.add_argument("-o", "--out", default="output/rebuilt.mp4")
    ap.add_argument("--fps", type=float, default=24.0)
    ap.add_argument("--radius", type=float, default=None)
    ap.add_argument("--deflicker-window", type=int, default=15, help="frames to smooth local brightness over; 0 disables")
    args = ap.parse_args(argv)

    paths = sorted(set(
        list(Path(args.frames_dir).glob("*.png"))
        + list(Path(args.frames_dir).glob("*.jpg"))
        + list(Path(args.frames_dir).glob("*.tif"))
    ))
    if not paths:
        raise SystemExit(f"no image files found in {args.frames_dir}")
    print(f"found {len(paths)} frames")

    frames = [cv2.imread(str(p)) for p in paths]
    h, w = frames[0].shape[:2]
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]

    radius = args.radius or estimate_radius_from_area(grays)
    print(f"expected disk radius: {radius:.1f}px")

    prev = None
    dets = []
    for gray in grays:
        d = detect_disk(gray, expected_radius=radius, prev=prev)
        dets.append(d)
        if d.found:
            prev = d

    found_idx = [i for i, d in enumerate(dets) if d.found]
    if not found_idx:
        raise SystemExit("disk not detected in any frame; try passing --radius")
    if len(found_idx) < len(dets):
        print(f"warning: disk not detected in {len(dets) - len(found_idx)}/{len(dets)} frames; those reuse the nearest detection")

    cx = np.array([dets[i].cx if dets[i].found else np.nan for i in range(len(dets))])
    cy = np.array([dets[i].cy if dets[i].found else np.nan for i in range(len(dets))])
    for i in range(len(dets)):
        if np.isnan(cx[i]):
            nearest = min(found_idx, key=lambda j: abs(j - i))
            cx[i], cy[i] = dets[nearest].cx, dets[nearest].cy

    cx_min, cx_max = float(cx.min()), float(cx.max())
    cy_min, cy_max = float(cy.min()), float(cy.max())
    target_cx, target_cy = (cx_min + cx_max) / 2.0, (cy_min + cy_max) / 2.0

    # See stabilize.py for the full reasoning: a window merely centered on the
    # original frame doesn't put the disk at the window's own center unless
    # built directly around target, and the canvas must be sized to the disk's
    # own diameter (not just the trajectory's tight bounding range) or the
    # disk itself clips regardless of centering.
    radius_typical = float(np.median([d.r for d in dets if d.found]))
    min_w_for_disk = int(np.ceil(2 * radius_typical * 1.12))
    min_h_for_disk = int(np.ceil(2 * radius_typical * 1.12))

    out_w = max(int(2 * min(cx_min, w - cx_max)), int(np.ceil(cx_max - cx_min)), min_w_for_disk)
    out_h = max(int(2 * min(cy_min, h - cy_max)), int(np.ceil(cy_max - cy_min)), min_h_for_disk)
    out_w, out_h = min(out_w, w), min(out_h, h)

    crop_l = int(round(target_cx - out_w / 2))
    crop_t = int(round(target_cy - out_h / 2))
    crop_l = max(0, min(crop_l, w - out_w))
    crop_t = max(0, min(crop_t, h - out_h))
    crop_r = w - out_w - crop_l
    crop_b = h - out_h - crop_t

    if out_w <= 0 or out_h <= 0:
        raise SystemExit("frames disagree too much on disk position to find a common crop; check for a bad detection (try --radius)")
    if out_w % 2:
        crop_r += 1
        out_w -= 1
    if out_h % 2:
        crop_b += 1
        out_h -= 1

    brightness = []
    for i, f in enumerate(frames):
        mask = np.zeros((h, w), dtype=np.uint8)
        r = int(dets[i].r) if dets[i].found else int(radius)
        cv2.circle(mask, (int(cx[i]), int(cy[i])), max(4, int(r * 1.5)), 255, -1)
        gray = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        brightness.append(float(cv2.mean(gray, mask=mask)[0]))
    brightness = np.array(brightness)

    if args.deflicker_window > 1 and len(frames) > 1:
        win = min(args.deflicker_window, len(frames))
        pad = win // 2
        padded = np.pad(brightness, pad, mode="edge")
        target_curve = np.array([np.median(padded[i:i + win]) for i in range(len(brightness))])
        gain = np.clip(target_curve / np.maximum(brightness, 1.0), 0.5, 2.0)
    else:
        gain = np.ones(len(frames))

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    writer = FfmpegWriter(args.out, args.fps, out_w, out_h)
    for i, f in enumerate(frames):
        dx, dy = target_cx - cx[i], target_cy - cy[i]
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        shifted = cv2.warpAffine(f, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        cropped = shifted[crop_t:crop_t + out_h, crop_l:crop_l + out_w]
        adjusted = np.clip(cropped.astype(np.float32) * gain[i], 0, 255).astype(np.uint8)
        writer.write(adjusted)
    writer.close()
    print(f"wrote {len(frames)} frames to {args.out} ({out_w}x{out_h} @ {args.fps}fps)")


if __name__ == "__main__":
    main()
