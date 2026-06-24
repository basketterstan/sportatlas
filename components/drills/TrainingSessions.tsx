
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Drill, TrainingSession, SubscriptionPlan, UserRole, SkillFocus, Level, VideoUpload, UserProfile, TacticalType, Sport } from '../../types';
import { getSportConfig } from '../../data/sports';
import { auth, db, storage, cleanRecord } from '../../utils/firebase';
import { getTranslation } from '../../utils/i18n';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch, increment, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import CoachBoard from '../shared/CoachBoard';
import DrillForm from './DrillForm';
import AdBanner from '../shared/AdBanner';
import { exportToPDF } from '../../utils/pdfExport';
import ShareModal from '../shared/ShareModal';

interface TrainingSessionsProps {
  drills: Drill[];
  personalSessionsCount?: number;
  sessions: TrainingSession[];
  publicSessions?: TrainingSession[];
  publicDrills?: Drill[];
  userPlan?: SubscriptionPlan;
  userRole?: UserRole;
  isAdmin?: boolean;
  isTester?: boolean;
  userName?: string;
  userProfile?: UserProfile | null;
  onBack: () => void;
  onViewDrill: (id: string) => void;
  onEditDrill: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onDrillCreated: (drill: Drill) => Promise<void>;
  initialCreate?: boolean;
  initialPlaybookId?: string;
}

