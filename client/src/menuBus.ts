const MENU_COUNTERS_EVENT = 'app:menu-counters:refresh';
const MENU_VISIBILITY_EVENT = 'app:menu-visibility:update';
const MENU_ITEMS_EVENT = 'app:menu-items:update';

type MenuVisibilityDetail = { showMenuCounters: boolean };
type MenuItemsDetail = { hidden: string[] };

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

export const notifyHiddenMenuItems = (hidden: string[]): void => {
  if (!isBrowser) return;
  const detail: MenuItemsDetail = { hidden };
  window.dispatchEvent(new CustomEvent<MenuItemsDetail>(MENU_ITEMS_EVENT, { detail }));
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

export const onHiddenMenuItemsChange = (callback: (hidden: string[]) => void): Cleanup => {
  if (!isBrowser) return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<MenuItemsDetail>).detail;
    if (detail && Array.isArray(detail.hidden)) {
      callback(detail.hidden);
    }
  };
  window.addEventListener(MENU_ITEMS_EVENT, handler as EventListener);
  return () => window.removeEventListener(MENU_ITEMS_EVENT, handler as EventListener);
};

export const menuBusEvents = {
  MENU_COUNTERS_EVENT,
  MENU_VISIBILITY_EVENT,
  MENU_ITEMS_EVENT,
};

export type { MenuVisibilityDetail };