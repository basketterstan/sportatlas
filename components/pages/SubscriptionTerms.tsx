
import React from 'react';
import { getTranslation } from '../../utils/i18n';

interface SubscriptionTermsProps {
  onBack: () => void;
}

const SubscriptionTerms: React.FC<SubscriptionTermsProps> = ({ onBack }) => {
  const t = getTranslation(null);
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-12 animate-in fade-in duration-500 pb-32">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] hover:text-white transition-all mb-8"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
        {t.back}
      </button>

      <div className="space-y-4">
        <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tight">Subscription <span className="text-purple-500">Terms</span></h1>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Last updated: {new Date().toLocaleDateString('en-US')}</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-10">
        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-purple-500 pl-4">1. Access Tiers</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            SportAtlas provides Free, Basic, and Pro tiers. Features are subject to current pricing at the time of purchase. By upgrading, you authorize automatic recurring billing through Stripe.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-purple-500 pl-4">2. Automatic Renewal</h2>
          <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2rem] space-y-4">
            <p className="text-slate-300 text-sm leading-relaxed">
              Paid subscriptions renew automatically at the interval chosen (monthly or yearly). Your payment method will be charged at the start of each billing period.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-purple-500 pl-4">3. Cancellation Policy</h2>
          <p className="text-slate-400 text-sm leading-relaxed font-bold">
            You are in full control. You can cancel your subscription at any time without penalty:
          </p>
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-4 shadow-xl">
             <p className="text-white text-xs font-black uppercase tracking-widest">Self-Service Cancellation:</p>
             <ol className="list-decimal pl-6 text-slate-400 text-xs space-y-3 font-medium">
               <li>Navigate to <span className="text-ha-brand">Settings</span> (Platform Office).</li>
               <li>Find the <span className="text-white italic">Subscription</span> section.</li>
               <li>Tap <span className="text-white italic">"Manage or Cancel Subscription"</span>.</li>
               <li>You will be redirected to the secure <span className="text-indigo-400">Stripe Billing Portal</span>.</li>
               <li>Follow the prompt to "Cancel Subscription" to stop future billing.</li>
             </ol>
             <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mt-4">
                <p className="text-indigo-400 text-[10px] font-bold leading-relaxed">
                  Upon cancellation, you will retain access to all paid features until the end of your current billing cycle. No further charges will occur.
                </p>
             </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-purple-500 pl-4">4. Refund Policy</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Due to the immediate access to digital tactical intelligence and AI cloud resources, we typically do not offer refunds for partially used periods. However, we encourage you to cancel early if you no longer wish to be billed.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-purple-500 pl-4">5. Support</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            For billing disputes or issues accessing the cancellation portal, contact tactical support via our in-app feedback channel.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SubscriptionTerms;