const TrainingSessions: React.FC<TrainingSessionsProps> = ({ 
  drills = [], 
  personalSessionsCount = 0,
  sessions = [], 
  publicSessions = [],
  publicDrills = [],
  userPlan, 
  userRole, 
  isAdmin = false, 
  isTester = false,
  userName,
  userProfile,
  onBack, 
  onViewDrill,
  onEditDrill,
  onTogglePin,
  onDrillCreated,
  initialCreate = false,
  initialPlaybookId
}) => {
  const t = getTranslation(userProfile);
  const [isCreating, setIsCreating] = useState(initialCreate);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<TrainingSession | null>(null);
  const [shareSession, setShareSession] = useState<TrainingSession | null>(null);

  // Handle initialPlaybookId
  useEffect(() => {
    if (initialPlaybookId) {
      const session = sessions.find(s => s.id === initialPlaybookId) || publicSessions?.find(s => s.id === initialPlaybookId);
      if (session) {
        setViewingSession(session);
      } else {
        // If not found in current lists, we might need to fetch it specifically if it's a shared link
        // For now, we assume it's in the public or personal lists
      }
    }
  }, [initialPlaybookId, sessions, publicSessions]);
  const [activeTab, setActiveTab] = useState<'my' | 'global'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sessionName, setSessionName] = useState('');
  const [selectedDrillIds, setSelectedDrillIds] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Sync viewing session with updated props
  useEffect(() => {
    if (viewingSession) {
      const updated = sessions.find(s => s.id === viewingSession.id) || publicSessions?.find(s => s.id === viewingSession.id);
      if (updated) setViewingSession(updated);
    }
  }, [sessions, publicSessions]);

  // Video State
  const [sessionVideoUploads, setSessionVideoUploads] = useState<VideoUpload[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [expandedDrillVideo, setExpandedDrillVideo] = useState<string | null>(null);
  
  // PDF Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<'idle' | 'capturing' | 'generating'>('idle');
  const [printingSession, setPrintingSession] = useState<TrainingSession | null>(null);
  const [sessionImagesMap, setSessionImagesMap] = useState<Record<string, string[]>>({});
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  
  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));

  const userSport: Sport = userProfile?.sport ?? Sport.BASKETBALL;
  const sportConfig = getSportConfig(userSport);

  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const sourceDrills = useMemo(() => {
    const all = [...(drills || []), ...(publicDrills || [])];
    const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
    // Only show drills matching user's sport
    return unique.filter(d => d.sport === userSport || (!d.sport && userSport === Sport.BASKETBALL));
  }, [drills, publicDrills, userSport]);

  const filteredSessions = useMemo(() => {
    let list = (activeTab === 'my' ? sessions : publicSessions).filter(s =>
      s.sport === userSport || (!s.sport && userSport === Sport.BASKETBALL)
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q));
    }
    if (dateFilter !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      if (dateFilter === 'today') list = list.filter(s => (now - (s.createdAt || 0)) < dayMs);
      if (dateFilter === 'week') list = list.filter(s => (now - (s.createdAt || 0)) < dayMs * 7);
      if (dateFilter === 'month') list = list.filter(s => (now - (s.createdAt || 0)) < dayMs * 30);
    }
    return [...list].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [activeTab, sessions, publicSessions, searchQuery, dateFilter]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    const uploadId = crypto.randomUUID();
    const storagePath = `sessions/${auth.currentUser.uid}/${uploadId}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      }, 
      (error) => {
        setUploadProgress(null);
        alert("Upload failed.");
      }, 
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setSessionVideoUploads(prev => [...prev, { url: downloadURL, name: file.name, storagePath: storagePath }]);
        setUploadProgress(null);
      }
    );
  };

  const exportPlaybookPDF = async (session: TrainingSession) => {
    if (!isPaid) {
      alert("BASIC FEATURE: PDF Export is only available for Basic users and above.");
      return;
    }
    if (!auth.currentUser || isExporting || !session?.drillIds) return;
    setIsExporting(true);
    setExportPhase('capturing');
    
    try {
      const finalImagesMap: Record<string, string[]> = {};
      
      for (const drillId of session.drillIds) {
        const drill = sourceDrills.find(d => d.id === drillId);
        if (!drill || !drill.boards) continue;
        
        const drillImages: string[] = [];
        for (let bIdx = 0; bIdx < drill.boards.length; bIdx++) {
           const boardEl = document.getElementById(`print-board-${drillId}-${bIdx}`) as HTMLDivElement;
           if (boardEl) {
              const html2canvas = (await import('html2canvas')).default;
              const canvas = await html2canvas(boardEl, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0
              });
              drillImages.push(canvas.toDataURL("image/png"));
           }
        }
        finalImagesMap[drillId] = drillImages;
      }

      setSessionImagesMap(finalImagesMap);
      setPrintingSession(session);
      setExportPhase('generating');
      
      setTimeout(async () => {
        try {
          const element = pdfContainerRef.current;
          if (!element) throw new Error("Print container missing");

          const filename = `HA_PLAYBOOK_${session.name.replace(/\s+/g, '_').toUpperCase()}.pdf`;
          await exportToPDF(element, filename);
          
        } catch (e) {
          console.error("PDF Export failed:", e);
          alert("Tactical Export Failed.");
        } finally {
          setIsExporting(false);
          setExportPhase('idle');
          setPrintingSession(null);
          setSessionImagesMap({});
        }
      }, 1000); 

    } catch (e) {
      console.error(e);
      alert("Snapshot engine failure.");
      setIsExporting(false);
      setExportPhase('idle');
    }
  };

  const [drillSearch, setDrillSearch] = useState('');
  const [drillFilter, setDrillFilter] = useState<SkillFocus | 'all'>('all');
  const [drillLevelFilter, setDrillLevelFilter] = useState<Level | 'all'>('all');
  const [drillSourceFilter, setDrillSourceFilter] = useState<'all' | 'my' | 'community'>('all');
  const [drillTypeFilter, setDrillTypeFilter] = useState<TacticalType | 'all'>('all');
  const [drillDurationFilter, setDrillDurationFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');

  const sportDrills = useMemo(() =>
    (drills || []).filter(d => d.sport === userSport || (!d.sport && userSport === Sport.BASKETBALL)),
    [drills, userSport]);
  const sportPublicDrills = useMemo(() =>
    (publicDrills || []).filter(d => d.sport === userSport || (!d.sport && userSport === Sport.BASKETBALL)),
    [publicDrills, userSport]);

  const filteredDrillsForSelection = useMemo(() => {
    let list = drillSourceFilter === 'my' ? sportDrills :
               drillSourceFilter === 'community' ? sportPublicDrills :
               sourceDrills;

    if (drillSearch.trim()) {
      const q = drillSearch.toLowerCase().trim();
      list = list.filter(d => (d.title || '').toLowerCase().includes(q));
    }
    if (drillFilter !== 'all') {
      list = list.filter(d => d.focus === drillFilter);
    }
    if (drillLevelFilter !== 'all') {
      list = list.filter(d => d.level === drillLevelFilter);
    }
    if (drillTypeFilter !== 'all') {
      list = list.filter(d => d.type === drillTypeFilter);
    }
    if (drillDurationFilter !== 'all') {
      if (drillDurationFilter === 'short') list = list.filter(d => d.duration <= 10);
      if (drillDurationFilter === 'medium') list = list.filter(d => d.duration > 10 && d.duration <= 20);
      if (drillDurationFilter === 'long') list = list.filter(d => d.duration > 20);
    }
    return list;
  }, [drills, publicDrills, sourceDrills, drillSearch, drillFilter, drillLevelFilter, drillSourceFilter, drillTypeFilter, drillDurationFilter]);

  const totalDuration = useMemo(() => {
    return selectedDrillIds.reduce((acc, id) => {
      const drill = sourceDrills.find(d => d.id === id);
      return acc + (drill?.duration || 0);
    }, 0);
  }, [selectedDrillIds, sourceDrills]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !sessionName.trim() || selectedDrillIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const data = cleanRecord({
        userId: auth.currentUser.uid,
        authorName: userName || 'Coach',
        name: sessionName.trim().toUpperCase(),
        sport: userSport,
        drillIds: selectedDrillIds,
        videoUploads: sessionVideoUploads,
        isPublic,
        updatedAt: Date.now()
      });
      if (editingSessionId) await updateDoc(doc(db, "trainings", editingSessionId), data);
      else await addDoc(collection(db, "trainings"), { ...data, isPublic, createdAt: Date.now() });
      setIsCreating(false); setEditingSessionId(null); setSelectedDrillIds([]); setSessionName(''); setSessionVideoUploads([]); setIsPublic(false);
    } catch (err) { alert("Save failed."); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Permanently delete this playbook?")) return;
    try {
      await deleteDoc(doc(db, "trainings", sessionId));
      setViewingSession(null);
    } catch (e) { alert("Purge failed."); }
  };

  const handleReorderDrill = async (sessionId: string, index: number, direction: 'up' | 'down') => {
    const session = viewingSession;
    if (!session || !session.drillIds) return;

    const newDrillIds = [...session.drillIds];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newDrillIds.length) return;

    [newDrillIds[index], newDrillIds[newIndex]] = [newDrillIds[newIndex], newDrillIds[index]];

    try {
      await updateDoc(doc(db, "trainings", sessionId), {
        drillIds: newDrillIds,
        updatedAt: Date.now()
      });
      // Local state will be updated via useEffect syncing with props
    } catch (e) {
      console.error("Reorder failed:", e);
      alert("Reorder failed.");
    }
  };

  const handleShare = (session: TrainingSession) => {
    setShareSession(session);
  };

  return (
    <div className="space-y-10 pb-20">
      
      {/* CAPTURE WORKSPACE (Zichtbaar voor browser voor rendering) */}
      <div 
        className="fixed top-0 pointer-events-none bg-white"
        style={{ left: '-9999px', zIndex: -200 }}
      >
        {sourceDrills?.map(drill => (
           <div key={drill.id}>
             {drill.boards?.map((b, bIdx) => (
               <div key={bIdx} id={`print-board-${drill.id}-${bIdx}`} style={{ width: '800px', height: b.courtType === 'full' ? '425px' : '750px', backgroundColor: '#ffffff' }}>
                  <CoachBoard initialPlayers={b.players} initialLines={b.lines} initialTexts={b.texts} initialCourtType={b.courtType} readOnly isPrinting onSave={()=>{}} onCancel={()=>{}} />
               </div>
             ))}
           </div>
        ))}
      </div>

      {/* PDF TEMPLATE (Even zichtbaar maken voor capture) */}
      <div 
        className="fixed top-0 w-full h-full pointer-events-none overflow-auto bg-white" 
        style={{ 
          left: exportPhase === 'generating' ? '0' : '-9999px',
          visibility: exportPhase === 'generating' ? 'visible' : 'hidden',
          zIndex: 9999
        }}
      >
        {printingSession && (
          <div ref={pdfContainerRef} className="p-10 text-slate-900 bg-white w-[1000px] font-sans">
            <div className="border-b-8 border-slate-900 pb-6 mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black uppercase italic text-indigo-600">HOOPSATLAS COMMAND</h1>
                <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">{printingSession.name}</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mt-2">Tactical Playbook Synthesis • Prepared by {printingSession.authorName}</p>
              </div>
              <div className="bg-slate-900 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase">Official Playbook</div>
            </div>

            <div className="space-y-16">
              {printingSession.drillIds?.map((id, idx) => {
                const drill = sourceDrills.find(d => d.id === id);
                if (!drill) return null;
                const drillImgs = sessionImagesMap[id] || [];
                return (
                  <div key={id} className="space-y-8" style={{ pageBreakInside: 'avoid' }}>
                    <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
                      <h2 className="text-2xl font-black uppercase italic text-slate-900">{idx + 1}. {drill.title}</h2>
                      <span className="text-[10px] font-black uppercase bg-slate-100 px-3 py-1 rounded text-slate-500">{drill.focus}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-10">
                      <div className="space-y-6">
                        {drillImgs.map((img, bIdx) => (
                          <div key={bIdx} className="space-y-2">
                            <p className="text-[8px] font-black uppercase text-slate-400">Frame {bIdx + 1}</p>
                            <div className="border-4 border-slate-100 rounded-[1.5rem] overflow-hidden">
                               <img src={img} className="w-full h-auto block" alt="Tactical Board" />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-8">
                        <div className="bg-slate-50 p-8 rounded-[2.5rem] border-l-8 border-indigo-600">
                          <h3 className="text-[10px] font-black uppercase mb-6 tracking-widest text-slate-400 italic">Execution Protocol</h3>
                          <div className="space-y-4">
                            {drill.steps?.map((s, si) => (
                              <div key={si} className="flex gap-4 items-start">
                                <span className="text-xl font-black text-indigo-600 leading-none">{si + 1}</span>
                                <p className="text-xs uppercase font-bold text-slate-800 leading-tight">{s}</p>
                              </div>
                            ))}
                          </div>
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
                );
              })}
            </div>
            <div className="mt-12 pt-6 border-t border-slate-100 text-center opacity-30">
               <p className="text-[8px] font-black uppercase tracking-[0.5em]">SportAtlas Professional Playbook • Internal Only</p>
            </div>
          </div>
        )}
      </div>

      {/* EXPORT OVERLAY */}
      {isExporting && (
        <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in">
          <div className="w-20 h-20 bg-indigo-600/10 border-2 border-indigo-500/30 rounded-[2rem] flex items-center justify-center mb-6">
             <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">
            {exportPhase === 'capturing' ? 'Capturing Playbook Units...' : 'Compiling Playbook...'}
          </h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mt-2 animate-pulse">Synthesis in progress</p>
        </div>
      )}

      {/* VISIBLE UI */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {viewingSession && (
             <button onClick={() => setViewingSession(null)} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
             </button>
          )}
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">
            {viewingSession ? viewingSession.name : <>Playbook <span className="text-indigo-400">Builder</span></>}
          </h2>
        </div>
        <div className="flex gap-2">
          {!viewingSession && !isCreating && (
            <button 
              onClick={() => { setIsCreating(true); setEditingSessionId(null); setSessionName(''); setSelectedDrillIds([]); setSessionVideoUploads([]); }}
              className="p-4 bg-indigo-600 border border-indigo-400 rounded-2xl text-white hover:bg-indigo-500 transition-all shadow-xl active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          )}
          <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {viewingSession ? (
        <div className="space-y-8 animate-in slide-in-from-right duration-500 px-1">
          <div className="flex items-center justify-between border-b border-slate-900 pb-6">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{(viewingSession.drillIds || []).length} UNITS IN SEQUENCE • BY {viewingSession.authorName}</p>
            <div className="flex gap-2">
               <button 
                onClick={() => handleShare(viewingSession)}
                className="p-4 bg-emerald-600 border border-emerald-400 rounded-2xl text-white hover:bg-emerald-500 transition-all shadow-xl active:scale-90"
                title="Share Playbook"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </button>
               <button 
                onClick={() => exportPlaybookPDF(viewingSession)} 
                disabled={isExporting} 
                className="p-4 bg-indigo-600 border border-indigo-400 rounded-2xl text-white hover:bg-indigo-500 transition-all shadow-xl active:scale-90 disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
              </button>
              {viewingSession.userId === auth.currentUser?.uid && (
                <button 
                  onClick={() => handleDeleteSession(viewingSession.id)}
                  className="p-4 bg-red-900/20 border border-red-900/30 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-xl"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>
          </div>

          {viewingSession.videoUploads && viewingSession.videoUploads.length > 0 && (
             <div className="space-y-4">
                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] italic ml-2">Tactical Intro Briefing</h3>
                <div className="bg-[#0b1224] border border-indigo-500/20 rounded-[2.5rem] overflow-hidden shadow-2xl">
                   <video src={viewingSession.videoUploads[0].url} controls playsInline className="w-full aspect-video" />
                </div>
             </div>
          )}

          <div className="space-y-4">
             <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic ml-2">Mission Units</h3>
             {viewingSession.drillIds?.map((id, index) => {
               const drill = sourceDrills.find(d => d.id === id);
               if (!drill) return null;
               const drillVideo = drill.videoUploads?.[0]?.url || drill.videoUrls?.[0];
               const isVideoExpanded = expandedDrillVideo === id;

               return (
                 <div key={id} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all hover:border-indigo-500/40">
                    <div onClick={() => onViewDrill(id)} className="p-6 flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-6">
                           <div className="flex flex-col items-center gap-1">
                              {viewingSession.userId === auth.currentUser?.uid && (
                                <div className="flex flex-col gap-1 mb-1">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleReorderDrill(viewingSession.id, index, 'up'); }}
                                    disabled={index === 0}
                                    className={`p-1 rounded bg-ha-bg border border-slate-800 hover:text-indigo-400 transition-colors ${index === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500'}`}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="6"><polyline points="18 15 12 9 6 15"/></svg>
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleReorderDrill(viewingSession.id, index, 'down'); }}
                                    disabled={index === (viewingSession.drillIds?.length || 0) - 1}
                                    className={`p-1 rounded bg-ha-bg border border-slate-800 hover:text-indigo-400 transition-colors ${index === (viewingSession.drillIds?.length || 0) - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500'}`}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="6"><polyline points="6 9 12 15 18 9"/></svg>
                                  </button>
                                </div>
                              )}
                              <div className="w-12 h-12 bg-ha-bg border border-slate-900 rounded-2xl flex items-center justify-center font-black italic text-indigo-400 shadow-inner group-hover:text-white transition-colors">{index + 1}</div>
                           </div>
                           <div className="space-y-1">
                              <h4 className="text-xl font-black italic uppercase text-white group-hover:text-indigo-400 transition-colors">{drill.title}</h4>
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{drill.focus} • {drill.duration} MIN</p>
                           </div>
                        </div>
                        <div className="flex gap-2">
                           {drillVideo && (
                             <button 
                               onClick={(e) => { e.stopPropagation(); setExpandedDrillVideo(isVideoExpanded ? null : id); }}
                               className={`p-3 rounded-xl border transition-all ${isVideoExpanded ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-indigo-400 hover:text-white'}`}
                             >
                               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                             </button>
                           )}
                           <div className="w-10 h-10 bg-ha-bg border border-slate-800 rounded-xl flex items-center justify-center text-slate-700 group-hover:translate-x-1 transition-transform">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
                           </div>
                        </div>
                    </div>
                    
                    {isVideoExpanded && drillVideo && (
                      <div className="px-6 pb-6 animate-in slide-in-from-top-2">
                         <div className="bg-black border border-indigo-500/30 rounded-2xl overflow-hidden shadow-inner">
                            <video src={drillVideo} controls autoPlay playsInline className="w-full h-full max-h-[300px]" />
                         </div>
                         <div className="mt-4 p-4 bg-ha-bg/50 rounded-xl border border-slate-900">
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed italic">
                              Protocol instructions for {drill.title}. Execute per tactical frames.
                            </p>
                         </div>
                      </div>
                    )}
                 </div>
               );
             })}
          </div>
        </div>
      ) : !isCreating ? (
        <div className="space-y-8 px-1">
           <div className="relative group">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaybooks}
                className="w-full bg-[#0b1224] border border-slate-800 rounded-[2rem] py-5 pl-14 pr-6 text-[10px] font-black uppercase tracking-[0.2em] text-white outline-none focus:border-indigo-500 shadow-inner transition-all"
              />
              <svg className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
           </div>

           <div className="flex bg-[#0b1224] p-1.5 rounded-[2rem] border border-slate-800 w-full shadow-2xl">
              <button onClick={() => setActiveTab('my')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all ${activeTab === 'my' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>{t.myPlaybooks}</button>
              <button onClick={() => setActiveTab('global')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] transition-all ${activeTab === 'global' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500'}`}>{t.publicIntel}</button>
           </div>

           <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => setDateFilter('all')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'all' ? 'text-white underline' : 'text-slate-600'}`}>{t.allTime}</button>
              <button onClick={() => setDateFilter('today')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'today' ? 'text-white underline' : 'text-slate-600'}`}>{t.today}</button>
              <button onClick={() => setDateFilter('week')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'week' ? 'text-white underline' : 'text-slate-600'}`}>{t.sevenDays}</button>
              <button onClick={() => setDateFilter('month')} className={`px-4 py-2 rounded-lg font-black uppercase text-[7px] tracking-widest transition-all ${dateFilter === 'month' ? 'text-white underline' : 'text-slate-600'}`}>{t.thirtyDays}</button>
           </div>

           <button onClick={() => { setIsCreating(true); setEditingSessionId(null); setSessionName(''); setSelectedDrillIds([]); setSessionVideoUploads([]); }} className="w-full py-8 bg-[#0b1224] border border-slate-800 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-3 shadow-inner active:scale-95 transition-all">
              <div className="w-12 h-12 bg-ha-bg rounded-2xl flex items-center justify-center text-indigo-400 font-black shadow-xl">+</div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t.deployNewPlaybookUnit}</span>
           </button>

           <div className="grid grid-cols-1 gap-6">
            {filteredSessions?.map(session => (
              <div key={session.id} onClick={() => setViewingSession(session)} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-2xl group cursor-pointer hover:border-indigo-500/30 transition-all active:scale-[0.98]">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h4 className="text-3xl font-black italic uppercase text-white tracking-tighter group-hover:text-indigo-400 transition-colors">{session.name}</h4>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{(session.drillIds || []).length} Units • By {session.authorName}</p>
                    {(session.videoUploads?.length || 0) > 0 && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[6px] font-black uppercase tracking-widest">Multimedia Intel Attached</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {onTogglePin && activeTab === 'my' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onTogglePin(session.id); }}
                        className={`p-4 border rounded-2xl transition-all shadow-xl active:scale-90 ${session.isPinned ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-amber-400'}`}
                        title={session.isPinned ? "Unpin" : "Pin to top"}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={session.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="3"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 10z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                      </button>
                    )}
                    {session.userId === auth.currentUser?.uid && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(session.id);
                            setSessionName(session.name);
                            setSelectedDrillIds(session.drillIds);
                            setSessionVideoUploads(session.videoUploads || []);
                            setIsPublic(session.isPublic || false);
                            setIsCreating(true);
                          }}
                          className="p-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl hover:text-ha-brand transition-all shadow-xl active:scale-90"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                          className="p-4 bg-red-900/20 border border-red-900/30 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-xl active:scale-90"
                          title="Delete playbook"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleShare(session); }}
                      className="p-4 bg-emerald-600 border border-emerald-400 text-white rounded-2xl hover:bg-emerald-500 transition-all shadow-xl active:scale-90"
                      title="Share Playbook"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); exportPlaybookPDF(session); }} 
                      disabled={isExporting} 
                      className="p-4 bg-indigo-600 border border-indigo-400 rounded-2xl text-white hover:bg-indigo-500 transition-all shadow-xl active:scale-90 disabled:opacity-50"
                    >
                      {isExporting && printingSession?.id === session.id ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-1 pb-40 animate-in slide-in-from-bottom duration-500">
           <form onSubmit={handleCreateSession} className="space-y-10">
              <div className="bg-[#0b1224] border border-indigo-500/30 p-8 rounded-[2.5rem] shadow-3xl">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 italic mb-2 block">Tactical Unit Identity</label>
                <input required type="text" placeholder="PLAYBOOK NAME..." value={sessionName} onChange={e => setSessionName(e.target.value.toUpperCase())} className="w-full bg-ha-bg border border-slate-800 p-6 rounded-2xl text-sm text-white font-black uppercase outline-none focus:border-indigo-500 shadow-inner" />
              </div>

              <div className="space-y-4">
                 <p className="text-[11px] font-black uppercase text-slate-500 ml-2 italic tracking-[0.3em]">Operational Briefing Video</p>
                 <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                    <input type="file" ref={videoInputRef} onChange={handleFileUpload} className="hidden" accept="video/*" />
                    {sessionVideoUploads.length > 0 ? (
                      <div className="space-y-4">
                         {sessionVideoUploads.map((v, i) => (
                           <div key={i} className="bg-ha-bg border border-indigo-500/40 rounded-2xl p-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="3"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                 <span className="text-[10px] font-black text-white uppercase italic truncate max-w-[200px]">{v.name}</span>
                              </div>
                              <button type="button" onClick={() => setSessionVideoUploads(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 p-2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
                           </div>
                         ))}
                      </div>
                    ) : (
                      <button type="button" onClick={() => videoInputRef.current?.click()} className="w-full py-12 border-4 border-dashed border-slate-800 rounded-[2rem] flex flex-col items-center justify-center gap-4 hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all group">
                         <div className="w-14 h-14 bg-ha-bg rounded-2xl flex items-center justify-center text-slate-700 border border-slate-900 group-hover:text-indigo-400 group-hover:scale-110 transition-all shadow-inner">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                         </div>
                         <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{uploadProgress !== null ? `Uploading: ${Math.round(uploadProgress)}%` : 'Attach Session Briefing'}</p>
                      </button>
                    )}
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="flex items-center justify-between ml-2">
                    <p className="text-[11px] font-black uppercase text-slate-500 italic tracking-[0.3em]">Tactical Units Sequence ({selectedDrillIds.length})</p>
                    <div className="px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl">
                       <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{totalDuration} MIN TOTAL</span>
                    </div>
                 </div>

                 {/* Selected Drills (Reorderable) */}
                 {selectedDrillIds.length > 0 && (
                   <div className="space-y-2 mb-6">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-2">Current Sequence (Tap to remove / reorder)</p>
                      <div className="flex flex-wrap gap-2 p-4 bg-ha-bg/50 border border-slate-900 rounded-[2rem]">
                         {selectedDrillIds.map((id, idx) => {
                           const drill = sourceDrills.find(d => d.id === id);
                           if (!drill) return null;
                           return (
                             <div key={`${id}-${idx}`} className="flex items-center gap-2 bg-indigo-600 px-3 py-2 rounded-xl shadow-lg animate-in zoom-in group">
                                <div className="flex flex-col gap-0.5">
                                   <button 
                                     type="button"
                                     onClick={() => {
                                       if (idx > 0) {
                                         const newIds = [...selectedDrillIds];
                                         [newIds[idx-1], newIds[idx]] = [newIds[idx], newIds[idx-1]];
                                         setSelectedDrillIds(newIds);
                                       }
                                     }}
                                     className={`p-0.5 rounded hover:bg-white/20 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-white/60 hover:text-white'}`}
                                   >
                                     <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="6"><polyline points="18 15 12 9 6 15"/></svg>
                                   </button>
                                   <button 
                                     type="button"
                                     onClick={() => {
                                       if (idx < selectedDrillIds.length - 1) {
                                         const newIds = [...selectedDrillIds];
                                         [newIds[idx], newIds[idx+1]] = [newIds[idx+1], newIds[idx]];
                                         setSelectedDrillIds(newIds);
                                       }
                                     }}
                                     className={`p-0.5 rounded hover:bg-white/20 ${idx === selectedDrillIds.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-white/60 hover:text-white'}`}
                                   >
                                     <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="6"><polyline points="6 9 12 15 18 9"/></svg>
                                   </button>
                                </div>
                                <span className="text-[10px] font-black text-white/50">{idx + 1}</span>
                                <span className="text-[10px] font-black text-white uppercase italic truncate max-w-[100px]">{drill.title}</span>
                                <button 
                                  type="button" 
                                  onClick={() => setSelectedDrillIds(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-white/60 hover:text-white ml-1"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                             </div>
                           );
                         })}
                      </div>
                   </div>
                 )}

                 <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-6 space-y-4 shadow-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                       <div className="relative flex gap-2">
                          <input 
                            type="text" 
                            placeholder="SEARCH DRILLS..." 
                            value={drillSearch}
                            onChange={e => setDrillSearch(e.target.value)}
                            className="flex-1 bg-ha-bg border border-slate-900 p-4 rounded-xl text-[10px] font-black uppercase text-white outline-none focus:border-indigo-500"
                          />
                          <button 
                            type="button"
                            onClick={() => setShowQuickCreate(true)}
                            className="px-4 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg flex items-center gap-2 shrink-0"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            New Unit
                          </button>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                         <select 
                          value={drillFilter}
                          onChange={e => setDrillFilter(e.target.value as any)}
                          className="bg-ha-bg border border-slate-900 p-2 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-indigo-500"
                         >
                            <option value="all">FOCUS</option>
                            {sportConfig.skills.map(f => <option key={f} value={f}>{f}</option>)}
                         </select>
                         <select 
                          value={drillLevelFilter}
                          onChange={e => setDrillLevelFilter(e.target.value as any)}
                          className="bg-ha-bg border border-slate-900 p-2 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-indigo-500"
                         >
                            <option value="all">LEVEL</option>
                            {Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                         </select>
                         <select 
                          value={drillSourceFilter}
                          onChange={e => setDrillSourceFilter(e.target.value as any)}
                          className="bg-ha-bg border border-slate-900 p-2 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-indigo-500"
                         >
                            <option value="all">SOURCE</option>
                            <option value="my">MY DRILLS</option>
                            <option value="community">COMMUNITY</option>
                         </select>
                         <select 
                          value={drillTypeFilter}
                          onChange={e => setDrillTypeFilter(e.target.value as any)}
                          className="bg-ha-bg border border-slate-900 p-2 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-indigo-500"
                         >
                            <option value="all">TYPE</option>
                            <option value="drill">SKILL DRILL</option>
                            <option value="play">TACTICAL PLAY</option>
                         </select>
                         <select 
                          value={drillDurationFilter}
                          onChange={e => setDrillDurationFilter(e.target.value as any)}
                          className="bg-ha-bg border border-slate-900 p-2 rounded-xl text-[9px] font-black uppercase text-white outline-none focus:border-indigo-500"
                         >
                            <option value="all">DURATION</option>
                            <option value="short">SHORT (≤10m)</option>
                            <option value="medium">MEDIUM (11-20m)</option>
                            <option value="long">LONG (&gt;20m)</option>
                         </select>
                       </div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2 pr-2">
                       {filteredDrillsForSelection?.map(d => {
                         const isSelected = selectedDrillIds.includes(d.id);
                         return (
                           <div 
                            key={d.id} 
                            onClick={() => setSelectedDrillIds(prev => [...prev, d.id])} 
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group bg-ha-bg border-slate-900 hover:border-indigo-500/50`}
                           >
                             <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-[10px] font-black text-white uppercase italic">{d.title}</p>
                                  {(d.videoUploads?.length || 0) > 0 && <span className="text-[6px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-black uppercase">Video</span>}
                                </div>
                                <p className="text-[8px] font-black text-slate-600 uppercase mt-1">{d.focus} • {d.duration}m</p>
                             </div>
                             <div className="w-8 h-8 bg-ha-bg rounded-xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                             </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
              </div>

              {/* QUICK CREATE MODAL */}
              {showQuickCreate && (
                <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-sm flex items-center justify-center p-6">
                  <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-md space-y-6 shadow-3xl animate-in zoom-in duration-300">
                    <div className="flex justify-between items-center">
                      <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Create New Unit</h3>
                      <button type="button" onClick={() => setShowQuickCreate(false)} className="text-slate-500 hover:text-white">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <DrillForm 
                      userProfile={userProfile}
                      sessions={sessions}
                      onSave={async (newDrill) => {
                        await onDrillCreated(newDrill);
                        setShowQuickCreate(false);
                        setSelectedDrillIds(prev => [...prev, newDrill.id]);
                      }}
                      onCancel={() => setShowQuickCreate(false)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-8 pt-8 border-t border-slate-900">
                <div className="flex items-center justify-between px-2"><label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">Public Intel</label></div>
                <button type="button" onClick={() => setIsPublic(!isPublic)} className={`w-full p-6 rounded-[2.5rem] border transition-all flex items-center justify-between group shadow-xl ${isPublic ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isPublic ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-700'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/><circle cx="12" cy="12" r="10"/></svg></div>
                    <div className="text-left"><p className="text-xs font-black uppercase italic tracking-tight">{isPublic ? 'Global Deployment Active' : 'Private Intel'}</p><p className="text-[8px] font-bold uppercase tracking-widest opacity-60 leading-tight pr-4">Make this playbook visible in the Public Intel database.</p></div>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${isPublic ? 'bg-indigo-500' : 'bg-slate-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isPublic ? 'left-7' : 'left-1'}`} /></div>
                </button>
              </div>

              <div className="flex gap-3">
                 <button type="button" onClick={() => { setIsCreating(false); setEditingSessionId(null); }} className="flex-1 py-6 bg-slate-900 text-slate-500 rounded-[2rem] font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Abort</button>
                 <button type="submit" disabled={isSubmitting || selectedDrillIds.length === 0} className="flex-[2] py-6 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-3xl active:scale-95 transition-all disabled:opacity-30">
                   {editingSessionId ? 'Update Playbook Synthesis' : 'Deploy Playbook Synthesis'}
                 </button>
              </div>
           </form>
        </div>
      )}
      {!isPaid && (
        <div className="px-4 max-w-5xl mx-auto py-8">
          <AdBanner adSlot="training_sessions_bottom" isPaid={isPaid} onUpgrade={() => {}} />
        </div>
      )}

      {shareSession && (
        <ShareModal
          item={shareSession}
          itemType="playbook"
          onClose={() => setShareSession(null)}
        />
      )}
    </div>
  );
};

export default TrainingSessions;
