import csv

import numpy as np


def suggest_min_score(rows, percentile=10.0):
    """A reasonable default cloud/quality cutoff with no manual tuning:
    the Nth percentile of edge_score among frames where the moon was
    actually found. This sits just above the noise floor of otherwise-
    successful detections, cutting the weakest slice of legitimate
    detections along with everything already zeroed out (not-found,
    rejected outliers) -- without requiring whoever is running this to
    know what a sensible score even looks like for their footage."""
    scores = [r["edge_score"] for r in rows if r["found"]]
    if not scores:
        return 0.0
    return float(np.percentile(scores, percentile))


def load_track(csv_path):
    rows = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            rows.append({
                "frame": int(row["frame"]),
                "t_sec": float(row["t_sec"]),
                "found": row["found"] == "True",
                "cx": float(row["cx"]),
                "cy": float(row["cy"]),
                "r": float(row["r"]),
                "edge_score": float(row["edge_score"]),
                "mean_brightness": float(row["mean_brightness"]),
            })
    return rows


def reject_outliers(rows, window=21, min_threshold=20.0, threshold_frac=0.08, max_passes=4):
    """A per-frame Hough match occasionally locks onto something that
    isn't the moon (a cloud-lit patch, a lens artifact) rather than
    failing outright -- it still passes as 'found' with a plausible
    edge_score, but its position is wrong. The moon's true motion is
    smooth (camera drift, not teleportation), so any detection that
    jumps far from the local trend is almost certainly one of these
    false locks. Demote it to 'not found' so downstream interpolation
    bridges over it instead of the output visibly jumping to it.

    Runs multiple passes: a false lock sitting right next to another
    false lock can drag the rolling median enough that neither looks
    like an outlier on its own -- removing the clearest offenders first
    lets the median recover and exposes the rest on the next pass."""

    def rolling_median(a, w):
        pad = w // 2
        padded = np.pad(a, pad, mode="edge")
        return np.array([np.median(padded[i:i + w]) for i in range(len(a))])

    total = 0
    for _ in range(max_passes):
        found_idx = [i for i, r in enumerate(rows) if r["found"]]
        if len(found_idx) < window:
            break

        cx = np.array([rows[i]["cx"] for i in found_idx])
        cy = np.array([rows[i]["cy"] for i in found_idx])
        radius = np.median([rows[i]["r"] for i in found_idx])

        med_cx = rolling_median(cx, window)
        med_cy = rolling_median(cy, window)
        dist = np.sqrt((cx - med_cx) ** 2 + (cy - med_cy) ** 2)
        threshold = max(min_threshold, radius * threshold_frac)

        pass_outliers = 0
        for k, i in enumerate(found_idx):
            if dist[k] > threshold:
                rows[i]["found"] = False
                rows[i]["edge_score"] = 0.0
                rows[i]["outlier"] = True
                pass_outliers += 1
        total += pass_outliers
        if pass_outliers == 0:
            break
    return rows, total


def smooth_positions(rows, max_gap=30):
    """Interpolate through gaps where the moon wasn't found or was
    rejected as an outlier; otherwise pass the raw measured position
    through untouched.

    This used to also run the raw position through a wide low-pass
    filter. Removed: a mount without equatorial tracking doesn't drift,
    it hunts -- alternately overshooting and correcting -- which shows up
    as a genuinely step-shaped position track, not a noisy one. Measuring
    frame-to-frame correlation on this footage's raw track confirms it:
    strongly negative (each step tends to reverse the last one), the
    signature of a mount correcting itself, not a smoothly panning one.
    Smoothing a step-shaped signal doesn't remove noise, it removes the
    steps -- flattening real, correct motion into a lagged average that
    puts the disk in the wrong place every single frame the raw position
    was moving. The reference implementation this was ported from tested
    exactly this change against decoded ground-truth frames and confirmed
    the raw track was the closer match every time.

    Outlier rejection stays: it targets detections that are wrong, not
    detections that are just early/late relative to a smoothed average,
    so removing the smoothing doesn't undo its purpose."""
    n = len(rows)
    cx = np.array([r["cx"] for r in rows])
    cy = np.array([r["cy"] for r in rows])
    found = np.array([r["found"] for r in rows])

    idxs = np.where(found)[0]
    if len(idxs) == 0:
        raise RuntimeError("no frames with a detected moon; cannot build a track")

    cx_interp, cy_interp = cx.copy(), cy.copy()
    for i in range(n):
        if found[i]:
            continue
        before = idxs[idxs < i]
        after = idxs[idxs > i]
        if len(before) and len(after):
            b, a = before[-1], after[0]
            if a - b <= max_gap:
                t = (i - b) / (a - b)
                cx_interp[i] = cx[b] * (1 - t) + cx[a] * t
                cy_interp[i] = cy[b] * (1 - t) + cy[a] * t
            else:
                cx_interp[i], cy_interp[i] = cx[b], cy[b]
        elif len(before):
            cx_interp[i], cy_interp[i] = cx[before[-1]], cy[before[-1]]
        elif len(after):
            cx_interp[i], cy_interp[i] = cx[after[0]], cy[after[0]]

    for i, row in enumerate(rows):
        row["cx_smooth"] = float(cx_interp[i])
        row["cy_smooth"] = float(cy_interp[i])
    return rows
