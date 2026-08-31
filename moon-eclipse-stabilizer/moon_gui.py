import contextlib
import queue
import re
import sys
import threading
from pathlib import Path
from tkinter import filedialog, messagebox

import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap import ToolTip

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

THEME = "nord-dark"
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
        root.geometry("920x680")
        root.minsize(760, 560)

        self.msg_queue = queue.Queue()
        self.worker = None
        self.current_proc_total = 0

        header = tb.Frame(root, padding=(16, 12, 16, 0))
        header.pack(fill="x")
        tb.Label(header, text="🌙 Moon Eclipse Stabilizer", font="-size 16 -weight bold").pack(side="left")
        tb.Label(header, text=f"v{__version__}", bootstyle="secondary").pack(side="left", padx=(8, 0), pady=(6, 0))

        notebook = tb.Notebook(root, padding=(12, 8, 12, 12))
        notebook.pack(fill="both", expand=True)

        self.stabilize_tab = tb.Frame(notebook)
        self.extract_tab = tb.Frame(notebook)
        self.build_tab = tb.Frame(notebook)
        self.help_tab = tb.Frame(notebook)
        notebook.add(self.stabilize_tab, text="  Stabilize video  ")
        notebook.add(self.extract_tab, text="  Extract frames  ")
        notebook.add(self.build_tab, text="  Build video from frames  ")
        notebook.add(self.help_tab, text="  ❓ Help  ")

        self._build_stabilize_tab()
        self._build_extract_tab()
        self._build_build_tab()
        self._build_help_tab()

        self.root.after(80, self._poll_queue)

    # ---- shared log widget -------------------------------------------------
    def _add_log_and_progress(self, parent):
        progress = tb.Progressbar(parent, mode="determinate", bootstyle="info-striped")
        progress.pack(fill="x", padx=4, pady=(8, 2))
        status = tb.StringVar(value="Idle")
        tb.Label(parent, textvariable=status, bootstyle="secondary").pack(anchor="w", padx=4, pady=(0, 6))

        text = tb.ScrolledText(parent, height=14, wrap="word", autohide=True, bootstyle="round")
        text.pack(fill="both", expand=True, padx=4, pady=(0, 4))
        text.text.configure(state="disabled", font="Consolas 9")
        return progress, status, text

    def _log(self, text_widget, line):
        text_widget.text.configure(state="normal")
        text_widget.insert("end", line + "\n")
        text_widget.see("end")
        text_widget.text.configure(state="disabled")

    # ---- tab 1: stabilize ---------------------------------------------------
    def _build_stabilize_tab(self):
        tab = self.stabilize_tab
        self.video_path = tb.StringVar()
        self.out_dir = tb.StringVar()

        intro = tb.Label(
            tab,
            text="Pick your eclipse video and click Start. That's it — radius detection and "
                 "cloud-stretch removal happen automatically. See the Help tab for details.",
            bootstyle="secondary", wraplength=820, justify="left",
        )
        intro.pack(fill="x", padx=4, pady=(4, 10))

        row = tb.Frame(tab)
        row.pack(fill="x", padx=4, pady=4)
        tb.Label(row, text="Video file:", width=14).pack(side="left")
        tb.Entry(row, textvariable=self.video_path).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row, text="Browse...", command=self._pick_video, bootstyle="secondary-outline").pack(side="left")

        row2 = tb.Frame(tab)
        row2.pack(fill="x", padx=4, pady=4)
        tb.Label(row2, text="Output folder:", width=14).pack(side="left")
        tb.Entry(row2, textvariable=self.out_dir).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row2, text="Browse...", command=self._pick_out_dir, bootstyle="secondary-outline").pack(side="left")

        adv = tb.LabelFrame(tab, text="Advanced (optional)", padding=10)
        adv.pack(fill="x", padx=4, pady=10)
        self.radius_var = tb.StringVar()
        self.min_score_var = tb.StringVar()

        radius_label = tb.Label(adv, text="Moon radius (px):")
        radius_label.grid(row=0, column=0, sticky="w", padx=6, pady=4)
        radius_entry = tb.Entry(adv, textvariable=self.radius_var, width=10)
        radius_entry.grid(row=0, column=1, sticky="w")
        tb.Label(adv, text="blank = auto-detect", bootstyle="secondary").grid(row=0, column=2, sticky="w", padx=8)
        radius_tip = "How big the moon is in the video, in pixels. Leave this blank — the app measures it from the footage itself. Only set it if auto-detection fails on unusual framing."
        ToolTip(radius_label, text=radius_tip, bootstyle="info")
        ToolTip(radius_entry, text=radius_tip, bootstyle="info")

        score_label = tb.Label(adv, text="Cloud cutoff score:")
        score_label.grid(row=1, column=0, sticky="w", padx=6, pady=4)
        score_entry = tb.Entry(adv, textvariable=self.min_score_var, width=10)
        score_entry.grid(row=1, column=1, sticky="w")
        tb.Label(adv, text="blank = auto", bootstyle="secondary").grid(row=1, column=2, sticky="w", padx=8)
        score_tip = "How sharp/clear a frame must be to keep. Frames below this are treated as cloud-obscured and skipped. Leave blank — the app picks a sensible cutoff from your footage's own quality spread. Raise it to cut more aggressively."
        ToolTip(score_label, text=score_tip, bootstyle="info")
        ToolTip(score_entry, text=score_tip, bootstyle="info")

        btn_row = tb.Frame(tab)
        btn_row.pack(fill="x", padx=4, pady=(4, 6))
        self.start_btn = tb.Button(btn_row, text="▶  Start Processing", command=self._start_stabilize, bootstyle="primary")
        self.start_btn.pack(side="left")
        self.open_folder_btn = tb.Button(btn_row, text="Open Output Folder", command=self._open_output, state="disabled", bootstyle="success-outline")
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
        self.ex_video = tb.StringVar()
        self.ex_track = tb.StringVar()
        self.ex_out = tb.StringVar()
        self.ex_interval = tb.StringVar(value="1.0")

        tb.Label(
            tab,
            text="Pull individual still frames from a video — the sharpest frame within each time window.",
            bootstyle="secondary", wraplength=820, justify="left",
        ).pack(fill="x", padx=4, pady=(4, 10))

        row = tb.Frame(tab)
        row.pack(fill="x", padx=4, pady=4)
        tb.Label(row, text="Video file:", width=20).pack(side="left")
        tb.Entry(row, textvariable=self.ex_video).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row, text="Browse...", command=lambda: self._pick_file(self.ex_video), bootstyle="secondary-outline").pack(side="left")

        row2 = tb.Frame(tab)
        row2.pack(fill="x", padx=4, pady=4)
        tb.Label(row2, text="Track CSV (from Stabilize tab):", width=20).pack(side="left")
        tb.Entry(row2, textvariable=self.ex_track).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row2, text="Browse...", command=lambda: self._pick_file(self.ex_track, [("CSV", "*.csv")]), bootstyle="secondary-outline").pack(side="left")

        row3 = tb.Frame(tab)
        row3.pack(fill="x", padx=4, pady=4)
        tb.Label(row3, text="One frame every").pack(side="left")
        tb.Entry(row3, textvariable=self.ex_interval, width=6).pack(side="left", padx=4)
        tb.Label(row3, text="seconds (sharpest in each window)").pack(side="left")

        row4 = tb.Frame(tab)
        row4.pack(fill="x", padx=4, pady=4)
        tb.Label(row4, text="Save frames to:", width=20).pack(side="left")
        tb.Entry(row4, textvariable=self.ex_out).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row4, text="Browse...", command=self._pick_ex_out, bootstyle="secondary-outline").pack(side="left")

        tb.Button(tab, text="Extract Frames", command=self._start_extract, bootstyle="primary").pack(anchor="w", padx=4, pady=(6, 6))
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
        self.bv_frames_dir = tb.StringVar()
        self.bv_out = tb.StringVar()
        self.bv_fps = tb.StringVar(value="24")

        tb.Label(
            tab,
            text="Reassemble a folder of still frames (e.g. ones you extracted and hand-picked) into a fresh, stabilized, deflickered video.",
            bootstyle="secondary", wraplength=820, justify="left",
        ).pack(fill="x", padx=4, pady=(4, 10))

        row = tb.Frame(tab)
        row.pack(fill="x", padx=4, pady=4)
        tb.Label(row, text="Frames folder:", width=16).pack(side="left")
        tb.Entry(row, textvariable=self.bv_frames_dir).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row, text="Browse...", command=self._pick_bv_frames, bootstyle="secondary-outline").pack(side="left")

        row2 = tb.Frame(tab)
        row2.pack(fill="x", padx=4, pady=4)
        tb.Label(row2, text="Playback speed (fps):", width=16).pack(side="left")
        tb.Entry(row2, textvariable=self.bv_fps, width=6).pack(side="left", padx=4)

        row3 = tb.Frame(tab)
        row3.pack(fill="x", padx=4, pady=4)
        tb.Label(row3, text="Save video as:", width=16).pack(side="left")
        tb.Entry(row3, textvariable=self.bv_out).pack(side="left", fill="x", expand=True, padx=6)
        tb.Button(row3, text="Browse...", command=self._pick_bv_out, bootstyle="secondary-outline").pack(side="left")

        tb.Button(tab, text="Build Video", command=self._start_build, bootstyle="primary").pack(anchor="w", padx=4, pady=(6, 6))
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

    # ---- tab 4: help ----------------------------------------------------------
    def _build_help_tab(self):
        tab = self.help_tab
        scroller = tb.ScrolledFrame(tab, autohide=True)
        scroller.pack(fill="both", expand=True)
        body = scroller

        def heading(text):
            tb.Label(body, text=text, font="-size 12 -weight bold", bootstyle="info").pack(anchor="w", pady=(14, 4))

        def para(text):
            tb.Label(body, text=text, wraplength=780, justify="left").pack(anchor="w", pady=(0, 2))

        def bullet(text):
            tb.Label(body, text="•  " + text, wraplength=780, justify="left").pack(anchor="w", pady=1)

        tb.Label(body, text="Getting started", font="-size 14 -weight bold").pack(anchor="w", pady=(6, 4))
        para("First time using this? Here's the whole workflow in one pass:")
        bullet("Go to the Stabilize video tab.")
        bullet("Click Browse and pick your eclipse video file.")
        bullet("Click ▶ Start Processing. Leave the Advanced fields blank — they're auto-detected.")
        bullet("Watch the log below for progress. A long video can take several minutes; the app is still working even if it looks paused between updates.")
        bullet("When it says “Done!”, click Open Output Folder — your result is final.mp4 in there.")

        heading("What actually happens (3 steps)")
        bullet("Analyzing: finds the moon in every frame and scores how sharp/clear each one is.")
        bullet("Stabilizing: locks the moon to a fixed spot on screen and cuts out cloud-obscured stretches.")
        bullet("Removing field rotation: if your camera wasn't on a tracking mount, the sky slowly rotates over a long shoot — this straightens that back out.")

        heading("Extract frames tab")
        para("Use this to pull individual still images out of a video — handy for a highlight reel or picking your best shots by hand.")
        bullet("Video file: the source video (can be your original, or a stabilized result).")
        bullet("Track CSV: the position file created in the Stabilize tab (named track.csv in that run's output folder). Required.")
        bullet("One frame every N seconds: how often to grab a frame — the sharpest one within each window is kept automatically.")

        heading("Build video from frames tab")
        para("Turns a folder of still images back into a video — re-stabilizing and smoothing brightness as it goes. Useful after you've extracted frames and deleted the ones you don't want.")

        heading("The Advanced options, in plain language")
        bullet("Moon radius (px): how big the moon is on screen. Leave blank — measured automatically from your footage. Only needed if detection struggles on very unusual framing.")
        bullet("Cloud cutoff score: how strict to be about skipping blurry/cloud-covered frames. Leave blank for an automatic, sensible cutoff. Raise it if clouds are still slipping through; lower it if too much good footage is getting cut.")

        heading("If something goes wrong")
        bullet("Check the log panel under the progress bar — it shows exactly what each step printed, including the reason for any failure.")
        bullet("“Modal radius” or detection issues on odd footage: try setting Moon radius manually once you know roughly how many pixels wide the moon is.")
        bullet("Full technical details and the command-line tools live in this project's README.md and CHANGELOG.md, in the moon-eclipse-stabilizer folder.")

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
    root = tb.Window(theme=THEME)
    MoonGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
