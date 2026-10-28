@echo off
rem Starts the Liberty Health Care dev server on http://localhost:8100  (XAMPP MySQL must be running)
cd /d "%~dp0"
echo Open http://localhost:8100/ in your browser. Press Ctrl+C to stop.
php -S localhost:8100 router.php
