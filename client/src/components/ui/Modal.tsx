import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayClassName?: string;
  containerClassName?: string;
  contentClassName?: string;
  closeOnOverlayClick?: boolean;
};

const DEFAULT_OVERLAY = "bg-black/60 backdrop-blur-sm";
const DEFAULT_CONTAINER = "items-center justify-center";
const DEFAULT_CONTENT =
  "w-full max-w-lg rounded-2xl border border-white/10 bg-black/90 p-6 shadow-2xl";
const EXIT_TIMEOUT = 360;
const EASE_CLASS = "ease-[cubic-bezier(0.22,1,0.36,1)]";

export function Modal({
  open,
  onClose,
  children,
  overlayClassName,
  containerClassName,
  contentClassName,
  closeOnOverlayClick = true,
}: ModalProps) {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalElement(document.body);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), EXIT_TIMEOUT);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!portalElement || !mounted) {
    return null;
  }

  const handleOverlayClick = () => {
    if (!closeOnOverlayClick) return;
    onClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 px-4 py-6 sm:px-6 ${
        visible ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        onClick={handleOverlayClick}
        className={`absolute inset-0 transition-opacity duration-300 ${EASE_CLASS} ${
          overlayClassName || DEFAULT_OVERLAY
        } ${visible ? "opacity-100" : "opacity-0"}`}
      />
      <div className="relative flex h-full w-full">
        <div
          className={`relative flex h-full w-full ${
            containerClassName || DEFAULT_CONTAINER
          }`}
        >
          <div
            className={`relative will-change-[transform,opacity] transition-all duration-[360ms] ${EASE_CLASS} ${
              visible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-8 scale-90 opacity-0"
            } ${contentClassName || DEFAULT_CONTENT}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    portalElement,
  );
}

export default Modal;
