
import React, { useState, useRef, useEffect } from 'react';
import { Drill, Team, UserProfile } from '../../types';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { callAI } from '../../utils/ai';

interface DrillExecutionProps {
  drill: Drill;
  onBack: () => void;
  userProfile?: UserProfile | null;
  teams?: Team[];
}

const DrillExecution: React.FC<DrillExecutionProps> = ({ drill, onBack, userProfile, teams = [] }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [feedback, setFeedback] = useState<string>("WAITING FOR CAMERA...");
  const [dribbleCount, setDribbleCount] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'ready' | 'active' | 'finished'>('idle');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastDribbleDetected, setLastDribbleDetected] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  
  // Vision states
  const [distanceStatus, setDistanceStatus] = useState<'checking' | 'too-close' | 'ready'>('checking');
  const [playerLocked, setPlayerLocked] = useState(false);
  const [ballLocked, setBallLocked] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, status]);

  useEffect(() => {
    return () => stopSession();
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user', 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 15 } 
        }, 
        audio: false 
      });
      setStream(mediaStream);
      setStatus('ready');
    } catch (err: any) {
      setFeedback("CAMERA ERROR: CHECK PERMISSIONS");
    }
  };

  const stopSession = () => {
    if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    if (status === 'active') setStatus('finished');
  };

  const transmitReport = async () => {
    if (!userProfile?.uid || teams.length === 0) return;
    setIsReporting(true);
    try {
      for (const team of teams) {
        await addDoc(collection(db, "squadMessages"), {
          teamId: team.id,
          senderId: userProfile.uid,
          senderName: userProfile.name,
          content: `🎯 PERFORMANCE REPORT: I just finished training "${drill.title}". Result: ${dribbleCount} successful units!`,
          createdAt: Date.now()
        });
      }
      alert("Report successfully transmitted to coaching staff!");
      onBack();
    } catch (e) {
      alert("Transmission failed. Check connection.");
    } finally {
      setIsReporting(false);
    }
  };

  const captureEnhancedFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = 320; 
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
  };

  const runTrackingCycle = async () => {
    if (isAnalyzing || !stream) return;

    const frame = captureEnhancedFrame();
    if (!frame) return;

    setIsAnalyzing(true);
    try {
      const maxRetries = 1; // Lower retries for real-time tracking to maintain responsiveness
      let attempt = 0;
      let success = false;
      let responseText = '';

      while (attempt <= maxRetries && !success) {
        try {
          if (distanceStatus !== 'ready') {
            responseText = await callAI({
              model: 'gpt-4o',
              messages: [{
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame}` } },
                  { type: 'text', text: `Quick check: Is there a person clearly visible from head to toe? Return JSON: {"ready": boolean, "instruction": "string"}` }
                ]
              }],
              response_format: { type: 'json_object' },
              max_tokens: 100
            });
          } else {
            responseText = await callAI({
              model: 'gpt-4o',
              messages: [{
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame}` } },
                  { type: 'text', text: `Estimate performance units (like dribbles) since last check. Be very concise. Return JSON: { "dribbles": number, "feedback": "string" }` }
                ]
              }],
              response_format: { type: 'json_object' },
              max_tokens: 100
            });
          }
          success = true;
        } catch (e: any) {
          console.error(`Vision attempt ${attempt + 1} failed:`, e);
          attempt++;
          if (attempt > maxRetries) throw e;
          // No delay for real-time tracking, just retry once quickly
        }
      }

      const data = JSON.parse(responseText || '{}');
      
      if (distanceStatus !== 'ready') {
        const isActuallyReady = data.ready;
        setPlayerLocked(isActuallyReady);
        setBallLocked(isActuallyReady);

        if (isActuallyReady) {
          setDistanceStatus('ready');
          setFeedback("POSITIONS LOCKED - START!");
          if (analysisTimerRef.current) {
            clearInterval(analysisTimerRef.current);
            analysisTimerRef.current = window.setInterval(runTrackingCycle, 8000); 
          }
        } else {
          setDistanceStatus('too-close');
          setFeedback(data.instruction || "STEP FURTHER BACK");
        }
      } else {
        if (data.dribbles > 0) {
          setDribbleCount(prev => prev + data.dribbles);
          setLastDribbleDetected(true);
          setTimeout(() => setLastDribbleDetected(false), 1000);
        }
        setFeedback(data.feedback?.toUpperCase() || "TRACKING ACTIVE");
      }
    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startDrill = () => {
    setStatus('active');
    setDribbleCount(0);
    setDistanceStatus('checking');
    setFeedback("CALIBRATING...");
    analysisTimerRef.current = window.setInterval(runTrackingCycle, 6000);
  };

  if (status === 'idle') {
    return (
      <div className="fixed inset-0 z-[100] bg-ha-bg flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-10">
          <div className="w-24 h-24 bg-ha-brand/10 border-2 border-ha-brand/30 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl">
             <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">Atlas <span className="text-ha-brand">Optics</span></h2>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] max-w-xs mx-auto">
              Prepare for tactical evaluation of "{drill.title}".<br/>
              <span className="text-emerald-500 mt-2 block">(ULTRA-FAST LITE MODE)</span>
            </p>
          </div>
          <button onClick={startCamera} className="w-full py-6 bg-ha-brand text-slate-950 font-black uppercase text-xs tracking-[0.3em] rounded-2xl shadow-2xl active:scale-95 transition-all">Start Camera</button>
          <button onClick={onBack} className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Abort</button>
        </div>
      </div>
    );
  }

  if (status === 'finished') {
    return (
      <div className="fixed inset-0 z-[100] bg-ha-bg flex flex-col items-center justify-center p-8 space-y-12 animate-in zoom-in duration-500">
         <div className="text-center space-y-4">
            <h2 className="text-5xl font-black italic uppercase text-white tracking-tighter">Session <span className="text-ha-brand">Complete</span></h2>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">{drill.title}</p>
         </div>
         
         <div className="bg-[#0b1224] border border-slate-800 p-10 rounded-[3rem] text-center w-full max-w-sm shadow-3xl">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em] mb-2">SCORE</p>
            <p className="text-8xl font-black italic text-white tracking-tighter">{dribbleCount}</p>
            <p className="text-[10px] font-bold text-slate-700 uppercase mt-4">Calculated by Atlas Optics</p>
         </div>

         <div className="w-full max-w-sm space-y-4">
            <button 
              onClick={transmitReport} 
              disabled={isReporting || teams.length === 0}
              className="w-full py-6 bg-indigo-600 text-white font-black uppercase text-xs tracking-[0.3em] rounded-2xl shadow-2xl active:scale-95 transition-all disabled:opacity-50"
            >
              {isReporting ? 'TRANSMITTING...' : 'Transmit Report to Coach'}
            </button>
            <button onClick={onBack} className="w-full py-5 bg-slate-900 border border-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-widest rounded-2xl">Discard & Return</button>
         </div>
         {teams.length === 0 && <p className="text-red-500 text-[8px] font-black uppercase tracking-widest">Note: Not currently linked to any squads.</p>}
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col font-tactical overflow-hidden transition-colors duration-500 ${distanceStatus === 'ready' ? 'bg-green-500/10' : 'bg-black'}`}>
      
      <div className="absolute top-0 left-0 w-full p-6 z-20 flex items-center justify-between pointer-events-none">
        <button onClick={stopSession} className="pointer-events-auto p-4 bg-black/40 backdrop-blur-xl rounded-2xl text-white border border-white/10 active:scale-90 transition-all">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>

        <div className={`transition-all duration-300 transform ${lastDribbleDetected ? 'scale-125' : 'scale-100'} ${distanceStatus !== 'ready' ? 'opacity-0' : 'opacity-100'}`}>
          <div className={`bg-slate-900/90 border-2 backdrop-blur-2xl px-10 py-4 rounded-[2.5rem] text-center shadow-2xl ${lastDribbleDetected ? 'border-green-500 shadow-green-500/20' : 'border-ha-brand/30'}`}>
            <p className="text-[9px] font-black text-ha-brand uppercase tracking-[0.4em]">SCORE</p>
            <p className="text-6xl font-black italic text-white tabular-nums tracking-tighter">{dribbleCount}</p>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 pointer-events-auto flex flex-col gap-2">
           <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${playerLocked ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
              <span className="text-[7px] font-black text-white uppercase tracking-widest">PLAYER</span>
           </div>
           <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ballLocked ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`}></div>
              <span className="text-[7px] font-black text-white uppercase tracking-widest">BALL</span>
           </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {distanceStatus !== 'ready' && (
            <div className="w-[80%] h-[85%] border-[3px] border-dashed border-white/20 rounded-[4rem] flex flex-col items-center justify-end pb-20 relative">
               <div className="absolute top-10 w-24 h-24 border-2 border-white/10 rounded-full"></div>
               <div className="w-32 h-8 bg-white/5 rounded-full mb-4"></div>
               <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-4">Stand inside this area</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-ha-bg p-8 space-y-4 z-30">
        <div className={`p-6 rounded-[2rem] text-center border transition-all duration-500 ${distanceStatus === 'ready' ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-900/50 border-white/5'}`}>
          <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em] mb-1">Atlas Optics Lite</p>
          <p className={`text-xl font-black italic text-white uppercase tracking-tighter ${isAnalyzing ? 'animate-pulse' : ''}`}>
            {feedback}
          </p>
        </div>

        {status === 'ready' ? (
          <button onClick={startDrill} className="w-full py-6 bg-ha-brand text-slate-950 font-black uppercase text-xs tracking-[0.4em] rounded-[2rem] shadow-2xl active:scale-95 transition-all">Start Calibration</button>
        ) : (
          <button onClick={stopSession} className="w-full py-6 bg-red-600 text-white font-black uppercase text-xs tracking-[0.4em] rounded-[2rem] active:scale-95 transition-all">Finish Session</button>
        )}
      </div>
    </div>
  );
};

export default DrillExecution;
