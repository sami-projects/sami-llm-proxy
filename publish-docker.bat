@echo off
REM Sami LLM Proxy - Publish to Docker Hub Script (CMD)
REM Скрипт для сборки и публикации образа на Docker Hub

echo === Sami LLM Proxy - Publish to Docker Hub ===
echo.

REM Конфигурация
set DOCKER_HUB_USER=samiapp
set IMAGE_NAME=sami-llm-proxy
set FULL_IMAGE_NAME=%DOCKER_HUB_USER%/%IMAGE_NAME%
set TAG=latest

REM Проверка Docker
echo Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found!
    exit /b 1
)
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker daemon is not running!
    exit /b 1
)
echo [OK] Docker is ready

REM Проверка авторизации
echo.
echo Authenticating with Docker Hub...
echo Docker will use saved credentials if available.
echo.
docker login
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Login failed!
    echo Please check your credentials and try again.
    exit /b 1
)
echo.
echo [OK] Successfully authenticated with Docker Hub

REM Сборка образа
echo.
echo Building Docker image with tag: %FULL_IMAGE_NAME%:%TAG%
echo This may take a few minutes...
echo.

docker build -t %FULL_IMAGE_NAME%:%TAG% .

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    exit /b 1
)

echo [OK] Image built successfully!

REM Публикация образа
echo.
echo Pushing image to Docker Hub...
echo Repository: %FULL_IMAGE_NAME%
echo Tag: %TAG%
echo.

docker push %FULL_IMAGE_NAME%:%TAG%

if %errorlevel% equ 0 (
    echo.
    echo [OK] Image published successfully!
    echo.
    echo Image available at:
    echo   https://hub.docker.com/r/%FULL_IMAGE_NAME%
    echo.
    echo Users can now pull it with:
    echo   docker pull %FULL_IMAGE_NAME%:%TAG%
    echo.
) else (
    echo.
    echo [ERROR] Push failed!
    echo Check your Docker Hub credentials and repository permissions
    exit /b 1
)
