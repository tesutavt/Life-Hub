# Client UI (Full)
Готовый клиент к API: авторизация, кредиты, транзакции (CSV), цели, Google Fit кнопка.

## Старт
```bash
npm i
npm run dev
# http://localhost:5173
```

Требуется запущенный сервер на :4000 (см. корневой README проекта).

## Переменные окружения

Для отображения погоды на дашборде необходим ключ OpenWeather. Его можно указать в настройках (раздел «OpenWeather») или задать через переменную окружения:

```env
VITE_OPENWEATHER_API_KEY=<ваш_ключ_openweather>
```

Получить ключ можно в [личном кабинете OpenWeather](https://openweathermap.org/).

## Страницы
- /login, /register
- /dashboard — дашборд (кредиты + Mi Fitness метрики)
- /loans — добавление/список кредитов
- /transactions — импорт CSV и список операций
- /goals — цели и прогресс
- /profile — подключение Google Fit
