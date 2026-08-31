import contextlib
import queue
import re
import sys
import threading
from pathlib import Path
from tkinter import Tk, StringVar, Text, filedialog, messagebox
from tkinter import ttk

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from moonlib.track import load_track, suggest_min_score
from moonlib.video_io import ffprobe_info
from moonlib.version import __version__

# Imported directly (not shelled out via sys.executable) so this keeps
# working once packaged into a standalone exe -- in a frozen build
# sys.executable points at the packaged app itself, not a Python
# interpreter, so re-invoking "python analyze.py" from inside it can't work.
import analyze
import build_video
import derotate
import extract_frames
import stabilize

PROGRESS_RE = re.compile(r"(?:frame|wrote)\s+(\d+)")


class _QueueWriter:
    """A file-like object that forwards each printed line to on_line, so a
    script's ordinary print() calls become live GUI log lines with no
    changes to the scripts themselves."""

    def __init__(self, on_line):
        self._buf = ""
        self._on_line = on_line

    def write(self, s):
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            self._on_line(line)

    def flush(self):
        pass


_run_lock = threading.Lock()


def run_step(main_func, argv, on_line):
    """Run one pipeline script's main(argv) in-process, capturing its
    print() output as log lines. main_func is expected to raise SystemExit
    on a user-facing failure (as our scripts do) -- treated the same as any
    other error here.

    Serialized by _run_lock: redirect_stdout swaps sys.stdout globally, not
    per-thread, so two of these running at once (e.g. from two tabs) would
    interleave into each other's logs rather than staying separate."""
    with _run_lock, contextlib.redirect_stdout(_QueueWriter(on_line)):
        try:
            main_func(argv)
        except SystemExit as e:
            if e.code not in (None, 0):
                raise RuntimeError(str(e.code))


