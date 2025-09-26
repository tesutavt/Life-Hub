import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Shell from '../components/Shell';
import { api } from '../api';
import { useNavigate, useParams } from 'react-router-dom';

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

type BlockType =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'todo'
  | 'bulleted'
  | 'numbered'
  | 'quote'
  | 'code'
  | 'image'
  | 'divider';

type Block = {
  id: string;
  type: BlockType;
  text?: string;
  checked?: boolean;
  url?: string | null;
  relation?: string | null;
};

type MenuState = { blockId: string; x: number; y: number };

const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'Текст',
  heading1: 'Заголовок 1',
  heading2: 'Заголовок 2',
  heading3: 'Заголовок 3',
  todo: 'Чек-лист',
  bulleted: 'Маркированный список',
  numbered: 'Нумерованный список',
  quote: 'Цитата',
  code: 'Код',
  image: 'Изображение',
  divider: 'Разделитель'
};

const EDITABLE_TYPES: BlockType[] = ['text', 'heading1', 'heading2', 'heading3', 'bulleted', 'numbered', 'quote', 'code'];
const BASE_EDITABLE_CLASS = 'min-h-[24px] w-full whitespace-pre-wrap leading-relaxed focus:outline-none';
const LTR_STYLE: React.CSSProperties = { direction: 'ltr', unicodeBidi: 'plaintext', textAlign: 'left' };

const createBlock = (type: BlockType = 'text'): Block => {
  if (type === 'divider') return { id: uuid(), type };
  if (type === 'todo') return { id: uuid(), type, text: '', checked: false };
  if (type === 'image') return { id: uuid(), type, text: '', url: '' };
  return { id: uuid(), type, text: '' };
};

function normaliseBlocks(input: any): Block[] {
  if (!input) return [createBlock('text')];

  if (Array.isArray(input)) {
    return input.map((raw: any) => ({
      id: raw.id || uuid(),
      type: (raw.type as BlockType) || 'text',
      text: raw.text ?? '',
      checked: raw.checked ?? false,
      url: raw.url ?? null,
      relation: raw.relation ?? null
    }));
  }

  if (input.blocks) {
    return normaliseBlocks(input.blocks);
  }

  if (input.type === 'doc' && Array.isArray(input.content)) {
    const flattened: Block[] = [];
    for (const node of input.content) {
      if (node.type === 'heading' && node.attrs?.level) {
        const level = Math.min(Math.max(node.attrs.level, 1), 3) as 1 | 2 | 3;
        flattened.push({ id: uuid(), type: (heading as BlockType), text: (node.content || []).map((child: any) => child.text || '').join('') });
        continue;
      }
      if (node.type === 'bulletList') {
        flattened.push({
          id: uuid(),
          type: 'bulleted',
          text: (node.content || [])
            .map((item: any) => (item.content || []).map((child: any) => child.text || '').join(''))
            .join('\n')
        });
        continue;
      }
      if (node.type === 'orderedList') {
        flattened.push({
          id: uuid(),
          type: 'numbered',
          text: (node.content || [])
            .map((item: any) => (item.content || []).map((child: any) => child.text || '').join(''))
            .join('\n')
        });
        continue;
      }
      if (node.type === 'taskList') {
        for (const item of node.content || []) {
          flattened.push({
            id: uuid(),
            type: 'todo',
            text: (item.content || []).map((child: any) => child.text || '').join(''),
            checked: !!item.attrs?.checked
          });
        }
        continue;
      }
      if (node.type === 'image') {
        flattened.push({ id: uuid(), type: 'image', text: '', url: node.attrs?.src || '' });
        continue;
      }
      if (node.type === 'horizontalRule') {
        flattened.push({ id: uuid(), type: 'divider' });
        continue;
      }
      if (node.type === 'blockquote') {
        flattened.push({ id: uuid(), type: 'quote', text: (node.content || []).map((child: any) => child.text || '').join('') });
        continue;
      }
      if (node.type === 'codeBlock') {
        flattened.push({ id: uuid(), type: 'code', text: (node.content || []).map((child: any) => child.text || '').join('\n') });
        continue;
      }
      flattened.push({ id: uuid(), type: 'text', text: (node.content || []).map((child: any) => child.text || '').join('') });
    }
    return flattened.length ? flattened : [createBlock('text')];
  }

  return [createBlock('text')];
}

