import React, { useEffect, useRef, useState } from 'react';
import { Season, ThemeSettings, loadLocalTheme, onThemeChange, seasonByDate } from '../theme';

// Сезонная атмосфера поверх интерфейса: падающие лепестки, листья, снег, светлячки,
// на Хэллоуин — паутина и тыквы по углам, на Новый год — гирлянда. Клики проходят насквозь.

type Particle = { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; phase: number; hue: number };

const COUNT: Record<Season, number> = { spring: 26, summer: 22, autumn: 22, halloween: 10, winter: 60, newyear: 45 };

function spawn(season: Season, w: number, h: number, anywhere: boolean): Particle {
  const fall = season === 'winter' || season === 'newyear' ? 0.5 + Math.random() * 1.1 : season === 'summer' ? 0 : 0.6 + Math.random() * 0.9;
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -20 - Math.random() * 60,
    vx: (Math.random() - 0.3) * 0.6,
    vy: fall,
    size: season === 'winter' || season === 'newyear' ? 1.5 + Math.random() * 3 : season === 'summer' ? 2 + Math.random() * 2 : 7 + Math.random() * 7,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.04,
    phase: Math.random() * Math.PI * 2,
    hue: Math.random(),
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.phase)));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
  g.addColorStop(0, 'rgba(255,240,245,0.95)');
  g.addColorStop(1, `rgba(${244 - p.hue * 20},${143 + p.hue * 30},${177 + p.hue * 20},0.85)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -p.size);
  ctx.bezierCurveTo(p.size, -p.size * 0.6, p.size * 0.8, p.size * 0.7, 0, p.size);
  ctx.bezierCurveTo(-p.size * 0.8, p.size * 0.7, -p.size, -p.size * 0.6, 0, -p.size);
  ctx.fill();
  ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(p.phase)));
  const colors = ['#f59e0b', '#ea580c', '#dc2626', '#ca8a04', '#b45309'];
  ctx.fillStyle = colors[Math.floor(p.hue * colors.length)] || '#ea580c';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -p.size);
  ctx.quadraticCurveTo(p.size * 0.9, -p.size * 0.2, 0, p.size);
  ctx.quadraticCurveTo(-p.size * 0.9, -p.size * 0.2, 0, -p.size);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,30,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -p.size);
  ctx.lineTo(0, p.size * 1.3);
  ctx.stroke();
  ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.fillStyle = `rgba(255,255,255,${0.55 + p.hue * 0.4})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawFirefly(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + p.phase));
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
  g.addColorStop(0, `rgba(253,250,180,${a})`);
  g.addColorStop(1, 'rgba(253,250,180,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBat(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  const flap = Math.sin(t / 120 + p.phase) * 0.6;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(20,10,30,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 9, -8 - flap * 8, side * 16, -2 - flap * 6);
    ctx.quadraticCurveTo(side * 10, 2, 0, 2);
    ctx.fill();
  });
  ctx.restore();
}

/** Паутина в углу (SVG). */
function Cobweb({ corner }: { corner: 'tl' | 'tr' }) {
  const flip = corner === 'tr' ? 'scale(-1,1)' : undefined;
  return (
    <svg width="170" height="170" viewBox="0 0 170 170" className={`pointer-events-none fixed top-0 ${corner === 'tl' ? 'left-0' : 'right-0'} opacity-60`} style={{ transform: flip, zIndex: 45 }}>
      <g stroke="rgba(230,230,240,0.55)" strokeWidth="1" fill="none">
        {[0, 18, 36, 54, 72, 90].map((deg) => {
          const r = (deg * Math.PI) / 180;
          return <line key={deg} x1="0" y1="0" x2={Math.cos(r) * 170} y2={Math.sin(r) * 170} />;
        })}
        {[30, 60, 95, 135].map((rad) => (
          <path key={rad} d={`M ${rad} 0 Q ${rad * 0.78} ${rad * 0.32} ${rad * 0.95} ${rad * 0.31} Q ${rad * 0.62} ${rad * 0.55} ${rad * 0.81} ${rad * 0.59} Q ${rad * 0.42} ${rad * 0.72} ${rad * 0.59} ${rad * 0.81} Q ${rad * 0.18} ${rad * 0.82} ${rad * 0.31} ${rad * 0.95} Q ${rad * 0.05} ${rad * 0.86} 0 ${rad}`} />
        ))}
      </g>
      <line x1="120" y1="0" x2="120" y2="70" stroke="rgba(230,230,240,0.5)" strokeWidth="1" />
      <text x="110" y="86" fontSize="20">🕷️</text>
    </svg>
  );
}

