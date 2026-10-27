const PROFILE_UPDATED_EVENT = 'app:profile:updated';

type Cleanup = () => void;

const isBrowser = typeof window !== 'undefined';

export const notifyProfileUpdated = (): void => {
  if (!isBrowser) return;
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
};

export const onProfileUpdated = (callback: () => void): Cleanup => {
  if (!isBrowser) return () => undefined;
  const handler = () => callback();
  window.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
};

export const profileBusEvents = {
  PROFILE_UPDATED_EVENT,
};
