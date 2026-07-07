
import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAppContext } from '../../contexts/AppContext';

interface PartnerPageProps {
  onBack: () => void;
}

type PartnerType = 'club' | 'coach' | 'business' | 'influencer' | 'basketball-page' | 'other';

const PARTNER_TYPES: { value: PartnerType; label: string }[] = [
  { value: 'club', label: 'Basketball Club' },
  { value: 'coach', label: 'Coach' },
  { value: 'business', label: 'Business' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'basketball-page', label: 'Basketball Page / Community' },
  { value: 'other', label: 'Other' },
];

const PartnerPage: React.FC<PartnerPageProps> = ({ onBack }) => {
  const { user, userProfile } = useAppContext();

  // Dashboard state
  const [approvedApp, setApprovedApp] = useState<any | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [socialLink, setSocialLink] = useState('');
  const [partnerType, setPartnerType] = useState<PartnerType>('club');
  const [promotionPlan, setPromotionPlan] = useState('');
  const [desiredCode, setDesiredCode] = useState('');
  const [paymentInfo, setPaymentInfo] = useState('');
  const [extraMessage, setExtraMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill form with logged-in user data
  useEffect(() => {
    if (userProfile?.name) setName(userProfile.name);
    if (userProfile?.email) setEmail(userProfile.email);
  }, [userProfile]);

  // Check if logged-in user has an approved (or pending) application
  useEffect(() => {
    const checkApplication = async () => {
      const emailToCheck = userProfile?.email || user?.email;
      if (!emailToCheck) { setLoadingApp(false); return; }

      try {
        const q = query(collection(db, 'partner_applications'), where('email', '==', emailToCheck));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const app = { ...snap.docs[0].data(), id: snap.docs[0].id };
          if (app.status === 'approved') {
            setApprovedApp(app);
          } else if (app.status === 'pending') {
            setHasPending(true);
          }
        }
      } catch (e) {
        console.warn('Could not check partner application:', e);
      } finally {
        setLoadingApp(false);
      }
    };
    checkApplication();
  }, [user, userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'partner_applications'), {
        name,
        email: email.toLowerCase().trim(),
        organization,
        socialLink,
        partnerType,
        promotionPlan,
        desiredCode: desiredCode.toUpperCase().trim(),
        paymentInfo,
        extraMessage,
        status: 'pending',
        createdAt: Date.now(),
        basicUses: 0,
        proUses: 0,
        paidOut: 0,
      });
      setIsSuccess(true);
    } catch (err) {
      console.error('Partner application failed:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full bg-ha-bg border border-slate-800 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800";
  const labelClass = "text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1";

  // ─── DASHBOARD VIEW ────────────────────────────────────────────────────────
  if (!loadingApp && approvedApp) {
    const basicUses: number = approvedApp.basicUses || 0;
    const proUses: number = approvedApp.proUses || 0;
    const totalEarned: number = basicUses * 3 + proUses * 5;
    const paidOut: number = approvedApp.paidOut || 0;
    const pending: number = totalEarned - paidOut;

    return (
      <div className="max-w-4xl mx-auto py-12 px-6 space-y-10 animate-in fade-in duration-700 pb-40">

        <div className="flex items-center justify-between sticky top-6 z-[100] bg-ha-bg p-2 rounded-full border border-white/5">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] bg-slate-900 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all active:scale-95 shadow-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6" /></svg>
            Return to HQ
          </button>
          <div className="hidden md:flex items-center gap-3 px-6 text-[8px] font-black text-green-400 uppercase tracking-[0.4em]">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            Partner: Active
          </div>
        </div>

        {/* Welcome */}
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-ha-brand"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-ha-brand">Partner Dashboard</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-[0.85]">
            Welcome, <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand via-blue-500 to-indigo-500">{approvedApp.name?.split(' ')[0]}.</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-tight">Your partner account is active. Share your code and track your earnings below.</p>
        </section>

        {/* Code card */}
        <div className="bg-gradient-to-br from-ha-brand/10 to-blue-900/20 border border-ha-brand/20 rounded-[3rem] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center md:text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-ha-brand">Your Discount Code</p>
            <p className="text-6xl md:text-7xl font-black italic tracking-tighter text-white">{approvedApp.assignedCode || approvedApp.desiredCode}</p>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Customers get 50% off their first month</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(approvedApp.assignedCode || approvedApp.desiredCode);
              alert('Code copied!');
            }}
            className="px-8 py-4 bg-ha-brand text-slate-950 font-black uppercase tracking-[0.3em] rounded-[2rem] text-[11px] active:scale-95 transition-all shadow-[0_10px_30px_rgba(6,182,212,0.25)]"
          >
            Copy Code
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Basic Referrals', value: basicUses, color: 'text-white', sub: `€${basicUses * 3} earned` },
            { label: 'Pro Referrals', value: proUses, color: 'text-indigo-400', sub: `€${proUses * 5} earned` },
            { label: 'Total Earned', value: `€${totalEarned}`, color: 'text-ha-brand', sub: 'all time' },
            { label: 'Pending Payout', value: `€${pending}`, color: pending > 0 ? 'text-yellow-400' : 'text-slate-600', sub: `€${paidOut} already paid` },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="bg-[#0b1224] border border-slate-800 rounded-2xl p-6 space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">{label}</p>
              <p className={`text-3xl font-black italic ${color}`}>{value}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-700">{sub}</p>
            </div>
          ))}
        </div>

        {/* Commission reminder */}
        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commission Structure</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-slate-400">Basic subscriber</span>
              <span className="text-xl font-black italic text-ha-brand">€3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-slate-400">Pro subscriber</span>
              <span className="text-xl font-black italic text-indigo-400">€5</span>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payout Info</p>
            <p className="text-[10px] text-slate-600 font-medium leading-relaxed uppercase tracking-tight">
              Payouts are processed manually. We will contact you via email once your balance reaches €10 or more.
            </p>
            <p className="text-[9px] text-slate-700 font-black uppercase tracking-widest">Registered: {approvedApp.paymentInfo || '—'}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 opacity-20">
          <p className="text-center text-[8px] font-black text-slate-600 uppercase tracking-[0.5em]">SPORTATLAS PARTNER PROGRAM • EST. 2026</p>
        </div>
      </div>
    );
  }

  // ─── PENDING STATE ─────────────────────────────────────────────────────────
  if (!loadingApp && hasPending) {
    return (
      <div className="max-w-2xl mx-auto py-24 px-6 text-center space-y-8 animate-in fade-in">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] bg-slate-900 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6" /></svg>
          Return to HQ
        </button>
        <div className="w-20 h-20 bg-yellow-400/10 border border-yellow-400/20 rounded-full flex items-center justify-center mx-auto text-3xl">⏳</div>
        <div className="space-y-2">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">Application Pending</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-tight">Your application is being reviewed. We'll contact you via email within a few days.</p>
        </div>
      </div>
    );
  }

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (loadingApp) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 bg-ha-brand rounded-xl animate-pulse" />
      </div>
    );
  }

  // ─── APPLICATION FORM ──────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-16 animate-in fade-in duration-700 pb-40">

      <div className="flex items-center justify-between sticky top-6 z-[100] bg-ha-bg p-2 rounded-full border border-white/5">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] bg-slate-900 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all active:scale-95 shadow-xl">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6" /></svg>
          Return to HQ
        </button>
        <div className="hidden md:flex items-center gap-4 px-6 text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Partner Program: Open</span>
          <div className="w-1 h-1 bg-ha-brand rounded-full animate-pulse shadow-[0_0_8px_#06b6d4]"></div>
        </div>
      </div>

      <section className="space-y-6 text-center md:text-left">
        <div className="space-y-4">
          <div className="flex items-center justify-center md:justify-start gap-3">
            <div className="h-px w-12 bg-ha-brand"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-ha-brand">Partner Program</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-[0.8] drop-shadow-2xl">
            BECOME A <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand via-blue-500 to-indigo-600">PARTNER.</span>
          </h1>
        </div>
        <p className="max-w-xl text-slate-500 text-sm md:text-lg font-medium leading-relaxed uppercase tracking-tight mx-auto md:mx-0">
          Promote SportAtlas to your community and earn commissions for every new paying member you bring in.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { step: '01', title: 'Apply', desc: 'Fill in the form below. We review every application manually and get back to you within a few days.', color: 'text-ha-brand', border: 'border-ha-brand/20', bg: 'bg-ha-brand/5' },
          { step: '02', title: 'Get Your Code', desc: 'After approval you receive a personal discount code. Your followers get 50% off their first month.', color: 'text-blue-400', border: 'border-blue-400/20', bg: 'bg-blue-400/5' },
          { step: '03', title: 'Earn Commissions', desc: 'You earn €3 per new Basic subscriber and €5 per new Pro subscriber — one-time per new customer.', color: 'text-indigo-400', border: 'border-indigo-400/20', bg: 'bg-indigo-400/5' },
        ].map(({ step, title, desc, color, border, bg }) => (
          <div key={step} className={`${bg} border ${border} rounded-[2.5rem] p-8 space-y-4`}>
            <span className={`text-[10px] font-black uppercase tracking-[0.5em] ${color}`}>Step {step}</span>
            <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">{title}</h3>
            <p className="text-slate-500 text-xs font-medium leading-relaxed uppercase tracking-tight">{desc}</p>
          </div>
        ))}
      </section>

      <section className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-8 md:p-12 space-y-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter">Commission Structure</h2>
          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">One-time per new paying customer — not recurring</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-ha-bg border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Basic Plan</p>
              <p className="text-white font-black italic text-lg uppercase mt-1">New Basic Subscriber</p>
              <p className="text-[10px] text-slate-600 font-black uppercase mt-2">Customer gets 50% off first month</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black italic text-ha-brand">€3</p>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">per referral</p>
            </div>
          </div>
          <div className="bg-ha-bg border border-indigo-500/20 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Pro Plan</p>
              <p className="text-white font-black italic text-lg uppercase mt-1">New Pro Subscriber</p>
              <p className="text-[10px] text-slate-600 font-black uppercase mt-2">Customer gets 50% off first month</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black italic text-indigo-400">€5</p>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">per referral</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-[#0b1224] border border-slate-800 p-8 md:p-12 rounded-[3.5rem] shadow-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-ha-brand/5 blur-[100px] rounded-full pointer-events-none"></div>

          {isSuccess ? (
            <div className="py-20 text-center space-y-6 animate-in fade-in zoom-in">
              <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black italic uppercase text-white">Application Sent</h3>
                <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Thank you for your application. We will review your request and contact you soon.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="space-y-1">
                <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter">Apply Now</h2>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">All applications are reviewed manually</p>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Full Name</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={inputClass} />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Club, Business, Page or Community Name</label>
                <input required type="text" value={organization} onChange={e => setOrganization(e.target.value)} placeholder="e.g. BC Brussels, CoachJohn, HoopLife Belgium" className={inputClass} />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Website or Social Media Link</label>
                <input required type="url" value={socialLink} onChange={e => setSocialLink(e.target.value)} placeholder="https://instagram.com/yourpage" className={inputClass} />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Type of Partner</label>
                <select required value={partnerType} onChange={e => setPartnerType(e.target.value as PartnerType)} className={inputClass + " appearance-none cursor-pointer"}>
                  {PARTNER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>How do you plan to promote SportAtlas?</label>
                <textarea required value={promotionPlan} onChange={e => setPromotionPlan(e.target.value)} placeholder="e.g. Instagram posts, newsletter, club announcements, YouTube videos..." className={inputClass + " min-h-[100px] resize-none"} />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Desired Discount Code</label>
                <input
                  required
                  type="text"
                  value={desiredCode}
                  onChange={e => setDesiredCode(e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="e.g. BCBRUSSELS or COACHJOHN"
                  maxLength={20}
                  className={inputClass + " uppercase tracking-widest font-bold"}
                />
                <p className="text-[9px] text-slate-700 font-black uppercase tracking-widest ml-1">Letters and numbers only, no spaces. Final code may be adjusted.</p>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Bank Account (IBAN) or PayPal Email</label>
                <input
                  required
                  type="text"
                  value={paymentInfo}
                  onChange={e => setPaymentInfo(e.target.value)}
                  placeholder="BE68 5390 0754 7034 or you@paypal.com"
                  className={inputClass}
                />
                <p className="text-[9px] text-slate-700 font-black uppercase tracking-widest ml-1">Used for commission payouts only. Kept confidential.</p>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Extra Message (Optional)</label>
                <textarea value={extraMessage} onChange={e => setExtraMessage(e.target.value)} placeholder="Anything else you'd like us to know..." className={inputClass + " min-h-[80px] resize-none"} />
              </div>

              {error && <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">{error}</p>}

              <button type="submit" disabled={isSubmitting} className="w-full py-5 bg-ha-brand disabled:opacity-50 text-slate-950 font-black uppercase tracking-[0.3em] rounded-[2rem] transition-all active:scale-95 shadow-[0_20px_40px_rgba(6,182,212,0.2)] text-[12px]">
                {isSubmitting ? 'SENDING...' : 'SUBMIT APPLICATION'}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900/50 border border-white/5 p-10 rounded-[3rem] space-y-6">
            <h3 className="text-xl font-black italic uppercase text-white tracking-tight">Who Can Apply?</h3>
            <div className="space-y-5">
              {[
                { icon: '🏀', title: 'Basketball Clubs', desc: 'Share your code with members, parents, and fans.' },
                { icon: '📋', title: 'Coaches', desc: 'Recommend SportAtlas to your players and fellow coaches.' },
                { icon: '📱', title: 'Influencers & Pages', desc: 'Basketball Instagram, TikTok, or YouTube creators.' },
                { icon: '🏢', title: 'Businesses', desc: 'Sports shops, academies, or any basketball-related business.' },
                { icon: '👥', title: 'Communities', desc: 'WhatsApp groups, Discord servers, or local leagues.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-10 h-10 bg-ha-brand/10 rounded-xl flex items-center justify-center text-lg shrink-0 border border-ha-brand/20">{icon}</div>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase tracking-widest">{title}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/5 p-10 rounded-[3rem] space-y-4">
            <h3 className="text-xl font-black italic uppercase text-white tracking-tight">Questions?</h3>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight leading-relaxed">
              Contact us at <span className="text-ha-brand">contact@sportatlas.com</span> if you have questions before applying.
            </p>
            <p className="text-[9px] text-slate-700 font-black uppercase tracking-widest leading-relaxed">
              Applications are reviewed within 3–5 business days. You will be contacted via email.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 opacity-20">
        <p className="text-center text-[8px] font-black text-slate-600 uppercase tracking-[0.5em]">SPORTATLAS PARTNER PROGRAM • EST. 2026</p>
      </div>
    </div>
  );
};

export default PartnerPage;
