import cv2
import numpy as np
from dataclasses import dataclass

MAX_CONTOUR_POINTS = 20000
STRONG_EDGE_FRAC = 0.25
MIN_ABS_GRADIENT = 50.0
COMPETING_SEARCH_FRAC = (0.05, 0.30)
COMPETING_MIN_REL_MASS = 0.5


@dataclass
class Detection:
    found: bool
    cx: float
    cy: float
    r: float
    edge_score: float
    mean_brightness: float
    method: str


def lit_mask(gray):
    """Illuminated region: threshold halfway between background and near-max."""
    g = gray.astype(np.float32)
    hi = float(np.percentile(g, 99.0))
    lo = float(np.percentile(g, 5.0))
    if hi - lo < 1e-6:
        return np.zeros(g.shape, dtype=bool)
    return g >= (lo + hi) * 0.5


def _limb_radius(gray):
    """Fit a circle to the outer boundary of the illuminated region.

    Unlike area/pi, this is unbothered by the disk's own albedo variation
    (e.g. the moon's dark maria or sunspots on the sun): the dark patches
    are interior holes in the bright mask, not gaps at the
    limb, so the outer contour still traces the true disk edge and
    minEnclosingCircle recovers the right radius even with those holes
    punched out of the interior -- and even on a partial (non-full) disk,
    as long as the visible arc is bright enough to trace, since the fit
    only needs boundary points that truly lie on the limb, not full coverage."""
    mask = (lit_mask(gray) * 255).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < 25:
        return None
    _, radius = cv2.minEnclosingCircle(largest)
    return float(radius)


def estimate_radius_from_area(grays):
    """Apparent disk radius, from a limb fit on every sampled frame.

    A limb fit on a gibbous or crescent phase legitimately underestimates
    the radius -- the fitted arc only spans part of the true circle, so
    minEnclosingCircle comes up short, not wrong. Pre-selecting "fullest"
    frames by raw lit-pixel count doesn't reliably exclude these (a bright
    cloud patch elsewhere in frame inflates area without being the disk),
    so instead every sample is fit and the true radius is taken as
    whichever value recurs most often across many frames: it's physically
    constant and should dominate a histogram, while underestimates from
    partial phases scatter across a wide range of smaller values with no
    single value dominating."""
    radii = [r for r in (_limb_radius(g) for g in grays) if r is not None]
    if not radii:
        raise ValueError("could not fit the limb on any sampled frame; pass --radius explicitly")
    radii = np.array(radii)
    bucket_w = 8.0
    buckets = {}
    for r in radii:
        buckets.setdefault(round(r / bucket_w), []).append(r)
    best_bucket = max(buckets.values(), key=len)
    return float(np.median(best_bucket))


def _sobel(gray):
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    return gx, gy


def _smooth3(a):
    p = np.pad(a, 1, mode="constant")
    h = (p[:, :-2] + p[:, 1:-1] + p[:, 2:]) / 3.0
    return ((h[:-2] + h[1:-1] + h[2:]) / 3.0).astype(np.float32)


def _resolve_competing_peak(acc, py, px, r, prev, offset_x, offset_y):
    """A fixed-radius vote on a partially-lit or partially-occluded disk
    can produce two comparably strong peaks (e.g. from the upper vs lower
    visible arc). Picking whichever is momentarily stronger makes the
    estimate ALTERNATE between them as lighting/cloud cover shifts frame
    to frame -- a jump of tens of pixels with no real motion behind it.
    When a genuine competitor exists, break the tie by proximity to the
    last confirmed position: real motion is small frame-to-frame, so the
    correct candidate should almost always be the nearer one."""
    h, w = acc.shape
    span = int(COMPETING_SEARCH_FRAC[1] * r)
    if span < 1:
        return py, px
    y0, y1 = max(0, py - span), min(h, py + span + 1)
    x0, x1 = max(0, px - span), min(w, px + span + 1)
    region = acc[y0:y1, x0:x1].copy()

    ry, rx = py - y0, px - x0
    near = max(1, int(COMPETING_SEARCH_FRAC[0] * r))
    yy, xx = np.mgrid[0:region.shape[0], 0:region.shape[1]]
    region[(yy - ry) ** 2 + (xx - rx) ** 2 < near * near] = 0
    if region.size == 0 or float(region.max()) <= 0.0:
        return py, px

    sy, sx = np.unravel_index(int(np.argmax(region)), region.shape)
    cand_y, cand_x = y0 + sy, x0 + sx
    if acc[cand_y, cand_x] < COMPETING_MIN_REL_MASS * acc[py, px]:
        return py, px
    if prev is None or not prev.found:
        return py, px

    def dist_to_prev(y, x):
        return (x + offset_x - prev.cx) ** 2 + (y + offset_y - prev.cy) ** 2

    if dist_to_prev(cand_y, cand_x) < dist_to_prev(py, px):
        return cand_y, cand_x
    return py, px


def _barycenter(acc, py, px, offset_x, offset_y):
    y1, y2 = max(0, py - 2), min(acc.shape[0], py + 3)
    x1, x2 = max(0, px - 2), min(acc.shape[1], px + 3)
    block = acc[y1:y2, x1:x2].astype(np.float64)
    total = block.sum()
    if total <= 0.0:
        return None
    yy, xx = np.mgrid[y1:y2, x1:x2]
    return (
        float((block * xx).sum() / total) + offset_x,
        float((block * yy).sum() / total) + offset_y,
        total,
    )


