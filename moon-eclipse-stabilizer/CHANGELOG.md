# Changelog

All notable changes to Moon Eclipse Stabilizer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH).

## [1.0.1] - 2026-08-31

### Fixed
- A console window no longer flashes on screen while ffmpeg encodes in the
  background. Windows opens a console for any console-subsystem child
  process (ffmpeg) spawned from a windowed app unless told not to
  (`CREATE_NO_WINDOW`); the GUI itself was silent, ffmpeg wasn't.

## [1.0.0] - 2026-08-30

### Added
- Double-click GUI (`moon_gui.py` / `MoonEclipseStabilizer.exe`) with three
  tabs: Stabilize video, Extract frames, Build video from frames. Runs the
  full pipeline with sensible defaults (auto radius, auto cloud-cutoff
  score) so no flags or terminal use are required.
- Windows installer (Inno Setup) — Program Files install, Start Menu and
  optional desktop shortcuts, uninstaller entry in Apps & Features. Fully
  self-contained: OpenCV, NumPy, and ffmpeg (via `imageio-ffmpeg`) are
  bundled, so nothing needs to be separately installed on the target
  machine.
- Core stabilization pipeline:
  - `analyze.py` — locates the moon each frame via a **directed Hough
    vote**: every strong-edge pixel votes for a single implied center at
    the known radius, rather than fitting a circle to a full contour.
    Degrades gracefully on a thin crescent or a cloud eating part of the
    limb. Includes a deterministic tie-break for the case where a
    partially-lit disk produces two comparably strong candidate centers.
  - Radius auto-estimation via a limb fit (`cv2.minEnclosingCircle` on the
    illuminated region's contour) on the frames showing the most
    illuminated area, robust to the moon's own albedo variation (dark
    maria) that defeats a simple brightness/area threshold.
  - `stabilize.py` — locks the moon to a fixed on-screen position by
    following the *raw* measured position (no temporal smoothing) within a
    "reachable corridor" (a robust percentile range), so it lands centered
    every frame with zero lag error. Rare wide excursions beyond the
    corridor let the disk drift toward the edge rather than forcing the
    canvas to cover the full range. Smoothing was deliberately removed
    after confirming (against real footage) that a mount without
    equatorial tracking moves in steps, not a slow drift — smoothing a
    step-shaped signal lags behind real motion instead of removing noise.
  - `derotate.py` — measures and removes field rotation accumulated over a
    multi-hour shoot on a mount without equatorial tracking, via
    frame-to-frame ORB feature matching integrated into a cumulative
    rotation curve.
  - `extract_frames.py` / `build_video.py` — pull individual stills
    (sharpest per time window) and reassemble a chosen subset into a fresh,
    stabilized, deflickered video.
- Automatic cloud-cutoff scoring (`moonlib.track.suggest_min_score`) so the
  GUI needs no manual threshold tuning.

[1.0.1]: #101---2026-08-31
[1.0.0]: #100---2026-08-30
