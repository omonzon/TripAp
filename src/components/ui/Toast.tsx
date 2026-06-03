import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Global toast state (simple pub/sub without adding another store)
let toastListeners: ((msg: ToastMessage) => void)[] = [];
export function showToast(msg: Omit<ToastMessage, 'id'>) {
  const full = { ...msg, id: Date.now().toString() + Math.random().toString(36).slice(2) };
  toastListeners.forEach((l) => l(full));
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-green-500" />,
  error:   <AlertCircle  size={18} className="text-red-500"   />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info:    <Info          size={18} className="text-blue-500"  />,
};

const BG: Record<ToastType, string> = {
  success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  error:   'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  warning: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  info:    'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
};

export function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, msg.duration ?? 4000);
    };
    toastListeners.push(handler);
    return () => { toastListeners = toastListeners.filter((l) => l !== handler); };
  }, []);

  return (
    <div
      className="fixed bottom-20 md:bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`
            flex items-start gap-3 p-3 rounded-xl border shadow-lg
            animate-slide-up cursor-pointer
            ${BG[toast.type]}
          `}
          onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        >
          {ICONS[toast.type]}
          <p className="text-sm flex-1 text-slate-800 dark:text-slate-200 leading-snug">
            {toast.message}
          </p>
          <button aria-label="Dismiss" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
