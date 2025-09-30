# Life Hub — Server

Backend для личного Life-Hub (финансы + фитнес + календарь + геймификация).

## Запуск
```bash
cd server
npm i
npm run dev
# API: http://localhost:4000
```

## Переменные окружения (опционально)
```
PORT=4000
JWT_SECRET=supersecret
GF_CLIENT_ID=...
GF_CLIENT_SECRET=...
GF_REDIRECT=http://localhost:4000/api/fitness/google/callback
```

## Google Fit

Перед авторизацией убедитесь, что в вашем проекте Google Cloud Console включён **Google Fitness API**. Без этого все запросы будут возвращать `403 Forbidden`.

В OAuth-клиенте должны быть разрешены только read-скоупы:

- `https://www.googleapis.com/auth/fitness.activity.read`
- `https://www.googleapis.com/auth/fitness.heart_rate.read`
- `https://www.googleapis.com/auth/fitness.sleep.read`

После подключения приложение автоматически обновляет access token по refresh token и проверяет, что указанные скоупы присутствуют у полученного токена.

## Основные маршруты
- `/api/auth/register`, `/api/auth/login`
- `/api/loans` (GET /summary, POST, PUT/:id, DELETE/:id)
- `/api/banks` (GET /transactions, POST /import/csv)
- `/api/fitness` (public: /google/auth, /google/callback; protected: /metrics)
- `/api/life` (profile/xp/calendar/languages/courses/yearly-goals/socials/journal/habits/travel)