class MoonGUI:
    def __init__(self, root):
        self.root = root
        root.title(f"Moon Eclipse Stabilizer v{__version__}")
        root.geometry("760x600")

        self.msg_queue = queue.Queue()
        self.worker = None
        self.current_proc_total = 0

        notebook = ttk.Notebook(root)
        notebook.pack(fill="both", expand=True, padx=8, pady=8)

        self.stabilize_tab = ttk.Frame(notebook)
        self.extract_tab = ttk.Frame(notebook)
        self.build_tab = ttk.Frame(notebook)
        notebook.add(self.stabilize_tab, text="Stabilize video")
        notebook.add(self.extract_tab, text="Extract frames")
        notebook.add(self.build_tab, text="Build video from frames")

        self._build_stabilize_tab()
        self._build_extract_tab()
        self._build_build_tab()

        self.root.after(80, self._poll_queue)

    # ---- shared log widget -------------------------------------------------
    def _add_log_and_progress(self, parent):
        progress = ttk.Progressbar(parent, mode="determinate")
        progress.pack(fill="x", padx=10, pady=(4, 0))
        status = StringVar(value="Idle")
        ttk.Label(parent, textvariable=status).pack(anchor="w", padx=10, pady=(2, 4))

        log_frame = ttk.Frame(parent)
        log_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        text = Text(log_frame, height=14, wrap="word", state="disabled")
        scroll = ttk.Scrollbar(log_frame, command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        text.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        return progress, status, text

    def _log(self, text_widget, line):
        text_widget.configure(state="normal")
        text_widget.insert("end", line + "\n")
        text_widget.see("end")
        text_widget.configure(state="disabled")

    # ---- tab 1: stabilize ---------------------------------------------------
    def _build_stabilize_tab(self):
        tab = self.stabilize_tab
        self.video_path = StringVar()
        self.out_dir = StringVar()

        row = ttk.Frame(tab)
        row.pack(fill="x", padx=10, pady=(10, 4))
        ttk.Label(row, text="Video file:").pack(side="left")
        ttk.Entry(row, textvariable=self.video_path).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=self._pick_video).pack(side="left")

        row2 = ttk.Frame(tab)
        row2.pack(fill="x", padx=10, pady=4)
        ttk.Label(row2, text="Output folder:").pack(side="left")
        ttk.Entry(row2, textvariable=self.out_dir).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row2, text="Browse...", command=self._pick_out_dir).pack(side="left")

        adv = ttk.LabelFrame(tab, text="Advanced (optional)")
        adv.pack(fill="x", padx=10, pady=6)
        self.radius_var = StringVar()
        self.min_score_var = StringVar()
        ttk.Label(adv, text="Moon radius (px, blank = auto-detect):").grid(row=0, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(adv, textvariable=self.radius_var, width=10).grid(row=0, column=1, sticky="w")
        ttk.Label(adv, text="Cloud cutoff score (blank = auto):").grid(row=1, column=0, sticky="w", padx=6, pady=4)
        ttk.Entry(adv, textvariable=self.min_score_var, width=10).grid(row=1, column=1, sticky="w")

        btn_row = ttk.Frame(tab)
        btn_row.pack(fill="x", padx=10, pady=6)
        self.start_btn = ttk.Button(btn_row, text="Start Processing", command=self._start_stabilize)
        self.start_btn.pack(side="left")
        self.open_folder_btn = ttk.Button(btn_row, text="Open Output Folder", command=self._open_output, state="disabled")
        self.open_folder_btn.pack(side="left", padx=6)

        self.stab_progress, self.stab_status, self.stab_log = self._add_log_and_progress(tab)
        self._final_output_dir = None

    def _pick_video(self):
        path = filedialog.askopenfilename(
            title="Select eclipse video",
            filetypes=[("Video files", "*.mp4 *.mov *.m4v *.avi"), ("All files", "*.*")],
        )
        if path:
            self.video_path.set(path)
            if not self.out_dir.get():
                stem = Path(path).stem
                self.out_dir.set(str(Path(path).parent / f"{stem}_stabilized"))

    def _pick_out_dir(self):
        path = filedialog.askdirectory(title="Select output folder")
        if path:
            self.out_dir.set(path)

    def _open_output(self):
        if self._final_output_dir:
            import os
            os.startfile(self._final_output_dir)

    def _start_stabilize(self):
        video = self.video_path.get().strip()
        if not video:
            messagebox.showerror("No video selected", "Pick a video file first.")
            return
        if not self.out_dir.get().strip():
            self.out_dir.set(str(Path(video).parent / f"{Path(video).stem}_stabilized"))
        self.start_btn.configure(state="disabled")
        self.open_folder_btn.configure(state="disabled")
        self.worker = threading.Thread(target=self._run_pipeline, args=(video, self.out_dir.get()), daemon=True)
        self.worker.start()

    def _run_pipeline(self, video, out_dir_str):
        q = self.msg_queue
        try:
            out_dir = Path(out_dir_str)
            out_dir.mkdir(parents=True, exist_ok=True)
            track_csv = out_dir / "track.csv"
            stabilized_mp4 = out_dir / "stabilized.mp4"
            final_mp4 = out_dir / "final.mp4"

            q.put(("status", "stab", "Step 1/3: Analyzing frames..."))
            q.put(("progress-mode", "stab", "indeterminate"))
            argv = [video, "-o", str(track_csv)]
            if self.radius_var.get().strip():
                argv += ["--radius", self.radius_var.get().strip()]
            run_step(analyze.main, argv, lambda line: q.put(("log", "stab", line)))

            q.put(("status", "stab", "Step 2/3: Stabilizing (position + crop)..."))
            rows = load_track(str(track_csv))
            min_score = self.min_score_var.get().strip()
            min_score = float(min_score) if min_score else suggest_min_score(rows)
            q.put(("log", "stab", f"auto cloud-cutoff score: {min_score:.3f}" if not self.min_score_var.get().strip() else f"using cloud-cutoff score: {min_score:.3f}"))

            argv = [video, str(track_csv), "-o", str(stabilized_mp4), "--min-score", str(min_score)]
            run_step(stabilize.main, argv, lambda line: q.put(("log", "stab", line)))

            q.put(("status", "stab", "Step 3/3: Removing field rotation..."))
            argv = [str(stabilized_mp4), "-o", str(final_mp4)]
            run_step(derotate.main, argv, lambda line: q.put(("log", "stab", line)))

            q.put(("status", "stab", f"Done! Saved to {final_mp4}"))
            q.put(("done", "stab", str(out_dir)))
        except Exception as e:
            q.put(("error", "stab", str(e)))

    # ---- tab 2: extract frames ----------------------------------------------
    def _build_extract_tab(self):
        tab = self.extract_tab
        self.ex_video = StringVar()
        self.ex_track = StringVar()
        self.ex_out = StringVar()
        self.ex_interval = StringVar(value="1.0")

        row = ttk.Frame(tab)
        row.pack(fill="x", padx=10, pady=(10, 4))
        ttk.Label(row, text="Video file:").pack(side="left")
        ttk.Entry(row, textvariable=self.ex_video).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=lambda: self._pick_file(self.ex_video)).pack(side="left")

        row2 = ttk.Frame(tab)
        row2.pack(fill="x", padx=10, pady=4)
        ttk.Label(row2, text="Track CSV (from Stabilize tab):").pack(side="left")
        ttk.Entry(row2, textvariable=self.ex_track).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row2, text="Browse...", command=lambda: self._pick_file(self.ex_track, [("CSV", "*.csv")])).pack(side="left")

        row3 = ttk.Frame(tab)
        row3.pack(fill="x", padx=10, pady=4)
        ttk.Label(row3, text="One frame every").pack(side="left")
        ttk.Entry(row3, textvariable=self.ex_interval, width=6).pack(side="left", padx=4)
        ttk.Label(row3, text="seconds (sharpest in each window)").pack(side="left")

        row4 = ttk.Frame(tab)
        row4.pack(fill="x", padx=10, pady=4)
        ttk.Label(row4, text="Save frames to:").pack(side="left")
        ttk.Entry(row4, textvariable=self.ex_out).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row4, text="Browse...", command=self._pick_ex_out).pack(side="left")

        ttk.Button(tab, text="Extract Frames", command=self._start_extract).pack(anchor="w", padx=10, pady=6)
        self.ex_progress, self.ex_status, self.ex_log = self._add_log_and_progress(tab)

    def _pick_file(self, var, types=None):
        path = filedialog.askopenfilename(filetypes=types or [("Video files", "*.mp4 *.mov *.m4v *.avi"), ("All files", "*.*")])
        if path:
            var.set(path)
            if var is self.ex_video and not self.ex_out.get():
                self.ex_out.set(str(Path(path).parent / "frames_extracted"))

    def _pick_ex_out(self):
        path = filedialog.askdirectory(title="Select folder to save frames into")
        if path:
            self.ex_out.set(path)

    def _start_extract(self):
        video = self.ex_video.get().strip()
        track = self.ex_track.get().strip()
        if not video or not track:
            messagebox.showerror("Missing input", "Pick both a video file and its track CSV.")
            return
        try:
            interval = float(self.ex_interval.get().strip())
        except ValueError:
            messagebox.showerror("Invalid interval", "Enter a number of seconds, e.g. 1.0")
            return
        out_dir = self.ex_out.get().strip() or str(Path(video).parent / "frames_extracted")
        threading.Thread(target=self._run_extract, args=(video, track, interval, out_dir), daemon=True).start()

    def _run_extract(self, video, track, interval, out_dir):
        q = self.msg_queue
        try:
            fps = ffprobe_info(video)["fps"]
            best_per = max(1, int(round(interval * fps)))
            q.put(("status", "ex", "Extracting frames..."))
            argv = [video, "--track", track, "--best-per", str(best_per), "-o", out_dir]
            run_step(extract_frames.main, argv, lambda line: q.put(("log", "ex", line)))
            q.put(("status", "ex", f"Done! Frames saved to {out_dir}"))
            q.put(("done", "ex", out_dir))
        except Exception as e:
            q.put(("error", "ex", str(e)))

    # ---- tab 3: build video from frames --------------------------------------
    def _build_build_tab(self):
        tab = self.build_tab
        self.bv_frames_dir = StringVar()
        self.bv_out = StringVar()
        self.bv_fps = StringVar(value="24")

        row = ttk.Frame(tab)
        row.pack(fill="x", padx=10, pady=(10, 4))
        ttk.Label(row, text="Frames folder:").pack(side="left")
        ttk.Entry(row, textvariable=self.bv_frames_dir).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=self._pick_bv_frames).pack(side="left")

        row2 = ttk.Frame(tab)
        row2.pack(fill="x", padx=10, pady=4)
        ttk.Label(row2, text="Playback speed (fps):").pack(side="left")
        ttk.Entry(row2, textvariable=self.bv_fps, width=6).pack(side="left", padx=4)

        row3 = ttk.Frame(tab)
        row3.pack(fill="x", padx=10, pady=4)
        ttk.Label(row3, text="Save video as:").pack(side="left")
        ttk.Entry(row3, textvariable=self.bv_out).pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(row3, text="Browse...", command=self._pick_bv_out).pack(side="left")

        ttk.Button(tab, text="Build Video", command=self._start_build).pack(anchor="w", padx=10, pady=6)
        self.bv_progress, self.bv_status, self.bv_log = self._add_log_and_progress(tab)

    def _pick_bv_frames(self):
        path = filedialog.askdirectory(title="Select folder of extracted frames")
        if path:
            self.bv_frames_dir.set(path)
            if not self.bv_out.get():
                self.bv_out.set(str(Path(path).parent / "rebuilt.mp4"))

    def _pick_bv_out(self):
        path = filedialog.asksaveasfilename(defaultextension=".mp4", filetypes=[("MP4 video", "*.mp4")])
        if path:
            self.bv_out.set(path)

    def _start_build(self):
        frames_dir = self.bv_frames_dir.get().strip()
        if not frames_dir:
            messagebox.showerror("Missing input", "Pick a folder of extracted frames.")
            return
        out = self.bv_out.get().strip() or str(Path(frames_dir).parent / "rebuilt.mp4")
        try:
            fps = float(self.bv_fps.get().strip())
        except ValueError:
            messagebox.showerror("Invalid fps", "Enter a number, e.g. 24")
            return
        threading.Thread(target=self._run_build, args=(frames_dir, out, fps), daemon=True).start()

    def _run_build(self, frames_dir, out, fps):
        q = self.msg_queue
        try:
            q.put(("status", "bv", "Building video..."))
            argv = [frames_dir, "-o", out, "--fps", str(fps)]
            run_step(build_video.main, argv, lambda line: q.put(("log", "bv", line)))
            q.put(("status", "bv", f"Done! Saved to {out}"))
            q.put(("done", "bv", str(Path(out).parent)))
        except Exception as e:
            q.put(("error", "bv", str(e)))

    # ---- queue polling / dispatch --------------------------------------------
    def _widgets_for(self, tag):
        return {
            "stab": (self.stab_log, self.stab_status, self.stab_progress),
            "ex": (self.ex_log, self.ex_status, self.ex_progress),
            "bv": (self.bv_log, self.bv_status, self.bv_progress),
        }[tag]

    def _poll_queue(self):
        try:
            while True:
                kind, tag, payload = self.msg_queue.get_nowait()
                log_w, status_v, progress_w = self._widgets_for(tag)
                if kind == "log":
                    self._log(log_w, payload)
                    m = PROGRESS_RE.search(payload)
                    if m:
                        progress_w.configure(mode="determinate")
                        progress_w["value"] = min(100, progress_w["value"] + 2)
                elif kind == "status":
                    status_v.set(payload)
                elif kind == "progress-mode":
                    progress_w.configure(mode=payload)
                    progress_w.start(15) if payload == "indeterminate" else progress_w.stop()
                elif kind == "done":
                    progress_w.stop()
                    progress_w.configure(mode="determinate")
                    progress_w["value"] = 100
                    if tag == "stab":
                        self._final_output_dir = payload
                        self.open_folder_btn.configure(state="normal")
                        self.start_btn.configure(state="normal")
                elif kind == "error":
                    progress_w.stop()
                    status_v.set(f"Error: {payload}")
                    self._log(log_w, f"ERROR: {payload}")
                    if tag == "stab":
                        self.start_btn.configure(state="normal")
                    messagebox.showerror("Processing failed", payload)
        except queue.Empty:
            pass
        self.root.after(80, self._poll_queue)


