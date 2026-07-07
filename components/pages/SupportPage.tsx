
import React, { useState, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../utils/firebase';
import DonateModal from '../misc/DonateModal';

interface SupportPageProps {
  onBack: () => void;
}

const SupportPage: React.FC<SupportPageProps> = ({ onBack }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<{url: string, name: string} | null>(null);
  const [showDonate, setShowDonate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    const fileId = crypto.randomUUID();
    const storagePath = `feedback-attachments/${auth.currentUser.uid}/${fileId}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      }, 
      (error) => {
        console.error("Upload failed", error);
        setUploadProgress(null);
        alert("File upload failed.");
      }, 
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setAttachment({ url: downloadURL, name: file.name });
        setUploadProgress(null);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "feedback"), {
        name,
        email,
        content: question,
        userId: auth.currentUser?.uid || 'anonymous',
        type: 'general',
        attachment: attachment || null,
        createdAt: Date.now(),
        status: 'new'
      });

      const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-FFLEi_FxOfes8RtN4aEKhkisTwazbYOwYejdRgozfI1y1w/formResponse';
      const formData = new FormData();
      formData.append('entry.1029448291', name);
      formData.append('entry.218947921', email);
      formData.append('entry.315525986', `${question}${attachment ? `\n\n[Attachment: ${attachment.name}]` : ''}`);

      await fetch(GOOGLE_FORM_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      });
      
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setName('');
        setEmail('');
        setQuestion('');
        setAttachment(null);
      }, 3000);
    } catch (error) {
      console.error('Submission failed', error);
      alert('Transmission failed. Check uplink.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-16 animate-in fade-in duration-700 pb-40">
      
      {/* TOP NAVIGATION HUD */}
      <div className="flex items-center justify-between sticky top-6 z-[100] bg-ha-bg p-2 rounded-full border border-white/5">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] bg-slate-900 px-6 py-3 rounded-full border border-slate-800 hover:text-white transition-all active:scale-95 shadow-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Return to HQ
        </button>
        <div className="hidden md:flex items-center gap-4 px-6 text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Support Protocol: Active</span>
          <div className="w-1 h-1 bg-ha-brand rounded-full animate-pulse shadow-[0_0_8px_#06b6d4]"></div>
        </div>
      </div>

      {/* HERO SECTION */}
      <section className="space-y-6 text-center md:text-left">
        <div className="space-y-4">
          <div className="flex items-center justify-center md:justify-start gap-3">
             <div className="h-px w-12 bg-ha-brand"></div>
             <span className="text-[10px] font-black uppercase tracking-[0.5em] text-ha-brand">Command Support</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-[0.8] drop-shadow-2xl">
            DIRECT <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand via-blue-500 to-indigo-600">UPLINK.</span>
          </h1>
        </div>
        <p className="max-w-xl text-slate-500 text-sm md:text-lg font-medium leading-relaxed uppercase tracking-tight mx-auto md:mx-0">
          Report bugs, request tactical features, or contact the Command HQ directly for operational assistance.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* FORM SECTION */}
        <div className="bg-[#0b1224] border border-slate-800 p-8 md:p-12 rounded-[3.5rem] shadow-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-ha-brand/5 blur-[100px] rounded-full pointer-events-none"></div>
          
          {isSuccess ? (
            <div className="py-20 text-center space-y-6 animate-in fade-in zoom-in">
              <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black italic uppercase text-white">Transmitted</h3>
                <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Feedback sent to Command HQ.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Full Name</label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coach/Player Name" className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Contact Email</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Intel Message</label>
                <textarea required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Describe your issue or suggestion..." className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800 min-h-[150px] resize-none" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Attach Evidence (Optional)</label>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 bg-ha-bg border border-slate-800 rounded-2xl text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-3 hover:border-ha-brand/30 transition-all shadow-inner"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  {attachment ? `✓ ${attachment.name}` : uploadProgress ? `Uploading ${Math.round(uploadProgress)}%` : 'Select File/Screenshot'}
                </button>
              </div>

              <button type="submit" disabled={isSubmitting || uploadProgress !== null} className="w-full py-5 bg-ha-brand disabled:opacity-50 text-slate-950 font-black uppercase tracking-[0.3em] rounded-[2rem] transition-all active:scale-95 shadow-[0_20px_40px_rgba(6,182,212,0.2)] text-[12px]">
                {isSubmitting ? 'TRANSMITTING...' : 'SEND TO COMMAND HQ'}
              </button>
            </form>
          )}
        </div>

        {/* INFO SECTION */}
        <div className="space-y-10">
          <div className="bg-slate-900/50 border border-white/5 p-10 rounded-[3rem] space-y-6">
            <h3 className="text-xl font-black italic uppercase text-white tracking-tight">Operational Support</h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-ha-brand/10 rounded-xl flex items-center justify-center text-ha-brand shrink-0 border border-ha-brand/20">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">Help Center</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight mt-1 leading-relaxed">
                    Check our documentation for quick answers to common tactical questions.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-500/20">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">Direct Email</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight mt-1 leading-relaxed">
                    For urgent billing issues, contact us at <span className="text-indigo-400">support@sportatlas.com</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 rounded-[3rem] text-center space-y-6 shadow-2xl border border-white/10">
            <p className="text-[10px] font-black text-indigo-100 uppercase tracking-[0.3em]">Strategic Partner</p>
            <img 
              src="https://firebasestorage.googleapis.com/v0/b/hoopsatlas-e16e4.firebasestorage.app/o/basketvision_no_bg.png?alt=media&token=56ca9d2c-ba65-4cc5-a278-d7420f344804" 
              alt="BasketVision" 
              className="h-16 mx-auto brightness-0 invert opacity-80"
            />
            <p className="text-[9px] text-indigo-200 font-bold uppercase tracking-widest leading-relaxed">
              SportAtlas is powered by BasketVision Intelligence for advanced tactical analysis.
            </p>
          </div>
        </div>
      </div>

      {/* DONATE SECTION */}
      <section className="bg-gradient-to-br from-ha-brand/10 to-blue-900/20 border border-ha-brand/20 rounded-[3rem] p-10 md:p-14 text-center space-y-8 shadow-2xl">
        <div className="space-y-4">
          <div className="w-16 h-16 bg-ha-brand/10 rounded-[1.75rem] flex items-center justify-center mx-auto border border-ha-brand/20">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-tight">
            Steun de <span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand to-blue-400">Camera Man</span>
          </h2>
          <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-lg mx-auto uppercase tracking-tight">
            SportAtlas films games for free for the Belgian basketball community.
            Met een kleine donatie help je de kosten te dekken en dit vol te houden.
          </p>
        </div>
        <button
          onClick={() => setShowDonate(true)}
          className="inline-flex items-center gap-3 px-10 py-5 bg-ha-brand text-slate-950 font-black uppercase tracking-[0.3em] rounded-[2rem] transition-all active:scale-95 shadow-[0_20px_40px_rgba(6,182,212,0.25)] text-[13px] hover:shadow-[0_20px_40px_rgba(6,182,212,0.4)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          Steun SportAtlas
        </button>
        <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Veilig via Stripe • Eenmalig • Geen account nodig</p>
      </section>

      <div className="flex flex-col items-center gap-4 opacity-20">
        <p className="text-center text-[8px] font-black text-slate-600 uppercase tracking-[0.5em]">HOOPSATLAS SUPPORT PROTOCOL • EST. 2026</p>
      </div>

      <DonateModal isOpen={showDonate} onClose={() => setShowDonate(false)} />
    </div>
  );
};

export default SupportPage;
