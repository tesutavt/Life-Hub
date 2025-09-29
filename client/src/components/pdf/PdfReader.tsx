import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Loader2,
  Minus,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfReaderMarker = {
  id: string;
  title: string;
  page: number | null;
  done: boolean;
};

type PdfReaderProps = {
  src: string;
  title?: string;
  originalName?: string | null;
  markers?: PdfReaderMarker[];
  className?: string;
  onAddMarker?: (input: { title: string; page: number | null }) => void;
  onToggleMarker?: (markerId: string) => void;
  onRemoveMarker?: (markerId: string) => void;
  onRenameMarker?: (markerId: string, title: string) => void;
  onChangeMarkerPage?: (markerId: string, page: number | null) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const markerSort = (markers: PdfReaderMarker[]) => {
  return [...markers].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.page != null && b.page != null && a.page !== b.page) return a.page - b.page;
    if (a.page != null) return -1;
    if (b.page != null) return 1;
    return a.title.localeCompare(b.title, 'ru');
  });
};

export default function PdfReader({
  src,
  title,
  originalName,
  markers = [],
  className = '',
  onAddMarker,
  onToggleMarker,
  onRemoveMarker,
  onRenameMarker,
  onChangeMarkerPage,
}: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.1);
  const [loadingDocument, setLoadingDocument] = useState<boolean>(false);
  const [renderingPage, setRenderingPage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showMarkerForm, setShowMarkerForm] = useState<boolean>(false);
  const [markerTitle, setMarkerTitle] = useState<string>('');
  const [markerPage, setMarkerPage] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const sortedMarkers = useMemo(() => markerSort(markers), [markers]);

  useEffect(() => {
    if (!isFullscreen) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setDocumentProxy(null);
      setError('Не удалось загрузить PDF');
      return undefined;
    }

    setLoadingDocument(true);
    setError(null);
    setDocumentProxy(null);
    setTotalPages(0);
    setCurrentPage(1);

    const task = getDocument({ url: src, withCredentials: true });

    task.promise
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setDocumentProxy(pdf);
        setTotalPages(pdf.numPages || 0);
        setCurrentPage((prev) => (prev > pdf.numPages ? pdf.numPages : prev || 1));
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error(err);
        setError(err?.message || 'Не удалось открыть документ');
        setDocumentProxy(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDocument(false);
        }
      });

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [src]);

  useEffect(() => {
    let cancelled = false;
    if (!documentProxy) {
      setRenderingPage(false);
      return () => {
        cancelled = true;
      };
    }
    const renderPage = async () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const pageNumber = clamp(currentPage, 1, documentProxy.numPages || 1);
      const page = await documentProxy.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = viewport.width * outputScale;
      canvas.height = viewport.height * outputScale;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      setRenderingPage(true);
      await page.render({
        canvasContext: context,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      }).promise;
      if (!cancelled) {
        setRenderingPage(false);
      }
    };

    setRenderingPage(true);
    renderPage().catch((err) => {
      if (cancelled) return;
      console.error(err);
      setError('Ошибка при отображении страницы');
      setRenderingPage(false);
    });

    return () => {
      cancelled = true;
    };
  }, [documentProxy, currentPage, scale]);

  useEffect(() => {
    if (!showMarkerForm) return;
    setMarkerPage(String(currentPage));
    if (!markerTitle.trim()) {
      setMarkerTitle(`Страница ${currentPage}`);
    }
  }, [showMarkerForm, currentPage, markerTitle]);

  const changePage = (offset: number) => {
    setCurrentPage((prev) => {
      if (!documentProxy) return prev + offset;
      const next = clamp(prev + offset, 1, documentProxy.numPages || 1);
      return next;
    });
  };

  const handleAddMarker = () => {
    if (!onAddMarker) return;
    const trimmedTitle = markerTitle.trim();
    const titleValue = trimmedTitle || `Страница ${markerPage || currentPage}`;
    const pageValue = markerPage.trim();
    let pageNumber: number | null = null;
    if (pageValue) {
      const parsed = Number.parseInt(pageValue, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        pageNumber = parsed;
      }
    } else if (currentPage) {
      pageNumber = currentPage;
    }
    onAddMarker({ title: titleValue, page: pageNumber });
    setShowMarkerForm(false);
    setMarkerTitle('');
    setMarkerPage('');
  };

  const canZoomIn = scale < 2.4;
  const canZoomOut = scale > 0.6;

  const containerHeightClass = isFullscreen ? 'h-full' : 'h-[60vh] md:h-[70vh]';
  const bookmarksHeightClass = isFullscreen ? 'h-full max-h-full' : 'max-h-[70vh]';

  return (
    <>
      {isFullscreen && (
        <div className="pointer-events-none h-[60vh] w-full md:h-[70vh]" aria-hidden />
      )}
      <div
        className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 ${
          isFullscreen
            ? 'fixed inset-0 z-[100] m-0 h-screen w-screen max-w-none overflow-hidden bg-black/90 p-4 sm:p-10'
            : ''
        } ${className}`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{title || originalName || 'PDF документ'}</div>
              {originalName && (
                <div className="truncate text-xs opacity-60">{originalName}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                onClick={() => setIsFullscreen((prev) => !prev)}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    Свернуть
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    На весь экран
                  </>
                )}
              </button>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                В новой вкладке
              </a>
            </div>
          </div>
          <div className="text-xs opacity-60">
            {totalPages > 0 ? `Страниц: ${totalPages}` : loadingDocument ? 'Загрузка документа...' : ''}
          </div>
        </div>

        <div
          className={`flex flex-1 flex-col gap-4 lg:flex-row ${isFullscreen ? 'lg:items-stretch' : ''}`}
        >
          <div className="relative flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/60">
            <div
              ref={containerRef}
              className={`flex ${containerHeightClass} min-h-[360px] items-center justify-center overflow-auto p-4`}
            >
              {error ? (
                <div className="p-6 text-center text-sm text-red-300">{error}</div>
              ) : (
                <canvas ref={canvasRef} className="max-w-full" />
              )}
            </div>
          {(loadingDocument || renderingPage) && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs shadow-lg">
            <button
              type="button"
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              onClick={() => setScale((prev) => clamp(prev - 0.2, 0.6, 2.4))}
              disabled={!canZoomOut}
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="pointer-events-auto w-16 text-center font-semibold">
              {Math.round(scale * 100)}%
            </div>
            <button
              type="button"
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              onClick={() => setScale((prev) => clamp(prev + 0.2, 0.6, 2.4))}
              disabled={!canZoomIn}
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="pointer-events-auto mx-2 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/15"
                onClick={() => changePage(-1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="w-16 text-center text-sm font-semibold">
                {totalPages > 0 ? `${currentPage} / ${totalPages}` : currentPage}
              </div>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/15"
                onClick={() => changePage(1)}
                disabled={totalPages > 0 ? currentPage >= totalPages : false}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              className="pointer-events-auto flex h-8 items-center gap-1 rounded-full bg-emerald-500/20 px-3 text-xs hover:bg-emerald-500/30"
              onClick={() => {
                setShowMarkerForm((prev) => !prev);
                setMarkerTitle(`Страница ${currentPage}`);
                setMarkerPage(String(currentPage));
              }}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Закладка
            </button>
          </div>
          </div>

          <div
            className={`flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-black/40 p-3 lg:w-72 ${bookmarksHeightClass} overflow-auto`}
          >
            <div className="text-xs uppercase tracking-wide text-white/60">Закладки</div>
            {showMarkerForm && (
              <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <input
                  value={markerTitle}
                  onChange={(event) => setMarkerTitle(event.target.value)}
                  placeholder="Название"
                  className="w-full rounded bg-white/10 px-3 py-2"
                />
                <input
                  value={markerPage}
                  onChange={(event) => setMarkerPage(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Страница"
                  className="w-full rounded bg-white/10 px-3 py-2"
                />
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="flex-1 rounded bg-emerald-500/20 px-3 py-2 hover:bg-emerald-500/30"
                    onClick={handleAddMarker}
                  >
                    Добавить
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white/10 px-3 py-2 hover:bg-white/20"
                    onClick={() => {
                      setShowMarkerForm(false);
                      setMarkerTitle('');
                      setMarkerPage('');
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
            {sortedMarkers.length === 0 ? (
              <div className="text-xs text-white/50">Закладок пока нет. Добавьте первую, чтобы быстро возвращаться к нужной странице.</div>
            ) : (
              <div className="space-y-2">
                {sortedMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    className={`group flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      marker.done
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${
                          marker.done
                            ? 'border-emerald-400/80 bg-emerald-500/30 text-emerald-100'
                            : 'border-white/30 bg-white/10 text-white/80'
                        }`}
                        onClick={() => onToggleMarker?.(marker.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{marker.title}</div>
                        {marker.page != null && (
                          <div className="text-xs opacity-70">Стр. {marker.page}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        {marker.page != null && (
                          <button
                            type="button"
                            className="rounded bg-white/10 p-1 hover:bg-white/20"
                            onClick={() => {
                              if (marker.page != null) {
                                setCurrentPage(marker.page);
                              }
                            }}
                          >
                            <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded bg-white/10 p-1 hover:bg-white/20"
                          onClick={() => {
                            const next = window.prompt('Название закладки', marker.title);
                            if (!next) return;
                            onRenameMarker?.(marker.id, next.trim() || marker.title);
                          }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded bg-white/10 p-1 hover:bg-white/20"
                          onClick={() => {
                            const next = window.prompt('Номер страницы', marker.page != null ? String(marker.page) : '');
                            if (next === null) return;
                            const trimmed = next.trim();
                            if (!trimmed) {
                              onChangeMarkerPage?.(marker.id, null);
                              return;
                            }
                            const parsed = Number.parseInt(trimmed, 10);
                            if (!Number.isNaN(parsed) && parsed > 0) {
                              onChangeMarkerPage?.(marker.id, parsed);
                              setCurrentPage(parsed);
                            }
                          }}
                        >
                          <ChevronRight className="h-3.5 w-3.5 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          className="rounded bg-red-500/20 p-1 text-red-100 hover:bg-red-500/30"
                          onClick={() => onRemoveMarker?.(marker.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
