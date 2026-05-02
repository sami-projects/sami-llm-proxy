@echo off
REM Sami LLM Proxy - Docker Build Script for Windows (CMD)
REM Простой скрипт для сборки Docker образа на Windows

echo === Sami LLM Proxy - Docker Build ===
echo.

REM Проверка наличия Docker
echo Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found! Please install Docker Desktop.
    exit /b 1
)
echo [OK] Docker found

REM Проверка что Docker работает
echo Checking Docker daemon...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker daemon is not running! Please start Docker Desktop.
    exit /b 1
)
echo [OK] Docker daemon is running

echo.
echo Building Docker image...
echo This may take a few minutes on first build...
echo.

REM Сборка образа
set IMAGE_NAME=sami-llm-proxy
docker build -t %IMAGE_NAME% .

if %errorlevel% equ 0 (
    echo.
    echo [OK] Docker image built successfully!
    echo.
    echo Image name: %IMAGE_NAME%
    echo.
    echo To run the container:
    echo   docker run -d --name sami-llm-proxy -p 8080:8080 %IMAGE_NAME%
    echo.
    echo Or use docker-compose:
    echo   docker-compose up -d
    echo.
) else (
    echo.
    echo [ERROR] Build failed!
    exit /b 1
)
