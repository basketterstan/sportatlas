
import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface AccountDeletionProps {
  onBack: () => void;
}

const AccountDeletion: React.FC<AccountDeletionProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [requestType, setRequestType] = useState<'full' | 'data-only'>('full');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (requestType === 'full') {
        // Full account deletion via Cloud Function (GDPR Art. 17 — automated)
        const functions = getFunctions();
        const selfDelete = httpsCallable(functions, 'selfDeleteAccount');
        await selfDelete({});
      } else {
        // Partial data erasure — route via email since it requires manual review
        const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-FFLEi_FxOfes8RtN4aEKhkisTwazbYOwYejdRgozfI1y1w/formResponse';
        const formData = new FormData();
        formData.append('entry.1029448291', `PARTIAL DATA ERASURE: ${name}`);
        formData.append('entry.218947921', email);
        formData.append('entry.315525986', `Request Type: data-only. Reason: ${reason}.`);
        await fetch(GOOGLE_FORM_URL, { method: 'POST', mode: 'no-cors', body: formData });
      }
      setIsSuccess(true);
    } catch (error) {
      alert("Technical error. Please try again or contact support directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-12 animate-in fade-in duration-500 pb-32">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] bg-slate-900/50 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"></polyline></svg>
        Back
      </button>

      <div className="space-y-4">
        <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">
          Data <span className="text-red-500">Erasure</span>
        </h1>
        <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.5em] ml-1">SportAtlas Privacy & Compliance Protocol</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* INFO SECTION */}
        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-red-500 pl-4">Steps to Delete Data</h2>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              SportAtlas (the "App") allows you to remove all or specific tactical data:
            </p>
            <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-6">
              <div className="space-y-2">
                <p className="text-ha-brand text-[10px] font-black uppercase tracking-widest">Option 1: In-App (Instant)</p>
                <ul className="text-slate-300 text-xs font-bold uppercase space-y-2">
                  <li className="flex gap-3"><span className="text-slate-600 italic">1.</span> Open SportAtlas & Login</li>
                  <li className="flex gap-3"><span className="text-slate-600 italic">2.</span> Go to Platform Office (Settings)</li>
                  <li className="flex gap-3"><span className="text-slate-600 italic">3.</span> Tap "Permanently Delete Account"</li>
                </ul>
              </div>
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest">Option 2: Partial Request (48h)</p>
                <p className="text-slate-400 text-[10px] font-medium leading-relaxed uppercase">
                  Use the "Manual Request" form on this page to ask for specific data removal (e.g., just Drills or just Teams) while keeping your account active.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black uppercase italic tracking-widest text-white border-l-4 border-red-500 pl-4">Retention Policy</h2>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              We adhere to the following data lifecycles:
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-red-500/10 rounded flex items-center justify-center flex-shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                <div className="space-y-1">
                  <p className="text-slate-200 text-[10px] font-black uppercase">Tactical Drills & Diagrams</p>
                  <p className="text-slate-500 text-[9px] font-medium uppercase leading-tight">Deleted instantly upon request or account termination. No backups are retained.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-red-500/10 rounded flex items-center justify-center flex-shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                <div className="space-y-1">
                  <p className="text-slate-200 text-[10px] font-black uppercase">Team Rosters & Squads</p>
                  <p className="text-slate-500 text-[9px] font-medium uppercase leading-tight">Dissolved instantly. Connections between players and coaches are severed.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center flex-shrink-0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>
                <div className="space-y-1">
                  <p className="text-slate-400 text-[10px] font-black uppercase">Billing & Financial Logs</p>
                  <p className="text-slate-600 text-[9px] font-medium uppercase leading-tight italic">Anonymized but retained for 7 years for tax and legal compliance (standard EU/Global requirement).</p>
                </div>
              </li>
            </ul>
          </section>
        </div>

        {/* REQUEST FORM */}
        <div className="bg-[#0b1224] border border-slate-800 p-10 rounded-[3rem] shadow-3xl space-y-8 relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-red-500/5 blur-[100px] rounded-full"></div>
          
          {isSuccess ? (
            <div className="py-20 text-center space-y-6 animate-in zoom-in">
              <div className="w-20 h-20 bg-green-500/10 border-2 border-green-500/30 rounded-full flex items-center justify-center mx-auto text-green-500 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black italic uppercase text-white">Task Queued</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">Our data safety team will process this request within 48 hours.</p>
              </div>
              <button onClick={() => setIsSuccess(false)} className="text-[10px] font-black text-slate-700 uppercase tracking-widest underline">Submit another request</button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-2xl font-black italic uppercase text-white">Manual Request</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Formal request for data removal</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div className="grid grid-cols-2 gap-2 p-1 bg-ha-bg border border-slate-800 rounded-2xl">
                  <button type="button" onClick={() => setRequestType('full')} className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${requestType === 'full' ? 'bg-red-600 text-white' : 'text-slate-700'}`}>Full Wipeout</button>
                  <button type="button" onClick={() => setRequestType('data-only')} className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${requestType === 'data-only' ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>Partial Erase</button>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Account Email</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="COACH@EXAMPLE.COM" className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-black uppercase outline-none focus:border-red-500 transition-all shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Full Name</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="IDENTIFY YOURSELF" className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-black uppercase outline-none focus:border-red-500 transition-all shadow-inner" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">What should be deleted?</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="E.G. 'DELETE ALL MY DRILLS BUT KEEP MY ACCOUNT'..." className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-black uppercase outline-none focus:border-red-500 transition-all shadow-inner h-24 resize-none" />
                </div>
                
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full py-5 bg-red-600 text-white font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl shadow-xl hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'TRANSMITTING...' : 'INITIATE ERASURE'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-[8px] font-black text-slate-800 uppercase tracking-[0.5em]">SportAtlas • Data Privacy Protocol • Est. 2026</p>
    </div>
  );
};

export default AccountDeletion;
