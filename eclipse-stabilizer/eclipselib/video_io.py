import shutil
import subprocess

import cv2


def _ffmpeg_exe():
    """Prefer the ffmpeg binary bundled by imageio-ffmpeg so this runs on a
    fresh machine with nothing installed beyond `pip install -r
    requirements.txt`; fall back to a system ffmpeg on PATH if that
    package isn't present."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError(
        "no ffmpeg available: run `pip install imageio-ffmpeg` "
        "or install ffmpeg and put it on PATH"
    )


def ffprobe_info(path):
    """Video metadata via OpenCV rather than shelling out to ffprobe --
    one less external binary a fresh install needs to have on PATH."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"could not open video: {path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
    nb_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return {
        "width": width,
        "height": height,
        "fps": fps,
        "nb_frames": nb_frames if nb_frames > 0 else None,
        "duration": (nb_frames / fps) if nb_frames > 0 and fps > 0 else None,
    }


def frame_reader(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"could not open video: {path}")
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        yield idx, frame
        idx += 1
    cap.release()


class FfmpegWriter:
    def __init__(self, path, fps, width, height, crf=16, preset="medium"):
        cmd = [
            _ffmpeg_exe(), "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
            "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(fps),
            "-i", "-", "-an", "-vcodec", "libx264", "-preset", preset,
            "-crf", str(crf), "-pix_fmt", "yuv420p", str(path),
        ]
        self.proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            # Without this, Windows opens a console window for ffmpeg (a
            # console-subsystem exe) even though the GUI itself has none --
            # that's the flash the app's own window doesn't explain.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def write(self, frame_bgr):
        self.proc.stdin.write(frame_bgr.tobytes())

    def close(self):
        self.proc.stdin.close()
        self.proc.wait()
        if self.proc.returncode != 0:
            raise RuntimeError(f"ffmpeg exited with code {self.proc.returncode}")
