'use client';

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  confirmDisabled?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  variant = 'danger',
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isDanger = variant === 'danger';
  const iconBg = isDanger ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
  const iconColor = isDanger ? 'var(--red)' : 'var(--orange, #f59e0b)';
  const buttonBg = isDanger ? 'var(--red, #ef4444)' : 'var(--orange, #f59e0b)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-5 w-80 shadow-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: iconBg }}>
          {isDanger ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: iconColor }} aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
        </div>
        <h3 id="confirm-dialog-title" className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>{title}</h3>
        <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>{description}</p>
        <div className="flex gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={confirmDisabled}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: buttonBg }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
