# Публикация на GitHub

## Пошаговая инструкция

### Шаг 1: Создайте репозиторий на GitHub

1. Зайдите на https://github.com/sami-projects
2. Нажмите "New repository" (или "New" → "Repository")
3. Имя репозитория: `sami-llm-proxy`
4. Описание: `HTTP/HTTPS proxy for LLM APIs with auth, IP filtering, and extended timeouts`
5. Видимость: **Public** (или Private, если хотите)
6. НЕ создавайте README, .gitignore, license (у нас уже есть)
7. Нажмите "Create repository"

---

### Шаг 2: Инициализируйте Git репозиторий локально

```powershell
# Убедитесь, что вы в папке proxy-server
cd d:\Research\Sami\proxy-server

# Инициализируйте git (если еще не инициализирован)
git init

# Проверьте статус
git status
```

---

### Шаг 3: Добавьте файлы

```powershell
# Добавьте все файлы (кроме тех, что в .gitignore)
git add .

# Проверьте, что добавлено правильно
git status
```

**Убедитесь, что НЕ добавлены:**
- `node_modules/`
- `dist/`
- `Docker/`
- `.env` файлы
- `*.log`

---

### Шаг 4: Создайте первый коммит

```powershell
git commit -m "Initial commit: Sami LLM Proxy Server v1.0.0"
```

---

### Шаг 5: Добавьте remote и запушьте

```powershell
# Добавьте remote (замените на ваш URL, если отличается)
git remote add origin https://github.com/sami-projects/sami-llm-proxy.git

# Проверьте remote
git remote -v

# Запушьте на GitHub
git branch -M main
git push -u origin main
```

**Если GitHub попросит авторизацию:**
- Используйте Personal Access Token (не пароль)
- Или используйте GitHub CLI: `gh auth login`

---

### Шаг 6: Проверьте на GitHub

Откройте https://github.com/sami-projects/sami-llm-proxy

Все файлы должны быть там!

---

## Обновление репозитория в будущем

```powershell
# Добавить изменения
git add .

# Закоммитить
git commit -m "Описание изменений"

# Запушить
git push
```

---

## Добавление ссылки на GitHub в Docker Hub

После публикации на GitHub:

1. Зайдите на Docker Hub: https://hub.docker.com/r/samiapp/sami-llm-proxy
2. Нажмите "Edit" на репозитории
3. В поле "Source code" укажите: `https://github.com/sami-projects/sami-llm-proxy`
4. Сохраните

---

## Troubleshooting

### Ошибка: "remote origin already exists"

```powershell
# Удалите старый remote
git remote remove origin

# Добавьте заново
git remote add origin https://github.com/sami-projects/sami-llm-proxy.git
```

### Ошибка: "authentication failed"

**Вариант 1: Использовать Personal Access Token**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Создайте новый token с правами `repo`
3. Используйте token вместо пароля

**Вариант 2: Использовать GitHub CLI**
```powershell
# Установите GitHub CLI (если еще не установлен)
# Затем:
gh auth login
```

### Ошибка: "refusing to merge unrelated histories"

```powershell
git pull origin main --allow-unrelated-histories
```

---

## Структура репозитория

После публикации структура будет:

```
sami-llm-proxy/
├── src/
│   └── index.ts
├── docs/
│   ├── README.md
│   ├── AUTO_RESTART_QUICK.md
│   └── ...
├── README.md
├── README_RU.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .gitignore
```

**НЕ будет в репозитории:**
- `node_modules/` (добавлен в .gitignore)
- `dist/` (собирается при установке)
- `Docker/` (артефакты сборки)
- `.env` файлы (секреты)

