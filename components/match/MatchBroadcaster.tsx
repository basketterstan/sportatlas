
import React, { useState, useRef, useEffect } from 'react';
import { doc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Team, UserProfile } from '../../types';
import { callAI } from '../../utils/ai';

interface MatchBroadcasterProps {
  userProfile: UserProfile;
  onBack: () => void;
}

const MatchBroadcaster: React.FC<MatchBroadcasterProps> = ({ userProfile, onBack }) => {
  const [isLive, setIsLive] = useState(false);
  const [scoreHome, setScoreHome] = useState(0);
  const [scoreAway, setScoreAway] = useState(0);
  const [aiCommentary, setAiCommentary] = useState("");
  const [visibility, setVisibility] = useState<'global' | 'team'>('global');
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [streamId, setStreamId] = useState<string>(`stream_${userProfile.uid}_${Date.now()}`);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isAuthorized = userProfile.isAdmin || userProfile.isStreamer;

  const runAiAnalysis = async () => {
    if (!canvasRef.current || !isLive) return;
    const frame = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
    try {
      const commentary = await callAI({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame}` } },
            { type: 'text', text: "Analyze this basketball match frame. Give 1 VERY short sentence of tactical commentary (max 10 words)." }
          ]
        }],
        max_tokens: 50
      });
      setAiCommentary(commentary);
    } catch (e) { console.warn("AI commentary generation failed:", e); }
  };

  useEffect(() => {
    if (isLive) {
      const aiInterval = setInterval(runAiAnalysis, 60000);
      return () => clearInterval(aiInterval);
    }
  }, [isLive]);

  useEffect(() => {
    if (!isAuthorized) {
      alert("UNAUTHORIZED UPLINK ATTEMPT: Your account lacks broadcast credentials.");
      onBack();
      return;
    }

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) { alert("Hardware access denied."); }
    };
    initCamera();

    const q = userProfile.role === 'player' 
      ? query(collection(db, "teams"), where("memberUids", "array-contains", userProfile.uid))
      : query(collection(db, "teams"), where("coachId", "==", userProfile.uid));

    const unsub = onSnapshot(q, (snap) => {
      const list: Team[] = [];
      (snap as any).forEach((d: any) => list.push({ ...d.data(), id: d.id } as Team));
      setMyTeams(list);
      if (list.length > 0) setSelectedTeamId(list[0].id);
    }, (err) => console.error("Broadcaster Sync Error:", err));

    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      unsub();
    };
  }, [isAuthorized]);

  const stopStream = async () => {
    if (isLive) {
      await deleteDoc(doc(db, "liveMatches", streamId));
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setIsLive(false);
    onBack();
  };

  const startStream = async () => {
    if (!isAuthorized) return;
    
    const team = myTeams.find(t => t.id === selectedTeamId);
    const finalTeamName = visibility === 'global' ? 'GLOBAL EXHIBITION' : (team?.name || 'SQUAD MATCH');
    const finalTeamId = visibility === 'global' ? 'global' : selectedTeamId;
    
    const newStreamId = `stream_${userProfile.uid}_${Date.now()}`;
    setStreamId(newStreamId);

    try {
      await setDoc(doc(db, "liveMatches", newStreamId), {
        id: newStreamId,
        teamId: finalTeamId,
        teamName: finalTeamName,
        streamerId: userProfile.uid,
        streamerName: userProfile.name,
        scoreHome: 0,
        scoreAway: 0,
        status: 'live',
        visibility: visibility,
        createdAt: Date.now()
      });

      setIsLive(true);

      const interval = setInterval(async () => {
        if (!canvasRef.current || !videoRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        await updateDoc(doc(db, "liveMatches", newStreamId), {
          currentFrame: frame,
          scoreHome,
          scoreAway,
          aiCommentary
        });
      }, 1500);

      return () => clearInterval(interval);
    } catch (err) { alert("Could not initialize Firestore document."); }
  };

  if (!isAuthorized) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-tactical">
      <div className="flex-1 relative bg-ha-bg overflow-hidden flex items-center justify-center">
         <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-all duration-700 ${!isLive ? 'blur-xl opacity-40 grayscale' : 'opacity-100'}`} />
         <canvas ref={canvasRef} className="hidden" />

         {!isLive && (
           <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 pointer-events-none">
              <div className="w-16 h-16 border-2 border-dashed border-white/20 rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">Standby for Fast Initialization</p>
           </div>
         )}
         
         <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none">
            <button onClick={stopStream} className="pointer-events-auto p-4 bg-black/40 backdrop-blur-xl border border-white/10 text-white rounded-2xl shadow-xl active:scale-90 transition-all font-black text-[10px]">
              {isLive ? 'END UPLINK' : 'ABORT'}
            </button>
            
            {isLive && (
              <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 flex flex-col items-center">
                <span className="text-[8px] font-black text-red-500 animate-pulse">● LIVE UPLINK ({visibility.toUpperCase()})</span>
                <div className="flex gap-4 items-center mt-1">
                   <span className="text-2xl font-black italic text-white">{scoreHome}</span>
                   <span className="text-slate-500 font-black">-</span>
                   <span className="text-2xl font-black italic text-white">{scoreAway}</span>
                </div>
              </div>
            )}
         </div>
      </div>

      <div className="bg-ha-bg border-t border-slate-900 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] z-50">
        {!isLive ? (
          <div className="p-8 space-y-8 animate-in slide-in-from-bottom duration-500">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-ha-brand/10 rounded-2xl flex items-center justify-center text-ha-brand border border-ha-brand/20">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div className="space-y-0.5">
                   <h2 className="text-xl font-black italic uppercase text-white tracking-tighter leading-none">Fast Broadcaster</h2>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Model: Gemini 3 Flash (Optimized)</p>
                </div>
             </div>
             
             <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Distribution Hub</p>
                  <div className="grid grid-cols-2 gap-3 p-1 bg-ha-bg border border-slate-900 rounded-2xl">
                    <button 
                      onClick={() => setVisibility('global')}
                      className={`py-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visibility === 'global' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-600'}`}
                    >
                      Global
                    </button>
                    <button 
                      onClick={() => setVisibility('team')}
                      className={`py-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${visibility === 'team' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}
                    >
                      Squad
                    </button>
                  </div>
                </div>

                {visibility === 'team' && (
                  <div className="space-y-2 animate-in fade-in zoom-in duration-300">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Select Active Squad</p>
                    {myTeams.length > 0 ? (
                      <select 
                        value={selectedTeamId}
                        onChange={e => setSelectedTeamId(e.target.value)}
                        className="w-full bg-ha-bg border border-slate-900 rounded-xl p-5 text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner appearance-none"
                      >
                        {myTeams.map(team => (
                          <option key={team.id} value={team.id}>{team.name} ({team.category})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-4 bg-red-600/10 border border-red-500/20 rounded-xl text-[9px] font-black text-red-500 uppercase text-center">
                        NO SQUADS REGISTERED
                      </div>
                    )}
                  </div>
                )}
             </div>

             <button 
              onClick={startStream} 
              disabled={visibility === 'team' && myTeams.length === 0}
              className="w-full py-6 bg-red-600 text-white font-black uppercase tracking-[0.3em] rounded-2xl shadow-2xl active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
             >
               Initialize Uplink
             </button>
          </div>
        ) : (
          <div className="p-8 grid grid-cols-2 gap-4 animate-in slide-in-from-bottom duration-500">
             <div className="space-y-4">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest text-center italic">TEAM PERFORMANCE</p>
                <div className="flex justify-center gap-2">
                   <button onClick={() => setScoreHome(s => Math.max(0, s - 1))} className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl text-white font-black hover:bg-slate-800 transition-colors">-</button>
                   <button onClick={() => setScoreHome(s => s + 1)} className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl text-white font-black hover:bg-slate-800 transition-colors">+</button>
                </div>
             </div>
             <div className="space-y-4">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest text-center italic">OPPONENT LOGIC</p>
                <div className="flex justify-center gap-2">
                   <button onClick={() => setScoreAway(s => Math.max(0, s - 1))} className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl text-white font-black hover:bg-slate-800 transition-colors">-</button>
                   <button onClick={() => setScoreAway(s => s + 1)} className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl text-white font-black hover:bg-slate-800 transition-colors">+</button>
                </div>
             </div>
             <div className="col-span-2 pt-6 mt-2 border-t border-slate-900">
                <div className="flex items-center gap-2 mb-3">
                   <div className="w-1.5 h-1.5 bg-ha-brand rounded-full animate-pulse"></div>
                   <p className="text-[9px] font-black text-ha-brand uppercase tracking-[0.2em] italic">Fast AI Analysis (60s cycle)</p>
                </div>
                <div className="bg-ha-bg/50 border border-slate-900 p-5 rounded-2xl shadow-inner">
                  <p className="text-white text-[13px] italic font-bold uppercase tracking-tight leading-relaxed">
                    "{aiCommentary || 'Calibrating fast tactical overview...'}"
                  </p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchBroadcaster;
