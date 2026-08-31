import cv2
import numpy as np

from .video_io import frame_reader


def estimate_rotation_increments(video_path, max_frames=None, progress_every=200, on_progress=None):
    """Per-frame rotation relative to the PREVIOUS frame, via ORB feature
    matching + a RANSAC-fit similarity transform. Consecutive frames share
    similar lighting (unlike comparing against one fixed reference across
    an eclipse's huge brightness swings), so this stays reliable throughout.
    Low-confidence pairs (too few inlier matches) come back as None so the
    caller can interpolate through them rather than trust a noisy estimate."""
    orb = cv2.ORB_create(2500)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    results = []
    prev_kp, prev_des = None, None
    for idx, frame in frame_reader(video_path):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        kp, des = orb.detectAndCompute(gray, None)
        angle, n_inliers = None, 0
        if prev_des is not None and des is not None and len(kp) >= 15 and len(prev_kp) >= 15:
            matches = bf.match(prev_des, des)
            matches = sorted(matches, key=lambda m: m.distance)[:150]
            if len(matches) >= 15:
                src = np.float32([prev_kp[m.queryIdx].pt for m in matches])
                dst = np.float32([kp[m.trainIdx].pt for m in matches])
                M, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.5)
                if M is not None and inliers is not None and int(inliers.sum()) >= 15:
                    angle = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
                    n_inliers = int(inliers.sum())
        results.append((idx, angle, n_inliers))
        prev_kp, prev_des = kp, des
        if idx % progress_every == 0:
            (on_progress or print)(f"  frame {idx}...")
        if max_frames and idx >= max_frames:
            break
    return results


def build_rotation_track(increments, smooth_window=31, max_gap=5):
    """Integrate per-frame increments into a cumulative angle per frame,
    then smooth -- true field rotation changes rate slowly, so a wide
    low-pass filter removes per-frame estimation noise without cutting
    into the real trend.

    A missing (low-confidence) increment gets linearly interpolated *only*
    within a short gap -- a brief feature-matching hiccup where assuming a
    smooth continuation is reasonable. Interpolating a per-frame STEP value
    across a LONG gap is a different, much riskier assumption: over many
    frames the interpolated ramp gets integrated (summed) that many times,
    so it must fill with zero instead (i.e. assume no net rotation change
    through the unmeasurable stretch) -- the same failure mode a huge cloud-
    obscured stretch hit here: a ~52s gap interpolated between two small but
    nonzero endpoint values integrated into a wildly wrong -140deg swing."""
    n = len(increments)
    step = np.array([a if a is not None else np.nan for _, a, _ in increments])

    valid = ~np.isnan(step)
    if not np.any(valid):
        return np.zeros(n)
    valid_idx = np.where(valid)[0]
    missing_idx = np.where(~valid)[0]

    interp_vals = np.interp(missing_idx, valid_idx, step[valid_idx], left=0.0, right=step[valid_idx[-1]])
    for i, v in zip(missing_idx, interp_vals):
        before = valid_idx[valid_idx < i]
        after = valid_idx[valid_idx > i]
        gap = (after[0] - before[-1]) if len(before) and len(after) else np.inf
        step[i] = v if gap <= max_gap else 0.0
    step[0] = 0.0

    cumulative = np.cumsum(step)

    pad = smooth_window // 2
    taps = np.arange(-pad, pad + 1)
    kernel = np.exp(-(taps ** 2) / (2 * (pad / 2.5) ** 2))
    kernel /= kernel.sum()
    smoothed = np.convolve(np.pad(cumulative, pad, mode="edge"), kernel, mode="valid")
    return smoothed
