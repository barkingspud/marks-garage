import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from moonlib.video_io import FfmpegWriter

import cv2
import numpy as np

W, H, FPS, N = 640, 480, 10.0, 150
rng = np.random.default_rng(0)

writer = FfmpegWriter("test_input.mp4", FPS, W, H)
base_cx, base_cy, r = 300.0, 250.0, 40.0

for i in range(N):
    frame = np.zeros((H, W, 3), dtype=np.uint8)
    frame[:] = (18, 14, 10)

    jitter_x = 15 * np.sin(i * 0.3) + rng.normal(0, 2)
    jitter_y = 10 * np.cos(i * 0.2) + rng.normal(0, 2)
    cx, cy = base_cx + jitter_x, base_cy + jitter_y

    phase = i / N
    if 0.45 < phase < 0.65:
        color = (40, 70, 150)
    else:
        color = (210, 210, 225)

    cloudy = 0.75 < phase < 0.9
    cv2.circle(frame, (int(cx), int(cy)), int(r), color, -1)
    if cloudy:
        frame = cv2.GaussianBlur(frame, (41, 41), 18)

    noise = rng.normal(0, 4, frame.shape).astype(np.int16)
    frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    writer.write(frame)

writer.close()
print("wrote test_input.mp4")
