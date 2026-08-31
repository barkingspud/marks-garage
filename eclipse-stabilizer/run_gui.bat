@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw eclipse_gui.py
) else (
    python eclipse_gui.py
)
