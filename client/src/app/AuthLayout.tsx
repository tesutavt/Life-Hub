import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { BookOpen, Dumbbell, Server, Target, Trophy, Wallet } from 'lucide-react';

export { desktop } from '../desktop';
import { desktop } from '../desktop';

/** Каркас страниц входа/регистрации: фон-иллюстрация и карточка по центру (как у Discord). */
export function AuthLayout({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-deep p-4">
      <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: 'url(/art-bg.jpg)' }} />
      <div className="absolute inset-0 bg-gradient-to-br from-brand-deep/90 via-brand-night/70 to-indigo-950/80" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 animate-[auth-float_14s_ease-in-out_infinite] rounded-full bg-brand-mint/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] animate-[auth-float_18s_ease-in-out_infinite_reverse] rounded-full bg-indigo-500/25 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 animate-[auth-float_22s_ease-in-out_infinite] rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="absolute left-6 top-5 flex items-center gap-2 text-white">
        <Logo size={34} />
        <span className="text-lg font-extrabold tracking-tight">Life Hub</span>
      </div>

      <div className="relative z-10 flex w-full max-w-[784px] animate-[auth-in_500ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-[10px] bg-brand-night/95 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="w-full p-8 md:w-[480px]">{children}</div>
        {aside !== undefined ? (
          <div className="hidden flex-1 flex-col items-center justify-center border-l border-white/5 p-8 text-center md:flex">{aside}</div>
        ) : null}
      </div>

      <ServerSwitch />
    </div>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-mint via-sky-400 to-indigo-500 font-black text-brand-deep shadow-[0_6px_20px_rgba(39,233,181,0.35)]"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      L
    </div>
  );
}

export function AuthField({
  label,
  required,
  error,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean; error?: string | null; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className={classNames('mb-2 block text-xs font-bold uppercase tracking-wide', error ? 'text-rose-300' : 'text-white/70')}>
        {label}
        {required ? <span className="pl-1 text-rose-400">*</span> : null}
        {error ? <span className="pl-1 text-[11px] font-medium normal-case italic tracking-normal">— {error}</span> : null}
      </span>
      <input
        {...input}
        required={required}
        className="h-10 w-full rounded-[4px] border-none bg-brand-deep px-3 text-[15px] text-white outline-none ring-0 transition placeholder:text-white/25 focus:ring-2 focus:ring-brand-mint/60"
      />
      {hint ? <span className="mt-1.5 block text-xs">{hint}</span> : null}
    </label>
  );
}

