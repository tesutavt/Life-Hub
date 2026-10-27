import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { AuthButton, AuthField, AuthLayout, translateAuthError } from './AuthLayout';

export default function Register() {
  const { setToken } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await api.post('/api/auth/register', { email, password, name, username }, { silentSuccess: true, silentError: true });
      setToken(r.token);
      nav('/dashboard');
    } catch (error: any) {
      setErr(translateAuthError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h1 className="mb-5 text-center text-2xl font-semibold text-white">Создать учётную запись</h1>
        <div className="space-y-4">
          <AuthField label="Email" required type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <AuthField label="Отображаемое имя" value={name} onChange={(e) => setName(e.target.value)} hint={<span className="text-white/40">Так вас будут видеть другие. Можно поменять позже.</span>} />
          <AuthField
            label="Имя пользователя"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
            hint={<span className="text-white/40">Латиница, цифры, «_» и «.» — адрес вашего профиля</span>}
          />
          <AuthField label="Пароль" required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="mt-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{err}</div>}
        <div className="mt-5">
          <AuthButton type="submit" loading={loading}>
            Продолжить
          </AuthButton>
        </div>
        <p className="mt-2 text-[11px] text-white/40">Регистрируясь, вы получаете первую ачивку 🎉</p>
        <div className="mt-4 text-sm">
          <Link to="/login" className="font-medium text-sky-300 hover:underline">
            Уже зарегистрированы?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
