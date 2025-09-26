import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';

type FeedItem = {
  id: number;
  type?: string | null;
  text?: string | null;
  ts?: string | null;
  created_at?: string | null;
  meta?: unknown;
};

export default function Journal(){
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/life/feed');
      const items = (response.items || []).map((raw: any) => ({
        id: raw.id,
        type: raw.type || raw.kind || null,
        text: raw.text || raw.title || '',
        ts: raw.ts || raw.created_at || null,
        meta: raw.meta || raw.extra || null
      }));
      setFeed(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
      setFeed([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold">Activity feed</div>
        <button onClick={load} disabled={loading} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-sm">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="card">
        {error && <div className="text-sm text-red-300 mb-3">{error}</div>}
        {feed.length === 0 && !loading ? (
          <div className="opacity-70 text-sm">No entries yet.</div>
        ) : (
          <div className="space-y-3">
            {feed.map(item => (
              <div key={item.id} className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>{item.type || 'note'}</span>
                  <span>{item.ts ? new Date(item.ts).toLocaleString() : '—'}</span>
                </div>
                {item.text && <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed text-left" style={{ direction: 'ltr' }}>{item.text}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
