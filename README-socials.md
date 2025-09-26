
# Соц. сети — Twitch / YouTube / Telegram (MVP)

Файлы:
- `server/routes-socials.js`
- `client/src/pages/Socials.tsx`

Подключение сервера:
```js
import socialsRouter from './routes-socials.js';
app.use('/api/socials', requireAuth, socialsRouter);
```

ENV:
```
YT_API_KEY=xxxxxxxx
TWITCH_CLIENT_ID=xxxxx
TWITCH_CLIENT_SECRET=xxxxx
```

YouTube: указывайте **channelId** (UC...).  
Twitch: указывайте **login** канала.

Шаблоны:
- стрим: `{stream_title}`, `{channel}`, `{game}`, `{viewers}`
- видео: `{video_title}`, `{video_url}`, `{published_at}`

