import React, { useEffect, useState } from 'react';
import { usePricing } from '../../hooks/usePricing';

const STORAGE_KEY = 'ha_pro_upgrade_popup_dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface ProTrialPopupProps {
  onUpgrade: () => void;
  onDismiss?: () => void;
}

const ProTrialPopup: React.FC<ProTrialPopupProps> = ({ onUpgrade, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const prices = usePricing();

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION_MS) return;

    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
    onDismiss?.();
  };

  const handleUpgrade = () => {
    setVisible(false);
    onUpgrade();
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label="Pro upgrade offer"
    >
      <div className="bg-[#0b1224] border border-indigo-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(99,102,241,0.2)] relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          aria-label="Sluiten"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-600/15 rounded-2xl flex items-center justify-center border border-indigo-500/25 shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Pro Plan</p>
            <h3 className="text-white font-black text-base leading-tight mb-1">
              Upgrade naar Pro
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Onbeperkte drills, AI Vision, volledige Squad Hub — {prices.pro.monthly}/maand.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleUpgrade}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-[0.15em] rounded-xl transition-all border-b-2 border-indigo-800 shadow-lg"
          >
            Upgrade naar Pro
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-3 text-slate-500 hover:text-slate-300 font-black text-[10px] uppercase tracking-widest transition-colors"
          >
            Niet nu
          </button>
        </div>

        <p className="mt-3 text-center text-[9px] text-slate-600 font-bold leading-relaxed">
          {prices.pro.monthly}/maand · Automatisch verlengd · Altijd opzegbaar
        </p>
      </div>
    </div>
  );
};

export default ProTrialPopup;
