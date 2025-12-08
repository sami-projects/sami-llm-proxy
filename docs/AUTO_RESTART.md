# Автоматический перезапуск прокси-сервера

Это руководство поможет настроить автоматический перезапуск прокси-сервера при сбоях, перезагрузке сервера или перегрузке.

## Варианты решения

### 1. Docker Restart Policy (уже настроено)

В `docker-compose.yml` уже установлена политика перезапуска:

```yaml
restart: unless-stopped
```

Это означает:
- ✅ Контейнер автоматически перезапустится при сбое
- ✅ Контейнер запустится при загрузке системы (если Docker настроен на автозапуск)
- ❌ Контейнер НЕ перезапустится, если вы вручную остановили его (`docker stop`)

**Для применения:**

```bash
# Если контейнер уже запущен, обновите его:
docker-compose up -d
```

**Или при запуске через `docker run`:**

```bash
docker run -d \
  --name sami-llm-proxy \
  --restart=unless-stopped \
  -p 8080:8080 \
  sami-llm-proxy
```

### 2. Systemd Service (рекомендуется для production)

Создайте systemd service для управления контейнером. Это обеспечит:
- ✅ Автоматический запуск при загрузке системы
- ✅ Автоматический перезапуск при сбоях
- ✅ Управление через стандартные команды systemd

#### Шаг 1: Создайте service файл

```bash
sudo nano /etc/systemd/system/sami-proxy.service
```

#### Шаг 2: Добавьте содержимое

```ini
[Unit]
Description=Sami LLM Proxy Server
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/proxy-server
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Важно:** Замените `/path/to/proxy-server` на реальный путь к папке с `docker-compose.yml`.

#### Шаг 3: Активируйте service

```bash
# Перезагрузите systemd
sudo systemctl daemon-reload

# Включите автозапуск
sudo systemctl enable sami-proxy.service

# Запустите service
sudo systemctl start sami-proxy.service

# Проверьте статус
sudo systemctl status sami-proxy.service
```

#### Шаг 4: Полезные команды

```bash
# Запустить
sudo systemctl start sami-proxy

# Остановить
sudo systemctl stop sami-proxy

# Перезапустить
sudo systemctl restart sami-proxy

# Посмотреть логи
sudo journalctl -u sami-proxy -f

# Проверить статус
sudo systemctl status sami-proxy
```

### 3. Улучшенный Systemd Service (с health checks)

Если хотите более продвинутый вариант с проверкой здоровья:

```ini
[Unit]
Description=Sami LLM Proxy Server
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/proxy-server
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
ExecReload=/usr/bin/docker-compose restart
Restart=on-failure
RestartSec=10

# Health check скрипт (опционально)
ExecStartPost=/bin/bash -c 'sleep 5 && /usr/bin/docker exec sami-llm-proxy wget --quiet --tries=1 --spider http://localhost:8080 || exit 1'

[Install]
WantedBy=multi-user.target
```

### 4. Docker Autostart при загрузке системы

Убедитесь, что Docker запускается автоматически:

```bash
# Проверьте, включен ли Docker автозапуск
sudo systemctl is-enabled docker

# Если нет, включите:
sudo systemctl enable docker
```

### 5. Мониторинг и уведомления (опционально)

Для мониторинга состояния прокси-сервера можно использовать:

#### Простой скрипт проверки

Создайте `/usr/local/bin/check-proxy.sh`:

```bash
#!/bin/bash
if ! curl -f -s http://localhost:8080 > /dev/null; then
    echo "Proxy is down, restarting..."
    docker restart sami-llm-proxy
    # Или через systemd:
    # systemctl restart sami-proxy
fi
```

Сделайте исполняемым:

```bash
sudo chmod +x /usr/local/bin/check-proxy.sh
```

Добавьте в crontab (проверка каждые 5 минут):

```bash
sudo crontab -e
# Добавьте строку:
*/5 * * * * /usr/local/bin/check-proxy.sh
```

## Рекомендуемая конфигурация для production

Для максимальной надежности используйте комбинацию:

1. **Docker restart policy** (`restart: unless-stopped` в docker-compose.yml)
2. **Systemd service** для управления контейнером
3. **Docker autostart** при загрузке системы
4. **Health checks** в docker-compose.yml (уже настроено)

## Проверка работы

### Тест 1: Перезагрузка сервера

```bash
# Перезагрузите сервер
sudo reboot

# После перезагрузки проверьте:
docker ps | grep sami-llm-proxy
# Или:
sudo systemctl status sami-proxy
```

### Тест 2: Имитация сбоя

```bash
# Остановите контейнер (имитация сбоя)
docker stop sami-llm-proxy

# Подождите 10 секунд и проверьте
docker ps | grep sami-llm-proxy
# Контейнер должен автоматически перезапуститься
```

### Тест 3: Проверка health check

```bash
# Проверьте статус health check
docker inspect sami-llm-proxy | grep -A 10 Health
```

## Устранение проблем

### Контейнер не перезапускается

1. Проверьте логи:
   ```bash
   docker logs sami-llm-proxy
   ```

2. Проверьте restart policy:
   ```bash
   docker inspect sami-llm-proxy | grep RestartPolicy
   ```

3. Проверьте systemd service:
   ```bash
   sudo systemctl status sami-proxy
   sudo journalctl -u sami-proxy -n 50
   ```

### Контейнер перезапускается слишком часто

1. Проверьте логи на ошибки:
   ```bash
   docker logs sami-llm-proxy 2>&1 | grep -i error
   ```

2. Проверьте ресурсы сервера:
   ```bash
   docker stats sami-llm-proxy
   free -h
   df -h
   ```

3. Увеличьте `RestartSec` в systemd service (например, до 30 секунд)

## Дополнительные настройки

### Ограничение ресурсов

Добавьте в `docker-compose.yml`:

```yaml
services:
  sami-llm-proxy:
    # ... другие настройки
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Логирование в файл

Добавьте в `docker-compose.yml`:

```yaml
services:
  sami-llm-proxy:
    # ... другие настройки
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Это ограничит размер логов до 30 МБ (3 файла по 10 МБ).

---

## Быстрая настройка (копипаста)

Для быстрой настройки выполните на сервере:

```bash
# 1. Создайте systemd service
sudo tee /etc/systemd/system/sami-proxy.service > /dev/null <<EOF
[Unit]
Description=Sami LLM Proxy Server
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 2. Активируйте
sudo systemctl daemon-reload
sudo systemctl enable sami-proxy.service
sudo systemctl start sami-proxy.service

# 3. Проверьте
sudo systemctl status sami-proxy.service
```

**Важно:** Замените `$(pwd)` на реальный путь к папке с `docker-compose.yml`, если выполняете команду не из этой папки.

