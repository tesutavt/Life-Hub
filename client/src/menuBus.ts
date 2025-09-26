const MENU_COUNTERS_EVENT = 'app:menu-counters:refresh';
const MENU_VISIBILITY_EVENT = 'app:menu-visibility:update';

type MenuVisibilityDetail = { showMenuCounters: boolean };

type Cleanup = () => void;

const isBrowser = typeof window !== 'undefined';

export const requestMenuCountersRefresh = (): void => {
  if (!isBrowser) return;
  window.dispatchEvent(new Event(MENU_COUNTERS_EVENT));
};

export const notifyMenuCountersVisibility = (show: boolean): void => {
  if (!isBrowser) return;
  const detail: MenuVisibilityDetail = { showMenuCounters: show };
  window.dispatchEvent(new CustomEvent<MenuVisibilityDetail>(MENU_VISIBILITY_EVENT, { detail }));
};

export const onMenuCountersRefresh = (callback: () => void): Cleanup => {
  if (!isBrowser) return () => undefined;
  const handler = () => callback();
  window.addEventListener(MENU_COUNTERS_EVENT, handler);
  return () => window.removeEventListener(MENU_COUNTERS_EVENT, handler);
};

export const onMenuVisibilityChange = (callback: (show: boolean) => void): Cleanup => {
  if (!isBrowser) return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<MenuVisibilityDetail>).detail;
    if (detail && typeof detail.showMenuCounters === 'boolean') {
      callback(detail.showMenuCounters);
    }
  };
  window.addEventListener(MENU_VISIBILITY_EVENT, handler as EventListener);
  return () => window.removeEventListener(MENU_VISIBILITY_EVENT, handler as EventListener);
};

export const menuBusEvents = {
  MENU_COUNTERS_EVENT,
  MENU_VISIBILITY_EVENT
};

export type { MenuVisibilityDetail };