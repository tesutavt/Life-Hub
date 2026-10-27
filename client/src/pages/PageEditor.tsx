import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Pin,
  PinOff,
  Save,
  SquareCheckBig,
  TimerReset,
  Trash2,
  Type,
} from 'lucide-react';
import Shell from '../components/Shell';
import { api, resolveApiUrl } from '../api';
import PdfReader from '../components/pdf/PdfReader';
import KanaTrainerBlock from '../components/KanaTrainerBlock';
import CountdownTimerBlock from '../components/CountdownTimerBlock';
import TagBadge from '../components/tags/TagBadge';

type TagOption = { id: number; label: string; color: string };
type PageOption = { id: number; title: string; tags: TagOption[]; pinned?: boolean };
type CalendarEventItem = { id: number; date: string; title: string; type?: string; mood?: string | null; tags: TagOption[] };

type BlockType =
  | 'text'
  | 'heading'
  | 'todo'
  | 'image'
  | 'pdf'
  | 'kana'
  | 'timer'
  | 'divider'
  | 'calendar'
  | 'pageNav'
  | 'tabs';

type BlockLayout = { x: number; y: number; w: number; h: number };
type BlockDisplay = { customTitle: string; hideChrome: boolean; hideHeader: boolean; locked: boolean };
type TabItem = { id: string; title: string };
type BlockMeta = {
  layout?: BlockLayout;
  links?: string[];
  originalName?: string | null;
  markers?: any[];
  kanaTrainer?: any;
  countdownTimer?: { title: string; target: string };
  display?: Partial<BlockDisplay>;
  selectedTagIds?: number[];
  tabs?: TabItem[];
  activeTabId?: string | null;
  tabGroupId?: string | null;
  tabId?: string | null;
};
type PageBlock = {
  id: string;
  type: BlockType;
  text?: string;
  checked?: boolean;
  url?: string | null;
  relation?: string | null;
  meta?: BlockMeta | null;
};
type DragState = { mode: 'move' | 'resize'; blockId: string; startX: number; startY: number; origin: BlockLayout } | null;
type ContextMenuState =
  | { kind: 'page'; x: number; y: number }
  | { kind: 'block'; x: number; y: number; blockId: string }
  | null;

const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const PAGE_MIN_WIDTH = 1280;
const PAGE_MIN_HEIGHT = 900;
const DEFAULT_DISPLAY: BlockDisplay = { customTitle: '', hideChrome: false, hideHeader: false, locked: false };

const BLOCK_PRESETS: Record<BlockType, { label: string; icon: React.ComponentType<{ className?: string }>; size: Pick<BlockLayout, 'w' | 'h'> }> = {
  text: { label: 'Текст', icon: Type, size: { w: 360, h: 190 } },
  heading: { label: 'Заголовок', icon: FileText, size: { w: 520, h: 120 } },
  todo: { label: 'Задача', icon: SquareCheckBig, size: { w: 320, h: 120 } },
  image: { label: 'Изображение', icon: ImageIcon, size: { w: 420, h: 320 } },
  pdf: { label: 'PDF', icon: FileText, size: { w: 580, h: 540 } },
  kana: { label: 'Kana', icon: Type, size: { w: 430, h: 440 } },
  timer: { label: 'Таймер', icon: TimerReset, size: { w: 390, h: 260 } },
  divider: { label: 'Разделитель', icon: FileText, size: { w: 520, h: 48 } },
  calendar: { label: 'Календарь', icon: CalendarDays, size: { w: 580, h: 420 } },
  pageNav: { label: 'Навигация', icon: Layers3, size: { w: 420, h: 360 } },
  tabs: { label: 'Tabs', icon: Layers3, size: { w: 620, h: 420 } },
};

const formatTitle = (value: string) => (value.trim() ? value.trim() : 'Untitled page');
const sameDay = (iso: string, day: string) => iso.slice(0, 10) === day;

