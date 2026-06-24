import React, { useState } from 'react';
import { AppLanguage } from '../../utils/i18n';

interface LanguagePickerProps {
  show: boolean;
  onSelect: (lang: AppLanguage) => void;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({ show, onSelect }) => {
  const [exiting, setExiting] = useState(false);

  const handleSelect = (lang: AppLanguage) => {
    setExiting(true);
    setTimeout(() => onSelect(lang), 280);
  };

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl">

        {/* Icon */}
        <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>

        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] mb-2">Language / Idioma</p>
        <h2 className="text-2xl font-black text-white uppercase italic tracking-tight mb-2">
          Choose your language
        </h2>
        <p className="text-slate-400 text-xs mb-2">Elige tu idioma</p>
        <p className="text-slate-600 text-[10px] mb-10 uppercase tracking-widest font-black">You can change this later in settings</p>

        <div className="space-y-3">
          <button
            onClick={() => handleSelect('en')}
            className="w-full py-5 font-black uppercase tracking-[0.15em] rounded-2xl text-sm border-b-4 transition-all shadow-xl bg-indigo-600 hover:bg-indigo-500 border-indigo-800 text-white flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🇬🇧</span>
            English
          </button>
          <button
            onClick={() => handleSelect('es')}
            className="w-full py-5 font-black uppercase tracking-[0.15em] rounded-2xl text-sm border-b-4 transition-all shadow-xl bg-slate-800 hover:bg-slate-700 border-slate-900 text-white flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🇪🇸</span>
            Español
          </button>
        </div>
      </div>
    </div>
  );
};

export default LanguagePicker;
