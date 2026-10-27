// Life Hub Desktop — Electron-оболочка: встроенный сервер (Express + SQLite) + клиент.
//
// Режимы:
//   • встроенный сервер (по умолчанию) — сервер запускается внутри приложения,
//     база и загрузки хранятся в профиле пользователя (%APPDATA%/Life Hub);
//   • удалённый сервер — окно открывает указанный адрес (например, http://my-host:4000).
// Режим переключается на экране входа (внизу «Сервер: …») и хранится в config.json.

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Tray, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { pathToFileURL } = require('url');

const DEFAULT_PORT = 4000;
const isDev = !app.isPackaged;
// В собранном приложении server/ и client/dist лежат рядом с main.js; в разработке — в корне репозитория.
const ROOT = isDev ? path.resolve(__dirname, '..') : __dirname;
const SERVER_ENTRY = path.join(ROOT, 'server', 'server.js');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

let mainWindow = null;
let tray = null;
let isQuitting = false;
// Запуск из автозагрузки Windows — сразу в трей, без окна
const startHidden = process.argv.includes('--hidden');
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
let localServerUrl = null;
let localServerStarting = null;

// ───────────── Настройки ─────────────
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return { server: null };
  }
}
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

// ───────────── Перенос базы данных ─────────────
// В собранном приложении база своя (%APPDATA%/Life Hub/lifehub.sqlite) и при первом
// запуске пустая. Предлагаем перенести существующую (например, server/lifehub.sqlite).

const PENDING_DB = 'lifehub.pending-import.sqlite';

/** Количество пользователей в базе; null — файла нет или это не база Life Hub. */
function countUsers(dbPath) {
  if (!fs.existsSync(dbPath)) return Promise.resolve(null);
  const sqlite3 = require('sqlite3');
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openError) => {
      if (openError) return resolve(null);
      db.get('SELECT COUNT(*) AS n FROM users', (error, row) => {
        db.close();
        resolve(error ? null : row?.n ?? 0);
      });
    });
  });
}

async function pickDatabaseFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите файл базы Life Hub (lifehub.sqlite)',
    filters: [{ name: 'База Life Hub', extensions: ['sqlite', 'sqlite3', 'db'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  const users = await countUsers(filePaths[0]);
  if (users === null) {
    dialog.showErrorBox('Life Hub', 'Этот файл не похож на базу Life Hub (в нём нет таблицы пользователей).');
    return null;
  }
  return filePaths[0];
}

/** Копирует папку uploads, лежащую рядом с выбранной базой, в папку данных приложения. */
function copyUploadsNextTo(source, dataDir) {
  const from = path.resolve(path.dirname(source), 'uploads');
  const to = path.resolve(dataDir, 'uploads');
  if (from.toLowerCase() === to.toLowerCase() || !fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
}

/** Кладёт выбранную базу в папку данных приложения (текущая сохраняется как резервная копия). */
function installDatabase(source, dataDir) {
  const target = path.join(dataDir, 'lifehub.sqlite');
  if (fs.existsSync(target)) {
    fs.renameSync(target, path.join(dataDir, `lifehub.backup-${Date.now()}.sqlite`));
  }
  fs.copyFileSync(source, target);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, target + suffix);
  }
}

async function prepareDatabase(dataDir) {
  const pending = path.join(dataDir, PENDING_DB);
  if (fs.existsSync(pending)) {
    // Сначала переименовываем, чтобы при сбое импорт не повторялся при каждой попытке.
    const staged = path.join(dataDir, `lifehub.importing-${Date.now()}.sqlite`);
    fs.renameSync(pending, staged);
    installDatabase(staged, dataDir);
    fs.rmSync(staged, { force: true });
    return;
  }
  const users = await countUsers(path.join(dataDir, 'lifehub.sqlite'));
  if (users) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Life Hub',
    message: 'Перенести существующие данные?',
    detail:
      'В настольной версии пока нет ни одного аккаунта — у неё отдельная база данных.\n\n' +
      'Если вы уже пользовались Life Hub (веб-версия или npm run dev), выберите файл lifehub.sqlite — ' +
      'обычно он лежит в папке server проекта. Загруженные файлы (папка uploads рядом) тоже будут перенесены.',
    buttons: ['Выбрать файл базы…', 'Начать с чистого листа'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return;
  const source = await pickDatabaseFile();
  if (!source) return;
  installDatabase(source, dataDir);
  copyUploadsNextTo(source, dataDir);
}

// ───────────── Встроенный сервер ─────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

/** Если на порту уже работает Life Hub (например, запущенный вручную сервер) — переиспользуем его. */
function isLifeHubServer(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/auth/me`, { timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(res.statusCode === 401 && body.includes('no token')));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('Сервер не запустился за 30 секунд'));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function startLocalServer() {
  if (localServerUrl) return localServerUrl;
  if (localServerStarting) return localServerStarting;

  localServerStarting = (async () => {
    for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 20; port += 1) {
      const url = `http://localhost:${port}`;
      if (await isPortFree(port)) {
        const dataDir = isDev ? null : app.getPath('userData');
        if (dataDir) {
          fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
          await prepareDatabase(dataDir);
          process.env.LIFEHUB_DATA_DIR = dataDir;
          // Ключи (например, Google) можно положить в %APPDATA%/Life Hub/.env
          process.env.DOTENV_CONFIG_PATH = path.join(dataDir, '.env');
        }
        process.env.LIFEHUB_CLIENT_DIST = CLIENT_DIST;
        process.env.PORT = String(port);
        // sqlite3 собран под N-API, поэтому сервер работает прямо в процессе Electron.
        await import(pathToFileURL(SERVER_ENTRY).href);
        await waitForServer(`${url}/`);
        localServerUrl = url;
        return url;
      }
      if (await isLifeHubServer(url)) {
        localServerUrl = url;
        return url;
      }
    }
    throw new Error('Не удалось найти свободный порт для сервера');
  })();

  try {
    return await localServerStarting;
  } finally {
    localServerStarting = null;
  }
}

