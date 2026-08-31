# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files("imageio_ffmpeg") + collect_data_files("ttkbootstrap")

a = Analysis(
    ["moon_gui.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "analyze", "stabilize", "derotate", "extract_frames", "build_video",
        "moonlib.detect", "moonlib.track", "moonlib.rotation", "moonlib.video_io",
        "ttkbootstrap", "ttkbootstrap.themes", "ttkbootstrap.themes.standard",
        "ttkbootstrap.themes.user", "ttkbootstrap.dialogs", "ttkbootstrap.scrolled",
        "ttkbootstrap.tooltip", "ttkbootstrap.icons",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MoonEclipseStabilizer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="MoonEclipseStabilizer",
)
