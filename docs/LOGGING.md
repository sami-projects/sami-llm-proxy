# Управление логами прокси-сервера

## Просмотр логов Docker контейнера

### Базовые команды

```bash
# Посмотреть все логи
docker logs sami-llm-proxy

# Посмотреть последние 100 строк
docker logs --tail 100 sami-llm-proxy

# Следить за логами в реальном времени (как tail -f)
docker logs -f sami-llm-proxy

# Следить с последних 50 строк
docker logs -f --tail 50 sami-llm-proxy

# Логи с временными метками
docker logs -f --timestamps sami-llm-proxy
```

### Фильтрация и поиск

```bash
# Фильтровать по ключевым словам
docker logs -f sami-llm-proxy | grep -i "error"
docker logs -f sami-llm-proxy | grep -i "connect"
docker logs -f sami-llm-proxy | grep -i "tunnel"

# Только ошибки
docker logs sami-llm-proxy 2>&1 | grep -i error

# Исключить debug логи (только info и error)
docker logs -f sami-llm-proxy | grep -v "\[DEBUG\]"
```

### Временные фильтры

```bash
# Логи за последний час
docker logs --since 1h sami-llm-proxy

# Логи за последние 30 минут
docker logs --since 30m sami-llm-proxy

# Логи за определенный период
docker logs --since "2025-12-07T20:00:00" --until "2025-12-07T21:00:00" sami-llm-proxy

# Логи с определенного времени до сейчас
docker logs --since "2025-12-07T20:00:00" sami-llm-proxy
```

### Сохранение логов

```bash
# Сохранить все логи в файл
docker logs sami-llm-proxy > proxy-logs.txt

# Сохранить логи с временными метками
docker logs --timestamps sami-llm-proxy > proxy-logs-with-time.txt

# Сохранить логи за последний час
docker logs --since 1h sami-llm-proxy > proxy-logs-last-hour.txt

# Добавить в существующий файл (append)
docker logs --since 1h sami-llm-proxy >> proxy-logs.txt
```

### Управление размером логов

**Проверить размер логов:**

```bash
# Размер логов контейнера
docker inspect sami-llm-proxy | grep -i log

# Или через docker system df
docker system df -v | grep sami-llm-proxy
```

**Очистить логи (перезапустить контейнер):**

```bash
# Остановить контейнер
docker stop sami-llm-proxy

# Удалить контейнер (логи удалятся)
docker rm sami-llm-proxy

# Запустить заново
docker run -d --name sami-llm-proxy -p 8080:8080 sami-llm-proxy
```

**Ограничить размер логов при запуске:**

```bash
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  sami-llm-proxy
```

Это ограничит логи до 10 МБ на файл, максимум 3 файла (30 МБ всего).

---

## Уровни логирования

Прокси-сервер поддерживает разные уровни логирования через переменную `LOG_LEVEL`:

- `error` - только ошибки
- `info` - важные события (рекомендуется для production)
- `debug` - детальная информация (для отладки)

**Изменить уровень логирования:**

```bash
# Остановить контейнер
docker stop sami-llm-proxy
docker rm sami-llm-proxy

# Запустить с другим уровнем
docker run -d \
  --name sami-llm-proxy \
  -p 8080:8080 \
  -e LOG_LEVEL=debug \
  sami-llm-proxy
```

**Или через docker-compose.yml:**

```yaml
environment:
  - LOG_LEVEL=info  # или debug, error
```

---

## Полезные команды для мониторинга

### Мониторинг в реальном времени

```bash
# Следить за логами и статистикой одновременно
watch -n 1 'docker logs --tail 20 sami-llm-proxy && echo "---" && docker stats --no-stream sami-llm-proxy'
```

### Подсчет событий

```bash
# Количество CONNECT запросов
docker logs sami-llm-proxy | grep -c "CONNECT request received"

# Количество ошибок
docker logs sami-llm-proxy | grep -c "\[ERROR\]"

# Количество успешных туннелей
docker logs sami-llm-proxy | grep -c "Connection Established"
```

### Поиск проблем

```bash
# Все ошибки за последний час
docker logs --since 1h sami-llm-proxy | grep -i error

# Все неудачные подключения
docker logs sami-llm-proxy | grep -i "failed\|error\|timeout"

# Активность по IP адресам
docker logs sami-llm-proxy | grep "clientIP" | sort | uniq -c
```

---

## Примеры использования

### Отладка проблем с подключением

```bash
# Включить debug логи
docker stop sami-llm-proxy && docker rm sami-llm-proxy
docker run -d --name sami-llm-proxy -p 8080:8080 -e LOG_LEVEL=debug sami-llm-proxy

# Следить за логами
docker logs -f --tail 50 sami-llm-proxy
```

### Мониторинг в production

```bash
# Следить только за важными событиями
docker logs -f sami-llm-proxy | grep -v "\[DEBUG\]"

# Или использовать info уровень
docker run -d --name sami-llm-proxy -p 8080:8080 -e LOG_LEVEL=info sami-llm-proxy
```

### Анализ производительности

```bash
# Время ответа туннелей
docker logs sami-llm-proxy | grep "Connection Established" | tail -100

# Частота запросов
docker logs --since 1h sami-llm-proxy | grep "CONNECT request" | wc -l
```

---

## Автоматический сбор логов

### Через systemd (если запущено как сервис)

```bash
# Создать unit файл
sudo nano /etc/systemd/system/sami-proxy-logs.service

# Содержимое:
[Unit]
Description=Sami Proxy Logs Collector
After=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/docker logs -f sami-llm-proxy
Restart=always

[Install]
WantedBy=multi-user.target

# Включить и запустить
sudo systemctl enable sami-proxy-logs
sudo systemctl start sami-proxy-logs
```

### Через cron (ежедневный сбор)

```bash
# Добавить в crontab
crontab -e

# Сохранять логи каждый день в 00:00
0 0 * * * docker logs --since 24h sami-llm-proxy > /var/log/sami-proxy/$(date +\%Y-\%m-\%d).log
```

---

## Быстрые команды (шпаргалка)

```bash
# Следить за логами
docker logs -f sami-llm-proxy

# Последние 50 строк
docker logs --tail 50 sami-llm-proxy

# Только ошибки
docker logs sami-llm-proxy 2>&1 | grep -i error

# Сохранить в файл
docker logs sami-llm-proxy > logs.txt

# Логи за последний час
docker logs --since 1h sami-llm-proxy
```


