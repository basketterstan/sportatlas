
import React, { useState } from 'react';

interface WaitlistFormProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
}

const WaitlistForm: React.FC<WaitlistFormProps> = ({ isOpen, onClose, planName }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Using the exact URL provided by the user (note: usually 'formResponse' but following user 'formResonse')
    // and correctly mapping entry IDs.
    const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdUv58J7ZtgIr0DqAMoKgCpQjHMF0yZ2QgMdhjQvmy0jb03qg/formResponse';
    
    const formData = new FormData();
    formData.append('entry.977932265', planName);    // Basic/Pro selection
    formData.append('entry.1039839318', name);        // Name entry
    formData.append('entry.1824687541', email);       // Email entry

    try {
      await fetch(GOOGLE_FORM_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });
      
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        setIsSuccess(false);
        setName('');
        setEmail('');
      }, 2500);
    } catch (error) {
      console.error('Waitlist submission failed', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ha-bg/95 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-8 w-full max-w-sm space-y-8 animate-in zoom-in duration-300 relative shadow-3xl">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        {isSuccess ? (
          <div className="py-12 text-center space-y-6 animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-ha-brand/20 text-ha-brand rounded-full flex items-center justify-center mx-auto border border-ha-brand/40 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black italic uppercase tracking-tight text-white">Registered!</h3>
              <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">You are on the {planName} waitlist.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 text-center">
              <span className="inline-block px-3 py-1 bg-ha-brand/10 border border-ha-brand/20 rounded-md text-[8px] font-black text-ha-brand uppercase tracking-widest">Priority Access</span>
              <h3 className="text-3xl font-black text-white italic uppercase tracking-tight">Join <span className="text-ha-brand">{planName}</span> Waitlist</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Early adopters get exclusive lifetime <br/> discounts and first-look features.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1">Your Name</label>
                <input 
                  required
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="COACH NAME"
                  className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white font-black uppercase tracking-widest focus:ring-1 focus:ring-ha-brand outline-none placeholder:text-slate-900 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1">Email Address</label>
                <input 
                  required
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="COACH@EXAMPLE.COM"
                  className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white font-black uppercase tracking-widest focus:ring-1 focus:ring-ha-brand outline-none placeholder:text-slate-900 transition-all"
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-5 bg-gradient-to-r from-ha-brand to-indigo-500 disabled:opacity-50 text-slate-950 font-black uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-[0.98] shadow-[0_10px_30px_rgba(6,182,212,0.3)] text-[11px]"
              >
                {isSubmitting ? 'SECURE POSITION...' : 'CLAIM PRIORITY SPOT'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default WaitlistForm;
