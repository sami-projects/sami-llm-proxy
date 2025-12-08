# Sami LLM Proxy Server - Dockerfile
# AI-NOTE: [СОЗДАНО] Воспроизводимый Docker образ для быстрого развертывания

FROM node:20-alpine

# Рабочая директория
WORKDIR /app

# Копируем package.json и устанавливаем ВСЕ зависимости (нужны dev для сборки)
COPY package*.json ./
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем TypeScript
RUN npm run build

# Открываем порт
EXPOSE 8080

# Запускаем сервер
CMD ["npm", "start"]

