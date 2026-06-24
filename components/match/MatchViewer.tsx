import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { LiveMatch, UserProfile } from '../../types';

interface MatchViewerProps {
  streamId: string;
  userProfile?: UserProfile | null;
  onBack: () => void;
}

const MatchViewer: React.FC<MatchViewerProps> = ({ streamId, userProfile, onBack }) => {
  const [matchData, setMatchData] = useState<LiveMatch | null>(null);
  const [loading, setLoading] = useState(true);

  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "liveMatches", streamId), (snap) => {
      if (snap.exists()) {
        setMatchData(snap.data() as LiveMatch);
        setLoading(false);
      } else {
        setMatchData(null);
        setLoading(false);
      }
    }, (err) => {
      console.error("Match Viewer Sync Error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [streamId]);

  if (loading) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Waiting for Uplink...</p>
    </div>
  );

  if (!matchData) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 space-y-6">
       <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-slate-700 border border-dashed border-slate-800">
         <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M12 2v20M4.93 4.93 14.14 14.14M4.93 19.07 14.14-14.14"/></svg>
       </div>
       <p className="text-white font-black italic uppercase text-center">Stream has terminated or is unauthorized.</p>
       <button onClick={onBack} className="px-8 py-3 bg-white text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-xl">Back to HQ</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-tactical">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {matchData.currentFrame ? (
          <img src={`data:image/jpeg;base64,${matchData.currentFrame}`} className="w-full h-full object-cover" />
        ) : (
          <div className="text-ha-brand animate-pulse font-black text-sm uppercase">Acquiring Visuals...</div>
        )}
        
        <div className="absolute top-10 left-10 right-10 flex justify-between items-start pointer-events-none">
           <div className="bg-red-600 px-3 py-1 rounded border border-white/20 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
              <span className="text-[8px] font-black text-white uppercase tracking-widest">AUTHORIZED LIVE FEED</span>
           </div>
           <button onClick={onBack} className="pointer-events-auto w-10 h-10 bg-black/40 backdrop-blur-md rounded-xl text-white flex items-center justify-center border border-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>
        </div>

        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xl border border-white/10 px-10 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-12">
            <div className="text-center">
               <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">TEAM</p>
               <p className="text-4xl font-black italic text-white leading-none">{matchData.scoreHome}</p>
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div className="text-center">
               <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1">OPP</p>
               <p className="text-4xl font-black italic text-white leading-none">{matchData.scoreAway}</p>
            </div>
        </div>
      </div>

      <div className="bg-ha-bg p-8 border-t border-slate-900">
         <p className="text-[8px] font-black text-ha-brand uppercase tracking-[0.2em] mb-2 italic">Broadcast Logic: {matchData.streamerName}</p>
         <div className="bg-ha-bg border border-slate-800 p-4 rounded-2xl">
            {isPro ? (
              <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight italic">
                Magic Coach: "{matchData.aiCommentary || 'Awaiting analysis...'}"
              </p>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">AI Commentary Restricted</p>
                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest animate-pulse">Upgrade to Pro for Real-time AI Intel</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default MatchViewer;