def detect_disk(gray, expected_radius, prev=None):
    """Locate the eclipsed disk (sun or moon) by a directed Hough vote at a fixed radius.

    At each strong-edge point, the gradient's normal points toward
    increasing brightness -- on the disk's limb that means straight
    toward the true center, at exactly distance r. Every edge point
    therefore votes for a single implied center rather than an entire
    circle of candidates, which degrades gracefully on a thin crescent
    or a cloud eating part of the limb: those points still vote for the
    right place, they're just fewer of them.

    edge_score returned is a 0..1 confidence: the fraction of total vote
    weight that landed in the winning peak.
    """
    if not expected_radius or expected_radius <= 0:
        raise ValueError("detect_disk requires a known expected_radius")
    r = float(expected_radius)
    h, w = gray.shape
    g = gray.astype(np.float32)

    gx, gy = _sobel(g)
    mag = np.sqrt(gx * gx + gy * gy)
    mag_max = float(mag.max())
    if mag_max < MIN_ABS_GRADIENT:
        # A relative threshold alone isn't enough: a frame with no real
        # object still has *some* strongest pixel, just compression noise
        # at near-zero magnitude -- 0.25 of a tiny max is still "strong"
        # relative to itself. A real limb edge produces gradients an order
        # of magnitude above this even on a dim, cloud-hazed disk.
        return Detection(False, 0.0, 0.0, 0.0, 0.0, float(np.mean(gray)), "none")

    strong = mag >= STRONG_EDGE_FRAC * mag_max
    ys, xs = np.nonzero(strong)
    if len(xs) == 0:
        return Detection(False, 0.0, 0.0, 0.0, 0.0, float(np.mean(gray)), "none")

    weights = mag[ys, xs]
    if len(xs) > MAX_CONTOUR_POINTS:
        keep = np.argsort(weights)[-MAX_CONTOUR_POINTS:]
        ys, xs, weights = ys[keep], xs[keep], weights[keep]

    nx = gx[ys, xs] / weights
    ny = gy[ys, xs] / weights
    vx = xs + r * nx
    vy = ys + r * ny

    # Votes for a real disk cluster tightly around the true center; sizing
    # the accumulator to the full frame (as the reference implementation
    # does, since a solar disk's frame is comparatively small) makes the two
    # 3x3 smoothing passes dominate runtime on a source this large -- almost
    # entirely smoothing empty cells. A percentile-bounded box around the
    # actual vote spread (not raw min/max, so a handful of stray votes can't
    # blow it back up) keeps the accumulator close to the size of the
    # cluster it needs to hold.
    vx_lo, vx_hi = np.percentile(vx, [0.5, 99.5])
    vy_lo, vy_hi = np.percentile(vy, [0.5, 99.5])
    margin = max(15, int(0.05 * r))
    x_min, x_max = int(np.floor(vx_lo)) - margin, int(np.ceil(vx_hi)) + margin
    y_min, y_max = int(np.floor(vy_lo)) - margin, int(np.ceil(vy_hi)) + margin

    acc = np.zeros((y_max - y_min + 1, x_max - x_min + 1), dtype=np.float32)
    ax, ay = vx - x_min, vy - y_min
    inside = (ax >= 0) & (ax < acc.shape[1] - 1) & (ay >= 0) & (ay < acc.shape[0] - 1)
    ax, ay, wv = ax[inside], ay[inside], weights[inside]
    if len(ax) == 0:
        return Detection(False, 0.0, 0.0, 0.0, 0.0, float(np.mean(gray)), "none")

    x0 = np.floor(ax).astype(np.int64)
    y0 = np.floor(ay).astype(np.int64)
    fx = (ax - x0).astype(np.float32)
    fy = (ay - y0).astype(np.float32)
    for dx, dy, corner_w in (
        (0, 0, (1 - fx) * (1 - fy)),
        (1, 0, fx * (1 - fy)),
        (0, 1, (1 - fx) * fy),
        (1, 1, fx * fy),
    ):
        np.add.at(acc, (y0 + dy, x0 + dx), wv * corner_w)

    acc = _smooth3(_smooth3(acc))

    peak = int(np.argmax(acc))
    py, px = np.unravel_index(peak, acc.shape)
    if acc[py, px] <= 0.0:
        return Detection(False, 0.0, 0.0, 0.0, 0.0, float(np.mean(gray)), "none")

    py, px = _resolve_competing_peak(acc, py, px, r, prev, x_min, y_min)

    refined = _barycenter(acc, py, px, x_min, y_min)
    if refined is None:
        return Detection(False, 0.0, 0.0, 0.0, 0.0, float(np.mean(gray)), "none")
    cx, cy, mass = refined
    confidence = min(float(mass / max(wv.sum(), 1e-9)), 1.0)

    mask = np.zeros_like(gray, dtype=np.uint8)
    cv2.circle(mask, (int(cx), int(cy)), max(1, int(r * 0.8)), 255, -1)
    mean_brightness = float(cv2.mean(gray, mask=mask)[0])

    return Detection(True, float(cx), float(cy), r, confidence, mean_brightness, "directed")
