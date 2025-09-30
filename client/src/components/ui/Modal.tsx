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


type ModalPhase = "idle" | "entering" | "open" | "exiting";
const DEFAULT_OVERLAY = "bg-brand-deep/80 backdrop-blur-sm";
const DEFAULT_CONTAINER = "items-center justify-center";
const DEFAULT_CONTENT =
  "w-full max-w-lg rounded-3xl border border-brand-slate/40 bg-brand-night/95 p-6 shadow-brand-soft";

const ENTER_DURATION = 420;
const EXIT_DURATION = 320;

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
  const [phase, setPhase] = useState<ModalPhase>(open ? "open" : "idle");

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalElement(document.body);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase("entering");
      const timer = window.setTimeout(() => setPhase("open"), ENTER_DURATION);
      return () => window.clearTimeout(timer);
    }

    if (!mounted) {
      setPhase("idle");
      return;
    }

    setPhase("exiting");
    const timeout = window.setTimeout(() => {
      setMounted(false);
      setPhase("idle");
    }, EXIT_DURATION);
    return () => window.clearTimeout(timeout);
  }, [open, mounted]);


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


  const interactive = phase !== "exiting";
  const overlayAnimationClass =
    phase === "exiting"
      ? "animate-overlay-out"
      : phase === "open"
      ? "modal-overlay-open"
      : "animate-overlay-in";
  const contentAnimationClass =
    phase === "exiting"
      ? "animate-modal-out"
      : phase === "open"
      ? "modal-content-open"
      : "animate-modal-in";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 px-4 py-6 sm:px-6 ${
        interactive ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        onClick={handleOverlayClick}

        className={`absolute inset-0 ${overlayAnimationClass} ${
          overlayClassName || DEFAULT_OVERLAY
        }`}
      />
      <div className="relative flex h-full w-full">
        <div
          className={`relative flex h-full w-full ${
            containerClassName || DEFAULT_CONTAINER
          }`}
        >
          <div
            className={`relative will-change-[transform,opacity] ${contentAnimationClass} ${
              contentClassName || DEFAULT_CONTENT
            }`}
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
