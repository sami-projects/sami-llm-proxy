#!/bin/bash
# Скрипт для обновления sami-llm-proxy с Docker Hub
# Использование: ./update-proxy.sh

CONTAINER_NAME="sami-llm-proxy"
IMAGE_NAME="samiapp/sami-llm-proxy:latest"

echo "=== Updating $CONTAINER_NAME ==="
echo ""

# Проверка существования контейнера
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    docker stop $CONTAINER_NAME
    
    echo "Removing old container..."
    docker rm $CONTAINER_NAME
else
    echo "Container not found, will create new one"
fi

# Получить новый образ
echo ""
echo "Pulling latest image from Docker Hub..."
docker pull $IMAGE_NAME

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to pull image!"
    exit 1
fi

# Запустить новый контейнер
echo ""
echo "Starting new container..."

# Проверка наличия .env файла
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "WARNING: .env file not found in current directory!"
    echo "Starting container without .env file..."
    docker run -d \
      --name $CONTAINER_NAME \
      -p 8080:8080 \
      --restart unless-stopped \
      $IMAGE_NAME
else
    echo "Using .env file: $ENV_FILE"
    docker run -d \
      --name $CONTAINER_NAME \
      -p 8080:8080 \
      --env-file $ENV_FILE \
      --restart unless-stopped \
      $IMAGE_NAME
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Container updated and started successfully!"
    echo ""
    echo "To view logs:"
    echo "  docker logs -f $CONTAINER_NAME"
    echo ""
    echo "To check status:"
    echo "  docker ps | grep $CONTAINER_NAME"
    echo ""
else
    echo ""
    echo "ERROR: Failed to start container!"
    exit 1
fi
