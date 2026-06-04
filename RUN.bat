@echo off
cd /d %~dp0
start brave http://localhost:5173
npm run dev
pause