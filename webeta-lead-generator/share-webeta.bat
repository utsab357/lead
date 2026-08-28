@echo off
echo.
echo ================================
echo   Webeta - Share via Cloudflare
echo ================================
echo.
echo Starting tunnel... please wait 15 seconds.
echo.
echo YOUR LINK WILL APPEAR BELOW BETWEEN THE STARS:
echo.
echo ************************************************************
"%~dp0cloudflared.exe" tunnel --protocol http2 --url http://localhost:3000 2>&1 | findstr /i "trycloudflare"
echo ************************************************************
echo.
echo The tunnel has stopped. Press any key to exit.
pause > nul
