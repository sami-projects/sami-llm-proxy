# Sami LLM Proxy - Docker Build Script for Windows
# Простой скрипт для сборки Docker образа на Windows

Write-Host "=== Sami LLM Proxy - Docker Build ===" -ForegroundColor Cyan
Write-Host ""

# Проверка наличия Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker not found! Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Проверка что Docker работает
Write-Host "Checking Docker daemon..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✓ Docker daemon is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker daemon is not running! Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Yellow
Write-Host "This may take a few minutes on first build..." -ForegroundColor Gray
Write-Host ""

# Сборка образа
$imageName = "sami-llm-proxy"
$buildCommand = "docker build -t $imageName ."

try {
    Invoke-Expression $buildCommand
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Docker image built successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Image name: $imageName" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "To run the container:" -ForegroundColor Yellow
        Write-Host "  docker run -d --name sami-llm-proxy -p 8080:8080 $imageName" -ForegroundColor White
        Write-Host ""
        Write-Host "Or use docker-compose:" -ForegroundColor Yellow
        Write-Host "  docker-compose up -d" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "✗ Build failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "✗ Build error: $_" -ForegroundColor Red
    exit 1
}