const getDisplay = (block: PageBlock): BlockDisplay => ({ ...DEFAULT_DISPLAY, ...(block.meta?.display || {}) });
const setDisplay = (block: PageBlock, patch: Partial<BlockDisplay>): PageBlock => ({
  ...block,
  meta: { ...(block.meta || {}), display: { ...getDisplay(block), ...patch } },
});
const getLayout = (block: PageBlock, index = 0): BlockLayout => {
  const layout = block.meta?.layout;
  const preset = BLOCK_PRESETS[block.type] ?? BLOCK_PRESETS.text;
  return {
    x: typeof layout?.x === 'number' ? layout.x : 80 + (index % 3) * 60,
    y: typeof layout?.y === 'number' ? layout.y : 110 + index * 50,
    w: typeof layout?.w === 'number' ? layout.w : preset.size.w,
    h: typeof layout?.h === 'number' ? layout.h : preset.size.h,
  };
};
const setLayout = (block: PageBlock, layout: BlockLayout): PageBlock => ({ ...block, meta: { ...(block.meta || {}), layout } });
const getLinks = (block: PageBlock) => {
  const rawLinks = Array.isArray(block.meta?.links) ? block.meta.links : [];
  const relation = typeof block.relation === 'string' && block.relation.trim() ? [block.relation.trim()] : [];
  return [...new Set([...rawLinks.filter((item: unknown) => typeof item === 'string' && item.trim()), ...relation])];
};
const setLinks = (block: PageBlock, links: string[]): PageBlock => ({ ...block, relation: links[0] || null, meta: { ...(block.meta || {}), links } });
const createTabItem = (title = 'Tab'): TabItem => ({ id: uuid(), title });
const getTabs = (block: PageBlock) => {
  const tabs = Array.isArray(block.meta?.tabs) ? block.meta.tabs : [];
  const normalizedTabs = tabs
    .map((tab, index) => {
      if (!tab || typeof tab !== 'object') return null;
      const id = typeof tab.id === 'string' && tab.id.trim() ? tab.id : `legacy-tab-${index + 1}`;
      const title = typeof tab.title === 'string' && tab.title.trim() ? tab.title : `Tab ${index + 1}`;
      return { id, title };
    })
    .filter(Boolean) as TabItem[];
  return normalizedTabs.length ? normalizedTabs : [createTabItem('Tab 1')];
};
const getActiveTabId = (block: PageBlock) => {
  const tabs = getTabs(block);
  const active = typeof block.meta?.activeTabId === 'string' ? block.meta.activeTabId : null;
  return tabs.some((tab) => tab.id === active) ? active : tabs[0]?.id || null;
};
const updateTabs = (block: PageBlock, tabs: TabItem[], activeTabId?: string | null): PageBlock => ({
  ...block,
  meta: { ...(block.meta || {}), tabs, activeTabId: activeTabId === undefined ? getActiveTabId(block) : activeTabId },
});

const getTabBinding = (block: PageBlock) => ({
  tabGroupId: typeof block.meta?.tabGroupId === 'string' ? block.meta.tabGroupId : null,
  tabId: typeof block.meta?.tabId === 'string' ? block.meta.tabId : null,
});

const isBlockVisibleForTabs = (block: PageBlock, allBlocks: PageBlock[]) => {
  if (block.type === 'tabs') return true;
  const binding = getTabBinding(block);
  if (!binding.tabGroupId || !binding.tabId) return true;
  const tabsBlock = allBlocks.find((item) => item.id === binding.tabGroupId && item.type === 'tabs');
  if (!tabsBlock) return true;
  return getActiveTabId(tabsBlock) === binding.tabId;
};

const getTabsDebugLabel = (block: PageBlock, allBlocks: PageBlock[]) => {
  if (block.type === 'tabs') {
    const activeTabId = getActiveTabId(block);
    const activeTab = getTabs(block).find((tab) => tab.id === activeTabId);
    return `DEBUG Tabs active=${activeTab?.title || activeTabId || 'none'} id=${activeTabId || 'none'}`;
  }
  const binding = getTabBinding(block);
  if (!binding.tabGroupId || !binding.tabId) return 'DEBUG Tabs none';
  const tabsBlock = allBlocks.find((item) => item.id === binding.tabGroupId && item.type === 'tabs');
  const tabsTitle = tabsBlock ? getDisplay(tabsBlock).customTitle.trim() || tabsBlock.text?.trim() || 'Tabs' : 'missing';
  const boundTab = tabsBlock ? getTabs(tabsBlock).find((tab) => tab.id === binding.tabId) : null;
  const visible = isBlockVisibleForTabs(block, allBlocks) ? 'visible' : 'hidden';
  return `DEBUG Tabs=${tabsTitle} tab=${boundTab?.title || binding.tabId} active=${tabsBlock ? getActiveTabId(tabsBlock) : 'none'} state=${visible}`;
};

const createBlock = (type: BlockType, index: number, x = 120, y = 160): PageBlock => {
  const preset = BLOCK_PRESETS[type] ?? BLOCK_PRESETS.text;
  return {
    id: uuid(),
    type,
    text: type === 'heading' ? 'Новый заголовок' : type === 'calendar' ? 'Календарь' : type === 'pageNav' ? 'Страницы' : type === 'tabs' ? 'Tabs' : '',
    checked: false,
    url: '',
    relation: null,
    meta: {
      layout: { x, y, w: preset.size.w, h: preset.size.h },
      links: [],
      markers: [],
      originalName: null,
      kanaTrainer: null,
      countdownTimer: { title: '', target: '' },
      display: DEFAULT_DISPLAY,
      selectedTagIds: [],
      tabs: type === 'tabs' ? [createTabItem('Tab 1')] : undefined,
      activeTabId: type === 'tabs' ? null : undefined,
      tabGroupId: null,
      tabId: null,
    },
  };
};

const normalizeBlocks = (input: unknown): PageBlock[] => {
  if (!Array.isArray(input) || input.length === 0) return [createBlock('text', 0)];
  const blocks = input.map((raw: any, index) => {
    const type = typeof raw?.type === 'string' && raw.type in BLOCK_PRESETS ? (raw.type as BlockType) : 'text';
    const block: PageBlock = {
      id: raw?.id || uuid(),
      type,
      text: typeof raw?.text === 'string' ? raw.text : '',
      checked: !!raw?.checked,
      url: typeof raw?.url === 'string' ? raw.url : '',
      relation: typeof raw?.relation === 'string' ? raw.relation : null,
      meta: raw?.meta && typeof raw.meta === 'object' ? raw.meta : {},
    };
    const normalizedBlock = setDisplay(setLayout(block, getLayout(block, index)), getDisplay(block));
    return normalizedBlock.type === 'tabs' ? updateTabs(normalizedBlock, getTabs(normalizedBlock), getActiveTabId(normalizedBlock)) : normalizedBlock;
  });
  const ids = new Set(blocks.map((item) => item.id));
  return blocks.map((block) => setLinks(block, getLinks(block).filter((targetId) => ids.has(targetId) && targetId !== block.id)));
};

