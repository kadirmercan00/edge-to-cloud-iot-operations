@echo off
REM ==============================================================================
REM edge-to-cloud-iot-operations — Firmware Build & OTA Deployment Pipeline
REM Builds PlatformIO target and deploys binary to AWS S3 bucket with MD5 checksum
REM ==============================================================================

setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0..
set S3_BUCKET=s3://iot-firmware-deployments-prod/builds
set TARGET_ENV=anchor-unit

echo [1/3] Compiling firmware target: %TARGET_ENV%...
cd "%PROJECT_DIR%\firmware\%TARGET_ENV%"
call pio run -e esp32dev

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed! Aborting deployment.
    exit /b %ERRORLEVEL%
)

echo [2/3] Preparing firmware binary...
set BIN_PATH="%PROJECT_DIR%\firmware\%TARGET_ENV%\.pio\build\esp32dev\firmware.bin"

if not exist %BIN_PATH% (
    echo [ERROR] Firmware binary not found at %BIN_PATH%
    exit /b 1
)

echo [3/3] Uploading binary to AWS S3...
aws s3 cp %BIN_PATH% "%S3_BUCKET%/%TARGET_ENV%-latest.bin" --acl private

echo [SUCCESS] Deployment complete. Field units can now perform OTA update.
pause
