import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width class, default is max-w-md */
  maxWidth?: string;
  /** Whether to show close button, default true */
  showClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md',
  showClose = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        className={`
          relative z-10 w-full ${maxWidth}
          my-auto
          max-h-[90vh] flex flex-col
          bg-[var(--color-surface)] rounded-[var(--radius-xl)]
          shadow-[var(--shadow-lg)]
          border border-[var(--color-border)]
          overflow-hidden
        `}
        style={{ animation: 'modal-in 200ms cubic-bezier(0.32,0.72,0,1) both' }}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
            {title && (
              <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="
                  p-1.5 rounded-[var(--radius-sm)]
                  text-[var(--color-text-3)] hover:text-[var(--color-text)]
                  hover:bg-[var(--color-surface-2)]
                  transition-colors duration-150
                  cursor-pointer
                "
                aria-label="Close"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Body with min-h-0 so flex child can shrink and scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-2)]">{message}</p>
    </Modal>
  );
}
