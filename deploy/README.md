# Life Hub на своём сервере (VDS)

Сервер — это API + веб-версия в одном процессе. К нему подключаются:

- **браузер** — `http://IP-сервера:4000`;
- **десктоп-приложение** (Electron) — на экране входа внизу «Сервер: … · сменить» → ввести IP;
- **Android-приложение** — при первом запуске экран «Подключение к серверу» → ввести IP.

Нужен VDS с Linux (Ubuntu 22.04/24.04 или Debian 12), 1 ГБ RAM хватает.

---

## Вариант 1. Docker (рекомендуется)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Код проекта (git clone или скопируйте папку проекта на сервер, например через scp/WinSCP)
git clone <адрес вашего репозитория> /opt/lifehub
cd /opt/lifehub

# 3. Сборка и запуск
docker compose up -d --build

# 4. Проверка
curl http://localhost:4000/api/health      # → {"app":"lifehub","ok":true,...}
```

Откройте порт в файрволе (если включён): `sudo ufw allow 4000/tcp`.

Всё, что нужно сохранить при обновлениях, лежит в `/opt/lifehub/data`: база, загрузки, кэш озвучки
и `.jwt-secret` (секрет подписи входа).

**Обновление:** `git pull && docker compose up -d --build`.
**Логи:** `docker compose logs -f`.
**Бэкап:** `tar czf lifehub-backup.tgz data/`.

## Вариант 2. Без Docker (Node.js + systemd)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs
sudo useradd -r -m -d /var/lib/lifehub lifehub
sudo git clone <репозиторий> /opt/lifehub && cd /opt/lifehub
(cd client && npm ci && npx vite build)
(cd server && npm ci --omit=dev)
sudo cp deploy/lifehub.service /etc/systemd/system/
sudo systemctl enable --now lifehub
```

---

## Перенос ваших данных на сервер

Скопируйте базу (и загрузки, если нужны картинки/PDF) в папку данных сервера **до первого запуска**
или остановив сервер:

| Откуда | Куда (Docker) |
|---|---|
| `server/lifehub.sqlite` (веб-версия) или `%APPDATA%\Life Hub\lifehub.sqlite` (exe) | `/opt/lifehub/data/lifehub.sqlite` |
| `server/uploads/` или `%APPDATA%\Life Hub\uploads\` | `/opt/lifehub/data/uploads/` |

```bash
# с Windows, из папки проекта (PowerShell):
scp server\lifehub.sqlite root@IP:/opt/lifehub/data/
scp -r server\uploads root@IP:/opt/lifehub/data/
# на сервере:
docker compose restart
```

Пароли в старой базе хранились открытым текстом — при первом запуске сервер сам их захэширует.
После переноса все устройства войдут заново (у нового сервера свой секрет входа).

---

## Безопасность

- **Регистрация.** По умолчанию открыта — кто угодно, знающий IP, может завести аккаунт.
  Чтобы закрыть: `ALLOW_REGISTRATION: "false"` в `docker-compose.yml`, затем `docker compose up -d`.
  Новых пользователей тогда заводите, временно включив регистрацию.
- **HTTPS.** По голому IP соединение идёт по HTTP — пароль при входе передаётся незашифрованным.
  Если есть домен, поставьте Caddy (`deploy/Caddyfile`) — сертификат выпустится автоматически.
  Тогда в docker-compose раскомментируйте `TRUST_PROXY: "1"`, закройте порт 4000 файрволом
  (`ufw deny 4000`) и подключайтесь по `https://ваш-домен`.
- Вход ограничен 10 попытками в минуту с одного IP.
- Сбросить пароль пользователю может администратор: «Пользователи» → «Сбросить пароль».

## Интеграции

Ключи Telegram/YouTube/Twitch задаются переменными окружения в `docker-compose.yml`.
Подключение Google Fit требует адреса сервера, прописанного в настройках OAuth-приложения Google.
