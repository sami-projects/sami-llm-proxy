# Sami LLM Proxy - Build and Run Script for Windows
# Собирает образ и запускает контейнер

Write-Host "=== Sami LLM Proxy - Build and Run ===" -ForegroundColor Cyan
Write-Host ""

# Проверка наличия Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker ps | Out-Null
    Write-Host "✓ Docker is ready" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker not found or not running!" -ForegroundColor Red
    exit 1
}

$imageName = "sami-llm-proxy"
$containerName = "sami-llm-proxy"

# Остановить и удалить существующий контейнер если есть
Write-Host ""
Write-Host "Checking for existing container..." -ForegroundColor Yellow
$existing = docker ps -a --filter "name=$containerName" --format "{{.Names}}"
if ($existing -eq $containerName) {
    Write-Host "Stopping existing container..." -ForegroundColor Yellow
    docker stop $containerName | Out-Null
    Write-Host "Removing existing container..." -ForegroundColor Yellow
    docker rm $containerName | Out-Null
}

# Сборка образа
Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -t $imageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Image built successfully!" -ForegroundColor Green

# Запуск контейнера
Write-Host ""
Write-Host "Starting container..." -ForegroundColor Yellow
docker run -d `
    --name $containerName `
    -p 8080:8080 `
    --restart unless-stopped `
    $imageName

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Container started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Container name: $containerName" -ForegroundColor Cyan
    Write-Host "Port: 8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To view logs:" -ForegroundColor Yellow
    Write-Host "  docker logs -f $containerName" -ForegroundColor White
    Write-Host ""
    Write-Host "To stop:" -ForegroundColor Yellow
    Write-Host "  docker stop $containerName" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✗ Failed to start container!" -ForegroundColor Red
    exit 1
}
