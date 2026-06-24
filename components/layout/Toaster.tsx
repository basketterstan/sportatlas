import React, { useState, useEffect } from 'react';
import { ToastItem, subscribeToToasts } from '../../utils/toast';

const COLORS: Record<ToastItem['type'], string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-ha-brand',
};

const ICONS: Record<ToastItem['type'], React.ReactNode> = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
    </svg>
  ),
};

const Toaster: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToToasts((item) => {
      setToasts(prev => [...prev, item]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id));
      }, 3500);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Meldingen"
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[500] flex flex-col gap-2 items-center pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          aria-atomic="true"
          className={`${COLORS[t.type]} text-white flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl font-black text-[11px] uppercase tracking-widest animate-in slide-in-from-top-2 duration-300`}
        >
          {ICONS[t.type]}
          {t.message}
        </div>
      ))}
    </div>
  );
};

export default Toaster;
