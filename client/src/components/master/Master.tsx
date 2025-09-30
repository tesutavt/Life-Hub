import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type MasterProps = {
  buttonLabel?: string;
  title?: string;
  description?: string;
  triggerClassName?: string;
  children: (args: { close: () => void }) => React.ReactNode;
};

const DEFAULT_TRIGGER =
  "px-4 py-2 rounded-2xl bg-brand-mint text-brand-deep font-medium shadow-brand-glow hover:bg-brand-mint/90 transition";

export default function Master({
  buttonLabel = "Добавить",
  title,
  description,
  triggerClassName,
  children,
}: MasterProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [renderModal, setRenderModal] = useState(false);
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof document !== "undefined") {
      setPortalElement(document.body);
    }
  }, []);

  useEffect(() => {
    if (!renderModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [renderModal]);

  const open = () => {
    if (!mounted) return;
    setRenderModal(true);
    requestAnimationFrame(() => setVisible(true));
  };

  const close = () => {
    setVisible(false);
    setTimeout(() => {
      setRenderModal(false);
    }, 250);
  };

  if (!mounted) {
    return (
      <button onClick={open} className={triggerClassName || DEFAULT_TRIGGER}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <>
      <button onClick={open} className={triggerClassName || DEFAULT_TRIGGER}>
        {buttonLabel}
      </button>
      {renderModal && portalElement
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div
                onClick={close}
                className={`absolute inset-0 bg-brand-deep/80 backdrop-blur-lg transition-opacity duration-300 ${
                  visible ? "opacity-100" : "opacity-0"
                }`}
              />
              <div
                className={`relative w-full max-w-xl transform overflow-hidden rounded-3xl border border-brand-slate/40 bg-brand-night/95 p-6 shadow-brand-soft transition-all duration-300 ${
                  visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
                }`}
              >
                <button
                  onClick={close}
                  className="absolute right-4 top-4 text-slate-300/70 transition hover:text-brand-mint"
                  aria-label="Закрыть"
                >
                  ×
                </button>
                {(title || description) && (
                  <div className="mb-4 space-y-1 pr-8">
                    {title && <div className="text-xl font-semibold text-brand-mint">{title}</div>}
                    {description && (
                      <p className="text-sm text-slate-200/80 leading-relaxed">{description}</p>
                    )}
                  </div>
                )}
                <div className="max-h-[70vh] overflow-y-auto pr-2">
                  {children({ close })}
                </div>
              </div>
            </div>,
            portalElement,
          )
        : null}
    </>
  );
}
