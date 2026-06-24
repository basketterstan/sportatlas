
import React, { useState, useRef, useEffect } from 'react';
import { storage, auth, db, cleanObject } from '../../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Team, UserProfile, Drill, SkillFocus, Level, ViewState } from '../../types';
import AdBanner from '../shared/AdBanner';
import { callAI } from '../../utils/ai';

interface MatchAnalysisProps {
  userProfile: UserProfile;
  team?: Team | null;
  onBack: () => void;
  onSaveAsPlay?: (drill: Drill) => Promise<void>;
  onNavigate?: (view: ViewState) => void;
}

interface TacticalPlay {
  timestamp: string;
  team: 'home' | 'away';
  description: string;
  coachingPoint: string;
  impact: 'positive' | 'negative' | 'neutral';
  efficiencyScore?: number;
}

interface AnalysisResult {
  summary: string;
  highlights: string[];
  plays: TacticalPlay[];
  overallStrategyImprovement: string;
  shotQualityMetric: string;
  spacingEfficiency: string;
}

interface SavedAnalysis {
  id: string;
  videoName: string;
  videoUrl: string;
  result: AnalysisResult;
  createdAt: number;
  teamId?: string;
}

const MatchAnalysis: React.FC<MatchAnalysisProps> = ({ userProfile, team, onBack, onSaveAsPlay, onNavigate }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [isConvertingToPlay, setIsConvertingToPlay] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());
  const canStream = isPro || userProfile?.isStreamer;

  useEffect(() => {
    if (!auth.currentUser || !isPro) return;
    const q = query(collection(db, "visionAnalyses"), where("userId", "==", auth.currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: SavedAnalysis[] = [];
      (snap as any).forEach((d: any) => list.push({ ...d.data(), id: d.id } as SavedAnalysis));
      setHistory(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 10));
    });
    return () => unsub();
  }, [isPro]);

  // SMART RECOVERY PARSER
  const smartParseAiJson = (text: string) => {
    let cleaned = text.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) cleaned = jsonMatch[0];
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      let repaired = cleaned;
      if (!repaired.endsWith('}')) repaired += '}';
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        throw new Error("Malformed response.");
      }
    }
  };

  const runAnalysis = async () => {
    if (!videoFile || !auth.currentUser) return;
    setIsAnalyzing(true);
    setAiStatus('Uploading tactical footage...');
    try {
      const storagePath = `match-analysis/${auth.currentUser.uid}/${Date.now()}_${videoFile.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, videoFile);
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100), 
          (err) => reject(err), 
          async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
      });
      setAiStatus('Vision AI performing Deep Scan...');
      
      const extractVideoFrame = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          const url = URL.createObjectURL(file);
          video.src = url;
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.currentTime = 2;
          video.onloadeddata = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            resolve(base64);
          };
          video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load video')); };
        });
      };

      let frameBase64: string | null = null;
      try {
        frameBase64 = await extractVideoFrame(videoFile);
      } catch (e) {
        console.warn('Frame extraction failed, proceeding with text-only analysis');
      }

      const maxRetries = 2;
      let attempt = 0;
      let success = false;
      let data: any = null;

      while (attempt <= maxRetries && !success) {
        try {
          const userContent: any[] = [];
          if (frameBase64) {
            userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameBase64}` } });
          }
          userContent.push({
            type: 'text',
            text: `Analyze this basketball match footage (file: "${videoFile.name}"). Return detailed JSON with:
            - summary: A high-level tactical summary.
            - highlights: A list of key moments.
            - plays: An array of TacticalPlay objects { timestamp, team, description, coachingPoint, impact, efficiencyScore }.
            - overallStrategyImprovement: Advice on how to improve the strategy.
            - shotQualityMetric: A percentage or score for shot quality.
            - spacingEfficiency: A percentage or score for spacing.
            RAW JSON ONLY. No conversational text.`
          });

          const responseText = await callAI({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'You are an elite basketball tactical analyst. Return ONLY valid JSON.' },
              { role: 'user', content: userContent }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 8000
          });
          if (!responseText) throw new Error("Empty response");

          data = smartParseAiJson(responseText);
          success = true;
        } catch (err: any) {
          console.error(`Analysis attempt ${attempt + 1} failed:`, err);
          attempt++;
          if (attempt > maxRetries) throw err;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      const docRef = await addDoc(collection(db, "visionAnalyses"), { userId: auth.currentUser.uid, videoName: videoFile.name, videoUrl: downloadUrl, result: data, teamId: team?.id || null, createdAt: Date.now() });
      setResult(data);
      setActiveAnalysisId(docRef.id);
    } catch (err: any) { 
      console.error(err);
      alert("Tactical Analysis Fault. The file might be too large or complex for real-time link."); 
    } finally { setIsAnalyzing(false); }
  };

  const convertToTacticalPlay = async () => {
    if (!result || !auth.currentUser) return;
    setIsConvertingToPlay(true);
    setAiStatus("Translating Vision to Geometry...");
    
    const maxRetries = 2;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        const responseText = await callAI({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a tactical basketball diagrammer. Return ONLY valid JSON. No conversational text.' },
            { role: 'user', content: `Convert match analysis results into a 3-frame Diagram Play. Analysis: ${JSON.stringify(result)}. RAW JSON ONLY. Keep coordinates simple.` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 8000
        });
        const rawJson = smartParseAiJson(responseText);
        const newPlay: Drill = {
          id: crypto.randomUUID(),
          userId: auth.currentUser.uid,
          title: `V-SCAN: ${rawJson.title || 'Synthesized Action'}`,
          type: 'play',
          focus: SkillFocus.TEAM_OFFENSE,
          level: Level.ADULT,
          duration: 15,
          steps: rawJson.steps || ["Extracted from AI data."],
          tags: ["vision-ai", "synthesized"],
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          boards: rawJson.boards?.map((b: any) => ({
            ...b,
            id: crypto.randomUUID(),
            players: b.players?.map((p: any) => ({ ...p, id: crypto.randomUUID() })) || [],
            lines: b.lines?.map((l: any) => ({ ...l, id: crypto.randomUUID() })) || [],
            texts: [],
            courtType: 'half'
          })) || []
        };
        if (onSaveAsPlay) {
          await onSaveAsPlay(newPlay);
          alert("Tactical Play deployed!");
        }
        success = true;
      } catch (e: any) {
        console.error(`Conversion attempt ${attempt + 1} failed:`, e);
        attempt++;
        if (attempt > maxRetries) {
          alert("Synthesis encountered an error during re-translation.");
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    setIsConvertingToPlay(false);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-32 px-1 max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between sticky top-0 bg-ha-bg py-4 z-50 px-2">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">VISION <span className="text-indigo-400">ANALYST</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">AI Tactical Video Intelligence</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      {!result && !isAnalyzing ? (
        <div className="space-y-10 px-2">
           <div onClick={() => isPro ? fileInputRef.current?.click() : alert("PRO FEATURE: Tactical Video Intelligence is only available for Pro users.")} className={`w-full aspect-video bg-[#0b1224] border-4 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center gap-6 group transition-all cursor-pointer shadow-3xl ${isPro ? 'hover:border-indigo-500/50 hover:bg-slate-900/60' : 'opacity-60 grayscale'}`}>
              <div className={`w-20 h-20 bg-indigo-600/10 border border-indigo-500/30 rounded-[2rem] flex items-center justify-center text-indigo-400 transition-transform ${isPro ? 'group-hover:scale-110' : ''}`}>
                {isPro ? (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                )}
              </div>
              <div className="text-center space-y-2">
                 <p className="text-xl font-black italic uppercase text-white tracking-tighter">{!isPro ? 'Unlock Vision AI' : (videoFile ? videoFile.name : 'Upload Tactical Footage')}</p>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">{!isPro ? 'Pro Subscription Required' : 'MP4, MOV supported • Fast AI Scan Active'}</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="hidden" accept="video/*" />
           </div>
           {videoFile && isPro && ( <button onClick={runAnalysis} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl active:scale-95 transition-all">Launch Fast Scan</button> )}
           {canStream && onNavigate && ( <button onClick={() => onNavigate('match-broadcaster')} className="w-full py-6 bg-red-600/10 border border-red-500/30 rounded-[2rem] text-red-500 font-black uppercase text-xs tracking-[0.4em] flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>Initialize Live Uplink</button> )}
        </div>
      ) : isAnalyzing ? (
        <div className="py-32 flex flex-col items-center justify-center space-y-12 animate-in zoom-in px-8">
           <div className="relative">
              <div className="w-32 h-32 rounded-[3.5rem] bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center mx-auto shadow-3xl"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
           </div>
           <div className="text-center space-y-4">
              <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter animate-pulse">{aiStatus}</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Synthesizing court geometry data: {Math.round(uploadProgress)}%</p>
           </div>
           <div className="w-full max-w-xs h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner"><div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div>
        </div>
      ) : result && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 px-2">
           <div className="bg-indigo-600 border border-indigo-500 p-8 rounded-[2.5rem] shadow-3xl space-y-6 relative overflow-hidden">
              <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 blur-3xl rounded-full"></div>
              <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">Tactical <span className="text-indigo-200">Intelligence</span></h3>
              <p className="text-indigo-100 text-sm font-medium leading-relaxed uppercase tracking-tight relative z-10">{result.summary}</p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                 <div className="bg-black/20 p-4 rounded-2xl border border-white/10"><p className="text-[8px] font-black text-indigo-200 uppercase tracking-widest mb-1">Spacing efficiency</p><p className="text-xl font-black text-white italic">{result.spacingEfficiency}</p></div>
                 <div className="bg-black/20 p-4 rounded-2xl border border-white/10"><p className="text-[8px] font-black text-indigo-200 uppercase tracking-widest mb-1">Shot selection</p><p className="text-xl font-black text-white italic">{result.shotQualityMetric}</p></div>
              </div>
           </div>
           <div className="space-y-6">
              <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] ml-2 italic">Possession Breakdown</h4>
              <div className="grid grid-cols-1 gap-4">
                 {result.plays.map((play, idx) => (
                   <div key={idx} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] space-y-4 hover:border-indigo-500/40 transition-all shadow-xl">
                      <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                            <span className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-white italic">{play.timestamp}</span>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${play.impact === 'positive' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{play.impact.toUpperCase()} IMPACT</span>
                         </div>
                         <span className="text-[7px] font-black text-slate-800 uppercase tracking-widest">UNIT: {play.team.toUpperCase()}</span>
                      </div>
                      <p className="text-white text-sm font-black italic uppercase tracking-tight leading-tight">{play.description}</p>
                      <div className="pt-4 border-t border-slate-900/50"><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Coaching Point</p><p className="text-indigo-400 text-[11px] font-medium leading-relaxed italic">"{play.coachingPoint}"</p></div>
                   </div>
                 ))}
              </div>
           </div>
           <div className="pt-8 border-t border-slate-900 flex flex-col gap-4">
              <button 
                onClick={() => isPro ? convertToTacticalPlay() : alert("PRO FEATURE: Synthesis is only available for Pro users.")} 
                disabled={isConvertingToPlay} 
                className={`w-full py-6 bg-white text-slate-950 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 ${!isPro ? 'opacity-50' : ''}`}
              >
                {isConvertingToPlay ? ( <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> ) : ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg> )}
                {isConvertingToPlay ? 'Synthesizing...' : (isPro ? 'Synthesize as Tactical Play' : 'Unlock Pro Synthesis')}
              </button>
              <button onClick={() => {setResult(null); setVideoFile(null);}} className="text-slate-600 font-black uppercase text-[10px] tracking-widest py-4">Discard & Start New Scan</button>
           </div>
        </div>
      )}
      {!isPaid && (
        <div className="py-8">
          <AdBanner adSlot="match_analysis_bottom" isPaid={isPaid} onUpgrade={() => {}} />
        </div>
      )}
    </div>
  );
};

export default MatchAnalysis;
