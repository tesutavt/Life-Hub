import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import { api } from '../api';
import TagSelector from '../components/tags/TagSelector';

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
  const [current, setCurrent] = useState(new Date());
  const [items, setItems] = useState<CalendarEvent[]>([]);
  const navigate = useNavigate();
  const [form, setForm] = useState({ date: '', title: '', type: 'note', mood: 3 });
  const [formTagIds, setFormTagIds] = useState<number[]>([]);
  const [tagOptions, setTagOptions] = useState<CalendarTag[]>([]);
  const [pattern, setPattern] = useState('2/2');
  const [autoStart, setAutoStart] = useState('');

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

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.post('/api/life/calendar', { ...form, tags: formTagIds });
    await api.post('/api/life/xp/add', { amount: 20, note: 'calendar add' });
    setForm({ date: '', title: '', type: 'note', mood: 3 });
    setFormTagIds([]);
    await load();
  };

  const generateShifts = async () => {
    const startDate = autoStart || toISODate(new Date(current.getFullYear(), current.getMonth(), 1));
    await api.post('/api/life/calendar/auto-shifts', { startDate, pattern, days: 120 });
    await load();
  };

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

  const goPrevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const goNextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold">Календарь</div>
        <div className="flex items-center gap-2">
          <button onClick={goPrevMonth} className="px-3 py-1 rounded bg-white/10">‹</button>
          <div>{current.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</div>
          <button onClick={goNextMonth} className="px-3 py-1 rounded bg-white/10">›</button>
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
          return (
            <div
              key={`${iso}-${index}`}
              className={`p-2 rounded-xl min-h-[120px] border ${inCurrentMonth ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/2'} flex flex-col gap-1`}
            >
              <div className="text-xs opacity-70 flex justify-between items-center">
                <span>{date.getDate()}</span>
                {mood ? <span>{emojiByMood[Math.max(1, Math.min(5, mood)) - 1]}</span> : null}
              </div>
              <div className="space-y-1 text-[11px] leading-tight">
                {dayEvents.slice(0, 4).map((event: CalendarEvent) => {
                  const key = event.id || `${event.title}-${event.date}`;
                  const highlight = event.type === 'work' ? 'text-amber-300' : event.type === 'off' ? 'text-emerald-300' : 'text-white/80';
                  const isPage = event.type === 'page' && !!event.page_id;
                  const hasLink = isPage || !!event.url;
                  const baseClass = ['truncate', highlight, hasLink ? 'cursor-pointer hover:underline' : '']
                    .filter(Boolean)
                    .join(' ');
                  const label = `${typeIcon(event.type)} ${event.title}`;
                  const tagDots = Array.isArray(event.tags) ? event.tags.slice(0, 4) : [];
                  if (hasLink) {
                    return (
                      <div key={key} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => handleEventClick(event)}
                          className={`${baseClass} text-left w-full`}
                        >
                          {label}
                        </button>
                        {tagDots.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tagDots.map((tag) => (
                              <span
                                key={`tag-${tag.id}`}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: tag.color || '#ffffff' }}
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
                      <div className={baseClass}>{label}</div>
                      {tagDots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tagDots.map((tag) => (
                            <span
                              key={`tag-${tag.id}`}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tag.color || '#ffffff' }}
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

      <div className="card mt-6 grid md:grid-cols-2 gap-4">
        <form onSubmit={add} className="space-y-2">
          <div className="font-medium">Создать событие / смену</div>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 rounded bg-white/10" />
          <input placeholder="Название" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded bg-white/10" />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded bg-white/10">
            <option value="note">Заметка</option>
            <option value="work">Рабочая смена</option>
            <option value="off">Выходной</option>
          </select>
          <label className="text-xs opacity-70">Настроение (1-5)</label>
          <input type="number" min={1} max={5} value={form.mood} onChange={e => setForm({ ...form, mood: +e.target.value })} className="w-full px-3 py-2 rounded bg-white/10" />
          <TagSelector
            tags={tagOptions}
            selectedIds={formTagIds}
            onChange={setFormTagIds}
            label="Теги события"
            emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
            onManageTags={() => window.open('/pages', '_blank')}
          />
          <button className="px-4 py-2 rounded bg-white text-black">Сохранить</button>
        </form>

        <div className="space-y-2">
          <div className="font-medium">Автогенерация смен</div>
          <div className="flex gap-2">
            <input placeholder="Паттерн (например 2/2)" value={pattern} onChange={e => setPattern(e.target.value)} className="px-3 py-2 rounded bg-white/10 flex-1" />
            <button onClick={generateShifts} className="px-4 py-2 rounded bg-white text-black">Сгенерировать</button>
          </div>
          <div className="flex items-center gap-2 text-xs opacity-70">
            <span>Старт с даты</span>
            <input type="date" value={autoStart} onChange={e => setAutoStart(e.target.value)} className="px-3 py-2 rounded bg-white/10" />
            <span>(необязательно)</span>
          </div>
          <p className="text-xs opacity-70">Смена будет чередоваться по заданному паттерну начиная с указанной даты.</p>
        </div>
      </div>
    </Shell>
  );
}
