import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Modal } from './ui/Modal';
import { api } from '../api';

type QrPayload = { code: string; expires_at: string; urls: string[] };

/**
 * Вход в Android-приложение по QR: телефон сканирует код и сразу оказывается
 * в этом аккаунте на этом сервере. Код одноразовый и живёт 2 минуты.
 */
export default function PhoneLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    setImage(null);
    try {
      const data = (await api.post('/api/auth/qr', {}, { silentSuccess: true, silentError: true })) as QrPayload;
      setPayload(data);
      const link = `lifehub://login?code=${encodeURIComponent(data.code)}&s=${encodeURIComponent(data.urls.join('|'))}`;
      setImage(await QRCode.toDataURL(link, { width: 280, margin: 1, color: { dark: '#051824', light: '#ffffff' } }));
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать код');
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !payload) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(payload.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open, payload]);

  // Истёк — сразу выдаём новый, чтобы окно можно было держать открытым
  useEffect(() => {
    if (open && payload && left === 0) refresh();
  }, [open, payload, left, refresh]);

  return (
    <Modal open={open} onClose={onClose} showCloseButton contentClassName="w-full max-w-md rounded-3xl border border-white/10 bg-brand-night p-6 shadow-2xl">
      <div className="space-y-4 text-center">
        <div className="pr-6 text-left">
          <div className="flex items-center gap-2 text-lg font-semibold text-white">
            <Smartphone size={18} className="text-brand-mint" /> Войти на телефоне
          </div>
          <div className="text-sm text-white/60">
            В приложении Life Hub на Android нажмите «Войти по QR-коду» и наведите камеру. Адрес сервера и вход подставятся сами.
          </div>
        </div>
        <div className="mx-auto flex h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white">
          {image ? <img src={image} alt="QR-код для входа" className="h-full w-full" /> : error ? null : <Loader2 className="h-8 w-8 animate-spin text-brand-deep" />}
          {error && <div className="p-4 text-sm text-rose-600">{error}</div>}
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-white/50">
          {payload && <span>Код обновится через {left} с</span>}
          <button type="button" onClick={refresh} className="inline-flex items-center gap-1 text-brand-mint hover:underline">
            <RefreshCw size={12} /> Новый код
          </button>
        </div>
        {payload && (
          <div className="rounded-2xl bg-white/5 p-3 text-left text-xs text-white/60">
            Телефон попробует подключиться по адресам:
            <ul className="mt-1 space-y-0.5 font-mono text-white/80">
              {payload.urls.map((url) => (
                <li key={url}>{url}</li>
              ))}
            </ul>
            <div className="mt-2 text-white/45">Телефон должен быть в той же Wi-Fi сети, а порт — открыт в брандмауэре Windows.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