// ───────────── Окно ─────────────
function showLoading(status, error = false) {
  if (!mainWindow) return;
  const query = new URLSearchParams({ status, error: error ? '1' : '' }).toString();
  return mainWindow.loadFile(path.join(__dirname, 'loading.html'), { search: query });
}

async function openApp() {
  const config = readConfig();
  try {
    let target;
    if (config.server) {
      await showLoading(`Подключаемся к ${config.server}…`);
      target = config.server.replace(/\/+$/, '');
    } else {
      await showLoading('Запускаем встроенный сервер…');
      target = await startLocalServer();
    }
    await mainWindow.loadURL(`${target}/`);
  } catch (error) {
    console.error(error);
    await showLoading(error.message || 'Не удалось запустить приложение', true);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#051824',
    title: 'Life Hub',
    autoHideMenuBar: true,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      // Напоминания и ачивки проверяются по таймеру, в том числе когда окно свёрнуто в трей
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // Крестик сворачивает в трей (если включено), выход — через меню трея
  mainWindow.on('close', (event) => {
    if (isQuitting || !desktopSettings().closeToTray) return;
    event.preventDefault();
    mainWindow.hide();
    const config = readConfig();
    if (!config.trayHintShown) {
      writeConfig({ trayHintShown: true });
      showNotification({ title: 'Life Hub работает в трее', body: 'Напоминания продолжат приходить. Открыть окно — двойной клик по значку у часов.' });
    }
  });

  // Внешние ссылки — в системном браузере, а не внутри приложения.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || url.startsWith('file:') || code === -3) return;
    showLoading(`Сервер ${new URL(url).origin} недоступен (${description})`, true);
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) mainWindow.webContents.reload();
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) mainWindow.webContents.toggleDevTools();
    if (input.key === 'F11') mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  openApp();
}

// ───────────── Трей, уведомления, автозапуск ─────────────
function desktopSettings() {
  const config = readConfig();
  return {
    closeToTray: config.closeToTray !== false,
    notifications: config.notifications !== false,
    autostart: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin,
    setupDone: !!config.desktopSetupDone,
  };
}

function applyDesktopSettings(patch = {}) {
  const next = {};
  if (typeof patch.closeToTray === 'boolean') next.closeToTray = patch.closeToTray;
  if (typeof patch.notifications === 'boolean') next.notifications = patch.notifications;
  if (patch.setupDone) next.desktopSetupDone = true;
  if (Object.keys(next).length) writeConfig(next);
  if (typeof patch.autostart === 'boolean' && !isDev) {
    // В режиме разработки автозапуск не трогаем: прописался бы electron.exe из node_modules
    app.setLoginItemSettings({ openAtLogin: patch.autostart, args: ['--hidden'] });
  }
  updateTrayMenu();
  return desktopSettings();
}

function showWindow(route) {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (route) mainWindow.webContents.send('desktop:navigate', route);
}

function showNotification({ title, body, route }) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined, silent: false });
  notification.on('click', () => showWindow(route));
  notification.show();
  return true;
}

