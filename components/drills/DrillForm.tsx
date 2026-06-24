
import React, { useState, useRef, useEffect } from 'react';
import { Drill, SkillFocus, Level, CourtType, DiagramBoard, VideoUpload, DocumentUpload, SubscriptionPlan, UserRole, TacticalType, UserProfile, PlayerPosition, DiagramLine, DiagramLineType, DiagramText, TrainingSession, Sport } from '../../types';
import { getSportConfig } from '../../data/sports';
import { clearDraftFromStorage, savePendingDrill } from '../../utils/storage';
import { toast } from '../../utils/toast';
import CoachBoard from '../shared/CoachBoard';
import { storage, auth, db } from '../../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getTranslation } from '../../utils/i18n';
import { callAI } from '../../utils/ai';
import DrillFormTour, { DRILL_TOUR_KEY } from '../misc/DrillFormTour';

interface DrillFormProps {
  initialDrill?: Drill;
  userProfile?: UserProfile | null;
  sessions?: TrainingSession[];
  onSave: (drill: Drill, selectedPlaybookIds?: string[]) => Promise<void>;
  onCancel: () => void;
  onRequestLogin?: () => void;
}

interface UploadingAsset {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  type: 'video' | 'document';
}

interface AiRawPlayer { x?: number; y?: number; type?: string; label?: string; }
interface AiRawLine { type?: string; startX?: number; startY?: number; endX?: number; endY?: number; }
interface AiRawBoard {
  name?: string;
  courtType?: string;
  players?: AiRawPlayer[];
  lines?: AiRawLine[];
}

