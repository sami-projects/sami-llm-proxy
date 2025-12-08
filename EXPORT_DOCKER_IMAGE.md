# Экспорт Docker образа с сервера

## Шаг 1: Копирование файлов на сервер

### Вариант 1: Через `scp` (рекомендуется) ⭐

**С Windows (PowerShell или CMD):**

```bash
# Из папки D:\Research\Sami\proxy-server
scp -r * user@your-server-ip:/opt/sami-llm-proxy/
```

**Или если нужно создать папку на сервере:**

```bash
# Сначала создать папку на сервере
ssh user@your-server-ip "mkdir -p /opt/sami-llm-proxy"

# Затем скопировать файлы
scp -r * user@your-server-ip:/opt/sami-llm-proxy/
```

**Что копируется:**
- `src/` - исходный код
- `package.json` и `package-lock.json` - зависимости
- `tsconfig.json` - настройки TypeScript
- `Dockerfile` - инструкции для Docker
- `.dockerignore` - что исключить из образа
- `docker-compose.yml` - опционально

**Что НЕ копируется (не нужно):**
- `node_modules/` - установится в Docker
- `dist/` - соберется в Docker
- `.git/` - не нужен

---

### Вариант 2: Через `rsync` (если установлен)

```bash
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  ./ user@your-server-ip:/opt/sami-llm-proxy/
```

---

### Вариант 3: Через архив (tar + scp)

**На Windows:**

```bash
# Создать архив (исключая ненужные папки)
# В PowerShell:
Compress-Archive -Path src,package.json,package-lock.json,tsconfig.json,Dockerfile,.dockerignore,docker-compose.yml,README.md -DestinationPath proxy-server.zip

# Скопировать архив
scp proxy-server.zip user@your-server-ip:/opt/

# На сервере распаковать
ssh user@your-server-ip
cd /opt
unzip proxy-server.zip -d sami-llm-proxy
```

**Или через tar (если есть WSL или Git Bash):**

```bash
# Создать архив
tar -czf proxy-server.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  src/ package.json package-lock.json tsconfig.json Dockerfile .dockerignore docker-compose.yml README.md

# Скопировать
scp proxy-server.tar.gz user@your-server-ip:/opt/

# На сервере распаковать
ssh user@your-server-ip
cd /opt
tar -xzf proxy-server.tar.gz -C sami-llm-proxy
```

---

### Вариант 4: Через Git (если есть репозиторий)

**На сервере:**

```bash
ssh user@your-server-ip
cd /opt
git clone <your-repo-url> sami-llm-proxy
cd sami-llm-proxy/proxy-server
```

---

## Шаг 2: Сборка Docker образа на сервере

**Подключитесь к серверу:**

```bash
ssh user@your-server-ip
cd /opt/sami-llm-proxy
```

**Проверьте, что файлы на месте:**

```bash
ls -la
# Должны быть: src/, package.json, Dockerfile, и т.д.
```

**Соберите образ:**

```bash
docker build -t sami-llm-proxy .
```

**Проверьте, что образ создан:**

```bash
docker images | grep sami-llm-proxy
```

---

## Шаг 3: Экспорт образа в файл

**На сервере:**

```bash
# Сохранить образ в файл
docker save sami-llm-proxy > sami-llm-proxy.tar

# Или со сжатием (меньше размер):
docker save sami-llm-proxy | gzip > sami-llm-proxy.tar.gz
```

**Проверьте размер файла:**

```bash
ls -lh sami-llm-proxy.tar*
```

---

## Шаг 4: Скачивание образа на Windows

**С Windows (PowerShell или CMD):**

```bash
# Скачать файл образа
scp user@your-server-ip:/opt/sami-llm-proxy/sami-llm-proxy.tar ./

# Или если со сжатием:
scp user@your-server-ip:/opt/sami-llm-proxy/sami-llm-proxy.tar.gz ./
```

**Если файл большой, можно использовать `rsync` (если установлен):**

```bash
rsync -avz --progress user@your-server-ip:/opt/sami-llm-proxy/sami-llm-proxy.tar.gz ./
```

---

## Шаг 5: Загрузка образа на Windows

**На Windows (нужен Docker Desktop или WSL2 с Docker):**

```bash
# Если файл без сжатия:
docker load < sami-llm-proxy.tar

# Если файл со сжатием:
gunzip -c sami-llm-proxy.tar.gz | docker load
# Или в PowerShell:
Get-Content sami-llm-proxy.tar.gz | docker load
```

**Проверьте, что образ загружен:**

```bash
docker images | grep sami-llm-proxy
```

**Теперь можно использовать:**

```bash
docker run -d --name sami-llm-proxy -p 8080:8080 --env-file .env sami-llm-proxy
```

---

## Полный скрипт (для удобства)

**Создайте файл `export-image.sh` на сервере:**

```bash
#!/bin/bash
# Скрипт для сборки и экспорта Docker образа

cd /opt/sami-llm-proxy

echo "Building Docker image..."
docker build -t sami-llm-proxy .

echo "Saving image to file..."
docker save sami-llm-proxy | gzip > sami-llm-proxy.tar.gz

echo "Image saved to: $(pwd)/sami-llm-proxy.tar.gz"
echo "File size: $(du -h sami-llm-proxy.tar.gz | cut -f1)"
```

**Использование:**

```bash
chmod +x export-image.sh
./export-image.sh
```

---

## Альтернатива: Прямой экспорт через SSH

**С Windows можно сделать все одной командой:**

```bash
# Собрать образ на сервере и сразу скачать
ssh user@your-server-ip "cd /opt/sami-llm-proxy && docker build -t sami-llm-proxy . && docker save sami-llm-proxy | gzip" > sami-llm-proxy.tar.gz
```

**Затем загрузить на Windows:**

```bash
gunzip -c sami-llm-proxy.tar.gz | docker load
```

---

## Размер образа

Ожидаемый размер образа: **~100-200 МБ** (после сжатия ~50-100 МБ)

Если размер слишком большой, можно оптимизировать Dockerfile (multi-stage build).

---

## Проверка работы

**После загрузки образа на Windows:**

```bash
# Запустить контейнер
docker run -d --name sami-llm-proxy -p 8080:8080 sami-llm-proxy

# Проверить логи
docker logs sami-llm-proxy

# Проверить работу
curl -x http://localhost:8080 https://www.google.com
```

---

## Удаление образа с сервера (опционально)

**После экспорта можно удалить образ с сервера для экономии места:**

```bash
ssh user@your-server-ip
docker rmi sami-llm-proxy
rm /opt/sami-llm-proxy/sami-llm-proxy.tar.gz
```

