import React, { useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import { Link, useNavigate } from 'react-router-dom'

export default function Register(){
  const { setToken } = useAuth()
  const nav = useNavigate()
  const [email,setEmail]=useState('test@example.com')
  const [password,setPassword]=useState('test')
  const [name,setName]=useState('User')
  const [err,setErr]=useState('')

  const submit = async (e:React.FormEvent)=>{
    e.preventDefault()
    try{
      const r = await api.post('/api/auth/register',{email,password,name})
      setToken(r.token)
      nav('/dashboard')
    }catch(e:any){ setErr(e.message) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-2xl bg-white/5 border border-white/10 space-y-3">
        <div className="text-xl font-semibold">Регистрация</div>
        {err && <div className="text-sm text-red-300">{err}</div>}
        <input className="w-full px-3 py-2 rounded bg-white/10" placeholder="Имя" value={name} onChange={e=>setName(e.target.value)}/>
        <input className="w-full px-3 py-2 rounded bg-white/10" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
        <input className="w-full px-3 py-2 rounded bg-white/10" placeholder="Пароль" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
        <button className="px-4 py-2 rounded bg-white text-black w-full">Создать</button>
        <div className="text-sm opacity-70">Уже есть аккаунт? <Link to="/login" className="underline">Войти</Link></div>
      </form>
    </div>
  )
}
