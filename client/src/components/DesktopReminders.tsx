import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { desktop, reminderPath } from '../desktop';

/**
 * Только в десктоп-версии. Напоминания и ачивки опрашивает главный процесс Electron
 * (работает и когда окно свёрнуто в трей); здесь — передаём ему токен входа
 * и открываем нужный раздел по клику на уведомление.
 */
export default function DesktopReminders() {
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    desktop()?.setAuth?.(token);
  }, [token]);

  useEffect(() => {
    const unsubscribe = desktop()?.onNavigate?.((route) => navigate(reminderPath(route)));
    return () => unsubscribe?.();
  }, [navigate]);

  return null;
}