const DrillForm: React.FC<DrillFormProps> = ({
  initialDrill,
  userProfile,
  sessions = [],
  onSave,
  onRequestLogin,
  onCancel,
}) => {
  const t = getTranslation(userProfile);
  const userSport: Sport = userProfile?.sport ?? Sport.BASKETBALL;
  const sportConfig = getSportConfig(userSport);
  const defaultCourtType = sportConfig.defaultCourtType as CourtType;
  const sportSkills = sportConfig.skills;

  const [title, setTitle] = useState(initialDrill?.title || '');
  const [type, setType] = useState<TacticalType>(initialDrill?.type || 'drill');
  const [focus, setFocus] = useState<SkillFocus | string>(initialDrill?.focus || sportSkills[0]);
  const [level, setLevel] = useState<Level>(initialDrill?.level || Level.U12);
  const [duration, setDuration] = useState(initialDrill?.duration || 10);
  const [equipment, setEquipment] = useState(initialDrill?.equipment || '');
  const [steps, setSteps] = useState<string[]>(initialDrill?.steps || ['']);
  const [tips, setTips] = useState(initialDrill?.tips || '');
  const [tagsInput, setTagsInput] = useState(initialDrill?.tags?.join(', ') || '');
  const [isPublic, setIsPublic] = useState(initialDrill?.isPublic || false);
  const [videoUrls, setVideoUrls] = useState(initialDrill?.videoUrls || []);
  const [videoUploads, setVideoUploads] = useState(initialDrill?.videoUploads || []);
  const [documentUploads, setDocumentUploads] = useState(initialDrill?.documentUploads || []);
  
  const [uploadingState, setUploadingState] = useState<UploadingAsset[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const isPro = userProfile?.isSubscribed === true || userProfile?.isAdmin === true || userProfile?.isTester === true;

  const [boards, setBoards] = useState<DiagramBoard[]>(() => {
    if (initialDrill?.boards && initialDrill.boards.length > 0) return initialDrill.boards;
    return [{ id: crypto.randomUUID(), name: 'Step 1: Setup', players: [], lines: [], texts: [], courtType: defaultCourtType }];
  });

  const [activeBoardIndex, setActiveBoardIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<{title?: string}>({});
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStatus, setAiStatus] = useState('Initializing uplink...');
  const [aiProgress, setAiProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiSection, setShowAiSection] = useState(false);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem(DRILL_TOUR_KEY));
  const [selectedPlaybookIds, setSelectedPlaybookIds] = useState<string[]>([]);
  const [playbookSearchQuery, setPlaybookSearchQuery] = useState('');
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [isCreatingPlaybook, setIsCreatingPlaybook] = useState(false);

  const filteredSessions = sessions.filter(s => 
    s.name.toLowerCase().includes(playbookSearchQuery.toLowerCase())
  );

  const handleCreatePlaybook = async () => {
    if (!newPlaybookName.trim() || !auth.currentUser) return;
    setIsCreatingPlaybook(true);
    try {
      const { addDoc, collection } = await import('firebase/firestore');
      const docRef = await addDoc(collection(db, 'trainings'), {
        userId: auth.currentUser.uid,
        authorName: userProfile?.name || 'Coach',
        name: newPlaybookName.trim().toUpperCase(),
        drillIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setSelectedPlaybookIds(prev => [...prev, docRef.id]);
      setNewPlaybookName('');
      setPlaybookSearchQuery('');
    } catch (e) {
      console.error("Failed to create playbook:", e);
      toast.error("Playbook aanmaken mislukt. Probeer opnieuw.");
    } finally {
      setIsCreatingPlaybook(false);
    }
  };

  useEffect(() => {
    let interval: number;
    let progressTimer: number;
    if (isAiGenerating) {
      setAiProgress(0);
      const messages = ["Synthesizing Tactics...", "Positioning Fleet...", "Rendering Geometry...", "Optimizing Spacing...", "Finalizing Unit..."];
      let i = 0;
      interval = window.setInterval(() => { setAiStatus(messages[i % messages.length]); i++; }, 1500);
      progressTimer = window.setInterval(() => { setAiProgress(prev => (prev >= 90 ? 90 : prev + Math.random() * 8)); }, 600);
    }
    return () => { clearInterval(interval); clearInterval(progressTimer); };
  }, [isAiGenerating]);

  const smartParseAiJson = (text: string) => {
    let cleaned = text.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) cleaned = jsonMatch[0];
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      let repaired = cleaned;
      if (!repaired.endsWith('}')) repaired += '}';
      if (!repaired.includes(']')) repaired = repaired.replace(/\}$/, ']}');
      if (repaired.split('{').length > repaired.split('}').length) {
        repaired += '}'.repeat(repaired.split('{').length - repaired.split('}').length);
      }
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        throw new Error("Critical Synthesis Failure: Data stream corrupted.");
      }
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    setAiStatus('Uplinking...');
    
    const maxRetries = 2;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success) {
      try {
        console.log(`[log] - AI Synthesis Attempt ${attempt + 1}...`);
        const responseText = await callAI({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are the SportAtlas Master Coach. You provide elite tactical data in RAW JSON.
              STRICT RULE: Return ONLY valid JSON. NEVER include conversational text, warnings, or explanations.

              COURT BOUNDARIES: Half-court (X 5-95, Y 5-89), Full-court (X 5-183, Y 5-95).
              PLAYER TYPES: 'home', 'away', 'ball', 'cone'.
              LINE TYPES: 'run', 'pass', 'screen', 'dribble', 'shot'.

              CRITICAL SPACING RULES — ALWAYS FOLLOW:
              1. NEVER place two players within 15 units of each other. Every player must be clearly separated.
              2. Spread players across the ENTIRE court area. Use the full width (X: 10-90) and full depth (Y: 10-85 for half-court).
              3. Typical positions for half-court: point guard ~(50,75), wings ~(20,60) and ~(80,60), corners ~(10,30) and ~(90,30), post ~(50,25).
              4. The 'ball' player should always be placed ON TOP of or very close (within 3 units) to the player holding it.
              5. Lines must connect logically: startX/startY at the player origin, endX/endY at the destination.
              6. Labels must be short: 1, 2, 3, 4, 5 for home players; X, Y, Z for away players.

              Required JSON structure: { title, focus, duration, steps: string[], tags: string[], boards: [{ name, courtType, players: [{x,y,type,label}], lines: [{type,startX,startY,endX,endY}] }] }`
            },
            {
              role: 'user',
              content: `MISSION COMMAND: Synthesize a professional basketball ${type.toUpperCase()}.
              FOCUS: ${focus}
              LEVEL: ${level}
              PROMPT: "${aiPrompt}"

              CRITICAL INSTRUCTIONS:
              1. If the PROMPT is very short (e.g. "shooting"), use your expert knowledge to improvise a COMPLETE professional training unit.
              2. Generate exactly 3 tactical frames representing a logical progression.
              3. Return RAW JSON ONLY. No markdown formatting.`
            }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4000
        });
        if (!responseText) throw new Error("Empty response");
        const data = smartParseAiJson(responseText);
        
        setAiProgress(100);
        setTimeout(() => {
          setTitle(data.title || '');
          setFocus(data.focus as SkillFocus || focus);
          setDuration(data.duration || duration);
          setSteps(data.steps || ['']);
          setTagsInput((data.tags || []).join(', '));
          if (data.boards) {
            setBoards((data.boards as AiRawBoard[]).map((b, idx) => ({
              id: crypto.randomUUID(),
              name: b.name ?? `Frame ${idx + 1}`,
              players: b.players?.map((p) => ({ ...p, id: crypto.randomUUID(), x: p.x ?? 50, y: p.y ?? 50, type: (p.type as PlayerPosition['type']) ?? 'home' })) || [],
              lines: b.lines?.map((l) => ({ ...l, id: crypto.randomUUID(), type: (l.type as DiagramLine['type']) ?? 'run', startX: l.startX ?? 0, startY: l.startY ?? 0, endX: l.endX ?? 0, endY: l.endY ?? 0 })) || [],
              texts: [],
              courtType: (b.courtType === 'full' ? 'full' : 'half') as CourtType
            })));
          }
          setIsAiGenerating(false);
        }, 500);
        success = true;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown Error';
        console.error(`[error] - AI Synthesis Attempt ${attempt + 1} failed:`, err);
        attempt++;
        if (attempt > maxRetries) {
          toast.error(`AI Synthesis failed: ${errMsg}. Try a different prompt.`);
          setIsAiGenerating(false);
        } else {
          setAiStatus(`Retrying Link (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  };

  const handleStepChange = (index: number, value: string) => { const newSteps = [...steps]; newSteps[index] = value; setSteps(newSteps); };
  const addStep = () => setSteps([...steps, '']);
  const removeStep = (index: number) => { if (steps.length > 1) setSteps(steps.filter((_, i) => i !== index)); };
  
  const handleAddFrame = () => {
    const lastBoard = boards[boards.length - 1];
    
    // Logic to move players based on lines in lastBoard
    const newPlayers = (lastBoard.players || []).map(player => {
      // Find a line that starts near this player
      // Threshold of 10 units for "near" (matching CoachBoard's SNAP_THRESHOLD of 6.5 plus some buffer)
      const attachedLine = lastBoard.lines.find(line => {
        const dist = Math.sqrt(Math.pow(line.startX - player.x, 2) + Math.pow(line.startY - player.y, 2));
        return dist < 10;
      });

      if (attachedLine) {
        // Determine if this player should move to the end of the line
        // 'run', 'dribble', 'screen' move the player/cone/coach
        // 'pass', 'shot' only move the 'ball' type
        const isMovementLine = attachedLine.type === 'run' || attachedLine.type === 'dribble' || attachedLine.type === 'screen';
        const isBallAction = attachedLine.type === 'pass' || attachedLine.type === 'shot';
        
        const shouldMove = isMovementLine || (isBallAction && player.type === 'ball');

        if (shouldMove) {
          let endX = attachedLine.endX;
          let endY = attachedLine.endY;
          
          // If it's a freehand line, use the last point in the sequence
          if (attachedLine.points && attachedLine.points.length > 0) {
            const lastPoint = attachedLine.points[attachedLine.points.length - 1];
            endX = lastPoint.x;
            endY = lastPoint.y;
          }
          
          return { ...player, id: crypto.randomUUID(), x: endX, y: endY };
        }
      }

      return { ...player, id: crypto.randomUUID() };
    });

    setBoards([...boards, { 
      id: crypto.randomUUID(), 
      name: `Frame ${boards.length + 1}`, 
      players: newPlayers, 
      lines: [], 
      texts: [], 
      courtType: lastBoard.courtType 
    }]);
  };

  const handleSave = async () => {
    if (!title.trim()) { setErrors({ title: 'Title is required' }); return; }
    if (!auth.currentUser) {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
      savePendingDrill({
        id: initialDrill?.id || crypto.randomUUID(),
        userId: '',
        sport: initialDrill?.sport ?? userSport,
        title: title.trim(),
        type, focus, level, duration,
        equipment: equipment.trim(),
        steps: steps.filter(s => s.trim().length > 0),
        tips: tips.trim(),
        tags, boards,
        videoUrls: videoUrls.filter(u => u.trim().length > 0),
        videoUploads: [], documentUploads: [],
        favorite: false, isPublic,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      onRequestLogin?.();
      return;
    }
    setIsSaving(true);
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
      await onSave({
        id: initialDrill?.id || crypto.randomUUID(),
        userId: initialDrill?.userId || auth.currentUser?.uid || '',
        sport: initialDrill?.sport ?? userSport,
        title: title.trim(),
        type, focus, level, duration,
        equipment: equipment.trim(),
        steps: steps.filter(s => s.trim().length > 0),
        tips: tips.trim(),
        tags, boards,
        videoUrls: videoUrls.filter(u => u.trim().length > 0),
        videoUploads, documentUploads,
        favorite: initialDrill?.favorite || false,
        isPublic,
        createdAt: initialDrill?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }, selectedPlaybookIds);
      clearDraftFromStorage();
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Opslaan mislukt. Probeer opnieuw.");
      setIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'video' | 'document') => {
    if (!isPro) return;
    const files = e.target.files;
    if (!files || !auth.currentUser) return;
    Array.from(files).forEach((file: File) => {
      const uploadId = crypto.randomUUID();
      const storagePath = `drills/${auth.currentUser?.uid}/${uploadId}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      setUploadingState(prev => [...(prev || []), { id: uploadId, name: file.name, progress: 0, status: 'uploading', type: fileType }]);
      uploadTask.on('state_changed', 
        (snapshot) => { setUploadingState(prev => prev.map(u => u.id === uploadId ? { ...u, progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100 } : u)); }, 
        (error) => setUploadingState(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'error' } : u)), 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (fileType === 'video') setVideoUploads(prev => [...(prev || []), { url: downloadURL, name: file.name, storagePath: storagePath }]);
          else setDocumentUploads(prev => [...(prev || []), { url: downloadURL, name: file.name, storagePath: storagePath, type: file.type }]);
          setUploadingState(prev => prev.filter(u => u.id !== uploadId));
        }
      );
    });
  };

  const removeAttachment = async (asset: VideoUpload | DocumentUpload, type: 'video' | 'document') => {
    if (!window.confirm("Bijlage permanent verwijderen?")) return;
    try {
      if (asset.storagePath) {
        const fileRef = ref(storage, asset.storagePath);
        await deleteObject(fileRef);
      }
      if (type === 'video') setVideoUploads(prev => prev.filter(v => v.url !== asset.url));
      else setDocumentUploads(prev => prev.filter(d => d.url !== asset.url));
    } catch (e) {
      if (type === 'video') setVideoUploads(prev => prev.filter(v => v.url !== asset.url));
      else setDocumentUploads(prev => prev.filter(d => d.url !== asset.url));
      toast.info("Bijlage verwijderd uit lijst (bestand niet gevonden in storage).");
    }
  };

  if (activeBoardIndex !== null && boards?.[activeBoardIndex]) {
    return (
      <div className="fixed inset-0 z-[100] bg-ha-bg">
        <CoachBoard
          initialPlayers={boards[activeBoardIndex].players || []}
          initialLines={boards[activeBoardIndex].lines || []}
          initialTexts={boards[activeBoardIndex].texts || []}
          initialCourtType={(boards[activeBoardIndex].courtType || defaultCourtType) as CourtType}
          sport={userSport}
          onSave={(players, lines, courtTypeVal, texts) => {
            const newBoards = [...boards];
            newBoards[activeBoardIndex] = { ...newBoards[activeBoardIndex], players, lines, texts, courtType: courtTypeVal };
            setBoards(newBoards);
            setActiveBoardIndex(null);
          }}
          onCancel={() => setActiveBoardIndex(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-32 pt-6 bg-ha-bg min-h-screen animate-in fade-in slide-in-from-bottom duration-500">

      <DrillFormTour show={showTour} onDone={() => setShowTour(false)} />

      {/* AI Loading Overlay */}
      {isAiGenerating && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-8 p-8">
          <div className="w-24 h-24 bg-cyan-600/10 border border-cyan-500/20 rounded-[2rem] flex items-center justify-center shadow-2xl">
            <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </div>
          <div className="text-center space-y-3">
            <p className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.4em] animate-pulse">{aiStatus}</p>
            <h2 className="text-2xl font-black italic uppercase text-white tracking-tight">AI Synthesis Active</h2>
            <p className="text-slate-500 text-xs max-w-xs">Building your complete tactical unit with court diagrams and coaching steps.</p>
          </div>
          <div className="w-full max-w-xs space-y-2">
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${aiProgress}%` }}
              />
            </div>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center">{Math.round(aiProgress)}%</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4">
        <h2 className="text-4xl font-black italic uppercase tracking-tighter">{t.unitSynthesis}</h2>
        <button onClick={onCancel} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div className="px-4 space-y-10">
        {!showAiSection ? (
          <button
            id="drill-tour-ai"
            onClick={() => setShowAiSection(true)}
            className={`w-full p-8 bg-[#0b1224] border rounded-[2.5rem] flex items-center justify-between group hover:border-indigo-500/50 transition-all shadow-xl overflow-hidden relative ${type === 'play' ? 'border-indigo-500/20' : 'border-ha-brand/20'}`}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-3xl rounded-full group-hover:bg-indigo-600/10 transition-all"></div>
            <div className="flex items-center gap-6 relative z-10">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg text-white font-black italic ${type === 'play' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-gradient-to-br from-ha-brand to-blue-600'}`}>AI</div>
              <div className="text-left">
                <h3 className="text-lg font-black text-white uppercase tracking-tighter italic leading-none">{t.magicCoach}</h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">{t.aiSynthesis}</p>
              </div>
            </div>
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-slate-600 group-hover:text-white transition-all">
              {isPro
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              }
            </div>
          </button>
        ) : isPro ? (
          <section className={`bg-[#0b1224] border rounded-[3rem] p-8 space-y-8 shadow-2xl relative overflow-hidden group transition-all duration-500 animate-in zoom-in-95 ${type === 'play' ? 'border-indigo-500/40' : 'border-ha-brand/40'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg text-white font-black italic ${type === 'play' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-gradient-to-br from-ha-brand to-blue-600'}`}>AI</div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest italic">{t.magicCoach}</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.3em]">{t.aiSynthesis}</p>
                </div>
              </div>
              <button onClick={() => setShowAiSection(false)} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Minimize</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-slate-600 tracking-widest ml-2">Skill Focus</label>
                <select className="w-full bg-ha-bg border border-slate-800 rounded-xl p-4 text-[10px] text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500" value={focus} onChange={e => setFocus(e.target.value as SkillFocus)}>
                  {sportSkills.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-slate-600 tracking-widest ml-2">Level</label>
                <select className="w-full bg-ha-bg border border-slate-800 rounded-xl p-4 text-[10px] text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500" value={level} onChange={e => setLevel(e.target.value as Level)}>
                  {Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-slate-600 tracking-widest ml-2">Duration (Min)</label>
                <input type="number" className="w-full bg-ha-bg border border-slate-800 rounded-xl p-4 text-[10px] text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 10)} />
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[8px] font-black uppercase text-slate-600 tracking-widest ml-2">Mission Objectives</label>
              <textarea placeholder={type === 'play' ? "Describe set play..." : "Describe drill..."} className="w-full bg-ha-bg border border-slate-800 rounded-3xl p-6 text-[13px] text-slate-200 outline-none focus:border-indigo-500 min-h-[100px] transition-all resize-none shadow-inner" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
            </div>
            <button onClick={handleAiGenerate} disabled={isAiGenerating || !aiPrompt.trim()} className={`w-full py-6 bg-gradient-to-r disabled:opacity-50 text-white font-black uppercase text-[11px] tracking-[0.3em] rounded-2xl transition-all shadow-xl active:scale-95 ${type === 'play' ? 'from-indigo-600 to-indigo-800' : 'from-cyan-600 to-cyan-800'}`}>{isAiGenerating ? 'Synthesizing...' : `Initialize AI Synthesis`}</button>
          </section>
        ) : (
          <section className="bg-[#0b1224] border border-purple-500/30 rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-[1.5rem] bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black uppercase italic tracking-tighter text-white">Pro Feature</h3>
              <p className="text-slate-400 text-sm max-w-xs">AI drill generation is available exclusively for Pro subscribers. Upgrade to unlock Magic Coach.</p>
            </div>
            <button
              onClick={() => { setShowAiSection(false); onRequestLogin?.(); }}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black uppercase text-[11px] tracking-[0.3em] rounded-2xl shadow-xl active:scale-95 transition-all"
            >
              Upgrade to Pro
            </button>
            <button onClick={() => setShowAiSection(false)} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Close</button>
          </section>
        )}

        <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-8 md:p-12 space-y-12 shadow-3xl">
          <div id="drill-tour-type" className="flex bg-ha-bg p-1.5 rounded-2xl border border-slate-800 shadow-xl max-w-sm">
            <button onClick={() => setType('drill')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${type === 'drill' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t.skillDrills}</button>
            <button onClick={() => setType('play')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${type === 'play' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>{t.tacticalPlays}</button>
          </div>
          
          <div id="drill-tour-title" className="space-y-4">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">{t.opTitle}</label>
            <input type="text" placeholder={t.titlePlaceholder} className={`w-full bg-ha-bg border ${errors.title ? 'border-red-500' : 'border-slate-800'} rounded-[2rem] p-6 text-white font-black uppercase tracking-widest focus:border-ha-brand outline-none transition-all placeholder:text-slate-900 shadow-inner`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <section className="space-y-8">
            <div className="flex items-center justify-between px-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.tacticalFrames}</label>
              <button onClick={handleAddFrame} className="text-[10px] font-black text-ha-brand uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t.addFrame}</button>
            </div>
            <div className="space-y-4">
              {boards?.map((board, idx) => (
                <div key={board.id} className="group relative bg-ha-bg border border-slate-800 rounded-[2rem] p-6 flex flex-col sm:flex-row items-center justify-between hover:border-ha-brand/40 transition-all shadow-xl gap-4">
                  <div className="flex items-center gap-6 w-full sm:w-auto">
                    <div className="w-14 h-14 bg-slate-900/50 rounded-2xl flex items-center justify-center border border-slate-800 text-slate-700 group-hover:text-ha-brand transition-all shrink-0"><span className="text-xl font-black italic">{idx + 1}</span></div>
                    <div className="space-y-1">
                      <p className="text-white font-black uppercase italic tracking-tight">{board.name}</p>
                      <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">{(board.players || []).length} Players • {(board.courtType || 'half').toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button id={idx === 0 ? 'drill-tour-edit-diagram' : undefined} onClick={() => setActiveBoardIndex(idx)} className="flex-1 sm:flex-none px-6 py-3 bg-cyan-600 border border-ha-brand text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-ha-brand transition-all shadow-lg active:scale-95">{t.editDiagram}</button>
                    {boards.length > 1 && (
                      <button onClick={() => setBoards(boards.filter((_, i) => i !== idx))} className="p-3 bg-red-950/20 border border-red-900/20 text-red-500 rounded-xl hover:bg-red-600 transition-all"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          <section id="drill-tour-steps" className="space-y-8 pt-8 border-t border-slate-900">
            <div className="flex items-center justify-between px-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.executionProtocol}</label>
              <button onClick={addStep} className="text-[10px] font-black text-ha-brand uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t.addStep}</button>
            </div>
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 items-start group">
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-indigo-400 font-black italic shrink-0 border border-slate-800">{idx + 1}</div>
                  <div className="flex-1 relative">
                    <textarea 
                      value={step} 
                      onChange={(e) => handleStepChange(idx, e.target.value)}
                      placeholder={t.enterProtocolStep}
                      className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-[13px] text-white outline-none focus:border-ha-brand transition-all min-h-[80px] resize-none shadow-inner"
                    />
                    {steps.length > 1 && (
                      <button 
                        onClick={() => removeStep(idx)}
                        className="absolute -right-2 -top-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-8 pt-8 border-t border-slate-900">
            <div className="flex items-center justify-between px-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.technicalInsight}</label>
            </div>
            <textarea 
              value={tips} 
              onChange={(e) => setTips(e.target.value)}
              placeholder={t.enterCoachingTips}
              className="w-full bg-ha-bg border border-slate-800 rounded-3xl p-6 text-[13px] text-slate-200 outline-none focus:border-ha-brand transition-all min-h-[120px] resize-none shadow-inner"
            />
          </section>
          
          <section className="space-y-8 pt-8 border-t border-slate-900">
            <div className="flex items-center justify-between px-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.mediaIntel}</label>
              {!isPro && <span className="bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest">Pro Only</span>}
            </div>

            {/* List of current attachments */}
            {(videoUploads.length > 0 || documentUploads.length > 0) && (
              <div className="space-y-2 mb-4">
                {videoUploads.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-ha-bg border border-slate-900 rounded-xl">
                    <div className="flex items-center gap-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-400"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      <span className="text-[10px] font-black text-white uppercase italic truncate max-w-[150px]">{v.name}</span>
                    </div>
                    <button type="button" onClick={() => removeAttachment(v, 'video')} className="text-red-500 hover:text-red-400 p-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                ))}
                {documentUploads.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-ha-bg border border-slate-900 rounded-xl">
                    <div className="flex items-center gap-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-ha-brand"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-[10px] font-black text-white uppercase italic truncate max-w-[150px]">{d.name}</span>
                    </div>
                    <button type="button" onClick={() => removeAttachment(d, 'document')} className="text-red-500 hover:text-red-400 p-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <input type="file" ref={videoInputRef} onChange={(e) => handleFileUpload(e, 'video')} className="hidden" accept="video/*" />
              <button type="button" disabled={!isPro} onClick={() => videoInputRef.current?.click()} className={`py-6 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${isPro ? 'bg-ha-bg border-slate-800 text-slate-600 hover:border-ha-brand/50 hover:text-ha-brand' : 'bg-slate-900 border-slate-800 opacity-40 cursor-not-allowed'}`}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span className="text-[9px] font-black uppercase tracking-widest">{t.attachVideo}</span></button>
              <input type="file" ref={docInputRef} onChange={(e) => handleFileUpload(e, 'document')} className="hidden" accept=".pdf,.doc,.docx" />
              <button type="button" disabled={!isPro} onClick={() => docInputRef.current?.click()} className={`py-6 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${isPro ? 'bg-ha-bg border-slate-800 text-slate-600 hover:border-ha-brand/50 hover:text-ha-brand' : 'bg-slate-900 border-slate-800 opacity-40 cursor-not-allowed'}`}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span className="text-[9px] font-black uppercase tracking-widest">{t.attachPdf}</span></button>
            </div>
          </section>

          <section className="space-y-8 pt-8 border-t border-slate-900">
            <div className="flex items-center justify-between px-2"><label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">{t.publicIntel}</label></div>
            <button type="button" onClick={() => setIsPublic(!isPublic)} className={`w-full p-6 rounded-[2.5rem] border transition-all flex items-center justify-between group shadow-xl ${isPublic ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isPublic ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-700'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/><circle cx="12" cy="12" r="10"/></svg></div>
                <div className="text-left"><p className="text-xs font-black uppercase italic tracking-tight">{isPublic ? 'Global Deployment Active' : 'Private Intel'}</p><p className="text-[8px] font-bold uppercase tracking-widest opacity-60 leading-tight pr-4">{t.shareNetwork}</p></div>
              </div>
              <div className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${isPublic ? 'bg-indigo-500' : 'bg-slate-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isPublic ? 'left-7' : 'left-1'}`} /></div>
            </button>
          </section>

          {/* LINK TO PLAYBOOKS */}
          <section className="space-y-8 pt-8 border-t border-slate-900">
            <div className="flex items-center justify-between px-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em]">Link to Playbooks</label>
            </div>

            <div className="space-y-4 px-2">
              {/* Search and Create Section */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    placeholder="Search playbooks..." 
                    className="w-full bg-ha-bg border border-slate-800 rounded-xl p-4 pl-10 text-[10px] text-white font-black uppercase tracking-widest outline-none focus:border-ha-brand transition-all"
                    value={playbookSearchQuery}
                    onChange={(e) => setPlaybookSearchQuery(e.target.value)}
                  />
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="New playbook name..." 
                    className="flex-1 sm:w-48 bg-ha-bg border border-slate-800 rounded-xl p-4 text-[10px] text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 transition-all"
                    value={newPlaybookName}
                    onChange={(e) => setNewPlaybookName(e.target.value)}
                  />
                  <button 
                    type="button"
                    onClick={handleCreatePlaybook}
                    disabled={isCreatingPlaybook || !newPlaybookName.trim()}
                    className="px-6 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-500 transition-all disabled:opacity-50"
                  >
                    {isCreatingPlaybook ? '...' : 'Create'}
                  </button>
                </div>
              </div>

              {/* Playbook List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredSessions.length > 0 ? (
                  filteredSessions.map(session => {
                    const isSelected = selectedPlaybookIds.includes(session.id);
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlaybookIds(prev => 
                            isSelected ? prev.filter(id => id !== session.id) : [...prev, session.id]
                          );
                        }}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between group ${isSelected ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-ha-bg border-slate-800 text-slate-600'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-700'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                          </div>
                          <span className="text-[10px] font-black uppercase italic truncate max-w-[150px]">{session.name}</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-400' : 'border-slate-800'}`}>
                          {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full py-8 text-center border border-dashed border-slate-800 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No playbooks found</p>
                  </div>
                )}
              </div>
            </div>
          </section>
          <div id="drill-tour-save" className="flex gap-4">
            <button onClick={onCancel} className="flex-1 py-6 bg-slate-900 text-slate-500 rounded-[2rem] font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Abort</button>
            <button onClick={handleSave} disabled={isSaving} className={`flex-[2] py-6 bg-gradient-to-r rounded-[2rem] text-[13px] font-black uppercase tracking-[0.3em] text-white shadow-2xl active:scale-95 transition-all disabled:opacity-50 ${type === 'play' ? 'from-indigo-600 via-purple-700 to-indigo-800' : 'from-ha-brand via-blue-600 to-indigo-600'}`}>{isSaving ? 'Synchronizing...' : (initialDrill ? 'Update Tactical Unit' : t.deployUnit)}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillForm;