const formatTitle = (value: string) => (typeof value === 'string' && value.trim() ? value.trim() : 'Untitled page');

export default function PageEditor(){
  const { id } = useParams();
  const nav = useNavigate();

  const [title, setTitle] = useState('');
  const [pageDate, setPageDate] = useState('');
  const [pinned, setPinned] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([createBlock('text')]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const focusBlock = useCallback((blockId: string | null) => {
    if (!blockId) return;
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
      if (!element) return;
      element.focus();
      if (element instanceof HTMLDivElement) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  }, []);

  useEffect(() => {
    if (!focusId) return;
    focusBlock(focusId);
    setFocusId(null);
  }, [blocks, focusBlock, focusId]);

  useEffect(() => {
    if (!menu) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && menuRef.current.contains(target)) return;
      setMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const node = menuRef.current;
    if (!node) return;
    const padding = 12;
    const rect = node.getBoundingClientRect();
    let nextX = menu.x;
    let nextY = menu.y;
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;
    if (nextX > maxX) nextX = Math.max(padding, maxX);
    if (nextY > maxY) nextY = Math.max(padding, maxY);
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    if (nextX !== menu.x || nextY !== menu.y) {
      setMenu(prev => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [menu]);

  const updateBlock = useCallback((blockId: string, patch: Partial<Block> | ((prev: Block) => Block)) => {
    setBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      if (typeof patch === 'function') return (patch as (b: Block) => Block)(block);
      return { ...block, ...patch };
    }));
  }, []);

  const insertBlockAfter = useCallback((blockId: string, type: BlockType = 'text') => {
    const newBlock = createBlock(type);
    setBlocks(prev => {
      const index = prev.findIndex(block => block.id === blockId);
      const next = [...prev];
      const insertIndex = index === -1 ? next.length : index + 1;
      next.splice(insertIndex, 0, newBlock);
      return next;
    });
    setFocusId(newBlock.id);
  }, []);

  const insertBlockAtEnd = useCallback((type: BlockType = 'text') => {
    const newBlock = createBlock(type);
    setBlocks(prev => [...prev, newBlock]);
    setFocusId(newBlock.id);
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      if (prev.length === 1) return [createBlock('text')];
      const index = prev.findIndex(block => block.id === blockId);
      const next = prev.filter(block => block.id !== blockId);
      const fallback = next[index - 1] || next[index] || next[0];
      if (fallback) setFocusId(fallback.id);
      return next;
    });
  }, []);

  const duplicateBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      const index = prev.findIndex(block => block.id === blockId);
      if (index === -1) return prev;
      const copy: Block = { ...prev[index], id: uuid() };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const convertBlockType = useCallback((blockId: string, type: BlockType) => {
    updateBlock(blockId, current => {
      const base: Block = { id: current.id, type, relation: current.relation ?? null };
      if (type === 'divider') return base;
      if (type === 'todo') return { ...base, text: current.text || '', checked: current.checked ?? false };
      if (type === 'image') return { ...base, text: current.text || '', url: current.url || '' };
      if (type === 'code') return { ...base, text: current.text || '' };
      return { ...base, text: current.text || '', url: null, checked: undefined };
    });
  }, [updateBlock]);

  const setRelation = useCallback((blockId: string) => {
    const value = window.prompt('Ссылка или идентификатор связи');
    if (value === null) return;
    const trimmed = value.trim();
    updateBlock(blockId, { relation: trimmed || null });
  }, [updateBlock]);

  const setImageUrl = useCallback((blockId: string) => {
    const value = window.prompt('Ссылка на изображение');
    if (value === null) return;
    updateBlock(blockId, { url: value.trim() });
  }, [updateBlock]);

  const openMenu = useCallback((blockId: string, x: number, y: number) => {
    setMenu({ blockId, x, y });
  }, []);

  const loadPage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/life/pages/${id}`);
      setTitle(response.page?.title || '');
      setPageDate(response.page?.page_date || '');
      setPinned(!!response.page?.pinned);
      const incoming = response.page?.blocks ?? response.page?.content ?? [];
      const normalised = normaliseBlocks(incoming);
      setBlocks(normalised.length ? normalised : [createBlock('text')]);
    } catch (err: any) {
      setError(err.message || 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const togglePinned = useCallback(async () => {
    if (!id) return;
    const next = !pinned;
    setPinned(next);
    setError(null);
    try {
      await api.put(`/api/life/pages/${id}`, { pinned: next });
    } catch (err: any) {
      setPinned(!next);
      setError(err?.message || 'Failed to update pinned state');
    }
  }, [id, pinned]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/life/pages/${id}`, {
        title: formatTitle(title),
        page_date: pageDate || null,
        pinned,
        blocks: blocks.map(block => ({
          id: block.id,
          type: block.type,
          text: block.text ?? '',
          checked: block.checked ?? false,
          url: block.url ?? null,
          relation: block.relation ?? null
        }))
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Delete this page?')) return;
    await api.del(`/api/life/pages/${id}`);
    nav('/pages');
  };

  const handleBlockInput = (blockId: string, value: string) => {
    updateBlock(blockId, { text: value });
    setFocusId(blockId);
  };

  const handleKeyDown = (event: React.KeyboardEvent, block: Block) => {
    if (event.key === 'Enter' && !event.shiftKey && EDITABLE_TYPES.includes(block.type)) {
      event.preventDefault();
      insertBlockAfter(block.id, block.type === 'bulleted' || block.type === 'numbered' ? block.type : 'text');
      return;
    }
    if (event.key === 'Backspace') {
      const target = event.currentTarget as HTMLElement;
      if ((target.textContent || '').trim().length === 0) {
        event.preventDefault();
        removeBlock(block.id);
      }
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="text-sm opacity-70">Loading page…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          className="flex-1 text-3xl font-semibold bg-transparent outline-none border-b border-transparent focus:border-white/20"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Untitled page"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={togglePinned}
            className={`px-3 py-2 rounded border border-white/20 ${pinned ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
          >
            {pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-2 rounded bg-white text-black">
            {saving ? 'Saving:' : 'Save'}
          </button>
          <button onClick={handleDelete} className="px-3 py-2 rounded bg-red-500/40 hover:bg-red-500/60">Удалить</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="opacity-70">Page date</span>
          <input
            type="date"
            value={pageDate}
            onChange={event => setPageDate(event.target.value)}
            className="px-3 py-1 rounded bg-white/10 text-white"
          />
        </label>
        {pageDate && (
          <button
            type="button"
            onClick={() => setPageDate('')}
            className="px-2 py-1 text-xs rounded bg-white/10 text-white/80 hover:bg-white/20"
          >
            Clear date
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-300 mb-3">{error}</div>}

      <div className="card p-4 space-y-4">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className="group relative flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-white/5"
            onContextMenu={event => {
              event.preventDefault();
              openMenu(block.id, event.clientX, event.clientY);
            }}
          >
            <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-white/40">{BLOCK_LABELS[block.type]}</div>

            {block.type === 'divider' ? (
              <div className="flex-1 pt-3" style={LTR_STYLE}>
                <div className="h-px bg-white/20" />
              </div>
            ) : block.type === 'image' ? (
              <div className="flex-1 space-y-2" style={LTR_STYLE}>
                {block.url ? (
                  <img src={block.url} alt="page block" className="max-h-96 rounded-xl border border-white/10 object-contain" />
                ) : (
                  <button type="button" className="px-3 py-2 text-sm rounded bg-white/10" onClick={() => setImageUrl(block.id)}>
                    Set image URL
                  </button>
                )}
                <input
                  value={block.text || ''}
                  onChange={event => handleBlockInput(block.id, event.target.value)}
                  placeholder="Caption (optional)"
                  className="w-full px-3 py-2 rounded bg-white/10 text-sm"
                />
              </div>
            ) : block.type === 'todo' ? (
              <label className="flex-1 flex items-start gap-3" style={LTR_STYLE}>
                <input
                  type="checkbox"
                  checked={!!block.checked}
                  onChange={event => updateBlock(block.id, { checked: event.target.checked })}
                  className="mt-1"
                />
                <div
                  className={BASE_EDITABLE_CLASS}
                  contentEditable
                  suppressContentEditableWarning
                  data-block-id={block.id}
                  onInput={event => handleBlockInput(block.id, (event.target as HTMLElement).textContent || '')}
                  onKeyDown={event => handleKeyDown(event, block)}
                  style={LTR_STYLE}
                >
                  {block.text}
                </div>
              </label>
            ) : block.type === 'bulleted' ? (
              <div className="flex-1 flex items-start gap-3" style={LTR_STYLE}>
                <span className="mt-1 text-white/70">•</span>
                <div
                  className={BASE_EDITABLE_CLASS}
                  contentEditable
                  suppressContentEditableWarning
                  data-block-id={block.id}
                  onInput={event => handleBlockInput(block.id, (event.target as HTMLElement).textContent || '')}
                  onKeyDown={event => handleKeyDown(event, block)}
                  style={LTR_STYLE}
                >
                  {block.text}
                </div>
              </div>
            ) : block.type === 'numbered' ? (
              <div className="flex-1 flex items-start gap-3" style={LTR_STYLE}>
                <span className="mt-1 text-white/70">{index + 1}.</span>
                <div
                  className={BASE_EDITABLE_CLASS}
                  contentEditable
                  suppressContentEditableWarning
                  data-block-id={block.id}
                  onInput={event => handleBlockInput(block.id, (event.target as HTMLElement).textContent || '')}
                  onKeyDown={event => handleKeyDown(event, block)}
                  style={LTR_STYLE}
                >
                  {block.text}
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <div
                  className={[
                    BASE_EDITABLE_CLASS,
                    block.type === 'heading1' ? 'text-4xl font-semibold' : '',
                    block.type === 'heading2' ? 'text-3xl font-semibold' : '',
                    block.type === 'heading3' ? 'text-2xl font-semibold' : '',
                    block.type === 'quote' ? 'border-l-4 border-white/30 pl-4 italic text-white/70' : '',
                    block.type === 'code' ? 'font-mono bg-black/40 border border-white/10 rounded-lg px-3 py-2' : ''
                  ].filter(Boolean).join(' ')}
                  contentEditable
                  suppressContentEditableWarning
                  data-block-id={block.id}
                  onInput={event => handleBlockInput(block.id, (event.target as HTMLElement).textContent || '')}
                  onKeyDown={event => handleKeyDown(event, block)}
                  style={LTR_STYLE}
                >
                  {block.text}
                </div>
              </div>
            )}

            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-white/10"
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMenu(block.id, rect.left, rect.bottom + 4);
                }}
              >Тип</button>
              <button type="button" className="px-2 py-1 text-xs rounded bg-white/10" onClick={() => insertBlockAfter(block.id)}>
                +
              </button>
              <button type="button" className="px-2 py-1 text-xs rounded bg-white/10" onClick={() => duplicateBlock(block.id)}>Копировать</button>
              <button type="button" className="px-2 py-1 text-xs rounded bg-red-500/40" onClick={() => removeBlock(block.id)}>Удалить</button>
            </div>

            {block.relation && (
              <div className="absolute -bottom-2 right-3 rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wide text-white/60">
                Связь: {block.relation}
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => insertBlockAtEnd('text')}
          className="w-full px-3 py-2 rounded-xl border border-dashed border-white/20 text-sm text-white/70 hover:border-white/40"
        >
          Добавить блок
        </button>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-64 rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl p-2"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="text-xs uppercase tracking-wide text-white/40 px-2 mb-1">Тип блока</div>
          <div className="space-y-1">
            {Object.entries(BLOCK_LABELS).map(([value, label]) => (
              <button
                key={value}
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-sm"
                onClick={() => {
                  convertBlockType(menu.blockId, value as BlockType);
                  if (value === 'image') setTimeout(() => setImageUrl(menu.blockId), 0);
                  setMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="border-t border-white/10 my-2" />
          <button
            className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-sm"
            onClick={() => {
              setRelation(menu.blockId);
              setMenu(null);
            }}
          >
            Указать связь...
          </button>
          <button
            className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-sm"
            onClick={() => {
              duplicateBlock(menu.blockId);
              setMenu(null);
            }}
          >
            Дублировать
          </button>
          <button
            className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-sm"
            onClick={() => {
              insertBlockAfter(menu.blockId);
              setMenu(null);
            }}
          >
            Вставить ниже
          </button>
          <button
            className="w-full text-left px-2 py-1 rounded hover:bg-red-500/20 text-sm text-red-200"
            onClick={() => {
              removeBlock(menu.blockId);
              setMenu(null);
            }}
          >
            Удалить блок
          </button>
        </div>
      )}
    </Shell>
  );
}









