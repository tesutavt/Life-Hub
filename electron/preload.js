const { contextBridge, ipcRenderer } = require('electron');

// Мост для веб-клиента: страница входа показывает переключатель сервера,
// экран загрузки — кнопки «Повторить» и «Встроенный сервер».
contextBridge.exposeInMainWorld('lifehubDesktop', {
  isDesktop: true,
  platform: process.platform,
  getServer: () => ipcRenderer.invoke('server:get'),
  setServer: (url) => ipcRenderer.invoke('server:set', url),
  checkServer: (url) => ipcRenderer.invoke('server:check', url),
  retry: () => ipcRenderer.invoke('app:retry'),
  openDataDir: () => ipcRenderer.invoke('app:data-dir'),
  importDatabase: () => ipcRenderer.invoke('app:import-db'),
  // Трей, уведомления Windows, автозапуск
  getDesktopSettings: () => ipcRenderer.invoke('desktop:settings:get'),
  setDesktopSettings: (patch) => ipcRenderer.invoke('desktop:settings:set', patch),
  notify: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  // Напоминания проверяет главный процесс; окно лишь передаёт токен входа
  setAuth: (token) => ipcRenderer.invoke('desktop:auth', token),
  checkReminders: () => ipcRenderer.invoke('desktop:reminders:check'),
  reminderStatus: () => ipcRenderer.invoke('desktop:reminders:status'),
  testNotification: () => ipcRenderer.invoke('desktop:notify-test'),
  isWindowVisible: () => ipcRenderer.invoke('desktop:window-visible'),
  onNavigate: (callback) => {
    const handler = (_event, route) => callback(route);
    ipcRenderer.on('desktop:navigate', handler);
    return () => ipcRenderer.removeListener('desktop:navigate', handler);
  },
});