const getPageBounds = (blocks: PageBlock[]) => {
  let width = PAGE_MIN_WIDTH;
  let height = PAGE_MIN_HEIGHT;
  blocks.forEach((block, index) => {
    const layout = getLayout(block, index);
    width = Math.max(width, layout.x + layout.w + 120);
    height = Math.max(height, layout.y + layout.h + 120);
  });
  return { width, height };
};

const isInteractiveTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return !!element.closest('textarea, input, button, label, select, a, canvas');
};

function CalendarBlock({
  block,
  events,
  tags,
  onChange,
}: {
  block: PageBlock;
  events: CalendarEventItem[];
  tags: TagOption[];
  onChange: (patch: Partial<PageBlock> | ((prev: PageBlock) => PageBlock)) => void;
}) {
  const selectedTagIds = Array.isArray(block.meta?.selectedTagIds) ? block.meta.selectedTagIds : [];
  const filteredEvents = events.filter((event) => selectedTagIds.length === 0 || event.tags.some((tag) => selectedTagIds.includes(tag.id)));
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dateNumber = index - startOffset + 1;
    if (dateNumber < 1 || dateNumber > daysInMonth) return null;
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(dateNumber).padStart(2, '0')}`;
    return { day, number: dateNumber, events: filteredEvents.filter((item) => sameDay(item.date, day)) };
  });

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const active = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  meta: {
                    ...(prev.meta || {}),
                    selectedTagIds: active ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id],
                  },
                }))
              }
              className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/60 hover:bg-white/10'}`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      <div className="grid flex-1 grid-cols-7 gap-2 text-xs text-white/70">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((item) => (
          <div key={item} className="pb-1 text-center uppercase tracking-wide text-white/35">
            {item}
          </div>
        ))}
        {cells.map((cell, index) => (
          <div key={cell?.day || `empty-${index}`} className={`min-h-[78px] rounded-2xl border p-2 ${cell ? 'border-white/10 bg-white/[0.03]' : 'border-transparent bg-transparent'}`}>
            {cell ? (
              <>
                <div className="text-white/80">{cell.number}</div>
                <div className="mt-1 space-y-1">
                  {cell.events.slice(0, 2).map((event) => (
                    <div key={event.id} className="truncate rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/75">
                      {event.title}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageNavBlock({ block, pages, tags }: { block: PageBlock; pages: PageOption[]; tags: TagOption[] }) {
  const selectedTagIds = Array.isArray(block.meta?.selectedTagIds) ? block.meta.selectedTagIds : [];
  const filteredPages = pages.filter((page) => selectedTagIds.length === 0 || page.tags.some((tag) => selectedTagIds.includes(tag.id)));
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {selectedTagIds.length === 0 ? <span className="text-xs text-white/45">Показаны все страницы</span> : null}
        {selectedTagIds.map((tagId) => {
          const tag = tags.find((item) => item.id === tagId);
          return tag ? <TagBadge key={tag.id} tag={tag} compact /> : null;
        })}
      </div>
      <div className="space-y-2 overflow-auto">
        {filteredPages.map((page) => (
          <Link key={page.id} to={`/pages/${page.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/80 hover:bg-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate">{page.title || 'Без названия'}</div>
              {page.pinned ? <Pin className="h-4 w-4 text-amber-300" /> : null}
            </div>
            {page.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {page.tags.slice(0, 4).map((tag) => (
                  <TagBadge key={tag.id} tag={tag} compact />
                ))}
              </div>
            ) : null}
          </Link>
        ))}
        {filteredPages.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/50">Нет страниц по выбранным тегам</div> : null}
      </div>
    </div>
  );
}

function TabsBlock({
  block,
  groupedCount,
  selectedBlock,
  onAssignSelected,
  onUnassignSelected,
  onChange,
}: {
  block: PageBlock;
  groupedCount: number;
  selectedBlock: PageBlock | null;
  onAssignSelected: () => void;
  onUnassignSelected: () => void;
  onChange: (patch: Partial<PageBlock> | ((prev: PageBlock) => PageBlock)) => void;
}) {
  const tabs = getTabs(block);
  const activeTabId = getActiveTabId(block);
  const activeTab = tabs.find((item) => item.id === activeTabId) || tabs[0];

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange((prev) => updateTabs(prev, getTabs(prev), tab.id));
            }}
            onDoubleClick={() => {
              const value = window.prompt('Название вкладки', tab.title);
              if (value === null) return;
              onChange((prev) => updateTabs(prev, getTabs(prev).map((item) => (item.id === tab.id ? { ...item, title: value || 'Tab' } : item)), tab.id));
            }}
            className={`rounded-xl px-3 py-2 text-sm ${tab.id === activeTabId ? 'bg-white text-slate-950' : 'border border-white/10 bg-white/[0.03] text-white/75'}`}
          >
            {tab.title}
          </button>
        ))}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange((prev) => {
              const nextTabs = [...getTabs(prev), createTabItem(`Tab ${getTabs(prev).length + 1}`)];
              return updateTabs(prev, nextTabs, nextTabs.at(-1)?.id || null);
            });
          }}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75"
        >
          + Tab
        </button>
      </div>
      <div className="hidden mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
        <div className="font-medium text-white">{activeTab?.title || 'Tab'}</div>
        <div className="mt-2">Это переключатель вкладок для уже существующих блоков страницы.</div>
        <div className="mt-1 text-white/50">Выдели любой существующий блок на странице и добавь его в активную вкладку этой панели.</div>
        <div className="mt-3 text-xs uppercase tracking-wide text-white/40">Блоков в текущем Tabs: {groupedCount}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAssignSelected}
            disabled={!selectedBlock || selectedBlock.id === block.id}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Добавить выбранный блок в активную вкладку
          </button>
          <button
            type="button"
            onClick={onUnassignSelected}
            disabled={!selectedBlock || selectedBlock.id === block.id}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Убрать выбранный блок из Tabs
          </button>
        </div>
        {selectedBlock && selectedBlock.id !== block.id ? (
          <div className="mt-2 text-xs text-white/45">
            Выбран блок: {getDisplay(selectedBlock).customTitle.trim() || selectedBlock.text?.trim() || BLOCK_PRESETS[selectedBlock.type].label}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BlockBody({
  block,
  tags,
  pages,
  calendarItems,
  groupedCount,
  selectedBlock,
  onAssignSelected,
  onUnassignSelected,
  onChange,
  onUploadPdf,
}: {
  block: PageBlock;
  tags: TagOption[];
  pages: PageOption[];
  calendarItems: CalendarEventItem[];
  groupedCount: number;
  selectedBlock: PageBlock | null;
  onAssignSelected: () => void;
  onUnassignSelected: () => void;
  onChange: (patch: Partial<PageBlock> | ((prev: PageBlock) => PageBlock)) => void;
  onUploadPdf: (file: File) => void;
}) {
  if (block.type === 'text') return <textarea value={block.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="h-full w-full resize-none bg-transparent p-4 text-sm leading-6 text-white outline-none" placeholder="Текстовый блок" />;
  if (block.type === 'heading') return <textarea value={block.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="h-full w-full resize-none bg-transparent p-4 text-3xl font-semibold leading-tight text-white outline-none" placeholder="Заголовок" />;
  if (block.type === 'todo') {
    return (
      <div className="flex h-full gap-3 p-4">
        <input type="checkbox" checked={!!block.checked} onChange={(e) => onChange({ checked: e.target.checked })} className="mt-1 h-5 w-5 rounded" />
        <textarea value={block.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="h-full w-full resize-none bg-transparent text-sm leading-6 text-white outline-none" placeholder="Описание задачи" />
      </div>
    );
  }
  if (block.type === 'image') {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <input value={block.url || ''} onChange={(e) => onChange({ url: e.target.value })} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" placeholder="URL изображения" />
        <textarea value={block.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white outline-none" placeholder="Подпись" />
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          {block.url ? <img src={block.url} alt={block.text || 'image'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-white/40">Нет изображения</div>}
        </div>
      </div>
    );
  }
  if (block.type === 'pdf') {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex gap-2">
          <input value={block.url || ''} onChange={(e) => onChange({ url: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" placeholder="URL PDF" />
          <label className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
            Upload
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadPdf(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        <input value={block.text || ''} onChange={(e) => onChange({ text: e.target.value })} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" placeholder="Название PDF" />
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          {block.url ? (
            <PdfReader
              src={resolveApiUrl(block.url)}
              title={block.text || 'PDF'}
              originalName={typeof block.meta?.originalName === 'string' ? block.meta.originalName : null}
              markers={Array.isArray(block.meta?.markers) ? block.meta.markers : []}
              className="h-full"
              onAddMarker={({ title, page }) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), markers: [...(Array.isArray(prev.meta?.markers) ? prev.meta.markers : []), { id: uuid(), title, page, done: false }] } }))}
              onToggleMarker={(markerId) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), markers: (Array.isArray(prev.meta?.markers) ? prev.meta.markers : []).map((m: any) => (m.id === markerId ? { ...m, done: !m.done } : m)) } }))}
              onRemoveMarker={(markerId) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), markers: (Array.isArray(prev.meta?.markers) ? prev.meta.markers : []).filter((m: any) => m.id !== markerId) } }))}
              onRenameMarker={(markerId, title) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), markers: (Array.isArray(prev.meta?.markers) ? prev.meta.markers : []).map((m: any) => (m.id === markerId ? { ...m, title } : m)) } }))}
              onChangeMarkerPage={(markerId, page) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), markers: (Array.isArray(prev.meta?.markers) ? prev.meta.markers : []).map((m: any) => (m.id === markerId ? { ...m, page } : m)) } }))}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/40">Укажите ссылку или загрузите PDF</div>
          )}
        </div>
      </div>
    );
  }
  if (block.type === 'kana') return <KanaTrainerBlock value={block.meta?.kanaTrainer} onChange={(next) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), kanaTrainer: next } }))} />;
  if (block.type === 'timer') return <CountdownTimerBlock value={block.meta?.countdownTimer} onChange={(next) => onChange((prev) => ({ ...prev, meta: { ...(prev.meta || {}), countdownTimer: next } }))} />;
  if (block.type === 'calendar') return <CalendarBlock block={block} events={calendarItems} tags={tags} onChange={onChange} />;
  if (block.type === 'pageNav') return <PageNavBlock block={block} pages={pages} tags={tags} />;
  if (block.type === 'tabs') return <TabsBlock block={block} groupedCount={groupedCount} selectedBlock={selectedBlock} onAssignSelected={onAssignSelected} onUnassignSelected={onUnassignSelected} onChange={onChange} />;
  return <div className="flex h-full items-center px-4"><div className="w-full border-t border-dashed border-white/30" /></div>;
}

function BlockCard({
  block,
  allBlocks,
  selected,
  tags,
  pages,
  calendarItems,
  groupedCount,
  selectedBlock,
  onAssignSelected,
  onUnassignSelected,
  onPointerDown,
  onContextMenu,
  onResizeStart,
  onChange,
  onUploadPdf,
}: {
  block: PageBlock;
  allBlocks: PageBlock[];
  selected: boolean;
  tags: TagOption[];
  pages: PageOption[];
  calendarItems: CalendarEventItem[];
  groupedCount: number;
  selectedBlock: PageBlock | null;
  onAssignSelected: () => void;
  onUnassignSelected: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onChange: (patch: Partial<PageBlock> | ((prev: PageBlock) => PageBlock)) => void;
  onUploadPdf: (file: File) => void;
}) {
  const layout = getLayout(block);
  const display = getDisplay(block);
  const headerTitle = display.customTitle.trim() || block.text?.trim() || BLOCK_PRESETS[block.type].label;
  const chromeClass = display.hideChrome ? 'border-transparent bg-transparent shadow-none backdrop-blur-none' : selected ? 'border-cyan-300/80 bg-[#10202c]/95 shadow-[0_12px_40px_rgba(0,0,0,0.35)]' : 'border-white/10 bg-[#10202c]/90 shadow-[0_8px_30px_rgba(0,0,0,0.24)]';
  const bodyHeight = display.hideHeader ? '100%' : 'calc(100% - 45px)';

  return (
    <div className={`absolute overflow-hidden rounded-[24px] border backdrop-blur-sm transition ${chromeClass}`} style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h }} onPointerDown={onPointerDown} onMouseDown={(e) => e.stopPropagation()} onContextMenu={onContextMenu}>
      {!display.hideHeader ? (
        <div className={`flex items-center justify-between border-b px-4 py-2 ${display.hideChrome ? 'border-white/0 bg-transparent' : 'border-white/10'}`}>
          <div className="truncate text-xs uppercase tracking-[0.24em] text-white/50">{headerTitle}</div>
          <div className="truncate text-[11px] text-white/30">{display.locked ? 'Зафиксирован' : 'ПКМ для действий'}</div>
        </div>
      ) : null}
      <div className="overflow-auto" style={{ height: bodyHeight }}>
        <BlockBody block={block} tags={tags} pages={pages} calendarItems={calendarItems} groupedCount={groupedCount} selectedBlock={selectedBlock} onAssignSelected={onAssignSelected} onUnassignSelected={onUnassignSelected} onChange={onChange} onUploadPdf={onUploadPdf} />
      </div>
      {!display.locked ? <button type="button" onPointerDown={onResizeStart} className="absolute bottom-2 right-2 h-5 w-5 rounded border border-white/10 bg-white/10" aria-label="Resize" /> : null}
    </div>
  );
}

export default function PageEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [title, setTitle] = useState('');
  const [pageDate, setPageDate] = useState('');
  const [pinned, setPinned] = useState(false);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerGradient, setBannerGradient] = useState('');
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [blocks, setBlocks] = useState<PageBlock[]>([createBlock('text', 0)]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [showTabsDropdownFor, setShowTabsDropdownFor] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarEventItem[]>([]);

  const pageBounds = useMemo(() => getPageBounds(blocks), [blocks]);
  const visibleBlocks = useMemo(() => blocks.filter((block) => isBlockVisibleForTabs(block, blocks)), [blocks]);
  const countBlocksInTabGroup = useCallback(
    (groupId: string) =>
      blocks.filter((block) => {
        const binding = getTabBinding(block);
        return block.type !== 'tabs' && binding.tabGroupId === groupId;
      }).length,
    [blocks]
  );
  const tabsBlocks = useMemo(() => blocks.filter((block) => block.type === 'tabs'), [blocks]);
  const selectedBlock = useMemo(() => blocks.find((block) => block.id === selectedId) || null, [blocks, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const block = blocks.find((item) => item.id === selectedId);
    if (block && isBlockVisibleForTabs(block, blocks)) return;
    setSelectedId(null);
  }, [blocks, selectedId]);

  useEffect(() => {
    if (!connectingFrom) return;
    const block = blocks.find((item) => item.id === connectingFrom);
    if (block && isBlockVisibleForTabs(block, blocks)) return;
    setConnectingFrom(null);
  }, [blocks, connectingFrom]);

  const updateBlock = useCallback((blockId: string, patch: Partial<PageBlock> | ((prev: PageBlock) => PageBlock)) => {
    setBlocks((prev) => prev.map((block) => (block.id !== blockId ? block : typeof patch === 'function' ? patch(block) : { ...block, ...patch })));
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const next = prev.filter((block) => block.id !== blockId).map((block) => setLinks(block, getLinks(block).filter((target) => target !== blockId)));
      return next.length ? next : [createBlock('text', 0)];
    });
    setSelectedId((prev) => (prev === blockId ? null : prev));
    setConnectingFrom((prev) => (prev === blockId ? null : prev));
  }, []);

  const duplicateBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const source = prev.find((block) => block.id === blockId);
      if (!source) return prev;
      const layout = getLayout(source);
      return [...prev, setLayout({ ...source, id: uuid(), relation: null, meta: { ...(source.meta || {}), links: [] } }, { ...layout, x: layout.x + 36, y: layout.y + 36 })];
    });
  }, []);

  const addBlock = useCallback((type: BlockType, x = 120, y = 160) => {
    setBlocks((prev) => [...prev, createBlock(type, prev.length, x, y)]);
  }, []);

  const loadPage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/life/pages/${id}`);
      const page = response.page || {};
      setTitle(page.title || '');
      setPageDate(page.page_date || '');
      setPinned(!!page.pinned);
      setBannerUrl(page.banner_url ?? page.bannerUrl ?? '');
      setBannerGradient(page.banner_gradient ?? page.bannerGradient ?? '');
      const normalized = normalizeBlocks(page.blocks ?? page.content ?? []);
      setBlocks(normalized);
      setSelectedId(normalized[0]?.id ?? null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAuxData = useCallback(async () => {
    const [tagsResponse, pagesResponse] = await Promise.all([
      api.get('/api/life/pages/tags', { silentError: true }),
      api.get('/api/life/pages', { silentError: true }),
    ]);

    setTagOptions(Array.isArray(tagsResponse?.items) ? tagsResponse.items.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color })) : []);
    setPageOptions(Array.isArray(pagesResponse?.items) ? pagesResponse.items.map((page: any) => ({ id: page.id, title: page.title || 'Без названия', pinned: !!page.pinned, tags: Array.isArray(page.tags) ? page.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color })) : [] })) : []);

    const current = new Date();
    const calendarResponse = await api.get(`/api/life/calendar?y=${current.getFullYear()}&m=${current.getMonth() + 1}`, { silentError: true });
    setCalendarItems(Array.isArray(calendarResponse?.items) ? calendarResponse.items.map((item: any) => ({ id: item.id, date: item.date, title: item.title, type: item.type, mood: item.mood ?? null, tags: Array.isArray(item.tags) ? item.tags.map((tag: any) => ({ id: tag.id, label: tag.label, color: tag.color })) : [] })) : []);
  }, []);

  useEffect(() => {
    loadPage();
    loadAuxData();
  }, [loadAuxData, loadPage]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      setContextMenu(null);
      setShowTabsDropdownFor(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
        setShowTabsDropdownFor(null);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!dragState) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (!pageRef.current) return;
      const pageRect = pageRef.current.getBoundingClientRect();
      const dx = event.clientX - pageRect.left - dragState.startX;
      const dy = event.clientY - pageRect.top - dragState.startY;
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== dragState.blockId) return block;
          const current = dragState.origin;
          if (dragState.mode === 'move') return setLayout(block, { ...current, x: Math.max(0, current.x + dx), y: Math.max(0, current.y + dy) });
          return setLayout(block, { ...current, w: Math.max(220, current.w + dx), h: Math.max(block.type === 'divider' ? 36 : 100, current.h + dy) });
        })
      );
    };
    const handlePointerUp = () => setDragState(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState]);

  const startDrag = useCallback((blockId: string, mode: 'move' | 'resize', clientX: number, clientY: number) => {
    if (!pageRef.current) return;
    const block = blocks.find((item) => item.id === blockId);
    if (!block || getDisplay(block).locked) return;
    const pageRect = pageRef.current.getBoundingClientRect();
    setSelectedId(blockId);
    setDragState({ mode, blockId, startX: clientX - pageRect.left, startY: clientY - pageRect.top, origin: getLayout(block) });
  }, [blocks]);

  const assignBlockToTabs = useCallback((tabsBlockId: string) => {
    const tabsBlock = blocks.find((block) => block.id === tabsBlockId && block.type === 'tabs');
    if (!tabsBlock || !selectedBlock || selectedBlock.id === tabsBlockId) return;
    const activeTabId = getActiveTabId(tabsBlock);
    if (!activeTabId) return;
    updateBlock(selectedBlock.id, (prev) => ({ ...prev, meta: { ...(prev.meta || {}), tabGroupId: tabsBlockId, tabId: activeTabId } }));
  }, [blocks, selectedBlock, updateBlock]);

  const unassignSelectedBlockFromTabs = useCallback(() => {
    if (!selectedBlock || selectedBlock.type === 'tabs') return;
    updateBlock(selectedBlock.id, (prev) => ({ ...prev, meta: { ...(prev.meta || {}), tabGroupId: null, tabId: null } }));
  }, [selectedBlock, updateBlock]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/life/pages/${id}`, {
        title: formatTitle(title),
        page_date: pageDate || null,
        pinned,
        banner_url: bannerUrl || null,
        banner_gradient: bannerGradient || null,
        blocks: blocks.map((block) => ({
          ...block,
          meta: {
            ...(block.meta || {}),
            layout: getLayout(block),
            links: getLinks(block),
            display: getDisplay(block),
            ...(block.type === 'tabs' ? { tabs: getTabs(block), activeTabId: getActiveTabId(block) } : null),
          },
        })),
      });
      await loadAuxData();
    } catch (err: any) {
      setError(err?.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  }, [bannerGradient, bannerUrl, blocks, id, loadAuxData, pageDate, pinned, title]);

  const togglePinned = useCallback(async () => {
    if (!id) return;
    const next = !pinned;
    setPinned(next);
    try {
      await api.put(`/api/life/pages/${id}`, { pinned: next }, { silentSuccess: true });
    } catch (err: any) {
      setPinned(!next);
      setError(err?.message || 'Failed to update pinned state');
    }
  }, [id, pinned]);

  const handleDeletePage = useCallback(async () => {
    if (!id || !window.confirm('Удалить страницу полностью?')) return;
    await api.del(`/api/life/pages/${id}`);
    navigate('/pages');
  }, [id, navigate]);

  const uploadPdfForBlock = useCallback(async (blockId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/life/uploads/pdf', formData);
    updateBlock(blockId, (prev) => ({ ...prev, url: response.url || '', text: prev.text || file.name.replace(/\.pdf$/i, ''), meta: { ...(prev.meta || {}), originalName: response.originalName || file.name } }));
  }, [updateBlock]);

  const connections = useMemo(() => {
    const layouts = new Map(visibleBlocks.map((block) => [block.id, getLayout(block)]));
    return visibleBlocks.flatMap((block) => {
      const from = layouts.get(block.id);
      if (!from) return [];
      return getLinks(block).map((targetId) => {
        const to = layouts.get(targetId);
        if (!to) return null;
        return { id: `${block.id}-${targetId}`, x1: from.x + from.w / 2, y1: from.y + from.h / 2, x2: to.x + to.w / 2, y2: to.y + to.h / 2 };
      }).filter(Boolean) as Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>;
    });
  }, [visibleBlocks]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          Загрузка редактора страницы...
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#10202c]">
          <div
            className="relative border-b border-white/10 px-6 py-6"
            style={{
              backgroundImage: bannerUrl.trim()
                ? `linear-gradient(rgba(8,16,24,0.68), rgba(8,16,24,0.88)), url(${bannerUrl.trim()})`
                : bannerGradient.trim() || 'linear-gradient(135deg, rgba(14,27,38,0.95) 0%, rgba(22,41,54,0.92) 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <button type="button" onClick={() => navigate('/pages')} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                  <ArrowLeft className="mr-2 inline h-4 w-4" />
                  К списку
                </button>
                <div>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full min-w-[280px] bg-transparent text-3xl font-semibold text-white outline-none" placeholder="Название страницы" />
                  <div className="mt-2 text-sm text-white/55">ПКМ по странице добавляет блоки. ПКМ по блоку открывает настройки и действия.</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setShowPageSettings((prev) => !prev)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10">Настройки страницы</button>
                <button type="button" onClick={togglePinned} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                  {pinned ? <PinOff className="mr-2 inline h-4 w-4" /> : <Pin className="mr-2 inline h-4 w-4" />}
                  {pinned ? 'Открепить' : 'Закрепить'}
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-950">
                  {saving ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Save className="mr-2 inline h-4 w-4" />}
                  Сохранить
                </button>
                <button type="button" onClick={handleDeletePage} className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/15">
                  <Trash2 className="mr-2 inline h-4 w-4" />
                  Удалить страницу
                </button>
              </div>
            </div>

            {showPageSettings ? (
              <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-3">
                <input type="date" value={pageDate} onChange={(e) => setPageDate(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" />
                <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" placeholder="URL баннера" />
                <input value={bannerGradient} onChange={(e) => setBannerGradient(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none" placeholder="CSS gradient" />
              </div>
            ) : null}
          </div>

          <div className="overflow-auto bg-[#0b1720] p-6">
            <div
              ref={pageRef}
              className="relative mx-auto rounded-[30px] border border-white/10 bg-[#10202c]"
              style={{ width: pageBounds.width, height: pageBounds.height }}
              onMouseDown={() => {
                setSelectedId(null);
                setConnectingFrom(null);
                setShowTabsDropdownFor(null);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setShowTabsDropdownFor(null);
                setContextMenu({ kind: 'page', x: event.clientX - rect.left, y: event.clientY - rect.top });
              }}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {connections.map((line) => (
                  <path key={line.id} d={`M ${line.x1} ${line.y1} C ${line.x1 + 120} ${line.y1}, ${line.x2 - 120} ${line.y2}, ${line.x2} ${line.y2}`} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" />
                ))}
              </svg>

              {visibleBlocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  allBlocks={blocks}
                  selected={selectedId === block.id}
                  tags={tagOptions}
                  pages={pageOptions}
                  calendarItems={calendarItems}
                  groupedCount={block.type === 'tabs' ? countBlocksInTabGroup(block.id) : 0}
                  selectedBlock={selectedBlock}
                  onAssignSelected={() => assignBlockToTabs(block.id)}
                  onUnassignSelected={unassignSelectedBlockFromTabs}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
                    event.stopPropagation();
                    startDrag(block.id, 'move', event.clientX, event.clientY);
                    setSelectedId(block.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = pageRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setSelectedId(block.id);
                    setShowTabsDropdownFor(null);
                    setContextMenu({ kind: 'block', blockId: block.id, x: event.clientX - rect.left, y: event.clientY - rect.top });
                  }}
                  onResizeStart={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startDrag(block.id, 'resize', event.clientX, event.clientY);
                  }}
                  onChange={(patch) => updateBlock(block.id, patch)}
                  onUploadPdf={(file) => uploadPdfForBlock(block.id, file)}
                />
              ))}

              {contextMenu ? (
                <div
                  ref={menuRef}
                  className="absolute z-50 min-w-[240px] rounded-2xl border border-white/10 bg-[#122330] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {contextMenu.kind === 'page' ? (
                    <div className="space-y-1">
                      {(Object.keys(BLOCK_PRESETS) as BlockType[]).map((type) => (
                        <button key={type} type="button" onClick={() => { addBlock(type, contextMenu.x, contextMenu.y); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">
                          Добавить: {BLOCK_PRESETS[type].label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {contextMenu.kind === 'block' ? (
                    <div className="space-y-1">
                      <button type="button" onClick={() => { duplicateBlock(contextMenu.blockId); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Дублировать блок</button>
                      <button type="button" onClick={() => { const current = blocks.find((b) => b.id === contextMenu.blockId); if (!current) return; const value = window.prompt('Собственное название блока', getDisplay(current).customTitle || ''); if (value !== null) updateBlock(contextMenu.blockId, (prev) => setDisplay(prev, { customTitle: value })); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Свое название блока</button>
                      <button type="button" onClick={() => { updateBlock(contextMenu.blockId, (prev) => setDisplay(prev, { hideChrome: !getDisplay(prev).hideChrome })); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Показать/скрыть оконтовку</button>
                      <button type="button" onClick={() => { updateBlock(contextMenu.blockId, (prev) => setDisplay(prev, { hideHeader: !getDisplay(prev).hideHeader })); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Показать/скрыть заголовок</button>
                      <button type="button" onClick={() => { updateBlock(contextMenu.blockId, (prev) => setDisplay(prev, { locked: !getDisplay(prev).locked })); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Зафиксировать / снять фиксацию</button>
                      <button type="button" onClick={() => { setConnectingFrom(contextMenu.blockId); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Начать связь с этим блоком</button>
                      <button type="button" onClick={() => { if (connectingFrom && connectingFrom !== contextMenu.blockId) updateBlock(connectingFrom, (prev) => setLinks(prev, [...getLinks(prev), contextMenu.blockId])); setConnectingFrom(null); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Связать сюда</button>
                      <button type="button" onClick={() => { updateBlock(contextMenu.blockId, (prev) => setLinks(prev, [])); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Очистить связи</button>
                      {blocks.find((item) => item.id === contextMenu.blockId)?.type !== 'tabs' && tabsBlocks.length > 0 ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setShowTabsDropdownFor((prev) => (prev === contextMenu.blockId ? null : contextMenu.blockId))}
                            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                          >
                            Добавить в Вкладку...
                          </button>
                          {showTabsDropdownFor === contextMenu.blockId ? (
                            <div className="ml-2 space-y-1 rounded-xl border border-white/10 bg-black/20 p-2">
                              {tabsBlocks.map((tabsBlock) => {
                                const activeId = getActiveTabId(tabsBlock);
                                const activeTab = getTabs(tabsBlock).find((tab) => tab.id === activeId);
                                const title = getDisplay(tabsBlock).customTitle.trim() || tabsBlock.text?.trim() || 'Tabs';
                                return (
                                  <button
                                    key={tabsBlock.id}
                                    type="button"
                                    onClick={() => {
                                      if (!activeTab) return;
                                      updateBlock(contextMenu.blockId, (prev) => ({ ...prev, meta: { ...(prev.meta || {}), tabGroupId: tabsBlock.id, tabId: activeTab.id } }));
                                      setContextMenu(null);
                                      setShowTabsDropdownFor(null);
                                    }}
                                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white/75 hover:bg-white/10"
                                  >
                                    {title} / {activeTab?.title || 'Tab'}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => {
                                  updateBlock(contextMenu.blockId, (prev) => ({ ...prev, meta: { ...(prev.meta || {}), tabGroupId: null, tabId: null } }));
                                  setContextMenu(null);
                                  setShowTabsDropdownFor(null);
                                }}
                                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white/60 hover:bg-white/10"
                              >
                                Убрать из Tabs
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {['calendar', 'pageNav'].includes(blocks.find((item) => item.id === contextMenu.blockId)?.type || '') ? (
                        <button type="button" onClick={() => { const current = blocks.find((item) => item.id === contextMenu.blockId); if (!current) return; const selected = Array.isArray(current.meta?.selectedTagIds) ? current.meta.selectedTagIds : []; const value = window.prompt('ID тегов через запятую', selected.join(', ')); if (value !== null) { const ids = value.split(',').map((item) => Number.parseInt(item.trim(), 10)).filter((item) => Number.isInteger(item)); updateBlock(contextMenu.blockId, (prev) => ({ ...prev, meta: { ...(prev.meta || {}), selectedTagIds: ids } })); } setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Фильтр по тегам</button>
                      ) : null}
                      <button type="button" onClick={() => { removeBlock(contextMenu.blockId); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10">Удалить блок</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      </div>
    </Shell>
  );
}
