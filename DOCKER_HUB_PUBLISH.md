# Публикация образа на Docker Hub

## Пошаговая инструкция

### Шаг 1: Войдите в Docker Hub

```bash
docker login
```

Введите ваш username (`samiapp`) и password.

---

### Шаг 2: Соберите образ с правильным тегом

**Важно:** Тег должен быть в формате `username/repository:tag`

```bash
# Перейдите в папку proxy-server
cd d:\Research\Sami\proxy-server

# Соберите образ с правильным тегом
docker build -t samiapp/sami-llm-proxy:latest .
```

**Объяснение:**
- `samiapp` - ваш username на Docker Hub
- `sami-llm-proxy` - имя репозитория
- `latest` - тег (версия образа)

**Альтернативно, можно собрать с версией:**
```bash
docker build -t samiapp/sami-llm-proxy:1.0.0 .
```

---

### Шаг 3: Проверьте, что образ собран

```bash
docker images | grep sami-llm-proxy
```

Должен появиться образ `samiapp/sami-llm-proxy:latest`

---

### Шаг 4: Запушьте образ на Docker Hub

```bash
# Для latest тега
docker push samiapp/sami-llm-proxy:latest

# Или для версии
docker push samiapp/sami-llm-proxy:1.0.0
```

---

### Шаг 5: Проверьте на Docker Hub

Откройте https://hub.docker.com/r/samiapp/sami-llm-proxy

Образ должен появиться в разделе "Tags".

---

## Публикация нескольких тегов

Если хотите опубликовать и `latest`, и версию:

```bash
# Соберите образ
docker build -t samiapp/sami-llm-proxy:1.0.0 .

# Создайте тег latest (указывает на тот же образ)
docker tag samiapp/sami-llm-proxy:1.0.0 samiapp/sami-llm-proxy:latest

# Запушьте оба тега
docker push samiapp/sami-llm-proxy:1.0.0
docker push samiapp/sami-llm-proxy:latest
```

---

## Важно: Исходники

**Docker Hub НЕ хранит исходники!** Он хранит только собранные образы.

Если хотите, чтобы исходники были доступны:
1. Создайте репозиторий на GitHub
2. Запушьте туда исходники
3. Укажите ссылку на GitHub в описании Docker Hub репозитория

---

## Быстрая команда (все в одном)

```bash
cd d:\Research\Sami\proxy-server
docker login
docker build -t samiapp/sami-llm-proxy:latest .
docker push samiapp/sami-llm-proxy:latest
```

---

## Troubleshooting

### Ошибка: "denied: requested access to the resource is denied"

**Причина:** Неправильный username или репозиторий не создан на Docker Hub.

**Решение:** 
1. Убедитесь, что вы залогинены: `docker login`
2. Убедитесь, что репозиторий `sami-llm-proxy` создан на Docker Hub
3. Проверьте username в теге (должен быть `samiapp`)

### Ошибка: "repository does not exist"

**Причина:** Репозиторий не создан на Docker Hub.

**Решение:** 
1. Зайдите на https://hub.docker.com
2. Нажмите "Create Repository"
3. Имя: `sami-llm-proxy`
4. Видимость: Public или Private (на ваш выбор)

---

## После публикации

Пользователи смогут использовать ваш образ:

```bash
docker pull samiapp/sami-llm-proxy:latest
docker run -d -p 8080:8080 samiapp/sami-llm-proxy:latest
```

