# Sami LLM Proxy - Publish to Docker Hub Script
# Скрипт для сборки и публикации образа на Docker Hub

Write-Host "=== Sami LLM Proxy - Publish to Docker Hub ===" -ForegroundColor Cyan
Write-Host ""

# Конфигурация
$dockerHubUser = "samiapp"
$imageName = "sami-llm-proxy"
$fullImageName = "$dockerHubUser/$imageName"
$tag = "latest"

# Проверка Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker ps | Out-Null
    Write-Host "✓ Docker is ready" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker not found or not running!" -ForegroundColor Red
    exit 1
}

# Проверка авторизации на Docker Hub
Write-Host ""
Write-Host "Authenticating with Docker Hub..." -ForegroundColor Yellow
Write-Host "Docker will use saved credentials if available." -ForegroundColor Gray
Write-Host ""
docker login
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "✗ Login failed!" -ForegroundColor Red
    Write-Host "Please check your credentials and try again." -ForegroundColor Yellow
    exit 1
}
Write-Host ""
Write-Host "✓ Successfully authenticated with Docker Hub" -ForegroundColor Green

# Сборка образа
Write-Host ""
Write-Host "Building Docker image with tag: $fullImageName`:$tag" -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

docker build -t "$fullImageName`:$tag" .

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Image built successfully!" -ForegroundColor Green

# Публикация образа
Write-Host ""
Write-Host "Pushing image to Docker Hub..." -ForegroundColor Yellow
Write-Host "Repository: $fullImageName" -ForegroundColor Gray
Write-Host "Tag: $tag" -ForegroundColor Gray
Write-Host ""

docker push "$fullImageName`:$tag"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Image published successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Image available at:" -ForegroundColor Cyan
    Write-Host "  https://hub.docker.com/r/$fullImageName" -ForegroundColor White
    Write-Host ""
    Write-Host "Users can now pull it with:" -ForegroundColor Yellow
    Write-Host "  docker pull $fullImageName`:$tag" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "✗ Push failed!" -ForegroundColor Red
    Write-Host "Check your Docker Hub credentials and repository permissions" -ForegroundColor Yellow
    exit 1
}
