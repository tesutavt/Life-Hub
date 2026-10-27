// Открыть дневник ежедневных заданий из любого места приложения.
const EVENT = 'lifehub:open-missions-diary';

export const openMissionsDiary = () => window.dispatchEvent(new Event(EVENT));

export const onOpenMissionsDiary = (handler: () => void) => {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
