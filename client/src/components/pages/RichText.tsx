import React, { useEffect, useRef, useState } from 'react';
import { Bold, Eraser, Heading2, Highlighter, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Underline } from 'lucide-react';

// Текст с форматированием для блоков страниц: жирный, курсив, подчёркнутый, зачёркнутый, заголовок,
// списки, цитата, цвет, выделение маркером, ссылка. Хранится в meta.html (как в старой версии редактора),
// а простой текст — в text (для поиска и телефона).

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'DIV', 'P', 'SPAN', 'FONT', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'CODE', 'MARK']);
const COLORS = ['#f8fafc', '#f43f5e', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6'];
const MARKS = ['#fde68a', '#bbf7d0', '#bae6fd', '#fbcfe8'];

/** Убираем всё лишнее из вставленного или набранного HTML: скрипты, чужие стили, обработчики. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        // незнакомый тег: оставляем текст, убираем обёртку
        child.replaceWith(...[...child.childNodes]);
        return;
      }
      const color = (child as HTMLElement).style?.color || child.getAttribute('color');
      const bg = (child as HTMLElement).style?.backgroundColor;
      const href = child.getAttribute('href');
      [...child.attributes].forEach((a) => child.removeAttribute(a.name));
      if (color) (child as HTMLElement).style.color = color;
      if (bg) (child as HTMLElement).style.backgroundColor = bg;
      if (child.tagName === 'A' && href && /^(https?:|mailto:|\/)/i.test(href)) {
        child.setAttribute('href', href);
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noreferrer');
      }
      walk(child);
    });
  };
  const root = doc.body.firstElementChild as Element;
  walk(root);
  return root.innerHTML;
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\n/g, '<br>');

export default function RichText({
  html,
  text,
  placeholder,
  onChange,
}: {
  html?: string | null;
  text?: string | null;
  placeholder?: string;
  onChange: (next: { html: string; text: string }) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastHtml = useRef<string>('');
  const [focused, setFocused] = useState(false);
  const [palette, setPalette] = useState<'color' | 'mark' | null>(null);

  // Содержимое ставим только при внешнем изменении — иначе курсор прыгал бы при каждом символе
  useEffect(() => {
    const next = html && html.trim() ? html : escapeHtml(text || '');
    if (ref.current && next !== lastHtml.current) {
      ref.current.innerHTML = next;
      lastHtml.current = next;
    }
  }, [html, text]);

  const emit = () => {
    if (!ref.current) return;
    const clean = sanitizeHtml(ref.current.innerHTML);
    lastHtml.current = clean;
    onChange({ html: clean, text: ref.current.innerText.replace(/\n{3,}/g, '\n\n').trim() });
  };
  const cmd = (name: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, value);
    emit();
  };
  const toggleBlock = (tag: string) => {
    const current = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
    cmd('formatBlock', current === tag ? 'div' : tag);
  };
  const tool = 'flex h-7 w-7 items-center justify-center rounded-md text-white/70 transition hover:bg-white/15 hover:text-white';
  const empty = !lastHtml.current || lastHtml.current === '<br>';

  return (
    <div className="relative flex h-full flex-col">
      {focused ? (
        // панель форматирования над текстом; mousedown не забирает фокус у текста
        <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-black/20 px-2 py-1" onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={tool} title="Жирный (Ctrl+B)" onClick={() => cmd('bold')}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Курсив (Ctrl+I)" onClick={() => cmd('italic')}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Подчеркнуть (Ctrl+U)" onClick={() => cmd('underline')}><Underline className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Зачеркнуть" onClick={() => cmd('strikeThrough')}><Strikethrough className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button type="button" className={tool} title="Подзаголовок" onClick={() => toggleBlock('h3')}><Heading2 className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Список" onClick={() => cmd('insertUnorderedList')}><List className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Нумерованный список" onClick={() => cmd('insertOrderedList')}><ListOrdered className="h-3.5 w-3.5" /></button>
          <button type="button" className={tool} title="Цитата" onClick={() => toggleBlock('blockquote')}><Quote className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button type="button" className={tool} title="Цвет текста" onClick={() => setPalette(palette === 'color' ? null : 'color')}>
            <span className="text-sm font-bold" style={{ background: 'linear-gradient(90deg,#f43f5e,#f59e0b,#22c55e,#38bdf8)', WebkitBackgroundClip: 'text', color: 'transparent' }}>A</span>
          </button>
          <button type="button" className={tool} title="Маркер" onClick={() => setPalette(palette === 'mark' ? null : 'mark')}><Highlighter className="h-3.5 w-3.5" /></button>
          <button
            type="button"
            className={tool}
            title="Ссылка"
            onClick={() => {
              const url = window.getSelection()?.toString().match(/^https?:\/\/\S+$/) ? window.getSelection()!.toString() : null;
              const target = url || (document.queryCommandValue('createLink') as string) || '';
              // ссылку спрашиваем в своём окне — prompt() в приложении не работает
              import('../ui/askText').then(async ({ askText }) => {
                const sel = window.getSelection();
                const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
                const href = await askText('Ссылка', target || 'https://');
                if (!href || !range) return;
                ref.current?.focus();
                sel?.removeAllRanges();
                sel?.addRange(range);
                cmd('createLink', href);
              });
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={tool} title="Убрать оформление" onClick={() => { cmd('removeFormat'); cmd('formatBlock', 'div'); }}><Eraser className="h-3.5 w-3.5" /></button>
          {palette ? (
            <div className="ml-1 flex items-center gap-1">
              {(palette === 'color' ? COLORS : MARKS).map((c) => (
                <button key={c} type="button" title={c} onClick={() => { cmd(palette === 'color' ? 'foreColor' : 'hiliteColor', c); setPalette(null); }} className="h-4 w-4 rounded-full border border-white/30" style={{ background: c }} />
              ))}
              {palette === 'mark' ? <button type="button" title="Без маркера" onClick={() => { cmd('hiliteColor', 'transparent'); setPalette(null); }} className="h-4 w-4 rounded-full border border-white/30 text-[9px] leading-none text-white/60">✕</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {empty && !focused ? <div className="pointer-events-none absolute left-4 top-4 text-sm text-white/30">{placeholder}</div> : null}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={emit}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setPalette(null); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPaste={(e) => {
            // вставка из браузеров/Word: только разрешённое оформление
            const pasted = e.clipboardData.getData('text/html');
            if (!pasted) return;
            e.preventDefault();
            document.execCommand('insertHTML', false, sanitizeHtml(pasted));
            emit();
          }}
          className="lh-rich lh-quiet-scroll h-full w-full overflow-auto p-4 text-sm leading-6 text-white outline-none"
        />
      </div>
    </div>
  );
}
