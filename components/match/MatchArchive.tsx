
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, limit, doc, updateDoc, increment, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../../utils/firebase';
import { UploadedMatch, UserProfile, ViewState, LiveMatch } from '../../types';
import AdBanner from '../shared/AdBanner';
import DonateModal from '../misc/DonateModal';
import { getTranslation } from '../../utils/i18n';

interface MatchArchiveProps {
  userProfile?: UserProfile | null;
  onBack: () => void;
  onNavigate: (view: ViewState, drillId?: string, mode?: 'login' | 'signup', streamId?: string) => void;
  initialMatchCode?: string | null;
  onClearInitialCode?: () => void;
}

const MatchArchive: React.FC<MatchArchiveProps> = ({ userProfile, onBack, onNavigate, initialMatchCode, onClearInitialCode }) => {
  const t = getTranslation(userProfile);
  const [matches, setMatches] = useState<UploadedMatch[]>([]);
  const [liveBroadcasts, setLiveBroadcasts] = useState<LiveMatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<UploadedMatch | null>(null);
  const [currentPartIdx, setCurrentPartIdx] = useState(0);
  const [copySuccessId, setCopySuccessId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  
  const [showDonate, setShowDonate] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<UploadedMatch | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isAdmin = userProfile?.isAdmin === true;
  const isLoggedIn = !!auth.currentUser;

  useEffect(() => {
    if (initialMatchCode) {
      const fetchInitialMatch = async () => {
        try {
          // Try fetching by ID first
          const matchDocRef = doc(db, "matches", initialMatchCode);
          const matchSnap = await getDoc(matchDocRef);
          
          let foundMatch: UploadedMatch | null = null;
          if (matchSnap.exists()) {
            foundMatch = { ...matchSnap.data(), id: matchSnap.id } as UploadedMatch;
          } else {
            // Try fetching by accessCode
            const q = query(collection(db, "matches"), where("accessCode", "==", initialMatchCode), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
              foundMatch = { ...snap.docs[0].data(), id: snap.docs[0].id } as UploadedMatch;
            }
          }

          if (foundMatch) {
            setSelectedMatch(foundMatch);
            setCurrentPartIdx(0);
            if (onClearInitialCode) onClearInitialCode();
          }
        } catch (err) {
          console.error("Error fetching initial match:", err);
        }
      };
      fetchInitialMatch();
    }
  }, [initialMatchCode, onClearInitialCode]);

  useEffect(() => {
    if (!isLoggedIn) { setLoading(false); return; }
    const unlockedIds = (userProfile as any)?.unlockedMatches || [];
    
    const fetchMatches = async () => {
      setLoading(true);
      try {
        let list: UploadedMatch[] = [];
        if (isAdmin) {
          const snap = await getDocs(query(collection(db, "matches"), limit(100)));
          snap.forEach(d => list.push({ ...d.data(), id: d.id } as UploadedMatch));
        } else {
          // Publieke matches
          const snapPub = await getDocs(query(collection(db, "matches"), where("visibility", "==", "public"), limit(50)));
          snapPub.forEach(d => list.push({ ...d.data(), id: d.id } as UploadedMatch));
          
          // Eigen matches
          const snapOwn = await getDocs(query(collection(db, "matches"), where("userId", "==", auth.currentUser?.uid), limit(50)));
          snapOwn.forEach(d => { 
            if (!list.find(m => m.id === d.id)) list.push({ ...d.data(), id: d.id } as UploadedMatch); 
          });

          // Ontgrendelde matches
          if (unlockedIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < unlockedIds.length; i += 30) chunks.push(unlockedIds.slice(i, i + 30));
            for (const chunk of chunks) {
              const snapPriv = await getDocs(query(collection(db, "matches"), where("__name__", "in", chunk)));
              snapPriv.forEach(d => { if (!list.find(m => m.id === d.id)) list.push({ ...d.data(), id: d.id } as UploadedMatch); });
            }
          }
        }
        setMatches(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchMatches();

    // Sync Live Broadcasts (Real-time AI Streams)
    const unsubLive = onSnapshot(query(collection(db, "liveMatches"), where("status", "==", "live"), limit(20)), (snap) => {
      const list: LiveMatch[] = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id } as LiveMatch));
      setLiveBroadcasts(list);
    });

    return () => unsubLive();
  }, [isAdmin, isLoggedIn, userProfile]);

  const handleDeleteMatch = async (match: UploadedMatch, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isOwner = auth.currentUser?.uid === match.userId;
    if (!isAdmin && !isOwner) {
      alert("UNAUTHORIZED: You can only delete your own videos.");
      return;
    }

    if (!window.confirm(`TACTICAL PURGE: Are you sure you want to delete "${match.title}"? All files in the cloud will be erased.`)) return;

    setIsDeletingId(match.id);
    try {
      // 1. Storage Cleanup
      if (match.storageNode === 'firebase') {
        // Probeer video onderdelen te verwijderen
        if (match.videoParts) {
          for (const part of match.videoParts) {
            try {
              // Extraheer pad uit de download URL als dat mogelijk is, anders proberen we de URL zelf
              const decodedUrl = decodeURIComponent(part.url);
              const pathPart = decodedUrl.split('/o/')[1]?.split('?')[0];
              if (pathPart) {
                await deleteObject(ref(storage, pathPart));
              }
            } catch (e) { console.warn("Storage Part Delete Error:", e); }
          }
        }
        // Thumbnail
        if (match.thumbnailUrl) {
          try {
            const decodedThumbUrl = decodeURIComponent(match.thumbnailUrl);
            const thumbPath = decodedThumbUrl.split('/o/')[1]?.split('?')[0];
            if (thumbPath) await deleteObject(ref(storage, thumbPath));
          } catch (e) { console.warn("Thumbnail cleanup failed (continuing):", e); }
        }
      }

      // 2. Firestore Cleanup
      await deleteDoc(doc(db, "matches", match.id));
      
      // Update UI
      setMatches(prev => prev.filter(m => m.id !== match.id));
      if (selectedMatch?.id === match.id) setSelectedMatch(null);
      
      alert("PURGE COMPLETE: The video has been removed from the database and cloud.");
    } catch (err: any) {
      console.error("Purge Error:", err);
      alert("PURGE FAULT: " + (err.message || "Unknown error during deletion. Check your permissions."));
    } finally {
      setIsDeletingId(null);
    }
  };

  const openMatch = (match: UploadedMatch) => {
    const sessionKey = `viewed_${match.id}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, 'true');
      updateDoc(doc(db, "matches", match.id), { viewCount: increment(1) });
    }
    setSelectedMatch(match);
    setCurrentPartIdx(0);
    setPendingMatch(null);
  };

  const handleMatchClick = (match: UploadedMatch) => {
    if (!isLoggedIn) { onNavigate('auth', undefined, 'login'); return; }
    setPendingMatch(match);
  };

  const copyMatchLink = (match: UploadedMatch, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const code = match.accessCode || match.id;
    const shareUrl = `${window.location.origin}/index.html?matchCode=${code}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopySuccessId(match.id);
      setTimeout(() => setCopySuccessId(null), 2000);
    });
  };

  const filteredMatches = matches.filter(match => 
    (match.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (match.ownerName && match.ownerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (match.description && match.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const liveMatches = filteredMatches.filter(m => m.isLive);
  const archivedMatches = filteredMatches.filter(m => !m.isLive);

  const filteredLiveBroadcasts = liveBroadcasts.filter(b => 
    (b.teamName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.streamerName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasAnyLive = liveMatches.length > 0 || filteredLiveBroadcasts.length > 0;

  if (selectedMatch) {
    const isYoutube = selectedMatch.storageNode === 'youtube';
    const currentVideoUrl = selectedMatch.videoParts ? selectedMatch.videoParts[currentPartIdx]?.url : selectedMatch.videoUrl;
    const isOwner = auth.currentUser?.uid === selectedMatch.userId;
    const canDelete = isAdmin || isOwner;
    
    return (
      <>
      <div className="space-y-8 animate-in fade-in duration-500 pb-24">
        <div className="flex justify-between items-center px-1">
          <button onClick={() => setSelectedMatch(null)} className="flex items-center gap-3 text-white font-black text-[11px] uppercase bg-indigo-600 px-6 py-4 rounded-2xl hover:bg-indigo-500 transition-all shadow-xl">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg>
            Archive
          </button>
          
          <div className="flex items-center gap-4">
            <button onClick={() => copyMatchLink(selectedMatch)} className={`px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl active:scale-95 ${copySuccessId === selectedMatch.id ? 'bg-emerald-600 text-white' : 'bg-ha-brand text-slate-950'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              {copySuccessId === selectedMatch.id ? 'Done' : 'Share'}
            </button>
            {canDelete && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onNavigate('match-upload', selectedMatch.id)}
                  className="p-4 bg-slate-800 border border-slate-700 text-ha-brand rounded-2xl hover:bg-ha-brand hover:text-slate-950 transition-all shadow-xl active:scale-90"
                  title="Edit Match"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button 
                  onClick={() => handleDeleteMatch(selectedMatch)}
                  disabled={isDeletingId === selectedMatch.id}
                  className="p-4 bg-red-950/20 border border-red-900/30 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-xl active:scale-90"
                >
                  {isDeletingId === selectedMatch.id ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] overflow-hidden shadow-3xl">
           <div className="aspect-video bg-black flex items-center justify-center relative">
              {isYoutube ? (
                <iframe 
                  width="100%" 
                  height="100%" 
                  src={`https://www.youtube.com/embed/${currentVideoUrl}?autoplay=1&modestbranding=1&rel=0`}
                  title="YouTube video player" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              ) : (
                <video ref={videoRef} src={currentVideoUrl} controls className="w-full h-full" crossOrigin="anonymous" playsInline autoPlay muted />
              )}
           </div>
           
           {/* FREE WATCH BANNER */}
           <div className="mx-6 mt-6 bg-gradient-to-r from-ha-brand/10 to-blue-900/20 border border-ha-brand/20 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
             <div className="space-y-2">
               <p className="text-[11px] font-black text-ha-brand uppercase tracking-widest">You can watch this game for free.</p>
               <p className="text-slate-300 text-sm font-medium leading-relaxed max-w-xl">
                 Would you like to help SportAtlas grow and support us in continuing to improve games, highlights, and tools for coaches?
               </p>
               <p className="text-slate-500 text-xs font-medium leading-relaxed max-w-xl">
                 With a voluntary donation, you directly support the development of SportAtlas. Every contribution, big or small, helps us make sports more accessible and more visible.
               </p>
             </div>
             <button
               onClick={() => setShowDonate(true)}
               className="shrink-0 flex items-center gap-2 px-7 py-4 bg-ha-brand text-slate-950 font-black uppercase tracking-[0.2em] rounded-[1.5rem] transition-all active:scale-95 shadow-[0_10px_30px_rgba(6,182,212,0.25)] text-[11px] hover:shadow-[0_10px_30px_rgba(6,182,212,0.4)] whitespace-nowrap"
             >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
               Donate
             </button>
           </div>

           <div className="p-8 space-y-8">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black italic uppercase text-white tracking-tight leading-none">{selectedMatch.title}</h2>
                  <div className="flex items-center gap-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                     <span>{selectedMatch.ownerName}</span>
                     <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                     <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{selectedMatch.viewCount || 0}</div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-ha-bg/50 border border-slate-900 rounded-[2rem]">
                 <p className="text-slate-400 text-xs font-medium leading-relaxed uppercase opacity-70 italic">{selectedMatch.description || 'No description.'}</p>
              </div>
           </div>
        </div>
      </div>
      <DonateModal
        isOpen={showDonate}
        onClose={() => setShowDonate(false)}
        matchCode={selectedMatch?.accessCode || selectedMatch?.id}
      />
      </>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-32 px-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl active:scale-95"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div className="space-y-1">
            <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">{t.watchGames}</h2>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{t.tacticalMatchArchive}</p>
          </div>
        </div>
        {isAdmin && <button onClick={() => onNavigate('match-upload', undefined)} className="p-4 bg-indigo-600 border border-indigo-500 rounded-2xl text-white font-black text-xs uppercase tracking-widest shadow-xl active:scale-90 transition-all">{t.upload}</button>}
      </div>

      {/* SEARCH BAR */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-500 group-focus-within:text-ha-brand transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input 
          type="text"
          placeholder={t.searchGamesClubsCoaches}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0b1224] border border-slate-800 rounded-[2rem] py-6 pl-16 pr-16 text-xs font-black uppercase tracking-widest text-white placeholder:text-slate-700 focus:outline-none focus:border-ha-brand/50 focus:ring-4 focus:ring-ha-brand/10 transition-all shadow-2xl"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-6 flex items-center text-slate-500 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* DONATE BANNER */}
      <button
        onClick={() => setShowDonate(true)}
        className="w-full flex items-center justify-between gap-4 bg-ha-brand/5 border border-ha-brand/20 rounded-[2rem] px-8 py-5 hover:bg-ha-brand/10 hover:border-ha-brand/40 transition-all active:scale-[0.99] group"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-ha-brand/10 rounded-xl flex items-center justify-center border border-ha-brand/20 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#06b6d4" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black text-white uppercase tracking-widest">{t.supportCameraMan}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">SportAtlas films games for free for the Belgian basketball community</p>
          </div>
        </div>
        <span className="text-[10px] font-black text-ha-brand uppercase tracking-widest shrink-0 group-hover:translate-x-1 transition-transform">{t.donate}</span>
      </button>

      {/* LIVE NOW SECTION */}
      {hasAnyLive && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
            <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em] italic">Live Now</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Real-time AI Broadcasts */}
            {filteredLiveBroadcasts.map(stream => (
              <div key={stream.id} onClick={() => onNavigate('match-viewer', undefined, undefined, stream.id)} className="group bg-[#0b1224] border-2 border-red-600/30 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all cursor-pointer hover:border-red-600 active:scale-[0.98] relative">
                 <div className="aspect-video bg-ha-bg relative overflow-hidden">
                    {stream.currentFrame ? (
                      <img src={`data:image/jpeg;base64,${stream.currentFrame}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={stream.teamName} />
                    ) : (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center font-black italic text-slate-700 text-2xl">ACQUIRING FEED...</div>
                    )}
                    <div className="absolute inset-0 bg-red-950/20 group-hover:bg-transparent transition-all"></div>
                    
                    <div className="absolute top-4 left-4 z-20">
                       <div className="px-3 py-1 bg-red-600 text-white rounded-lg flex items-center gap-2 shadow-lg">
                          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                          <span className="text-[8px] font-black uppercase tracking-widest">REAL-TIME AI FEED</span>
                       </div>
                    </div>

                    <div className="absolute bottom-4 right-4 z-20">
                       <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/20 flex items-center gap-3">
                          <span className="text-[10px] font-black italic text-white">{stream.scoreHome}</span>
                          <span className="text-slate-500 font-black">-</span>
                          <span className="text-[10px] font-black italic text-white">{stream.scoreAway}</span>
                       </div>
                    </div>

                    {/* PLAY OVERLAY */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                       </div>
                    </div>
                 </div>
                 <div className="p-8 space-y-2">
                    <h4 className="text-2xl font-black italic uppercase text-white tracking-tight group-hover:text-red-500 transition-colors leading-none truncate">{stream.teamName}</h4>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Broadcast by {stream.streamerName}</p>
                 </div>
              </div>
            ))}

            {/* YouTube Live Streams */}
            {liveMatches.map(match => {
              const isOwner = auth.currentUser?.uid === match.userId;
              const canDelete = isAdmin || isOwner;
              return (
                <div key={match.id} onClick={() => handleMatchClick(match)} className="group bg-[#0b1224] border-2 border-red-600/30 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all cursor-pointer hover:border-red-600 active:scale-[0.98] relative">
                   <div className="aspect-video bg-ha-bg relative overflow-hidden">
                      {match.thumbnailUrl ? <img src={match.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={match.title} /> : <div className="w-full h-full bg-slate-900 flex items-center justify-center font-black italic text-slate-700 text-2xl">HOOPSATLAS</div>}
                      <div className="absolute inset-0 bg-red-950/20 group-hover:bg-transparent transition-all"></div>
                      
                      <div className="absolute top-4 left-4 z-20">
                         <div className="px-3 py-1 bg-red-600 text-white rounded-lg flex items-center gap-2 shadow-lg">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                            <span className="text-[8px] font-black uppercase tracking-widest">LIVE</span>
                         </div>
                      </div>

                      {/* PLAY OVERLAY */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                         </div>
                      </div>

                      {canDelete && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 z-30 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onNavigate('match-upload', match.id); }}
                            className="p-3 bg-slate-900/80 backdrop-blur-md text-ha-brand rounded-xl shadow-xl hover:bg-ha-brand hover:text-slate-950 active:scale-90 transition-all"
                            title="Edit Match"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button 
                            onClick={(e) => handleDeleteMatch(match, e)}
                            disabled={isDeletingId === match.id}
                            className="absolute top-4 right-4 p-3 bg-red-600/80 backdrop-blur-md text-white rounded-xl shadow-xl z-30 md:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 active:scale-90"
                          >
                            {isDeletingId === match.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="3 6 6 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>}
                          </button>
                        </div>
                      )}
                   </div>
                   <div className="p-8 space-y-2">
                      <h4 className="text-2xl font-black italic uppercase text-white tracking-tight group-hover:text-red-500 transition-colors leading-none truncate">{match.title}</h4>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{match.ownerName} {isOwner && '(You)'}</p>
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AdBanner isPaid={!!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()))} adSlot="match_archive_mid" />

      {/* ARCHIVE SECTION */}
      <div className="space-y-6">
        <div className="px-2">
           <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic">Match Archive</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {loading ? (
            <div className="col-span-full py-20 flex justify-center"><div className="w-10 h-10 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div></div>
          ) : archivedMatches.length > 0 ? archivedMatches.map(match => {
          const isOwner = auth.currentUser?.uid === match.userId;
          const canDelete = isAdmin || isOwner;
          
          return (
            <div key={match.id} onClick={() => handleMatchClick(match)} className={`group bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all cursor-pointer hover:border-ha-brand/40 active:scale-[0.98] relative`}>
               <div className="aspect-video bg-ha-bg relative overflow-hidden">
                  {match.thumbnailUrl ? <img src={match.thumbnailUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={match.title} /> : <div className="w-full h-full bg-slate-900 flex items-center justify-center font-black italic text-slate-700 text-2xl">HOOPSATLAS</div>}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/0 transition-all"></div>
                  
                  {/* STORAGE TYPE BADGE */}
                  <div className="absolute bottom-4 right-4 z-20">
                     <div className={`px-3 py-1 rounded-lg border backdrop-blur-md flex items-center gap-2 ${match.storageNode === 'youtube' ? 'bg-red-600/60 border-red-400 text-white' : 'bg-black/60 border-white/20 text-slate-400'}`}>
                        <span className="text-[6px] font-black uppercase tracking-tighter">{match.storageNode === 'youtube' ? 'YOUTUBE' : 'HQ'}</span>
                     </div>
                  </div>

                  {/* PLAY OVERLAY */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <div className="w-16 h-16 bg-ha-brand rounded-full flex items-center justify-center text-slate-950 shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                     </div>
                  </div>

                  {/* EDIT, DELETE & SHARE BUTTONS - Visible for Owner or Admin */}
                  <div className="absolute top-4 right-4 flex items-center gap-2 z-30 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => copyMatchLink(match, e)}
                      className={`p-3 rounded-xl shadow-xl transition-all active:scale-90 ${copySuccessId === match.id ? 'bg-emerald-600 text-white' : 'bg-slate-900/80 backdrop-blur-md text-ha-brand hover:bg-ha-brand hover:text-slate-950'}`}
                      title="Share Match"
                    >
                      {copySuccessId === match.id ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      )}
                    </button>
                    {canDelete && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onNavigate('match-upload', match.id); }}
                          className="p-3 bg-slate-900/80 backdrop-blur-md text-ha-brand rounded-xl shadow-xl hover:bg-ha-brand hover:text-slate-950 active:scale-90 transition-all"
                          title="Edit Match"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button 
                          onClick={(e) => handleDeleteMatch(match, e)}
                          disabled={isDeletingId === match.id}
                          className="p-3 bg-red-600/80 backdrop-blur-md text-white rounded-xl shadow-xl hover:bg-red-600 active:scale-90 transition-all"
                        >
                          {isDeletingId === match.id ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          )}
                        </button>
                      </>
                    )}
                  </div>
               </div>
               <div className="p-8 space-y-2">
                  <h4 className="text-2xl font-black italic uppercase text-white tracking-tight group-hover:text-ha-brand transition-colors leading-none truncate">{match.title}</h4>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{match.ownerName} {isOwner && '(You)'}</p>
               </div>
            </div>
          );
        }) : (
          <div className="col-span-full py-32 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]"><p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No games found.</p></div>
        )}
      </div>
    </div>
      <DonateModal
        isOpen={showDonate}
        onClose={() => { setShowDonate(false); setPendingMatch(null); }}
        matchCode={selectedMatch?.accessCode || selectedMatch?.id || pendingMatch?.accessCode || pendingMatch?.id}
      />

      {/* FREE WATCH POP-UP */}
      {pendingMatch && (
        <div className="fixed inset-0 bg-ha-bg/95 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
          <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-lg shadow-3xl relative animate-in zoom-in duration-300 space-y-8">
            <button onClick={() => setPendingMatch(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div className="w-16 h-16 bg-ha-brand/10 rounded-[1.75rem] flex items-center justify-center border border-ha-brand/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#06b6d4" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-black text-ha-brand uppercase tracking-widest">You can watch this game for free.</p>
              <p className="text-white text-base font-bold leading-relaxed">
                Would you like to help SportAtlas grow and support us in continuing to improve games, highlights, and tools for coaches?
              </p>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                With a voluntary donation, you directly support the development of SportAtlas. Every contribution, big or small, helps us make sports more accessible and more visible.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => { setShowDonate(true); setPendingMatch(null); }}
                className="flex-1 py-5 bg-ha-brand text-slate-950 font-black uppercase tracking-[0.2em] rounded-[2rem] transition-all active:scale-95 shadow-[0_20px_40px_rgba(6,182,212,0.2)] text-[12px] flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                Donate
              </button>
              <button
                onClick={() => openMatch(pendingMatch)}
                className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black uppercase tracking-[0.2em] rounded-[2rem] transition-all active:scale-95 text-[12px] hover:text-white hover:border-slate-700"
              >
                Watch for free
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 opacity-30 pt-2 border-t border-slate-900">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-[0.2em]">Stripe PCI-DSS Encryption</p>
            </div>
          </div>
        </div>
      )}
  </div>
  );
};

export default MatchArchive;
