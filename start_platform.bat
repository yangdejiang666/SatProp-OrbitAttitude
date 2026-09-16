@echo off
chcp 65001 > nul
title SatProp-OrbitAttitude Mission Control
echo ===========================================================================
echo 🛰️  SatProp-OrbitAttitude: 卫星轨道动力学预测与姿态推演平台
echo ===========================================================================
echo.
echo 正在启动 3D WebGL 航天测控大屏与后端动力学预测服务...
echo 本地访问地址: http://127.0.0.1:8080
echo.
echo 提示: 服务启动后会自动打开浏览器，如未自动打开请手动访问上述网址。
echo 按 Ctrl+C 可停止运行。
echo.
timeout /t 2 > nul
start http://127.0.0.1:8080
py -3 main.py server
if %ERRORLEVEL% NEQ 0 (
    python main.py server
)
pause
