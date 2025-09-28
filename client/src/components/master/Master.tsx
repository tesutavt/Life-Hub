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
  "px-4 py-2 rounded bg-white text-black font-medium shadow hover:bg-white/90 transition";

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
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
                  visible ? "opacity-100" : "opacity-0"
                }`}
              />
              <div
                className={`relative w-full max-w-xl transform overflow-hidden rounded-2xl border border-white/10 bg-[#050505]/95 p-6 shadow-2xl transition-all duration-300 ${
                  visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
                }`}
              >
                <button
                  onClick={close}
                  className="absolute right-4 top-4 text-white/60 transition hover:text-white"
                  aria-label="Закрыть"
                >
                  ×
                </button>
                {(title || description) && (
                  <div className="mb-4 space-y-1 pr-8">
                    {title && <div className="text-xl font-semibold">{title}</div>}
                    {description && (
                      <p className="text-sm text-white/70 leading-relaxed">{description}</p>
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