/** Гирлянда сверху на Новый год. */
function Garland() {
  const bulbs = Array.from({ length: 28 });
  const colors = ['#f87171', '#facc15', '#4ade80', '#60a5fa', '#e879f9'];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 flex justify-between px-4" style={{ zIndex: 45 }}>
      <svg className="absolute inset-x-0 top-0 h-6 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
        <path d="M0 2 Q 3.5 8 7 2 T 14 2 T 21 2 T 28 2 T 35 2 T 42 2 T 49 2 T 56 2 T 63 2 T 70 2 T 77 2 T 84 2 T 91 2 T 98 2 T 105 2" stroke="rgba(30,60,30,0.7)" strokeWidth="0.4" fill="none" />
      </svg>
      {bulbs.map((_, i) => (
        <span
          key={i}
          className="relative mt-3 block h-3 w-2 rounded-full"
          style={{ background: colors[i % colors.length], boxShadow: `0 0 10px ${colors[i % colors.length]}`, animation: `garland-blink 1.6s ${(i % 5) * 0.3}s infinite alternate` }}
        />
      ))}
    </div>
  );
}

export function activeSeason(theme: ThemeSettings): Season | null {
  if (theme.seasonal === 'off') return null;
  return theme.seasonal === 'auto' ? seasonByDate() : theme.seasonal;
}

export default function SeasonalEffects() {
  const [theme, setTheme] = useState<ThemeSettings>(loadLocalTheme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const season = activeSeason(theme);

  useEffect(() => onThemeChange(setTheme), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !season) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    const kind: Season = season;
    const particles = Array.from({ length: COUNT[kind] }, () => spawn(kind, w, h, true));
    let frame = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(48, t - last) / 16.7;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.phase += 0.02 * dt;
        if (kind === 'summer') {
          p.x += Math.sin(p.phase) * 0.4 * dt;
          p.y += Math.cos(p.phase * 0.7) * 0.3 * dt;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        } else if (kind === 'halloween') {
          p.x += (1.2 + p.hue) * dt;
          p.y += Math.sin(p.phase * 2) * 0.8 * dt;
          if (p.x > w + 30) Object.assign(p, spawn(kind, w, h, false), { x: -30, y: Math.random() * h * 0.6 });
        } else {
          p.x += (p.vx + Math.sin(p.phase) * 0.5) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > h + 20) Object.assign(p, spawn(kind, w, h, false));
        }
        if (p.x > w + 30) p.x = -30;
        if (p.x < -30) p.x = w + 30;
        if (kind === 'spring') drawPetal(ctx, p);
        else if (kind === 'autumn') drawLeaf(ctx, p);
        else if (kind === 'summer') drawFirefly(ctx, p, t);
        else if (kind === 'halloween') drawBat(ctx, p, t);
        else drawSnow(ctx, p);
      }
      // Без анимаций — один статичный кадр
      if (theme.animations && !document.hidden) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onVisibility = () => {
      if (!document.hidden && theme.animations) {
        last = performance.now();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [season, theme.animations]);

  if (!season) return null;
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0" style={{ zIndex: 44 }} data-no-invert />
      {season === 'halloween' ? (
        <>
          <Cobweb corner="tl" />
          <Cobweb corner="tr" />
          {/* Тыквы выглядывают из-за края и полупрозрачны — не закрывают меню и содержимое */}
          <div className="pointer-events-none fixed -bottom-2 -right-2 flex items-end gap-1 opacity-60 drop-shadow-[0_0_12px_rgba(251,146,60,0.7)]" style={{ zIndex: 45 }}>
            <span className="text-xl">🕯️</span>
            <span className="text-4xl">🎃</span>
          </div>
        </>
      ) : null}
      {season === 'newyear' ? <Garland /> : null}
    </>
  );
}
