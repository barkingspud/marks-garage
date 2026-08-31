@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw moon_gui.py
) else (
    python moon_gui.py
)
