import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { Link } from 'react-router-dom';

type SocialMetric = {
  id: number;
  platform: string;
  followers: number | null;
  subscribers: number | null;
  avg_viewers: number | null;
  active_chatters: number | null;
  top_chatter?: string | null;
  snapshot_at: string;
};

type SocialSummary = {
  twitch?: {
    followers: number | null;
    currentViewers: number | null;
    averageViewers: number | null;
    activeChatters: number | null;
    topChatter: string | null;
  };
  youtube?: {
    subscribers: number | null;
  };
};

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : value.toLocaleString('ru-RU');

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('ru-RU') : '-';

export default function Socials() {
  const [metrics, setMetrics] = useState<SocialMetric[]>([]);
  const [summary, setSummary] = useState<SocialSummary>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const response = await api.get('/api/socials/metrics');
      setMetrics((response.items || []) as SocialMetric[]);
      setSummary((response.summary || {}) as SocialSummary);
    } catch {
      setMetrics([]);
      setSummary({});
    }
  };

  useEffect(() => { load(); }, []);

  const pollNow = async () => {
    setLoading(true);
    try {
      await api.post('/api/socials/poll', {});
      await load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-semibold">Социальные сети</div>
          <p className="text-xs opacity-70">
            Синхронизация Telegram, Twitch и YouTube настраивается в разделе{' '}
            <Link to="/settings" className="underline">Настройки</Link>.
          </p>
        </div>
        <button
          onClick={pollNow}
          disabled={loading}
          className="px-4 py-2 rounded bg-white/10 border border-white/20 text-sm"
        >
          {loading ? 'Обновляем…' : 'Запустить опрос'}
        </button>
      </div>

      {(summary.twitch || summary.youtube) && (
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {summary.twitch && (
            <div className="card space-y-2">
              <div className="font-medium">Twitch</div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="opacity-70">Фолловеры</span>
                  <span>{formatNumber(summary.twitch.followers)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Текущий онлайн</span>
                  <span>{formatNumber(summary.twitch.currentViewers)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Средний онлайн</span>
                  <span>{formatNumber(summary.twitch.averageViewers)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Активных чаттеров</span>
                  <span>{formatNumber(summary.twitch.activeChatters)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Самый активный</span>
                  <span>{summary.twitch.topChatter || '-'}</span>
                </div>
              </dl>
            </div>
          )}
          {summary.youtube && (
            <div className="card space-y-2">
              <div className="font-medium">YouTube</div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="opacity-70">Подписчики</span>
                  <span>{formatNumber(summary.youtube.subscribers)}</span>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="font-medium mb-3">История замеров</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-70 text-left">
              <tr>
                <th className="py-2 pr-3">Платформа</th>
                <th className="py-2 pr-3">Подписчики / фолловеры</th>
                <th className="py-2 pr-3">Текущий онлайн</th>
                <th className="py-2 pr-3">Активных чаттеров</th>
                <th className="py-2 pr-3">Самый активный</th>
                <th className="py-2 pr-3">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 capitalize">{item.platform}</td>
                  <td className="py-2 pr-3">
                    {item.platform === 'youtube'
                      ? formatNumber(item.subscribers)
                      : formatNumber(item.followers)}
                  </td>
                  <td className="py-2 pr-3">{formatNumber(item.avg_viewers)}</td>
                  <td className="py-2 pr-3">{formatNumber(item.active_chatters)}</td>
                  <td className="py-2 pr-3">{item.top_chatter || '-'}</td>
                  <td className="py-2 pr-3">{formatDateTime(item.snapshot_at)}</td>
                </tr>
              ))}
              {metrics.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center opacity-70">
                    Пока нет данных. Подключите источники и выполните опрос.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
