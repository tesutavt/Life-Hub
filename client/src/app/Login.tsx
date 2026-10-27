import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { AuthAside, AuthButton, AuthField, AuthLayout, desktop, translateAuthError } from './AuthLayout';

export default function Login() {
  const { setToken } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await api.post('/api/auth/login', { email, password }, { silentSuccess: true, silentError: true });
      setToken(r.token);
      nav('/dashboard');
    } catch (error: any) {
      setErr(translateAuthError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout aside={<AuthAside title="Ваша жизнь — в одном окне" subtitle="Финансы, здоровье, учёба и цели. Всё под рукой и с наградами за прогресс." />}>
      <form onSubmit={submit}>
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-white">С возвращением!</h1>
          <p className="mt-1 text-[15px] text-white/60">Мы так рады видеть вас снова! 👋</p>
        </div>
        <div className="space-y-5">
          <AuthField
            label="Email или имя пользователя"
            required
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={err ? 'неверные данные' : null}
          />
          <AuthField
            label="Пароль"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={err ? 'неверные данные' : null}
            hint={
              <button type="button" onClick={() => setForgot((v) => !v)} className="font-medium text-sky-300 hover:underline">
                Забыли пароль?
              </button>
            }
          />
        </div>
        {forgot && (
          <div className="mt-3 rounded-md bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
            Попросите администратора сбросить пароль в разделе «Пользователи».
          </div>
        )}
        {err && desktop()?.importDatabase && (
          <div className="mt-3 rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            У десктоп-версии своя база данных. Аккаунт создан в веб-версии?{' '}
            <button type="button" onClick={() => desktop()?.importDatabase?.()} className="font-semibold underline">
              Перенести базу (lifehub.sqlite)
            </button>
          </div>
        )}
        {err && <div className="mt-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{err}</div>}
        <div className="mt-5">
          <AuthButton type="submit" loading={loading}>
            Вход
          </AuthButton>
        </div>
        <div className="mt-2 text-sm text-white/50">
          Нужна учётная запись?{' '}
          <Link to="/register" className="font-medium text-sky-300 hover:underline">
            Зарегистрироваться
          </Link>
        </div>
        {desktop()?.importDatabase && (
          <button type="button" onClick={() => desktop()?.importDatabase?.()} className="mt-3 text-xs text-white/40 hover:text-white/70 hover:underline">
            Перенести данные из другой базы…
          </button>
        )}
      </form>
    </AuthLayout>
  );
}
