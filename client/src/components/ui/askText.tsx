import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

// Своё окно ввода вместо window.prompt: в собранном приложении (Electron) prompt() не поддерживается
// и молча возвращает null — из-за этого «Своё название блока» и переименования не работали.

type Request = { title: string; value: string; placeholder?: string; password?: boolean; resolve: (v: string | null) => void };
let push: ((r: Request) => void) | null = null;

/** Спросить строку у пользователя. Возвращает null, если окно закрыли. */
export function askText(title: string, value = '', options: { placeholder?: string; password?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!push) return resolve(null);
    push({ title, value, ...options, resolve });
  });
}

/** Монтируется один раз в корне приложения. */
export function AskTextHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    push = (r) => {
      setReq(r);
      setValue(r.value);
    };
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (req) window.setTimeout(() => inputRef.current?.select(), 50);
  }, [req]);
  const close = (result: string | null) => {
    req?.resolve(result);
    setReq(null);
  };
  return (
    <Modal open={!!req} onClose={() => close(null)} contentClassName="w-full max-w-sm rounded-3xl border border-white/10 bg-brand-night p-5 shadow-2xl">
      {req ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            close(value);
          }}
          className="space-y-4"
        >
          <div className="text-base font-semibold text-white">{req.title}</div>
          <input
            ref={inputRef}
            autoFocus
            type={req.password ? 'password' : 'text'}
            value={value}
            placeholder={req.placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-mint/60"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => close(null)} className="rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10">
              Отмена
            </button>
            <button type="submit" className="rounded-xl bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-deep">
              Готово
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
