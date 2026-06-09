@echo off
REM ---------------------------------------------------------------------------
REM Prices daemon launcher (auto-restart).
REM
REM Runs backend\prices_daemon.py continuously, relaunching it if it ever exits.
REM Point a boot-time Task Scheduler / cron entry at this file so the live
REM "Prices" feed stays running on the same machine as the daily main.py cron.
REM Press Ctrl-C and answer "Y" to stop.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

:loop
call venv\Scripts\activate.bat
python backend\prices_daemon.py
echo [run_prices_daemon] daemon exited with code %ERRORLEVEL%; restarting in 10s...
timeout /t 10 /nobreak >nul
goto loop
