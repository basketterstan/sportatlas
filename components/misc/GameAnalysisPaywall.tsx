
import React, { useState } from 'react';

interface GameAnalysisPaywallProps {
  onClose: () => void;
  onUpgrade: (cycle: 'month' | 'year') => void;
}

const GameAnalysisPaywall: React.FC<GameAnalysisPaywallProps> = ({ onClose, onUpgrade }) => {
  const [cycle, setCycle] = useState<'month' | 'year'>('year');

  const features = [
    { icon: '🎬', text: '8 hours of AI game analysis per month' },
    { icon: '📊', text: 'Automatic team & player insights' },
    { icon: '🏀', text: 'Offensive and defensive analysis' },
    { icon: '⚡', text: 'Key moments and coaching points' },
    { icon: '📋', text: 'Match reports with improvement areas' },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-ha-bg/98 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-md shadow-3xl relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="space-y-8 relative z-10">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xl shrink-0">
                🎬
              </div>
              <div>
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.4em]">Add-on</p>
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter leading-none">
                  Game Analysis <span className="text-orange-400">Pro</span>
                </h3>
              </div>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Take your coaching to the next level with AI-powered game analysis. Save hours of manual video work and get insights that make your team better.
            </p>
          </div>

          {/* Features */}
          <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800/50 space-y-3">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-base shrink-0">{f.icon}</span>
                <span className="text-xs font-bold text-slate-300">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Billing toggle */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setCycle('month')}
              className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                cycle === 'month'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Monthly<br />
              <span className="font-bold normal-case tracking-normal text-[10px] opacity-70">€49,99 / mo</span>
            </button>
            <button
              onClick={() => setCycle('year')}
              className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all relative ${
                cycle === 'year'
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-1 bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                −17%
              </span>
              <br />
              <span className="font-bold normal-case tracking-normal text-[10px] opacity-70">€499 / yr</span>
            </button>
          </div>

          {/* CTA */}
          <button
            onClick={() => onUpgrade(cycle)}
            className="w-full py-7 bg-gradient-to-br from-orange-500 to-orange-700 text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl active:scale-95 transition-all"
          >
            {cycle === 'month' ? 'Start for €49,99 / month' : 'Start for €499 / year'}
          </button>

          <p className="text-center text-[9px] text-slate-600 leading-relaxed">
            Subscription auto-renews. Cancel anytime via your billing portal.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GameAnalysisPaywall;