function updateTrayMenu() {
  if (!tray) return;
  const settings = desktopSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть Life Hub', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Напоминания', type: 'checkbox', checked: settings.notifications, click: (item) => applyDesktopSettings({ notifications: item.checked }) },
      { label: 'Запускать вместе с Windows', type: 'checkbox', checked: settings.autostart, enabled: !isDev, click: (item) => applyDesktopSettings({ autostart: item.checked }) },
      { label: 'Сворачивать в трей при закрытии', type: 'checkbox', checked: settings.closeToTray, click: (item) => applyDesktopSettings({ closeToTray: item.checked }) },
      { type: 'separator' },
      { label: 'Выход', click: () => { isQuitting = true; app.quit(); } },
    ])
  );
}

function createTray() {
  const image = fs.existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Life Hub');
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
  updateTrayMenu();
}

// ───────────── Напоминания: проверяет главный процесс ─────────────
// Раньше напоминания проверяло окно, и при закрытом/не загруженном окне они не приходили.
// Теперь сервер опрашивается отсюда — работает и в трее, и сразу после автозапуска.
const REMINDER_POLL_MS = 10 * 60_000;
let reminderStatus = { lastCheck: null, ok: null, error: null, shown: 0 };

const pad2 = (n) => String(n).padStart(2, '0');
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const serverBase = () => (readConfig().server || localServerUrl || '').replace(/\/+$/, '');

async function apiFetch(pathname, options = {}) {
  const token = readConfig().authToken;
  const base = serverBase();
  if (!token) throw new Error('не выполнен вход в аккаунт');
  if (!base) throw new Error('сервер ещё не запущен');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (response.status === 401) throw new Error('сессия истекла — войдите заново');
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('сервер не ответил');
    throw new Error(error.message?.includes('fetch failed') ? `сервер ${base} недоступен` : error.message);
  } finally {
    clearTimeout(timer);
  }
}

async function checkReminders({ force = false } = {}) {
  if (!force && !desktopSettings().notifications) return reminderStatus;
  const now = new Date();
  const today = localDateStr(now);
  let shownCount = 0;
  try {
    const res = await apiFetch(`/api/reminders/pending?date=${today}&hour=${now.getHours()}${force ? '&force=1' : ''}`);
    const config = readConfig();
    const cutoff = localDateStr(new Date(Date.now() - 3 * 86400_000));
    const shown = Object.fromEntries(Object.entries(config.shownReminders || {}).filter(([, date]) => date >= cutoff));
    for (const item of Array.isArray(res?.items) ? res.items : []) {
      if (!force && shown[item.key]) continue;
      if (showNotification({ title: item.title, body: item.body, route: item.route })) shownCount += 1;
      shown[item.key] = today;
    }
    // Новые ачивки — уведомлением, только если окно не на экране (иначе их покажет само приложение)
    const windowVisible = !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused();
    if (!windowVisible) {
      const unseen = await apiFetch('/api/achievements/unseen').catch(() => null);
      const items = Array.isArray(unseen?.items) ? unseen.items : [];
      for (const a of items) {
        showNotification({ title: `🏆 Ачивка: ${a.title}`, body: [a.description, a.xp_reward ? `+${a.xp_reward} XP` : ''].filter(Boolean).join(' · '), route: 'achievements' });
        shownCount += 1;
      }
      if (items.length) await apiFetch('/api/achievements/seen', { method: 'POST', body: JSON.stringify({ ids: items.map((a) => a.id) }) }).catch(() => {});
    }
    writeConfig({ shownReminders: shown });
    reminderStatus = { lastCheck: now.toISOString(), ok: true, error: null, shown: shownCount };
  } catch (error) {
    reminderStatus = { lastCheck: now.toISOString(), ok: false, error: error.message, shown: 0 };
  }
  return reminderStatus;
}

function startReminderLoop() {
  setTimeout(() => checkReminders(), 45_000);
  setInterval(() => checkReminders(), REMINDER_POLL_MS);
}

/**
 * Windows показывает уведомления только приложениям с ярлыком в «Пуске» с тем же AppUserModelId.
 * Установщик создаёт его сам, а портативной версии — нет, поэтому уведомления молча пропадали.
 */
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32' || isDev) return;
  try {
    const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const shortcut = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Life Hub.lnk');
    const options = { target, appUserModelId: 'com.lifehub.desktop', description: 'Life Hub', icon: target, iconIndex: 0 };
    if (fs.existsSync(shortcut)) {
      const current = shell.readShortcutLink(shortcut);
      if (current.target === target && current.appUserModelId === 'com.lifehub.desktop') return;
      shell.writeShortcutLink(shortcut, 'replace', options);
    } else {
      shell.writeShortcutLink(shortcut, 'create', options);
    }
  } catch (error) {
    console.error('shortcut', error);
  }
}

