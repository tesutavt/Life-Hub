import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Edit3, Loader2, Pin, PinOff, Save, Trash2, X } from 'lucide-react';
import PdfReader from '../components/pdf/PdfReader';
import { gradients, palette } from '../theme';


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
  | 'pdf'
  | 'divider';

type Block = {
  id: string;
  type: BlockType;
  text?: string;
  checked?: boolean;
  url?: string | null;
  relation?: string | null;
  meta?: any;
};

type PdfMarker = {
  id: string;
  title: string;
  page: number | null;
  done: boolean;
};

type PdfMeta = {
  markers: PdfMarker[];
  originalName?: string | null;
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
  pdf: 'PDF документ',
  divider: 'Разделитель'
};

const EDITABLE_TYPES: BlockType[] = ['text', 'heading1', 'heading2', 'heading3', 'bulleted', 'numbered', 'quote', 'code', 'todo'];
const RICH_TEXT_TYPES: BlockType[] = ['text', 'heading1', 'heading2', 'heading3', 'bulleted', 'numbered', 'quote', 'todo'];
const BASE_EDITABLE_CLASS = 'min-h-[24px] w-full whitespace-pre-wrap leading-relaxed focus:outline-none';
const LTR_STYLE: React.CSSProperties = { direction: 'ltr', unicodeBidi: 'plaintext', textAlign: 'left' };

const DEFAULT_BANNER_GRADIENT = gradients.hero;

const BANNER_GRADIENT_PRESETS = [
  { label: 'Глубина', value: 'linear-gradient(135deg, rgba(5, 24, 36, 0.92) 0%, rgba(22, 41, 54, 0.88) 100%)' },
  { label: 'Атмосфера', value: 'linear-gradient(135deg, rgba(22, 41, 54, 0.92) 0%, rgba(59, 82, 101, 0.85) 100%)' },
  { label: 'Мята', value: 'linear-gradient(135deg, rgba(39, 233, 181, 0.3) 0%, rgba(39, 233, 181, 0.05) 100%)' },
  { label: 'Сияние', value: 'linear-gradient(135deg, rgba(5, 24, 36, 0.92) 0%, rgba(39, 233, 181, 0.25) 100%)' }
];

const FORMAT_COLORS = [
  palette.mint,
  '#5ef0c9',
  '#93f5dc',
  palette.steel,
  '#1f3a4a',
  palette.midnight,
  '#0b1d29',
  palette.deep,
  '#162936'
];
const FONT_FAMILIES = [
  { label: 'Системный', value: 'inherit' },
  { label: 'Serif', value: 'Georgia, Times, serif' },
  { label: 'Sans-serif', value: 'Inter, Arial, sans-serif' },
  { label: 'Mono', value: '"Fira Code", "Courier New", monospace' }
];
const FONT_SIZES = [
  { label: 'Мелкий', value: 2 },
  { label: 'Обычный', value: 3 },
  { label: 'Крупный', value: 4 },
  { label: 'Очень крупный', value: 5 }
];
const EMOJI_OPTIONS = ['😀', '😁', '😂', '😊', '😍', '🤩', '🤔', '😎', '😭', '🙌', '🔥', '🚀', '🌟', '✅', '❤️'];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ensurePdfMeta = (meta: any): PdfMeta => {
  if (meta && typeof meta === 'object') {
    const markers = Array.isArray(meta.markers)
      ? meta.markers
          .map((marker: any) => ({
            id: marker.id || uuid(),
            title: typeof marker.title === 'string' ? marker.title : 'Страница',
            page:
              marker.page == null || Number.isNaN(Number(marker.page))
                ? null
                : Number.parseInt(marker.page, 10),
            done: !!marker.done
          }))
      : [];
    return { markers, originalName: typeof meta.originalName === 'string' ? meta.originalName : null };
  }
  return { markers: [], originalName: null };
};

const getBlockHtml = (block: Block) => {
  if (RICH_TEXT_TYPES.includes(block.type)) {
    const html = block.meta?.html;
    if (typeof html === 'string') return { __html: html };
  }
  const text = block.text ?? '';
  return { __html: escapeHtml(text) };
};

