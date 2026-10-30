import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import CalendarMaster from '../components/master/CalendarMaster';
import StudyPlanner from '../components/StudyPlanner';
import { palette } from '../theme';

const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const emojiByMood = ['😢', '😕', '😐', '🙂', '😄'];

type CalendarTag = { id: number; label: string; color: string };

type CalendarEvent = {
  id: string | number;
  user_id?: number;
  date: string;
  title: string;
  type: string;
  mood?: number | null;
  page_id?: number;
  url?: string | null;
  tags?: CalendarTag[];
  pageBannerUrl?: string | null;
  pageBannerGradient?: string | null;
};

const typeIcon = (type: string) => {
  switch (type) {
    case 'loan_due':
      return '💳';
    case 'stream_live':
      return '🔴';
    case 'video_released':
      return '🎬';
    case 'work':
      return '💼';
    case 'off':
      return '🌴';
    case 'page':
      return '📄';
    case 'study':
      return '📚';
    case 'mood':
      return '';
    default:
      return '•';
  }
};

const pad = (n: number) => n.toString().padStart(2, '0');
const toISODate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function monthMatrix(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const firstDay = new Date(y, m, 1);
  const start = new Date(firstDay);
  const offset = (firstDay.getDay() + 6) % 7; // convert Sunday=0 to Monday=0
  start.setDate(firstDay.getDate() - offset);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function CalendarPage() {
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('plan') === '1') {
      setPlannerOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);
  const [current, setCurrent] = useState(new Date());
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const navigate = useNavigate();
  const [tagOptions, setTagOptions] = useState<CalendarTag[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearingShifts, setClearingShifts] = useState(false);

  const weeks = useMemo(() => monthMatrix(current), [current]);

  const load = async () => {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const response = await api.get(`/api/life/calendar?y=${year}&m=${month}`);
    const normalized = (response.items || []).map((item: any) => ({
      ...item,
      tags: Array.isArray(item?.tags)
        ? item.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
        : [],
      pageBannerUrl: item.page_banner_url ?? item.pageBannerUrl ?? item.banner_url ?? item.bannerUrl ?? null,
      pageBannerGradient:
        item.page_banner_gradient ?? item.pageBannerGradient ?? item.banner_gradient ?? item.bannerGradient ?? null,
    }));
    setItems(normalized);
  };

  const loadTagOptions = async () => {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }));
    setTagOptions(options);
  };

  useEffect(() => {
    load();
    loadTagOptions();
  }, [current]);

  const eventsByDate = (date: string) => items.filter((item) => item.date === date);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === 'page' && event.page_id) {
      navigate(`/pages/${event.page_id}`);
      return;
    }
    if (event.url) {
      if (/^https?:\/\//i.test(event.url)) {
        window.open(event.url, '_blank', 'noopener,noreferrer');
      } else {
        navigate(event.url);
      }
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (deletingId !== null) return;
    const confirmed = window.confirm('Удалить это событие?');
    if (!confirmed) return;
    try {
      setDeletingId(eventId);
      await api.del(`/api/life/calendar/${eventId}`);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearShifts = async () => {
    if (clearingShifts) return;
    const confirmed = window.confirm('Удалить все рабочие смены и выходные?');
    if (!confirmed) return;
    try {
      setClearingShifts(true);
      await api.post(
        '/api/life/calendar/clear-shifts',
        { types: ['work', 'off'] },
        { notifySuccess: 'Смены удалены' }
      );
      await load();
    } finally {
      setClearingShifts(false);
    }
  };

  const goPrevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const goNextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));

  const dayBackgroundStyle = (event: CalendarEvent | undefined): React.CSSProperties | undefined => {
    if (!event) return undefined;
    const layers: string[] = [];
    if (event.pageBannerGradient) {
      layers.push(event.pageBannerGradient);
    }
    if (event.pageBannerUrl) {
      const url = event.pageBannerUrl.startsWith('http') || event.pageBannerUrl.startsWith('data:')
        ? event.pageBannerUrl
        : resolveApiUrl(event.pageBannerUrl);
      layers.push(`url(${url})`);
    }
    if (!layers.length) return undefined;
    const size = layers.map(() => 'cover').join(',');
    const position = layers.map(() => 'center').join(',');
    const repeat = layers.map(() => 'no-repeat').join(',');
    return {
      backgroundImage: layers.join(','),
      backgroundSize: size,
      backgroundPosition: position,
      backgroundRepeat: repeat,
    };
  };

  return (
    <Shell>
      <StudyPlanner open={plannerOpen} onClose={() => setPlannerOpen(false)} onApplied={load} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="text-2xl font-semibold">Календарь</div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarMaster tagOptions={tagOptions} currentMonth={current} onCompleted={load} onOpenPlanner={() => setPlannerOpen(true)} />
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
            <button onClick={goPrevMonth} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition">‹</button>
            <div className="min-w-[140px] text-center text-sm font-medium uppercase tracking-wide">
              {current.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={goNextMonth} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition">›</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayNames.map((name) => (
          <div key={name} className="text-xs opacity-70 text-center uppercase tracking-wide">{name}</div>
        ))}
        {weeks.flat().map((date, index) => {
          const iso = toISODate(date);
          const inCurrentMonth = date.getMonth() === current.getMonth();
          const dayEvents = eventsByDate(iso);
          const mood = dayEvents.find((event) => event.mood)?.mood;
          const bannerSource = dayEvents.find(
            (event) => event.type === 'page' && (event.pageBannerGradient || event.pageBannerUrl)
          );
          const backgroundStyle = dayBackgroundStyle(bannerSource);
          return (
            <div
              key={`${iso}-${index}`}
              className={`relative overflow-hidden rounded-2xl border p-2 min-h-[120px] flex flex-col gap-1 ${
                inCurrentMonth ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/2'
              }`}
              style={backgroundStyle}
            >
              {backgroundStyle ? <div className="pointer-events-none absolute inset-0 bg-black/45" /> : null}
              <div className="relative z-10 flex items-center justify-between text-xs opacity-70">
                <span>{date.getDate()}</span>
                {mood ? <span>{emojiByMood[Math.max(1, Math.min(5, mood)) - 1]}</span> : null}
              </div>
              <div className="relative z-10 space-y-1 text-[11px] leading-tight">
                {dayEvents.slice(0, 4).map((event: CalendarEvent) => {
                  const key = event.id || `${event.title}-${event.date}`;
                  const highlight = event.type === 'work' ? 'text-amber-300' : event.type === 'off' ? 'text-brand-mint' : event.type === 'study' ? 'text-sky-300' : 'text-white/80';
                  const isPage = event.type === 'page' && !!event.page_id;
                  const hasLink = isPage || !!event.url;
                  const baseClass = ['truncate', highlight, hasLink ? 'cursor-pointer hover:underline' : '']
                    .filter(Boolean)
                    .join(' ');
                  const label = `${typeIcon(event.type)} ${event.title}`;
                  const tagDots = Array.isArray(event.tags) ? event.tags.slice(0, 4) : [];
                  const numericId = typeof event.id === 'number' ? event.id : Number.isFinite(Number(event.id)) ? Number(event.id) : null;
                  const isDeletable = numericId !== null && !Number.isNaN(numericId);
                  const isDeleting = isDeletable && deletingId === numericId;
                  if (hasLink) {
                    return (
                      <div key={key} className="space-y-0.5">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEventClick(event)}
                            className={`${baseClass} text-left w-full min-w-0`}
                          >
                            {label}
                          </button>
                          {isDeletable ? (
                            <button
                              type="button"
                              onClick={() => numericId !== null && handleDeleteEvent(numericId)}
                              className={`text-xs text-white/40 hover:text-brand-mint transition ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                              aria-label="Удалить событие"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                        {tagDots.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tagDots.map((tag) => (
                              <span
                                key={`tag-${tag.id}`}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: tag.color || palette.mint }}
                                title={tag.label}
                                aria-label={tag.label}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex items-start gap-1.5">
                        <div className={`${baseClass} min-w-0`}>{label}</div>
                        {isDeletable ? (
                          <button
                            type="button"
                            onClick={() => numericId !== null && handleDeleteEvent(numericId)}
                            className={`text-xs text-white/40 hover:text-brand-mint transition ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                            aria-label="Удалить событие"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      {tagDots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tagDots.map((tag) => (
                            <span
                              key={`tag-${tag.id}`}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tag.color || palette.mint }}
                              title={tag.label}
                              aria-label={tag.label}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleClearShifts}
          className={`rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 ${
            clearingShifts ? 'pointer-events-none opacity-50' : ''
          }`}
          type="button"
        >
          {clearingShifts ? 'Удаление…' : 'Удалить все смены'}
        </button>
      </div>
    </Shell>
  );
}