def _selftest(video_path):
    """Headless smoke test for a packaged build: runs the real pipeline
    in-process (the same run_step() path the GUI uses) against a given
    video with no Tk window involved, so a frozen exe's actual behavior
    can be verified by exit code rather than assumed from "it launched".

    Writes to a log file, not stdout: a windowed (console=False) frozen
    build has no console attached, and sys.stdout is commonly None there
    -- print() or writing to it would crash before any real test ran."""
    from pathlib import Path
    out_dir = Path(video_path).parent / "selftest_out"
    out_dir.mkdir(parents=True, exist_ok=True)
    track = out_dir / "track.csv"
    stab = out_dir / "stabilized.mp4"
    final = out_dir / "final.mp4"
    log_path = out_dir / "selftest.log"

    with open(log_path, "w") as logf:
        on_line = lambda line: (logf.write(line + "\n"), logf.flush())

        def fail(msg):
            logf.write(f"SELFTEST FAILED: {msg}\n")
            sys.exit(1)

        try:
            run_step(analyze.main, [video_path, "-o", str(track)], on_line)
            rows = load_track(str(track))
            min_score = suggest_min_score(rows)
            run_step(stabilize.main, [video_path, str(track), "-o", str(stab), "--min-score", str(min_score)], on_line)
            run_step(derotate.main, [str(stab), "-o", str(final)], on_line)
        except Exception as e:
            fail(str(e))
        if not final.exists() or final.stat().st_size == 0:
            fail("no output produced")
        logf.write(f"SELFTEST OK: {final} ({final.stat().st_size} bytes)\n")
    sys.exit(0)


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--selftest":
        _selftest(sys.argv[2])
        return
    root = Tk()
    MoonGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
