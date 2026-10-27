# Life Hub — правила для работы с проектом

## Версии и релизы

Каждое существенное улучшение или исправление серьёзного бага выпускается новой версией на GitHub (`tesutavt/Life-Hub`).

1. **Во время работы** записывай изменения в раздел `## [Не выпущено]` файла `CHANGELOG.md` — по-русски, понятным пользователю языком, в подразделы `### ✨ Добавлено` / `### 🐛 Исправлено` / `### 🔧 Изменено`.
2. **Выбери тип версии:**
   - `patch` — только исправления ошибок;
   - `minor` — новые возможности (новый раздел, интеграция, заметная функция);
   - `major` — несовместимые изменения (формат данных, поведение, которое ломает старые клиенты).
3. **Выпуск:** `node scripts/release.mjs <patch|minor|major>` (или `npm run release:minor` и т. п.). Скрипт:
   поднимает версию в `package.json` (корень, `electron`, `client`, `server`) и в Android (`versionName`, `versionCode + 1`),
   переносит «Не выпущено» в раздел версии с датой, собирает exe и APK, делает коммит «Релиз vX.Y.Z», тег, пуш и релиз на GitHub
   с описанием из CHANGELOG и тремя файлами (установщик, portable, APK).
4. Мелочи (опечатки, косметика, рефакторинг без видимых изменений) отдельного релиза не требуют — копятся в «Не выпущено» до следующего.

Перед выпуском проверь, что всё собирается: `cd android && gradlew.bat :app:compileDebugKotlin` и `npm run build`.

## Что не коммитить

`node_modules/`, сборки (`client/dist`, `electron/dist`, `android/**/build`), базу `server/lifehub.sqlite`, `server/uploads/`, `.env`, `android/local.properties` — всё это в `.gitignore`.

## Структура

- `server/` — Express + SQLite; схема `server/schema.sql`, миграции колонок — `server/utils.js`.
- `client/` — React + Vite + Tailwind.
- `electron/` — десктоп со встроенным сервером (данные в `%APPDATA%/Life Hub`).
- `android/` — Kotlin + Jetpack Compose; данные браслета — Health Connect (`health/HealthSync.kt`).
- Новые API, которые использует телефон, требуют обновления сервера — отмечай это в CHANGELOG.
