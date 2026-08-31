# Eclipse timelapse stabilizer

Stabilizes a shaky eclipse timelapse: locks the sun or moon to a fixed
position, removes field rotation from a mount without equatorial tracking,
and skips past cloud-obscured stretches.

Built and validated on lunar eclipse footage. The tracking itself doesn't
care which body it's looking at — it just needs a bright, roughly circular
disk of known apparent size against a darker background — so a partial solar
eclipse should track the same way, though that path is less tested. Totality
with the solar filter removed (the corona, not a simple disk) is a different
kind of image this pipeline isn't built for.

## Quick start (GUI, no terminal needed)

1. Install [Python 3.10+](https://www.python.org/downloads/) if you don't
   already have it. On Windows, check "Add python.exe to PATH" during
   install.
2. Open a terminal in this folder and run:
   ```bash
   pip install -r requirements.txt
   ```
   (ffmpeg is bundled via `imageio-ffmpeg` — nothing else to install.)
3. Double-click **`run_gui.bat`** (or `run_gui.pyw`).
4. In the **Stabilize video** tab: Browse to your video, click
   **Start Processing**, wait. The final result lands in the output folder
   as `final.mp4`.

The **Extract frames** and **Build video from frames** tabs pull individual
stills from a stabilized video (sharpest frame per time window) and can
reassemble a chosen subset back into a fresh clip — useful for pulling out a
handful of the sharpest shots, or hand-culling frames before rebuilding.

## How it works

`eclipselib/detect.py` locates the disk each frame with a **directed Hough
vote**: at every strong-edge pixel, the gradient's normal points toward
increasing brightness — on the disk's limb that means straight toward the
true center, at exactly the known radius. Every edge pixel votes for a
single implied center rather than a whole circle of candidates, which
degrades gracefully on a thin crescent or a cloud eating part of the limb.
The returned confidence score is the fraction of vote weight that landed in
the winning peak — that's what `--min-score` filters on.

`eclipselib/track.py` interpolates through gaps (short ones linearly, long
ones by holding position) but does **not** smooth the position track.
Testing against real footage showed smoothing makes things worse on a mount
without equatorial tracking: the true motion is step-shaped (the mount
hunting and correcting), not a slow drift, and smoothing just lags behind
real motion instead of removing noise.

`stabilize.py` follows the raw measured position exactly within a
"reachable corridor" (a robust percentile range of where the disk actually
sits), so it lands centered every frame with zero lag error. Rare wide
excursions beyond the corridor let the disk drift toward the edge rather
than forcing the canvas to cover the full range.

`eclipselib/rotation.py` / `derotate.py` measure and remove field rotation —
real, physical, and easy to mistake for jitter: without equatorial tracking,
the sky field slowly rotates around the target over a multi-hour shoot.

## Command-line workflow

The GUI just runs these in sequence with sensible defaults; use them
directly for more control.

```bash
python analyze.py your_video.mp4 -o track.csv
```
Scans every frame, writes `track.csv` (position + confidence per frame),
and prints a confidence-score percentile breakdown.

```bash
python stabilize.py your_video.mp4 track.csv --min-score 0.06 -o output/stabilized.mp4
```
Locks the disk in frame and crops to a canvas sized to it. `--min-score`
drops cloud-obscured frames entirely (the timelapse skips forward through
that stretch); omit it to keep every frame. If unset, `eclipselib.track.
suggest_min_score` picks a reasonable default automatically (what the GUI
uses) — the 10th percentile of confidence among frames where the disk was
found.

```bash
python derotate.py output/stabilized.mp4 -o output/final.mp4
```
Removes accumulated field rotation from the already-stabilized video.

```bash
python extract_frames.py your_video.mp4 --track track.csv --best-per 30 -o frames_extracted
```
Pulls individual PNG frames. Useful modes:
- `--every N` — every Nth frame
- `--indices "100,150,300-320"` — specific frames/ranges
- `--best-per N` — sharpest frame in each window of N frames
- `--min-score X` — only frames at/above a quality threshold

Hand-review/delete files in `frames_extracted/` to curate before rebuilding.

```bash
python build_video.py frames_extracted -o output/rebuilt.mp4 --fps 24
```
Builds a fresh video from whatever frames are in that folder: re-detects and
re-stabilizes each one, then applies a mild deflicker that smooths
short-timescale brightness swings while preserving the real long-arc
dimming/reddening of the eclipse itself. Tune with `--deflicker-window`
(frames; `0` disables).

## Notes

- If auto-detection struggles (unusual framing, a very small/large disk),
  pass `--radius <pixels>` explicitly to `analyze.py` / `build_video.py`.
- `_make_test_video.py` regenerates a synthetic test clip — useful for a
  quick sanity check after any change to `eclipselib/detect.py`.
- All output goes to `output/`; extracted PNGs go to `frames_extracted/`
  by default (both configurable).

## Versioning & releasing

The app's version lives in one place, `eclipselib/version.py`, and shows in
the GUI's title bar. Every user-visible change is recorded in
[`CHANGELOG.md`](CHANGELOG.md) (format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions: [SemVer](https://semver.org/)) — bug fixes bump the patch number,
new features bump minor, breaking changes bump major.

To cut a release after making changes:
1. Bump `__version__` in `eclipselib/version.py`.
2. Add a dated entry to `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD`
   heading, describing what changed and (for fixes) why it happened.
3. Update `MyAppVersion` in `installer.iss` to match.
4. Rebuild:
   ```bash
   pip install pyinstaller
   python -m PyInstaller --noconfirm --clean eclipse_gui.spec
   "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" installer.iss
   ```
   The installer lands in `installer_output/EclipseStabilizerSetup.exe`.
5. Before shipping, sanity-check the frozen build without clicking through
   the GUI:
   ```bash
   dist\EclipseStabilizer\EclipseStabilizer.exe --selftest path\to\test_input.mp4
   ```
   Runs the real pipeline headlessly and writes `selftest_out/selftest.log`
   next to the test video; check it ends with `SELFTEST OK`.
