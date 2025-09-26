import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark'|'light';
type ThemeCtx = { theme: Theme; toggle: ()=>void };
const Ctx = createContext<ThemeCtx>(null!);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  useEffect(()=>{
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') { root.classList.add('dark'); } else { root.classList.remove('dark'); }
  }, [theme]);
  return <Ctx.Provider value={{ theme, toggle: ()=>setTheme(t=>t==='dark'?'light':'dark') }}>{children}</Ctx.Provider>;
};
export const useTheme = () => useContext(Ctx);
