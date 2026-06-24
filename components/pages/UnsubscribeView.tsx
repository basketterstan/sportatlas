
import React, { useEffect, useState } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';

interface UnsubscribeViewProps {
  onBack: () => void;
}

const UnsubscribeView: React.FC<UnsubscribeViewProps> = ({ onBack }) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Just fetch the email to show the user what they are doing
    const fetchUser = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setUserEmail(currentUser.email);
      } else {
        // If somehow they got here without auth, it's an error
        setStatus('error');
      }
    };
    fetchUser();
  }, []);

  const handleConfirmUnsubscribe = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setStatus('error');
      return;
    }

    setStatus('processing');
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { isSubscribed: false });
      setStatus('success');
    } catch (e) {
      console.error("Unsubscribe error", e);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-ha-bg flex flex-col items-center justify-center p-8 font-sans">
      <div className="w-full max-w-sm bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 text-center space-y-8 animate-in zoom-in shadow-3xl">
        
        <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl mb-4">
          <span className="text-white font-black text-2xl italic">H</span>
        </div>

        {status === 'idle' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="space-y-2">
              <h3 className="text-2xl font-black italic uppercase text-white tracking-tight">Email Opt-Out</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                You are currently logged in as:<br/>
                <span className="text-ha-brand italic block mt-1">{userEmail || '...'}</span>
              </p>
            </div>
            
            <div className="p-5 bg-ha-bg border border-slate-900 rounded-2xl">
               <p className="text-[9px] text-slate-600 font-medium uppercase leading-relaxed">
                 By confirming, you will stop receiving tactical updates and platform news.
               </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleConfirmUnsubscribe}
                className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all shadow-xl shadow-red-900/20"
              >
                Confirm Unsubscribe
              </button>
              <button 
                onClick={onBack}
                className="w-full py-4 bg-slate-900 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all"
              >
                Keep me Subscribed
              </button>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="space-y-6 py-10">
            <div className="w-12 h-12 border-4 border-ha-brand border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Processing Request...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-8 animate-in zoom-in">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black italic uppercase text-white">Action Complete</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                You have been successfully removed from our distribution list.
              </p>
            </div>
            <button 
              onClick={onBack} 
              className="w-full py-5 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all shadow-xl"
            >
              Return to Home
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto text-red-500">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black italic uppercase text-white">Session Fault</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                Identity verification failed. Please log in again to manage your settings.
              </p>
            </div>
            <button 
              onClick={onBack} 
              className="w-full py-5 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all shadow-xl"
            >
              Back to Home
            </button>
          </div>
        )}
        
        <p className="text-[8px] font-black text-slate-800 uppercase tracking-[0.5em] pt-4">SportAtlas Privacy Protocol</p>
      </div>
    </div>
  );
};

export default UnsubscribeView;
