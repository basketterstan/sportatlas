
import React, { useState, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../utils/firebase';

interface ContactFormProps {
  isOpen: boolean;
  onClose: () => void;
  isTesterFeedback?: boolean;
}

const ContactForm: React.FC<ContactFormProps> = ({ isOpen, onClose, isTesterFeedback = false }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<{url: string, name: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
      // 1. Sla op in Firestore voor Admin Dashboard
      await addDoc(collection(db, "feedback"), {
        name,
        email,
        content: question,
        userId: auth.currentUser?.uid || 'anonymous',
        type: isTesterFeedback ? 'tester' : 'general',
        attachment: attachment || null,
        createdAt: Date.now(),
        status: 'new'
      });

      // 2. Backup naar Google Forms (optioneel, zonder attachment)
      const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-FFLEi_FxOfes8RtN4aEKhkisTwazbYOwYejdRgozfI1y1w/formResponse';
      const formData = new FormData();
      const finalName = isTesterFeedback ? `[TESTER] ${name}` : name;
      formData.append('entry.1029448291', finalName);
      formData.append('entry.218947921', email);
      formData.append('entry.315525986', `${question}${attachment ? `\n\n[Attachment: ${attachment.name}]` : ''}`);

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
        setQuestion('');
        setAttachment(null);
      }, 2000);
    } catch (error) {
      console.error('Submission failed', error);
      alert('Transmission failed. Check uplink.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ha-bg/90 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-6 animate-in zoom-in duration-200 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        {isSuccess ? (
          <div className="py-8 text-center space-y-4 animate-in fade-in zoom-in">
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Transmitted</h3>
              <p className="text-slate-400 text-sm">Feedback sent to Command HQ.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-center">
              <h3 className="text-xl font-black italic uppercase text-white">{isTesterFeedback ? 'Alpha Feedback' : 'Direct Uplink'}</h3>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">Report bugs or request tactical features</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 ml-1">Full Name</label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coach/Player Name" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 ml-1">Contact Email</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 ml-1">Intel Message</label>
                <textarea required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Describe your issue or suggestion..." className="w-full bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-800 min-h-[100px] resize-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 ml-1">Attach Evidence (Optional)</label>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 bg-ha-bg border border-slate-800 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2 hover:border-ha-brand/30 transition-all"
                >
                  {attachment ? `✓ ${attachment.name}` : uploadProgress ? `Uploading ${Math.round(uploadProgress)}%` : 'Select File/Screenshot'}
                </button>
              </div>

              <button type="submit" disabled={isSubmitting || uploadProgress !== null} className={`w-full py-4 ${isTesterFeedback ? 'bg-amber-600' : 'bg-ha-brand'} disabled:opacity-50 text-slate-950 font-black uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-95 shadow-xl text-[11px]`}>
                {isSubmitting ? 'TRANSMITTING...' : 'SEND TO COMMAND HQ'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ContactForm;
