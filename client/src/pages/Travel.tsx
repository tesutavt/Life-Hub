import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import TagBadge from '../components/tags/TagBadge';
import TagSelector from '../components/tags/TagSelector';
import TravelMaster from '../components/master/TravelMaster';

type TagOption = { id: number; label: string; color: string };

type Travel = {
  id:number;
  title:string;
  location?:string;
  date_from?:string;
  date_to?:string;
  status?:string;
  tags: TagOption[];
};

export default function Travel(){
  const [items, setItems] = useState<Travel[]>([]);
  const [editing, setEditing] = useState<Travel|null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [editingTagIds, setEditingTagIds] = useState<number[]>([]);

  const mapTravel = (row: any): Travel => ({
    id: row.id,
    title: row.title,
    location: row.location,
    date_from: row.date_from,
    date_to: row.date_to,
    status: row.status,
    tags: Array.isArray(row?.tags)
      ? row.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color }))
      : [],
  });

  const load = async()=>{
    const r = await api.get('/api/life/travel');
    const list = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
    setItems(list.map(mapTravel));
  };

  const loadTagOptions = async () => {
    const res = await api.get('/api/life/pages/tags', { silentError: true });
    const options = (res.items || []).map((tag: any) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
    }));
    setTagOptions(options);
  };

  useEffect(()=>{ load(); loadTagOptions(); },[]);

  const save = async()=>{
    if(!editing) return;
    await api.put('/api/life/travel/'+editing.id, { ...editing, tags: editingTagIds });
    setEditing(null);
    setEditingTagIds([]);
    await load();
  };

  const del = async(id:number)=>{ if(!confirm('Удалить поездку?')) return; await api.del('/api/life/travel/'+id); await load(); };

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="text-2xl font-semibold">Путешествия</div>
        <TravelMaster tagOptions={tagOptions} onCreated={load} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(items||[]).map(t => (
          <div key={t.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{t.title}</div>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs">{t.status||'planned'}</span>
            </div>
            <div className="text-sm opacity-80">{t.location}</div>
            <div className="text-xs opacity-70">{t.date_from} — {t.date_to}</div>
            {t.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 text-xs">
                {t.tags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} compact />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={()=>{
                  setEditing(t);
                  setEditingTagIds(t.tags.map(tag => tag.id));
                }}
                className="ml-auto px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              >✎</button>
              <button onClick={()=>del(t.id)} className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40">Удалить</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-xl w-96 border border-white/20 space-y-3">
            <div className="text-lg font-medium">Редактировать</div>
            <input className="px-3 py-2 rounded bg-white/10 w-full" value={editing.title} onChange={e=>setEditing({...editing, title:e.target.value})}/>
            <input className="px-3 py-2 rounded bg-white/10 w-full" value={editing.location||''} onChange={e=>setEditing({...editing, location:e.target.value})}/>
            <input type="date" className="px-3 py-2 rounded bg-white/10 w-full" value={editing.date_from||''} onChange={e=>setEditing({...editing, date_from:e.target.value})}/>
            <input type="date" className="px-3 py-2 rounded bg-white/10 w-full" value={editing.date_to||''} onChange={e=>setEditing({...editing, date_to:e.target.value})}/>
            <select className="px-3 py-2 rounded bg-white/10 w-full" value={editing.status||'planned'} onChange={e=>setEditing({...editing, status:e.target.value})}>
              <option value="planned">Планируется</option>
              <option value="done">Совершено</option>
              <option value="cancelled">Отменено</option>
            </select>
            <TagSelector
              tags={tagOptions}
              selectedIds={editingTagIds}
              onChange={setEditingTagIds}
              label="Теги путешествия"
              emptyState="Нет доступных тэгов. Создайте их на странице Страницы."
              onManageTags={() => window.open('/pages', '_blank')}
            />
            <div className="flex justify-between">
              <button onClick={()=>{ setEditing(null); setEditingTagIds([]); }} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20">Отмена</button>
              <button onClick={save} className="px-3 py-2 rounded bg-green-600 hover:bg-green-700">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