const createBlock = (type: BlockType = 'text'): Block => {
  if (type === 'divider') return { id: uuid(), type };
  if (type === 'todo') return { id: uuid(), type, text: '', checked: false, meta: { html: '' } };
  if (type === 'image') return { id: uuid(), type, text: '', url: '' };
  if (type === 'pdf') return { id: uuid(), type, text: '', url: '', meta: { markers: [] } };
  return { id: uuid(), type, text: '', meta: { html: '' } };
};

function normaliseBlocks(input: any): Block[] {
  if (!input) return [createBlock('text')];

  if (Array.isArray(input)) {
    return input.map((raw: any) => {
      const type = (raw.type as BlockType) || 'text';
      const block: Block = {
        id: raw.id || uuid(),
        type,
        text: raw.text ?? '',
        checked: raw.checked ?? false,
        url: raw.url ?? null,
        relation: raw.relation ?? null
      };
      if (type === 'pdf') {
        block.meta = ensurePdfMeta(raw.meta);
      } else if (raw.meta && typeof raw.meta === 'object') {
        block.meta = raw.meta;
      }
      return block;
    });
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
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerGradient, setBannerGradient] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([createBlock('text')]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [formatMenu, setFormatMenu] = useState<MenuState | null>(null);
  const [emojiMenu, setEmojiMenu] = useState<MenuState | null>(null);
  const [uploadingPdfBlockId, setUploadingPdfBlockId] = useState<string | null>(null);
  const [pdfErrors, setPdfErrors] = useState<Record<string, string | null>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBannerSettings, setShowBannerSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const selectionRef = useRef<Range | null>(null);
  const lastSelectionRef = useRef<Range | null>(null);

  const trimmedBannerUrl = bannerUrl.trim();
  const trimmedBannerGradient = bannerGradient.trim();
  const bannerPreviewStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    };
    if (trimmedBannerUrl) {
      style.backgroundImage = `url(${trimmedBannerUrl})`;
    } else {
      style.backgroundImage = trimmedBannerGradient || DEFAULT_BANNER_GRADIENT;
    }
    return style;
  }, [trimmedBannerGradient, trimmedBannerUrl]);

  const formattedPageDate = useMemo(() => {
    if (!pageDate) return '';
    const iso = pageDate.includes('T') ? pageDate : `${pageDate}T00:00:00`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return pageDate;
    return parsed.toLocaleDateString();
  }, [pageDate]);

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
      setFormatMenu(null);
      setEmojiMenu(null);
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

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      try {
        const range = selection.getRangeAt(0);
        lastSelectionRef.current = range.cloneRange();
      } catch {
        // ignore
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    if (!formatMenu) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (formatMenuRef.current && target && formatMenuRef.current.contains(target)) return;
      setFormatMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFormatMenu(null);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [formatMenu]);

  useEffect(() => {
    if (!emojiMenu) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (emojiMenuRef.current && target && emojiMenuRef.current.contains(target)) return;
      setEmojiMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEmojiMenu(null);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [emojiMenu]);

  useLayoutEffect(() => {
    if (!formatMenu) return;
    const node = formatMenuRef.current;
    if (!node) return;
    const padding = 12;
    const rect = node.getBoundingClientRect();
    let nextX = formatMenu.x;
    let nextY = formatMenu.y;
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;
    if (nextX > maxX) nextX = Math.max(padding, maxX);
    if (nextY > maxY) nextY = Math.max(padding, maxY);
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    if (nextX !== formatMenu.x || nextY !== formatMenu.y) {
      setFormatMenu(prev => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [formatMenu]);

  useLayoutEffect(() => {
    if (!emojiMenu) return;
    const node = emojiMenuRef.current;
    if (!node) return;
    const padding = 12;
    const rect = node.getBoundingClientRect();
    let nextX = emojiMenu.x;
    let nextY = emojiMenu.y;
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;
    if (nextX > maxX) nextX = Math.max(padding, maxX);
    if (nextY > maxY) nextY = Math.max(padding, maxY);
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    if (nextX !== emojiMenu.x || nextY !== emojiMenu.y) {
      setEmojiMenu(prev => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [emojiMenu]);

  const registerBlockRef = useCallback((blockId: string, element: HTMLElement | null) => {
    if (!element) {
      blockRefs.current.delete(blockId);
      return;
    }
    blockRefs.current.set(blockId, element);
  }, []);

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
      if (type === 'pdf') {
        const meta = ensurePdfMeta(current.meta);
        return { ...base, text: current.text || '', url: current.url || '', meta };
      }
      if (type === 'todo') {
        const html = typeof current.meta?.html === 'string' ? current.meta.html : current.text || '';
        return { ...base, text: current.text || '', checked: current.checked ?? false, meta: { html } };
      }
      if (type === 'image') return { ...base, text: current.text || '', url: current.url || '' };
      if (type === 'code') return { ...base, text: current.text || '' };
      const html = typeof current.meta?.html === 'string' ? current.meta.html : current.text || '';
      return { ...base, text: current.text || '', url: null, checked: undefined, meta: { html } };
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
    setFormatMenu(null);
    setEmojiMenu(null);
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
      setBannerUrl(response.page?.banner_url ?? response.page?.bannerUrl ?? '');
      setBannerGradient(response.page?.banner_gradient ?? response.page?.bannerGradient ?? '');
      setShowBannerSettings(false);
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
        banner_url: bannerUrl.trim() ? bannerUrl.trim() : null,
        banner_gradient: bannerGradient.trim() ? bannerGradient.trim() : null,
        blocks: blocks.map(block => ({
          id: block.id,
          type: block.type,
          text: block.text ?? '',
          checked: block.checked ?? false,
          url: block.url ?? null,
          relation: block.relation ?? null,
          meta: block.meta ?? null
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

  const handleBlockInput = (blockId: string, value: string, html?: string) => {
    updateBlock(blockId, current => {
      const next: Block = { ...current, text: value };
      if (html !== undefined && RICH_TEXT_TYPES.includes(current.type)) {
        const meta = typeof current.meta === 'object' && current.meta !== null ? { ...current.meta } : {};
        next.meta = { ...meta, html };
      }
      return next;
    });
    setFocusId(blockId);
  };

  const commitRichText = useCallback((blockId: string) => {
    const element = blockRefs.current.get(blockId);
    if (!element) return;
    const text = element.innerText;
    const html = element.innerHTML;
    updateBlock(blockId, current => {
      if (!RICH_TEXT_TYPES.includes(current.type)) {
        return { ...current, text };
      }
      const meta = typeof current.meta === 'object' && current.meta !== null ? { ...current.meta } : {};
      return { ...current, text, meta: { ...meta, html } };
    });
  }, [updateBlock]);

  const applyFormatting = useCallback(
    (command: string, value?: string) => {
      if (!formatMenu) return;
      const selection = window.getSelection();
      if (selectionRef.current) {
        selection?.removeAllRanges();
        selection?.addRange(selectionRef.current);
      }
      try {
        document.execCommand(command, false, value);
      } catch (err) {
        console.error(err);
      }
      commitRichText(formatMenu.blockId);
      selectionRef.current = null;
      setFormatMenu(null);
    },
    [commitRichText, formatMenu]
  );

  const insertEmoji = useCallback(
    (blockId: string, emoji: string) => {
      const element = blockRefs.current.get(blockId);
      if (!element) return;
      element.focus();
      const selection = window.getSelection();
      if (lastSelectionRef.current) {
        selection?.removeAllRanges();
        selection?.addRange(lastSelectionRef.current);
      } else {
        selection?.selectAllChildren(element);
        selection?.collapseToEnd();
      }
      try {
        document.execCommand('insertText', false, emoji);
      } catch (err) {
        console.error(err);
      }
      commitRichText(blockId);
      setEmojiMenu(null);
    },
    [commitRichText]
  );

  const updatePdfMeta = useCallback(
    (blockId: string, mutate: (meta: PdfMeta) => PdfMeta) => {
      updateBlock(blockId, current => {
        const meta = ensurePdfMeta(current.meta);
        const nextMeta = mutate(meta);
        return { ...current, meta: nextMeta };
      });
    },
    [updateBlock]
  );

  const addPdfMarker = useCallback(
    (blockId: string, marker: PdfMarker) => {
      updatePdfMeta(blockId, meta => ({ ...meta, markers: [...meta.markers, marker] }));
    },
    [updatePdfMeta]
  );

  const togglePdfMarker = useCallback(
    (blockId: string, markerId: string) => {
      updatePdfMeta(blockId, meta => ({
        ...meta,
        markers: meta.markers.map(marker =>
          marker.id === markerId ? { ...marker, done: !marker.done } : marker
        )
      }));
    },
    [updatePdfMeta]
  );

  const updatePdfMarker = useCallback(
    (blockId: string, markerId: string, updates: Partial<PdfMarker>) => {
      updatePdfMeta(blockId, meta => ({
        ...meta,
        markers: meta.markers.map(marker =>
          marker.id === markerId ? { ...marker, ...updates } : marker
        )
      }));
    },
    [updatePdfMeta]
  );
  const removePdfMarker = useCallback(
    (blockId: string, markerId: string) => {
      updatePdfMeta(blockId, meta => ({
        ...meta,
        markers: meta.markers.filter(marker => marker.id !== markerId)
      }));
    },
    [updatePdfMeta]
  );

  const handlePdfFileChange = useCallback(
    async (blockId: string, file: File | null) => {
      if (!file) return;
      setUploadingPdfBlockId(blockId);
      setPdfErrors(prev => ({ ...prev, [blockId]: null }));
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/life/uploads/pdf', formData, { silentSuccess: true });
        if (response?.url) {
          updateBlock(blockId, current => {
            const meta = ensurePdfMeta(current.meta);
            const fallbackTitle = file.name.replace(/\.pdf$/i, '');
            return {
              ...current,
              text: current.text && current.text.trim().length > 0 ? current.text : fallbackTitle,
              url: response.url,
              meta: { ...meta, originalName: file.name }
            };
          });
        }
      } catch (err: any) {
        setPdfErrors(prev => ({ ...prev, [blockId]: err?.message || 'Не удалось загрузить файл' }));
      } finally {
        setUploadingPdfBlockId(null);
      }
    },
    [updateBlock]
  );

  const setPdfUrl = useCallback(
    (blockId: string) => {
      const value = window.prompt('Ссылка на PDF документ');
      if (value === null) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      setPdfErrors(prev => ({ ...prev, [blockId]: null }));
      updateBlock(blockId, current => ({
        ...current,
        url: trimmed,
        meta: ensurePdfMeta(current.meta)
      }));
    },
    [updateBlock]
  );

  const handleBlockContextMenu = (event: React.MouseEvent, block: Block) => {
    if (RICH_TEXT_TYPES.includes(block.type)) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        try {
          const range = selection.getRangeAt(0);
          const container = blockRefs.current.get(block.id);
          if (container && container.contains(range.commonAncestorContainer)) {
            if (selection.toString().trim().length > 0) {
              event.preventDefault();
              selectionRef.current = range.cloneRange();
              setFormatMenu({ blockId: block.id, x: event.clientX, y: event.clientY });
              setMenu(null);
              setEmojiMenu(null);
              return;
            }
          }
        } catch {
          // ignore
        }
      }
    }
    event.preventDefault();
    selectionRef.current = null;
    setFormatMenu(null);
    setEmojiMenu(null);
    openMenu(block.id, event.clientX, event.clientY);
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

  const openEmojiMenuForBlock = (block: Block, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!RICH_TEXT_TYPES.includes(block.type)) {
      focusBlock(block.id);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        lastSelectionRef.current = selection.getRangeAt(0).cloneRange();
      } catch {
        lastSelectionRef.current = null;
      }
    }
    setEmojiMenu({ blockId: block.id, x: rect.left, y: rect.bottom + 6 });
    setMenu(null);
    setFormatMenu(null);
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
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
              pinned
                ? 'border-amber-400/60 bg-amber-300 text-black hover:bg-amber-200'
                : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'
            }`}
            title={pinned ? 'Открепить страницу' : 'Закрепить страницу'}
            aria-label={pinned ? 'Открепить страницу' : 'Закрепить страницу'}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            title="Сохранить страницу"
            aria-label="Сохранить страницу"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDelete}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-red-400/40 bg-red-500/40 text-red-100 transition hover:bg-red-500/60"
            title="Удалить страницу"
            aria-label="Удалить страницу"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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

      <div className="mb-6 space-y-4">
        <div className="relative h-48 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
          <div className="absolute inset-0" style={bannerPreviewStyle} />
          <div className="absolute inset-0 bg-black/40" />
          <button
            type="button"
            onClick={() => setShowBannerSettings(prev => !prev)}
            className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition hover:bg-black/60"
            title={showBannerSettings ? 'Скрыть настройки баннера' : 'Настроить баннер'}
            aria-label={showBannerSettings ? 'Скрыть настройки баннера' : 'Настроить баннер'}
          >
            {showBannerSettings ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
          </button>
          <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
            <div className="text-3xl font-semibold drop-shadow">{formatTitle(title)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
              {pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/90 px-3 py-0.5 text-black font-semibold uppercase tracking-wide text-[10px]">
                  <Pin className="h-3 w-3" /> Закреплено
                </span>
              )}
              {formattedPageDate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/40 px-3 py-0.5">
                  <CalendarDays className="h-3 w-3" /> {formattedPageDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {showBannerSettings && (
          <div className="space-y-4 rounded-3xl border border-white/10 bg-black/30 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-white/80">
                <span className="text-xs uppercase tracking-wide text-white/60">Ссылка на изображение</span>
                <div className="flex gap-2">
                  <input
                    value={bannerUrl}
                    onChange={event => setBannerUrl(event.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                  />
                  {bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setBannerUrl('')}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20"
                      title="Убрать изображение"
                      aria-label="Убрать изображение"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-white/50">Если указано изображение, оно перекроет градиент.</span>
              </label>

              <label className="flex flex-col gap-2 text-sm text-white/80">
                <span className="text-xs uppercase tracking-wide text-white/60">CSS-градиент</span>
                <textarea
                  rows={2}
                  value={bannerGradient}
                  onChange={event => setBannerGradient(event.target.value)}
                  placeholder="linear-gradient(...)"
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                />
                <span className="text-xs text-white/50">Введите CSS-значение или выберите вариант ниже.</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-white/60">Пресеты:</span>
              {BANNER_GRADIENT_PRESETS.map(preset => {
                const isActive = trimmedBannerGradient === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setBannerGradient(preset.value)}
                    className={`h-12 w-20 rounded-xl border transition ${
                      isActive ? 'border-white/70 ring-2 ring-white/60' : 'border-white/10 hover:border-white/40'
                    }`}
                    style={{
                      backgroundImage: preset.value,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                    title={preset.label}
                    aria-label={`Установить градиент: ${preset.label}`}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => setBannerGradient(DEFAULT_BANNER_GRADIENT)}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
              >
                По умолчанию
              </button>
              <button
                type="button"
                onClick={() => setBannerGradient('')}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
              >
                Очистить
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        {blocks.map((block, index) => {
          const isPdf = block.type === 'pdf';
          const pdfMeta = isPdf ? ensurePdfMeta(block.meta) : null;
          const pdfError = pdfErrors[block.id] || null;
          const pdfSrc = block.url ? resolveApiUrl(block.url) : '';
          const pdfTitle = block.text || pdfMeta?.originalName || 'PDF документ';

          return (
            <div
              key={block.id}
              className="group relative flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-white/5"
              onContextMenu={event => handleBlockContextMenu(event, block)}
            >
              <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-white/40">{BLOCK_LABELS[block.type]}</div>

              {block.type === 'divider' ? (
                <div className="flex-1 pt-3" style={LTR_STYLE}>
                  <div className="h-px bg-white/20" />
                </div>
              ) : block.type === 'image' ? (
                <div className="flex-1 space-y-2" style={LTR_STYLE}>
                  {block.url ? (
                    <img
                      src={block.url}
                      alt="page block"
                      className="max-h-96 rounded-xl border border-white/10 object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-2 text-sm rounded bg-white/10"
                      onClick={() => setImageUrl(block.id)}
                    >
                      Указать ссылку
                    </button>
                  )}
                  <input
                    value={block.text || ''}
                    onChange={event => handleBlockInput(block.id, event.target.value)}
                    placeholder="Подпись (опционально)"
                    className="w-full px-3 py-2 rounded bg-white/10 text-sm"
                  />
                </div>
              ) : block.type === 'pdf' ? (
                <div className="flex-1 space-y-3" style={LTR_STYLE}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <input
                      value={block.text || ''}
                      onChange={event => handleBlockInput(block.id, event.target.value)}
                      placeholder="Название документа"
                      className="flex-1 px-3 py-2 rounded bg-white/10 text-sm"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded bg-white/10 cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={event => handlePdfFileChange(block.id, event.target.files?.[0] || null)}
                          disabled={uploadingPdfBlockId === block.id}
                        />
                        {uploadingPdfBlockId === block.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Загрузить PDF</span>}
                      </label>
                      <button
                        type="button"
                        className="px-3 py-2 text-xs rounded bg-white/10 hover:bg-white/20"
                        onClick={() => setPdfUrl(block.id)}
                      >
                        Указать ссылку
                      </button>
                      {block.url && (
                        <a
                          href={pdfSrc}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 text-xs rounded bg-white/10 hover:bg-white/20"
                        >
                          Открыть PDF
                        </a>
                      )}
                    </div>
                  </div>
                  {pdfMeta?.originalName && (
                    <div className="text-xs opacity-70">Исходный файл: {pdfMeta.originalName}</div>
                  )}
                  {pdfError && (
                    <div className="text-xs text-red-300">{pdfError}</div>
                  )}
                  {block.url ? (
                    <PdfReader
                      src={pdfSrc}
                      title={pdfTitle}
                      originalName={pdfMeta?.originalName ?? null}
                      markers={pdfMeta?.markers || []}
                      onAddMarker={({ title, page }) =>
                        addPdfMarker(block.id, { id: uuid(), title, page, done: false })
                      }
                      onToggleMarker={markerId => togglePdfMarker(block.id, markerId)}
                      onRemoveMarker={markerId => removePdfMarker(block.id, markerId)}
                      onRenameMarker={(markerId, value) =>
                        updatePdfMarker(block.id, markerId, { title: value })
                      }
                      onChangeMarkerPage={(markerId, page) => updatePdfMarker(block.id, markerId, { page })}
                    />
                  ) : (
                    <div className="text-xs opacity-60">Загрузите файл или укажите ссылку, чтобы просмотреть PDF.</div>
                  )}
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
                    ref={element => registerBlockRef(block.id, element)}
                    onInput={event => {
                      const target = event.currentTarget as HTMLElement;
                      handleBlockInput(block.id, target.innerText, target.innerHTML);
                    }}
                    onKeyDown={event => handleKeyDown(event, block)}
                    style={LTR_STYLE}
                    dangerouslySetInnerHTML={getBlockHtml(block)}
                  />
                </label>
              ) : block.type === 'bulleted' ? (
                <div className="flex-1 flex items-start gap-3" style={LTR_STYLE}>
                  <span className="mt-1 text-white/70">•</span>
                  <div
                    className={BASE_EDITABLE_CLASS}
                    contentEditable
                    suppressContentEditableWarning
                    data-block-id={block.id}
                    ref={element => registerBlockRef(block.id, element)}
                    onInput={event => {
                      const target = event.currentTarget as HTMLElement;
                      handleBlockInput(block.id, target.innerText, target.innerHTML);
                    }}
                    onKeyDown={event => handleKeyDown(event, block)}
                    style={LTR_STYLE}
                    dangerouslySetInnerHTML={getBlockHtml(block)}
                  />
                </div>
              ) : block.type === 'numbered' ? (
                <div className="flex-1 flex items-start gap-3" style={LTR_STYLE}>
                  <span className="mt-1 text-white/70">{index + 1}.</span>
                  <div
                    className={BASE_EDITABLE_CLASS}
                    contentEditable
                    suppressContentEditableWarning
                    data-block-id={block.id}
                    ref={element => registerBlockRef(block.id, element)}
                    onInput={event => {
                      const target = event.currentTarget as HTMLElement;
                      handleBlockInput(block.id, target.innerText, target.innerHTML);
                    }}
                    onKeyDown={event => handleKeyDown(event, block)}
                    style={LTR_STYLE}
                    dangerouslySetInnerHTML={getBlockHtml(block)}
                  />
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
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    contentEditable
                    suppressContentEditableWarning
                    data-block-id={block.id}
                    ref={element => registerBlockRef(block.id, element)}
                    onInput={event => {
                      const target = event.currentTarget as HTMLElement;
                      handleBlockInput(block.id, target.innerText, target.innerHTML);
                    }}
                    onKeyDown={event => handleKeyDown(event, block)}
                    style={LTR_STYLE}
                    dangerouslySetInnerHTML={getBlockHtml(block)}
                  />
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
                >
                  Тип
                </button>
                <button type="button" className="px-2 py-1 text-xs rounded bg-white/10" onClick={() => insertBlockAfter(block.id)}>
                  +
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs rounded bg-white/10"
                  onClick={event => openEmojiMenuForBlock(block, event)}
                >
                  😊
                </button>
                <button type="button" className="px-2 py-1 text-xs rounded bg-white/10" onClick={() => duplicateBlock(block.id)}>
                  Копировать
                </button>
                <button type="button" className="px-2 py-1 text-xs rounded bg-red-500/40" onClick={() => removeBlock(block.id)}>
                  Удалить
                </button>
              </div>

              {block.relation && (
                <div className="absolute -bottom-2 right-3 rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wide text-white/60">
                  Связь: {block.relation}
                </div>
              )}
            </div>
          );
        })}

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

      {formatMenu && (
        <div
          ref={formatMenuRef}
          className="fixed z-50 w-72 rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl p-3 space-y-3"
          style={{ left: formatMenu.x, top: formatMenu.y }}
        >
          <div className="text-xs uppercase tracking-wide text-white/50">Форматирование текста</div>
          <div className="flex flex-wrap gap-2">
            {FORMAT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className="h-6 w-6 rounded-full border border-white/20"
                style={{ backgroundColor: color }}
                onClick={() => applyFormatting('foreColor', color)}
                title={`Цвет ${color}`}
              />
            ))}
          </div>
          <div className="space-y-2">
            <select
              className="w-full px-2 py-1 rounded bg-white/10 text-sm"
              onChange={event => {
                const value = event.target.value;
                if (value === 'inherit') {
                  applyFormatting('removeFormat');
                } else {
                  applyFormatting('fontName', value);
                }
              }}
              defaultValue="inherit"
            >
              {FONT_FAMILIES.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {FONT_SIZES.map(size => (
                <button
                  key={size.value}
                  type="button"
                  className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20"
                  onClick={() => applyFormatting('fontSize', String(size.value))}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
              onClick={() => {
                const url = window.prompt('Введите ссылку');
                if (!url) return;
                applyFormatting('createLink', url);
              }}
            >
              Сделать ссылкой
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
              onClick={() => applyFormatting('removeFormat')}
            >
              Очистить форматирование
            </button>
          </div>
        </div>
      )}

      {emojiMenu && (
        <div
          ref={emojiMenuRef}
          className="fixed z-50 w-56 rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl p-2 flex flex-wrap gap-1"
          style={{ left: emojiMenu.x, top: emojiMenu.y }}
        >
          {EMOJI_OPTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="h-8 w-8 rounded bg-white/10 text-lg hover:bg-white/20"
              onClick={() => insertEmoji(emojiMenu.blockId, emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}









