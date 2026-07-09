
import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { SubscriptionPlan, ViewState } from '../../types';
import { auth, db } from '../../utils/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SubscriptionPlan;
  price: string;
  period: string;
  lookupKey: string; 
  onSuccess: () => void;
  onNavigate: (view: ViewState) => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose, plan, price, period, lookupKey }) => {
  const [status, setStatus] = useState<'idle' | 'creating' | 'waiting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showBenefits, setShowBenefits] = useState(true);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const isSubmitting = status === 'creating' || status === 'waiting';
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setStatus('idle');
      setShowBenefits(true);
      setRetryCooldown(0);
      submittingRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (retryCooldown <= 0) return;
    const t = setTimeout(() => setRetryCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [retryCooldown]);

  const features = {
    basic: [
      "20 Tactical Units (Drills)",
      "4 Active Tournaments",
      "PDF Tactical Exports",
      "Basic Analytics Dashboard",
      "Community Access"
    ],
    pro: [
      "Unlimited Tactical Units",
      "Unlimited Tournaments",
      "Full Squad Hub Access",
      "Playbook",
      "Tactical AI Vision",
      "Magic Coach Synthesis",
      "Advanced Team Stats"
    ],
    club10: [
      "Everything in Pro",
      "Up to 10 Staff Members",
      "Centralized Club Library",
      "Club-wide Analytics",
      "Priority Support"
    ],
    club20: [
      "Everything in Pro",
      "Up to 20 Staff Members",
      "Centralized Club Library",
      "Club-wide Analytics",
      "Priority Support"
    ],
    clubunlimited: [
      "Everything in Pro",
      "Unlimited Staff Members",
      "Centralized Club Library",
      "Club-wide Analytics",
      "White-glove Onboarding"
    ],
    gameanalysis: [
      "8 hours of AI game analysis per month",
      "Automatic team & player insights",
      "Offensive and defensive analysis",
      "Key moments and coaching points",
      "Match reports with improvement areas",
      "Perfect for serious coaches & competitive teams"
    ]
  };

  const currentFeatures = features[plan.toLowerCase() as keyof typeof features] || [];

  const handleCheckout = async () => {
    if (submittingRef.current || isSubmitting) return;
    submittingRef.current = true;
    if (!auth.currentUser) {
      submittingRef.current = false;
      setErrorMessage("Authentication failed. Please log in again.");
      return;
    }

    if (!lookupKey || lookupKey.trim() === "") {
      setErrorMessage("Price Configuration Error: Missing Stripe ID for this tier. Please contact support.");
      setStatus('error');
      submittingRef.current = false;
      return;
    }

    setStatus('creating');
    const uid = auth.currentUser.uid;
    console.log(`[log] - Initiating Stripe session for UID: ${uid}, Price: ${lookupKey}`);
    try {
      const baseUrl = Capacitor.isNativePlatform()
        ? 'https://app.sportatlas.app'
        : window.location.origin;
      const sessionDocRef = await addDoc(collection(db, 'customers', uid, 'checkout_sessions'), {
        price: lookupKey,
        success_url: baseUrl + '/?status=success',
        cancel_url: baseUrl + '/?status=cancelled',
        mode: 'subscription',
        allow_promotion_codes: true,
        currency: 'eur',
      });
      console.log(`[log] - Session doc created: ${sessionDocRef.id}, waiting for URL...`);
      setStatus('waiting');
      
      let unsub: () => void;

      const timeout = setTimeout(() => {
        console.error("[error] - Stripe session timeout: No URL received from extension.");
        setErrorMessage("Timeout: The payment server is not responding. Please ensure the Stripe extension is installed and configured in Firebase.");
        setStatus('error');
        if (unsub) unsub();
      }, 15000);

      unsub = onSnapshot(sessionDocRef, async (snap) => {
        const data = snap.data() as any;
        if (!data) return;
        console.log(`[log] - Session update: ${JSON.stringify(data)}`);
        if (data.url) {
          clearTimeout(timeout);
          console.log(`[log] - Redirecting to: ${data.url}`);
          unsub();
          if (Capacitor.isNativePlatform()) {
            onClose();
            await Browser.open({ url: data.url });
          } else {
            window.location.assign(data.url);
          }
        } else if (data.error) {
          console.error(`[error] - Stripe Session Error: ${data.error.message}`);
          const isIdempotencyError = data.error.message?.toLowerCase().includes('idempotent');
          if (isIdempotencyError) {
            // Cloud Functions can fire twice for the same document — keep listening for the URL
            console.log(`[log] - Idempotency conflict detected, continuing to listen for URL...`);
            return;
          }
          clearTimeout(timeout);
          setErrorMessage(data.error.message);
          setStatus('error');
          submittingRef.current = false;
          unsub();
        }
      });
    } catch (err: any) {
      console.error(`[error] - Firestore addDoc failed: ${err.message}`);
      setErrorMessage(err.message);
      setStatus('error');
      submittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ha-bg/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-md text-center shadow-3xl relative animate-in zoom-in duration-300">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className="space-y-8 py-4">
          <div className="w-20 h-20 bg-indigo-600/10 rounded-[2.25rem] flex items-center justify-center mx-auto border border-indigo-500/20 shadow-xl">
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-white uppercase italic tracking-tight">{plan} Upgrade</h3>
            <p className="text-white font-black text-lg">{price} / {period === 'month' ? 'month' : 'year'}</p>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Billed in EUR</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-left space-y-2">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-3">Subscription Terms</p>
            <TermRow icon="🔄" text={`Automatically renews ${period === 'month' ? 'every month' : 'every year'} at ${price}`} />
            <TermRow icon="❌" text="Cancel anytime in Google Play or App Settings before renewal date" />
            <TermRow icon="✅" text="A free plan is available — subscription is not required to use basic features" />
            <TermRow icon="💳" text="Payment processed securely via Stripe upon confirmation" />
          </div>


          {showBenefits ? (
            <div className="space-y-6">
              <div className="bg-slate-900/50 rounded-3xl p-6 border border-slate-800/50 text-left space-y-4">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2">Included Benefits:</p>
                <ul className="space-y-3">
                  {currentFeatures.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs font-bold text-slate-300">
                      <div className="w-5 h-5 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <button 
                onClick={() => setShowBenefits(false)} 
                className="w-full py-6 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-indigo-500 transition-all text-xs border-b-4 border-indigo-800"
              >
                Continue to Payment
              </button>
            </div>
          ) : status === 'idle' ? (
            <div className="space-y-6">
              <button onClick={handleCheckout} className="w-full py-6 bg-emerald-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-emerald-500 transition-all text-xs border-b-4 border-emerald-800">
                Launch Secure Checkout
              </button>
              <button onClick={() => setShowBenefits(true)} className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors">
                ← Back to benefits
              </button>
            </div>
          ) : status === 'error' ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-500 font-black uppercase">
                {errorMessage || "Connection Fault"}
              </div>
              <button
                onClick={() => { if (retryCooldown <= 0) setStatus('idle'); }}
                disabled={retryCooldown > 0}
                className="w-full py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {retryCooldown > 0 ? `Wait ${retryCooldown}s...` : 'Retry Connection'}
              </button>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_20px_rgba(99,102,241,0.2)]"></div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Establishing Secure Uplink...</p>
            </div>
          )}
          
          <div className="pt-4 border-t border-slate-900 space-y-2">
            <div className="flex items-center justify-center gap-3 opacity-40">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-[0.2em]">Stripe PCI-DSS Encryption</p>
            </div>
            <p className="text-[9px] text-slate-600 leading-relaxed text-center">
              Subscription automatically renews {period === 'month' ? 'monthly' : 'yearly'} at {price} unless cancelled at least 24 hours before the renewal date. Manage or cancel in your account settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const TermRow: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="flex items-start gap-2">
    <span className="text-xs shrink-0">{icon}</span>
    <p className="text-slate-400 text-[10px] leading-relaxed">{text}</p>
  </div>
);

export default CheckoutModal;
