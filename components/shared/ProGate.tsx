import React from 'react';
import { SubscriptionPlan } from '../../types';

interface ProGateProps {
  children: React.ReactNode;
  hasAccess: boolean;
  requiredPlan?: 'pro' | 'club';
  onUpgrade: (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;
}

const ProGate: React.FC<ProGateProps> = ({ children, hasAccess, requiredPlan = 'pro', onUpgrade }) => {
  if (hasAccess) return <>{children}</>;

  const isClub = requiredPlan === 'club';
  const plan: SubscriptionPlan = isClub ? 'club10' : 'pro';
  const label = isClub ? 'Club' : 'Pro';
  const price = isClub ? '€99.00/mo' : '€14.99/mo';
  const yearlyPrice = isClub ? '€999.00/year' : '€149.00/year';
  const color = isClub ? 'text-amber-400' : 'text-indigo-400';
  const bgColor = isClub ? 'bg-amber-500' : 'bg-indigo-500';
  const borderColor = isClub ? 'border-amber-500/30' : 'border-indigo-500/30';

  return (
    <div className="relative min-h-[60vh]">
      {/* Blurred preview */}
      <div className="pointer-events-none select-none blur-[3px] opacity-40 saturate-0">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-start justify-center pt-16 z-10">
        <div className={`mx-4 max-w-sm w-full bg-[#0a0f1e] border ${borderColor} rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl`}>
          <div className={`w-14 h-14 rounded-2xl bg-ha-bg border ${borderColor} flex items-center justify-center`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={color}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <div className="text-center space-y-2">
            <div className={`text-xs font-black uppercase tracking-widest ${color}`}>{label} Feature</div>
            <h3 className="text-white font-black text-xl uppercase italic tracking-tight">
              Upgrade Required
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              This feature is available on the <span className={`font-bold ${color}`}>{label}</span> plan. Upgrade to get full access.
            </p>
          </div>

          <div className="w-full space-y-3">
            <button
              onClick={() => onUpgrade(plan, 'month')}
              className={`w-full py-3.5 ${bgColor} text-white rounded-xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform shadow-lg`}
            >
              Upgrade to {label} — {price}
            </button>
            <button
              onClick={() => onUpgrade(plan, 'year')}
              className={`w-full py-3 bg-transparent border ${borderColor} text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 transition-transform`}
            >
              Yearly — {yearlyPrice} <span className="text-emerald-400">(-20%)</span>
            </button>
          </div>

          <div className="w-full bg-slate-900 rounded-xl p-3 space-y-1.5 text-left">
            <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest mb-2">Subscription Terms</p>
            <p className="text-[9px] text-slate-500 leading-relaxed">🔄 Automatically renews at the price shown above (monthly or yearly) until cancelled.</p>
            <p className="text-[9px] text-slate-500 leading-relaxed">❌ Cancel anytime in Settings before your renewal date.</p>
            <p className="text-[9px] text-slate-500 leading-relaxed">✅ A free plan is available — no subscription required for basic features.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProGate;
