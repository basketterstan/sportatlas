
import React, { useState, useRef } from 'react';
import { Drill, DiagramBoard, VideoUpload, UserProfile, SkillFocus, Level } from '../../types';
import CoachBoard from '../shared/CoachBoard';
import { doc, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../utils/firebase';
import CommentsSection from './CommentsSection';
import VideoGenerator from './VideoGenerator';
import AdBanner from '../shared/AdBanner';
import { exportToPDF } from '../../utils/pdfExport';
import ShareModal from '../shared/ShareModal';

interface DrillDetailProps {
  drill: Drill;
  isOwn: boolean;
  userProfile?: UserProfile | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onTogglePin?: (id: string) => void;
  onVote?: (id: string, type: 'like' | 'dislike') => void;
  onUpgrade?: () => void;
  onStartDrill?: () => void;
  onLogin?: () => void;
  onAddToPlaybook?: (id: string) => void;
}

const DrillDetail: React.FC<DrillDetailProps> = ({ 
  drill, 
  isOwn,
  userProfile,
  onBack, 
  onEdit, 
  onDelete, 
  onToggleFavorite,
  onTogglePin,
  onLogin,
  onDuplicate,
  onAddToPlaybook,
  onUpgrade
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingDiagrams, setIsDownloadingDiagrams] = useState(false);
  const [showVideoGenerator, setShowVideoGenerator] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [showMotionModal, setShowMotionModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingToClub, setSharingToClub] = useState(false);
  
  // PDF State
  const [exportPhase, setExportPhase] = useState<'idle' | 'capturing' | 'generating'>('idle');
  const [renderedImages, setRenderedImages] = useState<string[]>([]);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const diagramRefs = useRef<(HTMLDivElement | null)[]>([]);

  const clubId = userProfile?.managedByUid || (userProfile?.plan?.includes('club') ? userProfile?.uid : null);
  const isInClub = !!clubId;
  const isSharedToClub = !!drill.clubId;

  const handleShareToClub = async () => {
    if (!isOwn || !clubId || sharingToClub) return;
    setSharingToClub(true);
    try {
      const newClubId = isSharedToClub ? null : clubId;
      await updateDoc(doc(db, 'drills', drill.id), { clubId: newClubId, updatedAt: Date.now() });
    } catch (err: any) {
      alert('Failed to update club sharing: ' + err.message);
    } finally {
      setSharingToClub(false);
    }
  };

  const handleShareDrill = async () => {
    const shareData = {
      title: `SportAtlas: ${drill.title}`,
      text: `Check out this ${drill.type === 'play' ? 'tactical play' : 'drill'} on SportAtlas: ${drill.title}`,
      url: `${window.location.origin}?drillId=${drill.id}`
    };
    
    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        alert("Link copied to clipboard!");
      } catch (err) {
        const mailto = `mailto:?subject=Check out this drill on SportAtlas&body=Hey! Check out this ${drill.type === 'play' ? 'play' : 'drill'} I found on SportAtlas: ${drill.title}. View it here: ${shareData.url}`;
        window.location.href = mailto;
      }
    }
  };

  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));

  const handleExportPDF = async () => {
    if (!isPaid) {
      alert("BASIC FEATURE: PDF Export is only available for Basic users and above.");
      return;
    }
    if (isExporting || !drill?.boards) return;
    setIsExporting(true);
    setExportPhase('capturing');
    try {
      const images: string[] = [];
      for (let i = 0; i < drill.boards.length; i++) {
        const target = diagramRefs.current[i];
        if (target) {
          const html2canvas = (await import('html2canvas')).default;
          const canvas = await html2canvas(target, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            logging: false,
            scrollX: 0,
            scrollY: 0
          });
          images.push(canvas.toDataURL("image/png"));
        }
      }
      setRenderedImages(images);
      setExportPhase('generating');
      
          // Wait for React to render the hidden PDF container
          setTimeout(async () => {
            try {
              const element = pdfContainerRef.current;
              if (!element) throw new Error("Print container not found");
              
              const filename = `HA_TACTICAL_${drill.title.replace(/\s+/g, '_').toUpperCase()}.pdf`;
              await exportToPDF(element, filename);
              
            } catch (e) { 
              console.error(e);
              alert("PDF generator error."); 
            } finally { 
              setIsExporting(false); 
              setExportPhase('idle'); 
              setRenderedImages([]); 
            }
          }, 1000);
    } catch (e) { 
      console.error(e);
      setIsExporting(false); 
      setExportPhase('idle'); 
    }
  };

  const handleDownloadDiagrams = async () => {
    if (isDownloadingDiagrams || !drill?.boards?.length) return;
    setIsDownloadingDiagrams(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      for (let i = 0; i < drill.boards.length; i++) {
        const target = diagramRefs.current[i];
        if (!target) continue;
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#0b1224',
          logging: false,
          scrollX: 0,
          scrollY: 0
        });
        const link = document.createElement('a');
        const label = drill.boards.length > 1 ? `_frame${i + 1}` : '';
        link.download = `HA_${drill.title.replace(/\s+/g, '_').toUpperCase()}${label}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (e) {
      console.error(e);
      alert("Download failed.");
    } finally {
      setIsDownloadingDiagrams(false);
    }
  };

  const handleVideoGenerated = async (url: string, blob: Blob) => {
    if (!isOwn || !auth.currentUser) return;
    setIsUploadingVideo(true);
    try {
      const filename = `motion_${drill.id}_${Date.now()}.webm`;
      const storagePath = `drills/${auth.currentUser.uid}/${drill.id}/${filename}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const newVideo: VideoUpload = { url: downloadURL, name: `Motion Sequence: ${drill.title}`, storagePath: storagePath };
      await updateDoc(doc(db, 'drills', drill.id), { videoUploads: arrayUnion(newVideo) });
      setShowVideoGenerator(false);
      alert("Motion video synchronized.");
    } catch (e) { alert("Error saving video."); } finally { setIsUploadingVideo(false); }
  };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'drills', drill.id)); onDelete(); } catch (e) { alert("Purge failed."); }
  };

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500">
      
      {/* EXPORT WORKSPACE */}
      <div 
        className="fixed top-0 w-full h-full pointer-events-none overflow-auto bg-white" 
        style={{ 
          left: exportPhase === 'generating' ? '0' : '-9999px',
          visibility: exportPhase === 'generating' ? 'visible' : 'hidden',
          zIndex: 9999
        }}
      >
        <div ref={pdfContainerRef} className="p-10 text-slate-900 bg-white w-[1000px] font-sans">
          <div className="border-b-4 border-slate-900 pb-6 mb-10 flex justify-between items-end">
            <div><h1 className="text-xl font-black uppercase italic text-indigo-600">HOOPSATLAS COMMAND</h1><h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">{drill.title}</h2></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-10">
            <div className="space-y-10">
              {renderedImages.map((img, idx) => (
                <div key={idx} className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
                  <p className="text-[9px] font-black uppercase text-slate-400 italic">Frame {idx + 1}</p>
                  <div className="border-4 border-slate-100 rounded-[1.5rem] overflow-hidden"><img src={img} className="w-full h-auto block" alt="Tactical Frame" /></div>
                </div>
              ))}
            </div>
            <div className="space-y-10">
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border-l-8 border-indigo-600">
                <h3 className="text-[10px] font-black uppercase mb-6 tracking-widest text-slate-400 italic">Protocol</h3>
                <div className="space-y-5">{drill.steps?.map((s, si) => (<div key={si} className="flex gap-4 items-start" style={{ pageBreakInside: 'avoid' }}><span className="text-xl font-black text-indigo-600 leading-none">{si + 1}</span><p className="text-xs uppercase font-bold text-slate-800 leading-tight">{s}</p></div>))}</div>
              </div>
              {drill.tips && (
                <div className="p-8 bg-slate-900 text-white rounded-[2rem]" style={{ pageBreakInside: 'avoid' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mb-2">Technical Insight</p>
                  <p className="text-[11px] italic uppercase leading-relaxed">{drill.tips}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="space-y-1">
            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">{drill.title}</h2>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{drill.focus} • {drill.duration} MIN</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {drill.boards && drill.boards.length > 1 && (
            <button 
              onClick={() => setShowMotionModal(true)}
              className="p-3 bg-indigo-600 border border-indigo-400 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-xl animate-pulse"
              title="Play Motion Sequence"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="m5 3 14 9-14 9V3z"/></svg>
            </button>
          )}
          <button onClick={() => setShowShareModal(true)} className="p-3 bg-slate-900 border border-slate-800 text-emerald-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          {isOwn && isInClub && (
            <button
              onClick={handleShareToClub}
              disabled={sharingToClub}
              title={isSharedToClub ? 'Remove from Club Vault' : 'Share to Club Vault'}
              className={`p-3 border rounded-xl transition-all shadow-xl active:scale-90 disabled:opacity-50 ${isSharedToClub ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-400'}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
          )}
          {onAddToPlaybook && (
            <button 
              onClick={() => onAddToPlaybook(drill.id)}
              className="p-3 bg-indigo-600 border border-indigo-400 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-xl"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          )}
          {isOwn && (
            <div className="flex items-center gap-2">
              {onTogglePin && (
                <button 
                  onClick={() => onTogglePin(drill.id)}
                  className={`p-3 border rounded-xl transition-all shadow-xl active:scale-90 ${drill.isPinned ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-amber-400'}`}
                  title={drill.isPinned ? "Unpin" : "Pin to top"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={drill.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="3"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 10z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                </button>
              )}
              <button onClick={onEdit} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-ha-brand transition-all shadow-xl"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button onClick={() => setShowDeleteConfirm(true)} className="p-3 bg-slate-900 border border-slate-800 text-red-500/50 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-xl"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {drill.boards?.map((board, idx) => (
            <div key={board.id} className="bg-[#0b1224] border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl relative group max-w-lg mx-auto" style={{ pageBreakInside: 'avoid' }}>
              <div className="p-6 border-b border-slate-900 flex justify-between items-center bg-ha-bg/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black italic text-sm shadow-lg">{idx + 1}</div>
                  <h3 className="text-sm font-black uppercase text-white tracking-widest">{board.name}</h3>
                </div>
              </div>
              <div ref={el => { diagramRefs.current[idx] = el; }} className="relative w-full overflow-hidden" style={{ aspectRatio: board.courtType === 'full' ? '188/100' : '100/94' }}>
                <CoachBoard initialPlayers={board.players} initialLines={board.lines} initialTexts={board.texts} initialCourtType={board.courtType} readOnly onSave={() => {}} onCancel={() => {}} />
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-8">
          {((drill.videoUploads?.length || 0) > 0 || (drill.videoUrls?.length || 0) > 0) && (
            <section className="bg-[#0b1224] border border-indigo-500/30 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] italic border-b border-indigo-950 pb-3">Tactical Playback</h3>
              <div className="space-y-6">
                 {drill.videoUploads?.map((vid, vIdx) => (
                   <div key={vIdx} className="space-y-2">
                     <div className="bg-black rounded-2xl overflow-hidden aspect-video border border-white/5">
                        {vid.node === 'youtube' || vid.url.length === 11 ? (
                           <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${vid.url}?modestbranding=1&rel=0`} frameBorder="0" allowFullScreen></iframe>
                        ) : (
                           <video src={vid.url} controls playsInline className="w-full h-full" />
                        )}
                     </div>
                     <p className="text-[8px] font-black text-slate-600 uppercase text-center tracking-widest">{vid.name}</p>
                   </div>
                 ))}
                 {drill.videoUrls?.map((url, uIdx) => {
                    let videoId = '';
                    try {
                      if (url.includes('youtu.be/')) {
                        videoId = url.split('youtu.be/')[1].split(/[?#]/)[0];
                      } else if (url.includes('youtube.com/watch')) {
                        const urlParams = new URLSearchParams(url.split('?')[1]);
                        videoId = urlParams.get('v') || '';
                      } else if (url.includes('youtube.com/embed/')) {
                        videoId = url.split('youtube.com/embed/')[1].split(/[?#]/)[0];
                      } else {
                        videoId = url;
                      }
                    } catch (e) {
                      videoId = url;
                    }
                    return (
                      <div key={uIdx} className="bg-black rounded-2xl overflow-hidden aspect-video border border-white/5">
                          <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0`} frameBorder="0" allowFullScreen></iframe>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          <section className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-2xl" style={{ pageBreakInside: 'avoid' }}>
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic border-b border-slate-900 pb-3">Execution Protocol</h3>
            <div className="space-y-6">
              {drill.steps?.map((step, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <span className="text-[10px] font-black text-indigo-500 mt-0.5">{idx + 1}.</span>
                  <p className="text-slate-300 text-xs font-medium leading-relaxed uppercase tracking-tight">{step}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-3">
            <button onClick={handleDownloadDiagrams} disabled={isDownloadingDiagrams || !drill?.boards?.length} className="flex-1 py-5 bg-slate-800 border border-slate-700 text-slate-300 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-700 hover:text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">
              {isDownloadingDiagrams ? <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin"></div> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              {isDownloadingDiagrams ? 'Saving...' : 'Download Diagrams'}
            </button>
            <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 py-5 bg-indigo-600 border border-indigo-400 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-indigo-500 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">
              {isExporting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              {isExporting ? 'Capturing...' : 'Export Tactical PDF'}
            </button>
          </div>
        </div>
      </div>

      {!isPaid && (
        <div className="py-8">
          <AdBanner adSlot="drill_detail_bottom" isPaid={isPaid} onUpgrade={() => onUpgrade?.()} />
        </div>
      )}

      <CommentsSection drillId={drill.id} userName={userProfile?.name || 'Coach'} onLogin={onLogin} />
      
      {showMotionModal && (
        <div className="fixed inset-0 z-[300] bg-ha-bg flex flex-col">
          <div className="p-6 flex items-center justify-between bg-ha-bg border-b border-slate-900">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black italic shadow-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="m5 3 14 9-14 9V3z"/></svg>
              </div>
              <div>
                <h3 className="text-xl font-black italic uppercase text-white tracking-tighter leading-none">Motion <span className="text-indigo-400">Sequence</span></h3>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mt-1">{drill.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwn && drill.boards?.length > 0 && (
                <button
                  onClick={() => { setShowMotionModal(false); setShowVideoGenerator(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 border border-indigo-400 text-white rounded-xl hover:bg-indigo-500 transition-all text-[10px] font-black uppercase tracking-widest"
                  title="Export as video file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
                  Record
                </button>
              )}
              <button onClick={() => setShowMotionModal(false)} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <CoachBoard
              animationSequence={drill.boards}
              initialPlayers={drill.boards?.[0]?.players || []}
              initialLines={drill.boards?.[0]?.lines || []}
              initialTexts={drill.boards?.[0]?.texts || []}
              initialCourtType={drill.boards?.[0]?.courtType || 'half'}
              forcePlayback={true}
              readOnly={true}
              isFullscreen={true}
              onSave={() => {}}
              onCancel={() => setShowMotionModal(false)}
            />
          </div>
        </div>
      )}

      {showVideoGenerator && drill.boards?.length > 0 && (
        <VideoGenerator
          drill={drill}
          activeBoard={drill.boards[0]}
          onClose={() => setShowVideoGenerator(false)}
          onVideoGenerated={handleVideoGenerated}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] bg-ha-bg flex items-center justify-center p-6">
          <div className="bg-[#0b1224] border border-red-500/30 p-10 rounded-[3.5rem] w-full max-md text-center space-y-8 shadow-3xl animate-in zoom-in">
            <h3 className="text-3xl font-black italic uppercase text-white">Confirm Purge</h3>
            <div className="flex flex-col gap-3">
              <button onClick={handleDelete} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-xl">Execute Purge</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl font-black uppercase text-[11px]">Abort</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareModal
          item={drill}
          itemType="drill"
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};

export default DrillDetail;
