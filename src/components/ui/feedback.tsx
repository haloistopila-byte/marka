import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Button, Dialog, EASE, cx } from './index';

/**
 * In-app feedback instead of the browser's alert() and confirm():
 *   notify('Tersimpan')                       a toast at the foot of the screen
 *   if (await confirmDialog({...})) { ... }   a dialog that names the object and the consequence
 */

export type ToastTone = 'info' | 'ok' | 'alert';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

let pushToast: ((t: Toast) => void) | null = null;
let seq = 0;

/** Guess the tone of an older message that did not say it. */
function toneOf(message: string): ToastTone {
  if (/gagal|ditolak|tidak dapat|tidak bisa|error|kesalahan|tidak valid|harus|wajib|belum lengkap|tidak ditemukan/i.test(message)) return 'alert';
  if (/berhasil|tersimpan|disimpan|sukses|disalin|terkirim|dicatat|selesai/i.test(message)) return 'ok';
  return 'info';
}

export function notify(message: string, tone?: ToastTone): void {
  const toast = { id: ++seq, message: String(message).trim(), tone: tone ?? toneOf(String(message)) };
  if (pushToast) pushToast(toast);
  else console.info(toast.message);
}

const ICON: Record<ToastTone, React.ElementType> = { info: Info, ok: CheckCircle2, alert: AlertCircle };

export const Toaster: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    pushToast = t => setToasts(prev => [...prev.slice(-2), t]);
    return () => {
      pushToast = null;
    };
  }, []);
  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onDone: () => void }> = ({ toast, onDone }) => {
  useEffect(() => {
    const ms = Math.min(9000, 3200 + toast.message.length * 35);
    const t = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(t);
  }, [toast, onDone]);
  const Icon = ICON[toast.tone];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.24, ease: EASE }}
      role={toast.tone === 'alert' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg bg-night px-4 py-3 text-[13px] leading-5 text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,.45)]"
    >
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', toast.tone === 'alert' ? 'text-[#ff8f8a]' : toast.tone === 'ok' ? 'text-[#7fd49a]' : 'text-white/70')} strokeWidth={2} aria-hidden />
      <p className="min-w-0 flex-1 whitespace-pre-line">{toast.message}</p>
      <button type="button" onClick={onDone} aria-label="Tutup" className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-white/60 hover:text-white">
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </motion.div>
  );
};

// ------------------------------------------------------------------ confirm

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

let openConfirm: ((opts: ConfirmOptions, resolve: (ok: boolean) => void) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const options = typeof opts === 'string' ? { title: opts } : opts;
  return new Promise(resolve => {
    if (openConfirm) openConfirm(options, resolve);
    else resolve(window.confirm([options.title, typeof options.body === 'string' ? options.body : ''].filter(Boolean).join('\n\n')));
  });
}

export const ConfirmHost: React.FC = () => {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    openConfirm = (opts, resolve) => setState({ opts, resolve });
    return () => {
      openConfirm = null;
    };
  }, []);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const o = state?.opts;
  return (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={o?.title}
      description={o?.body}
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>{o?.cancelLabel || 'Batal'}</Button>
          <Button
            data-autofocus
            variant={o?.tone === 'danger' ? 'primary' : 'primary'}
            className={o?.tone === 'danger' ? 'bg-alert hover:bg-[#a91e23]' : undefined}
            onClick={() => close(true)}
          >
            {o?.confirmLabel || 'Lanjutkan'}
          </Button>
        </>
      }
    />
  );
};