export function AuthButton({ children, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="flex h-11 w-full items-center justify-center rounded-[4px] bg-gradient-to-r from-brand-mint to-sky-400 text-[15px] font-semibold text-brand-deep transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-80"
    >
      {loading ? (
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-deep" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

const FEATURES = [
  { icon: Wallet, text: 'Финансы и кредиты', color: 'text-brand-mint' },
  { icon: Dumbbell, text: 'Фитнес и сон', color: 'text-sky-300' },
  { icon: BookOpen, text: 'Языки и уроки', color: 'text-violet-300' },
  { icon: Target, text: 'Цели и привычки', color: 'text-pink-300' },
  { icon: Trophy, text: 'Ачивки и XP', color: 'text-amber-300' },
];

export function AuthAside({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-3xl bg-brand-mint/10" style={{ animationDuration: '3s' }} />
        <div className="relative rounded-3xl bg-white p-2 shadow-xl">
          <Logo size={140} />
        </div>
      </div>
      <div className="text-2xl font-semibold text-white">{title}</div>
      <div className="mt-2 max-w-[240px] text-sm text-white/60">{subtitle}</div>
      <div className="mt-6 flex flex-wrap justify-center gap-1.5">
        {FEATURES.map(({ icon: Icon, text, color }) => (
          <span key={text} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
            <Icon size={12} className={color} /> {text}
          </span>
        ))}
      </div>
    </>
  );
}

/** В десктоп-версии позволяет выбрать: встроенный сервер или удалённый (VDS по IP/домену). */
function ServerSwitch() {
  const bridge = desktop();
  const [info, setInfo] = useState<{ mode: 'local' | 'remote'; url: string | null; recent?: string[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });

  useEffect(() => {
    bridge?.getServer().then((value) => {
      setInfo(value);
      setUrl(value.mode === 'remote' ? value.url || '' : '');
    });
  }, []);

  if (!bridge || !info) return null;

  const connect = async (target: string | null) => {
    setStatus({ kind: 'busy', text: target ? 'Проверяем сервер…' : 'Запускаем встроенный сервер…' });
    const result = await bridge.setServer(target);
    if (result && result.ok === false) setStatus({ kind: 'error', text: result.error });
  };

  const check = async () => {
    if (!bridge.checkServer || !url.trim()) return;
    setStatus({ kind: 'busy', text: 'Проверяем…' });
    const result = await bridge.checkServer(url);
    setStatus(result.ok ? { kind: 'ok', text: `Сервер найден: ${result.url}` } : { kind: 'error', text: result.error });
  };

  return (
    <div className="absolute bottom-4 left-1/2 z-20 w-[min(560px,92vw)] -translate-x-1/2">
      {open ? (
        <div className="rounded-2xl bg-brand-night/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Server size={15} className="text-brand-mint" /> Сервер
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/50 hover:text-white">
              Свернуть
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect(url.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setStatus({ kind: 'idle' });
              }}
              placeholder="IP или домен: 95.105.76.39 или lifehub.example.com"
              className="h-10 min-w-0 flex-1 rounded-[4px] bg-brand-deep px-3 text-sm text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-brand-mint/60"
            />
            <button type="button" onClick={check} disabled={!url.trim()} className="rounded-[4px] bg-white/10 px-3 text-xs text-white/80 hover:bg-white/15 disabled:opacity-40">
              Проверить
            </button>
            <button type="submit" disabled={!url.trim() || status.kind === 'busy'} className="rounded-[4px] bg-brand-mint px-3 text-xs font-semibold text-brand-deep disabled:opacity-40">
              Подключить
            </button>
          </form>
          <div className="mt-1.5 text-[11px] text-white/40">Порт по умолчанию — 4000. Для HTTPS укажите адрес с https://</div>
          {status.kind !== 'idle' && (
            <div className={classNames('mt-2 rounded-md px-3 py-2 text-xs', status.kind === 'error' ? 'bg-rose-500/15 text-rose-200' : status.kind === 'ok' ? 'bg-brand-mint/15 text-brand-mint/90' : 'bg-white/5 text-white/60')}>
              {status.text}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => connect(null)}
              className={classNames('rounded-full px-3 py-1 text-xs', info.mode === 'local' ? 'bg-brand-mint/20 text-brand-mint/90' : 'bg-white/5 text-white/70 hover:bg-white/10')}
            >
              💻 Встроенный (на этом компьютере)
            </button>
            {(info.recent || []).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => connect(item)}
                className={classNames('rounded-full px-3 py-1 text-xs', info.mode === 'remote' && info.url === item ? 'bg-sky-400/20 text-sky-100' : 'bg-white/5 text-white/70 hover:bg-white/10')}
              >
                🌐 {item.replace(/^https?:\/\//, '')}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-xs text-white/60 backdrop-blur hover:text-white">
            <span className={classNames('h-2 w-2 rounded-full', info.mode === 'local' ? 'bg-brand-mint' : 'bg-sky-400')} />
            Сервер: {info.mode === 'local' ? 'встроенный' : info.url?.replace(/^https?:\/\//, '')} · сменить
          </button>
        </div>
      )}
    </div>
  );
}

export const translateAuthError = (message: string) => {
  const map: Record<string, string> = {
    'bad creds': 'Неверный логин или пароль',
    exists: 'Этот email уже зарегистрирован',
    username_taken: 'Это имя пользователя уже занято',
    'Failed to fetch': 'Сервер недоступен. Проверьте подключение',
  };
  return map[message] || message;
};
