
import React, { useState, useRef, useEffect } from 'react';
import { storage, auth, db, cleanRecord } from '../../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { UserProfile, VideoPart, StorageProvider, UploadedMatch } from '../../types';
import { toast } from '../../utils/toast';

interface MatchUploadFormProps {
  userProfile?: UserProfile | null;
  onBack: () => void;
  matchId?: string;
}

const MatchUploadForm: React.FC<MatchUploadFormProps> = ({ userProfile, onBack, matchId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [loadingMatch, setLoadingMatch] = useState(false);
  
  // Storage Selection
  const [storageNode, setStorageNode] = useState<StorageProvider>('firebase');
  const [externalUrl, setExternalUrl] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [existingMatch, setExistingMatch] = useState<UploadedMatch | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userProfile?.isAdmin === true;
  const isMultiCloud = userProfile?.multiCloudEnabled === true;

  useEffect(() => {
    if (matchId) {
      const fetchMatch = async () => {
        setLoadingMatch(true);
        try {
          const docSnap = await getDoc(doc(db, "matches", matchId));
          if (docSnap.exists()) {
            const data = docSnap.data() as UploadedMatch;
            if (!isAdmin && data.userId !== auth.currentUser?.uid) {
              toast.error("Geen toegang tot dit bestand.");
              onBack();
              return;
            }
            setExistingMatch({ ...data, id: docSnap.id });
            setTitle(data.title);
            setDescription(data.description);
            setVisibility(data.visibility);
            setStorageNode(data.storageNode || 'firebase');
            if (data.storageNode === 'youtube') {
              setExternalUrl(`https://www.youtube.com/watch?v=${data.videoUrl}`);
            } else if (data.storageNode === 'external_vault') {
              setExternalUrl(data.videoUrl);
            }
            setIsLive(!!data.isLive);
          }
        } catch (e) {
          console.error("Error fetching match:", e);
        } finally {
          setLoadingMatch(false);
        }
      };
      fetchMatch();
    }
  }, [matchId]);

  useEffect(() => {
    if (userProfile && !isAdmin && !matchId) {
      toast.error("Alleen admins kunnen wedstrijden uploaden.");
      onBack();
    }
  }, [userProfile, isAdmin, onBack, matchId]);

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selected]);
  };

  const generateThumbnail = async (videoFile: File): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const url = URL.createObjectURL(videoFile);
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => video.currentTime = Math.min(2, video.duration / 2);
      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      video.load();
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    if (storageNode === 'firebase' && files.length === 0 && !matchId) return;
    if (storageNode === 'external_vault' && !externalUrl.trim()) return;
    if (storageNode === 'youtube' && !extractYoutubeId(externalUrl)) {
      toast.error("Ongeldige YouTube URL.");
      return;
    }
    
    if (!title.trim() || !auth.currentUser) return;

    setIsUploading(true);
    setAiStatus(matchId ? 'Updating Tactical Record...' : 'Establishing Uplink Cluster...');

    const matchIdToUse = matchId || crypto.randomUUID();
    let uploadedParts: VideoPart[] = existingMatch?.videoParts || [];
    let thumbnailUrl = existingMatch?.thumbnailUrl || "";
    
    try {
      // 1. Thumbnail Protocol
      if (storageNode === 'youtube') {
        const yid = extractYoutubeId(externalUrl);
        thumbnailUrl = `https://img.youtube.com/vi/${yid}/maxresdefault.jpg`;
      } else if (files.length > 0) {
        setAiStatus('Capturing Tactical Thumbnail...');
        const thumbBlob = await generateThumbnail(files[0]);
        if (thumbBlob) {
          const thumbPath = `matches/${auth.currentUser.uid}/${matchIdToUse}/thumbnail.jpg`;
          const thumbRef = ref(storage, thumbPath);
          await uploadBytes(thumbRef, thumbBlob);
          thumbnailUrl = await getDownloadURL(thumbRef);
        }
      }

      // 2. Data Ingestion Protocol
      if (storageNode === 'firebase' && files.length > 0) {
        uploadedParts = []; // Reset if new files are uploaded
        for (let i = 0; i < files.length; i++) {
          setCurrentFileIdx(i);
          const file = files[i];
          const storagePath = `matches/${auth.currentUser.uid}/${matchIdToUse}/part_${i}_${file.name}`;
          const storageRef = ref(storage, storagePath);
          const uploadTask = uploadBytesResumable(storageRef, file);
          setAiStatus(`Uplinking Segment ${i + 1}...`);
          const downloadURL = await new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snap) => {
                const fileProgress = (snap.bytesTransferred / snap.totalBytes) * 100;
                const totalProgress = ((i / files.length) * 100) + (fileProgress / files.length);
                setUploadProgress(totalProgress);
              }, 
              (err) => reject(err), 
              async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
            );
          });
          uploadedParts.push({ url: downloadURL, order: i, name: file.name });
        }
      } else if (storageNode === 'youtube') {
        const yid = extractYoutubeId(externalUrl);
        uploadedParts = [{ url: yid!, order: 0, name: "YOUTUBE_INTEL" }];
        setUploadProgress(100);
      } else if (storageNode === 'external_vault' && externalUrl !== existingMatch?.videoUrl) {
        uploadedParts = [{ url: externalUrl, order: 0, name: "EXTERNAL_SOURCE" }];
        setUploadProgress(100);
      }

      if (!matchId) {
        setAiStatus('Synthesizing Tactical Summary...');
        // ... AI summary logic ...
      }

      const matchData = cleanRecord({
        userId: existingMatch?.userId || auth.currentUser!.uid,
        ownerName: existingMatch?.ownerName || userProfile?.name || 'Coach',
        title: title.toUpperCase(),
        description: description,
        videoUrl: uploadedParts[0]?.url || existingMatch?.videoUrl,
        videoParts: uploadedParts,
        thumbnailUrl: thumbnailUrl,
        visibility: visibility,
        accessCode: visibility === 'private' ? (existingMatch?.accessCode || `H-${Math.random().toString(36).substring(2, 7).toUpperCase()}`) : null,
        updatedAt: Date.now(),
        storageNode: storageNode,
        isLive: isLive
      });

      if (matchId) {
        await updateDoc(doc(db, "matches", matchId), matchData);
        toast.success("Wedstrijd bijgewerkt.");
      } else {
        await addDoc(collection(db, "matches"), { ...matchData, createdAt: Date.now(), aiSummary: "Deployment analysis pending." });
        toast.success("Wedstrijd opgeslagen.");
      }
      onBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Onbekende fout";
      toast.error("Upload mislukt: " + msg);
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom duration-500 pb-32">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">{matchId ? 'DATA' : 'DATA'} <span className="text-indigo-400">{matchId ? 'MODIFICATION' : 'INGESTION'}</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">{matchId ? 'Update Tactical Record' : 'Initialize Tactical Record'}</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      {loadingMatch ? (
        <div className="py-32 flex justify-center"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <form onSubmit={handleUpload} className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-8 md:p-12 space-y-8 shadow-3xl">
          {isUploading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-10 animate-in zoom-in">
             <div className="relative">
                <div className="w-24 h-24 rounded-[2rem] bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center mx-auto animate-pulse">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">{aiStatus}</h3>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{Math.round(uploadProgress)}% Total Deployment</p>
             </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Target Storage Node</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-ha-bg border border-slate-900 rounded-2xl">
                 <button 
                  type="button" 
                  onClick={() => setStorageNode('firebase')} 
                  className={`py-4 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1 ${storageNode === 'firebase' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-600'}`}
                 >
                   <span>HQ</span>
                   <span className="text-[6px] opacity-60">(Cloud)</span>
                 </button>
                 <button 
                  type="button" 
                  onClick={() => setStorageNode('youtube')} 
                  className={`py-4 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1 ${storageNode === 'youtube' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-600'}`}
                 >
                   <span>YouTube</span>
                   <span className="text-[6px] opacity-60">(Embed)</span>
                 </button>
                 <button 
                  type="button" 
                  onClick={() => setStorageNode('external_vault')} 
                  className={`py-4 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-1 ${storageNode === 'external_vault' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}
                 >
                   <span>Vault</span>
                   <span className="text-[6px] opacity-60">(Private)</span>
                 </button>
              </div>
            </div>

            {storageNode === 'firebase' ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-12 border-4 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4 group transition-all cursor-pointer ${files.length > 0 ? 'bg-indigo-600/5 border-indigo-500/50' : 'bg-ha-bg border border-slate-800 hover:border-indigo-500/30'}`}
              >
                 <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${files.length > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-600 group-hover:scale-110'}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                 </div>
                 <p className="text-xs font-black uppercase italic tracking-widest text-slate-500">{files.length > 0 ? `${files.length} Segments Linked` : 'Select Tactical Segments'}</p>
                 <input required ref={fileInputRef} type="file" accept="video/*" multiple onChange={handleFileChange} className="hidden" />
              </div>
            ) : (
              <div className="space-y-4 animate-in slide-in-from-top-4">
                 <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">{storageNode === 'youtube' ? 'YouTube Video URL' : 'External Vault URL'}</label>
                 <div className="relative">
                   <input 
                    required 
                    type="url" 
                    value={externalUrl} 
                    onChange={e => setExternalUrl(e.target.value)}
                    placeholder={storageNode === 'youtube' ? "https://www.youtube.com/watch?v=..." : "https://cloud.provider.com/video.mp4"}
                    className={`w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs font-tactical tracking-widest outline-none focus:border-indigo-500 shadow-inner ${storageNode === 'youtube' ? 'text-red-400' : 'text-ha-brand'}`}
                   />
                 </div>
                 {storageNode === 'youtube' && (
                   <div className="flex items-center justify-between p-4 bg-ha-bg border border-slate-900 rounded-xl">
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLive ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-900 text-slate-600'}`}>
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Stream Mode</span>
                     </div>
                     <button 
                       type="button"
                       onClick={() => setIsLive(!isLive)}
                       className={`w-12 h-6 rounded-full transition-all relative ${isLive ? 'bg-red-600' : 'bg-slate-800'}`}
                     >
                       <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isLive ? 'left-7' : 'left-1'}`}></div>
                     </button>
                   </div>
                 )}
                 <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest text-center italic">
                   {storageNode === 'youtube' ? 'Video speelt direct in de app zonder door te sturen naar YouTube.' : 'HoopsAtlas refereert naar deze externe bron voor tactische analyse.'}
                 </p>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Operation Identity</label>
                 <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="TITLE..." className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-black uppercase outline-none focus:border-indigo-500 shadow-inner" />
              </div>
              <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Objective Context</label>
                 <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="DESCRIBE THE TACTICAL PURPOSE..." className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-medium h-32 resize-none outline-none focus:border-indigo-500 shadow-inner" />
              </div>
              <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Visibility</label>
                 <select 
                  value={visibility} 
                  onChange={e => setVisibility(e.target.value as 'public' | 'private')}
                  className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-black uppercase outline-none focus:border-indigo-500 shadow-inner"
                 >
                   <option value="public">Public (Visible for all)</option>
                   <option value="private">Private (Access code required)</option>
                 </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isUploading}
              aria-disabled={isUploading}
              className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.3em] shadow-2xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {matchId ? 'SYNCHRONIZE TACTICAL RECORD' : 'INITIATE CLUSTER DEPLOYMENT'}
            </button>
          </>
        )}
      </form>
      )}
    </div>
  );
};

export default MatchUploadForm;