ipcMain.handle('desktop:auth', (_event, token) => {
  const value = typeof token === 'string' && token ? token : null;
  if (readConfig().authToken !== value) writeConfig({ authToken: value });
  return true;
});
ipcMain.handle('desktop:reminders:check', () => checkReminders({ force: true }));
ipcMain.handle('desktop:reminders:status', () => reminderStatus);
ipcMain.handle('desktop:notify-test', () =>
  showNotification({ title: 'Life Hub: проверка 🔔', body: 'Если вы видите это — уведомления Windows работают.', route: null })
);

ipcMain.handle('desktop:settings:get', () => desktopSettings());
ipcMain.handle('desktop:settings:set', (_event, patch) => applyDesktopSettings(patch));
ipcMain.handle('desktop:notify', (_event, payload) => {
  if (!desktopSettings().notifications && !payload?.force) return false;
  return showNotification({ title: String(payload?.title || 'Life Hub'), body: String(payload?.body || ''), route: payload?.route || null });
});
ipcMain.handle('desktop:window-visible', () => !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused());

// ───────────── IPC для страницы входа и экрана загрузки ─────────────
ipcMain.handle('server:get', () => {
  const config = readConfig();
  return { mode: config.server ? 'remote' : 'local', url: config.server || localServerUrl, recent: config.recent || [] };
});

/** Приводит ввод к адресу: «1.2.3.4» → http://1.2.3.4:4000, «host:8080» → http://host:8080. */
function normalizeServerUrl(input) {
  let value = String(input || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  const explicitPort = /^https?:\/\/[^/]+:\d+/i.test(value);
  const url = new URL(value);
  // Порт по умолчанию — 4000, если не указан явно (явный :80 оставляем как есть)
  if (!explicitPort && url.protocol === 'http:') url.port = '4000';
  return url.origin;
}

/** Проверяет, что по адресу отвечает сервер Life Hub. */
async function checkServer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${url}/api/health`, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (data?.app !== 'lifehub') throw new Error('по этому адресу отвечает не сервер Life Hub (или старая версия без /api/health)');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('сервер не ответил за 6 секунд — проверьте IP, порт и файрвол');
    throw new Error(error.message?.includes('fetch failed') ? 'не удалось подключиться — проверьте IP, порт и что сервер запущен' : error.message);
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('server:check', async (_event, input) => {
  try {
    const url = normalizeServerUrl(input);
    const info = await checkServer(url);
    return { ok: true, url, version: info.version };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('server:set', async (_event, input) => {
  let value = '';
  if (input) {
    try {
      value = normalizeServerUrl(input);
      await checkServer(value);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  const config = readConfig();
  const recent = value ? [value, ...(config.recent || []).filter((u) => u !== value)].slice(0, 5) : config.recent || [];
  writeConfig({ server: value || null, recent });
  await openApp();
  return { ok: true };
});

ipcMain.handle('app:retry', () => openApp());

// Импорт базы, когда сервер уже запущен: файл открыт сервером, поэтому кладём его
// рядом и подменяем при следующем старте (приложение перезапускается само).
ipcMain.handle('app:import-db', async () => {
  if (isDev) {
    dialog.showMessageBox(mainWindow, { message: 'В режиме разработки используется server/lifehub.sqlite — импорт не нужен.' });
    return false;
  }
  const source = await pickDatabaseFile();
  if (!source) return false;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Life Hub',
    message: 'Заменить текущие данные приложения?',
    detail: 'Текущая база будет сохранена как резервная копия рядом. Приложение перезапустится.',
    buttons: ['Заменить и перезапустить', 'Отмена'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return false;
  fs.copyFileSync(source, path.join(app.getPath('userData'), PENDING_DB));
  copyUploadsNextTo(source, app.getPath('userData'));
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle('app:data-dir', () => shell.openPath(isDev ? path.join(ROOT, 'server') : app.getPath('userData')));

// ───────────── Жизненный цикл ─────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  // Нужен Windows для уведомлений от имени «Life Hub», а не electron.exe
  app.setAppUserModelId('com.lifehub.desktop');
  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    ensureStartMenuShortcut();
    createWindow();
    createTray();
    startReminderLoop();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  process.on('uncaughtException', (error) => {
    console.error(error);
    if (app.isReady()) dialog.showErrorBox('Life Hub — ошибка', String(error?.stack || error));
  });

  app.on('window-all-closed', () => {
    // При сворачивании в трей окно скрыто, а не закрыто; сюда попадаем только при выходе
    if (process.platform !== 'darwin' && (isQuitting || !desktopSettings().closeToTray)) app.quit();
  });
}
