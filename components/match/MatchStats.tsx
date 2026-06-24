
import React, { useState, useEffect, useRef } from 'react';
import { PlayerProfile, UserProfile, MatchStats as MatchStatsType, PlayerMatchStat } from '../../types';
import { getTranslation } from '../../utils/i18n';
import { db, auth, storage, handleFirestoreError, OperationType } from '../../utils/firebase';
import { callAI } from '../../utils/ai';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

interface MatchStatsProps {
  userProfile: UserProfile | null;
  onBack: () => void;
}

const MatchStats: React.FC<MatchStatsProps> = ({ userProfile, onBack }) => {
  const t = getTranslation(userProfile);
  const [activeTab, setActiveTab] = useState<'players' | 'matches' | 'progress'>('matches');

  // Progress tab state
  const [progressPlayerId, setProgressPlayerId] = useState<string | null>(null);

  // AI recommendations state
  const [aiMatchId, setAiMatchId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Progress AI plan state
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanPlayerId, setAiPlanPlayerId] = useState<string | null>(null);
  const [aiPlanResult, setAiPlanResult] = useState<string | null>(null);
  const [hiddenStats, setHiddenStats] = useState<Set<string>>(new Set());
  
  // Players State
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [isEditingPlayer, setIsEditingPlayer] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Partial<PlayerProfile> | null>(null);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Matches State
  const [matches, setMatches] = useState<MatchStatsType[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [isEditingMatch, setIsEditingMatch] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Partial<MatchStatsType> | null>(null);
  const [isSavingMatch, setIsSavingMatch] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for Players
    const qPlayers = query(
      collection(db, 'playerProfiles'),
      where('userId', '==', auth.currentUser.uid)
    );
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PlayerProfile[];
      setProfiles(fetched.sort((a, b) => b.createdAt - a.createdAt));
      setLoadingPlayers(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'playerProfiles'));

    // Listen for Matches
    const qMatches = query(
      collection(db, 'matchStats'),
      where('userId', '==', auth.currentUser.uid)
    );
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MatchStatsType[];
      setMatches(fetched.sort((a, b) => b.createdAt - a.createdAt));
      setLoadingMatches(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'matchStats'));

    return () => {
      unsubPlayers();
      unsubMatches();
    };
  }, []);

  // Player Handlers
  const handleAddPlayer = () => {
    setCurrentPlayer({
      name: '',
      position: '',
      height: '',
      weight: '',
      shootingHand: 'Right',
      preferredDribbleMoves: '',
      notes: '',
    });
    setIsEditingPlayer(true);
  };

  const handleEditPlayer = (profile: PlayerProfile) => {
    setCurrentPlayer(profile);
    setIsEditingPlayer(true);
  };

  const handleDeletePlayer = async (id: string) => {
    if (!window.confirm('Verwijder deze speler?')) return;
    try {
      const profile = profiles.find(p => p.id === id);
      if (profile?.photoUrl) {
        try {
          const photoRef = ref(storage, profile.photoUrl);
          await deleteObject(photoRef);
        } catch (e) { console.error(e); }
      }
      await deleteDoc(doc(db, 'playerProfiles', id));
    } catch (e) { console.error(e); }
  };

  const handleSavePlayer = async () => {
    if (!currentPlayer?.name || !auth.currentUser) return;
    setIsSavingPlayer(true);
    try {
      const data = { ...currentPlayer, userId: auth.currentUser.uid, updatedAt: Date.now() };
      if (currentPlayer.id) {
        await updateDoc(doc(db, 'playerProfiles', currentPlayer.id), data);
      } else {
        await addDoc(collection(db, 'playerProfiles'), { ...data, createdAt: Date.now() });
      }
      setIsEditingPlayer(false);
      setCurrentPlayer(null);
    } catch (e) { console.error(e); } finally { setIsSavingPlayer(false); }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    const storagePath = `player_photos/${auth.currentUser.uid}/${crypto.randomUUID()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on('state_changed',
      (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => { console.error(error); setUploadProgress(null); },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setCurrentPlayer(prev => ({ ...prev, photoUrl: downloadURL }));
        setUploadProgress(null);
      }
    );
  };

  // Match Handlers
  const handleAddMatch = () => {
    setCurrentMatch({
      matchTitle: '',
      date: new Date().toISOString().split('T')[0],
      teamName: '',
      opponentName: '',
      statDefinitions: ['PTS', 'REB', 'PAS', 'AST', 'STL', 'BLK', 'TO', 'PF'],
      playerStats: [],
    });
    setIsEditingMatch(true);
  };

  const handleEditMatch = (match: MatchStatsType) => {
    // Ensure old matches have statDefinitions
    const matchWithDefs = {
      ...match,
      statDefinitions: match.statDefinitions || ['PTS', 'REB', 'PAS', 'AST', 'STL', 'BLK', 'TO', 'PF']
    };
    setCurrentMatch(matchWithDefs);
    setIsEditingMatch(true);
  };

  const handleDeleteMatch = async (id: string) => {
    if (!window.confirm('Verwijder deze wedstrijdstatistieken?')) return;
    try {
      await deleteDoc(doc(db, 'matchStats', id));
    } catch (e) { console.error(e); }
  };

  const handleSaveMatch = async () => {
    if (!currentMatch?.matchTitle || !auth.currentUser) return;
    setIsSavingMatch(true);
    try {
      const data = { ...currentMatch, userId: auth.currentUser.uid, updatedAt: Date.now() };
      if (currentMatch.id) {
        await updateDoc(doc(db, 'matchStats', currentMatch.id), data);
      } else {
        await addDoc(collection(db, 'matchStats'), { ...data, createdAt: Date.now() });
      }
      setIsEditingMatch(false);
      setCurrentMatch(null);
    } catch (e) { console.error(e); } finally { setIsSavingMatch(false); }
  };

  const handleAddPlayerToMatch = (player: PlayerProfile) => {
    if (!currentMatch) return;
    const alreadyAdded = currentMatch.playerStats?.some(ps => ps.playerId === player.id);
    if (alreadyAdded) return;

    const initialStats: Record<string, number> = {};
    (currentMatch.statDefinitions || []).forEach(stat => {
      initialStats[stat] = 0;
    });

    const newStat: PlayerMatchStat = {
      playerId: player.id,
      playerName: player.name,
      stats: initialStats
    };

    setCurrentMatch({
      ...currentMatch,
      playerStats: [...(currentMatch.playerStats || []), newStat]
    });
  };

  const updatePlayerStat = (playerId: string, statKey: string, value: number) => {
    if (!currentMatch) return;
    const updatedStats = currentMatch.playerStats?.map(ps => {
      if (ps.playerId === playerId) {
        return { 
          ...ps, 
          stats: { 
            ...(ps.stats || {}), 
            [statKey]: Math.max(0, value) 
          } 
        };
      }
      return ps;
    });
    setCurrentMatch({ ...currentMatch, playerStats: updatedStats });
  };

  const handleAddStatDefinition = (newStat: string) => {
    if (!currentMatch || !newStat.trim()) return;
    const upperStat = newStat.trim().toUpperCase();
    if (currentMatch.statDefinitions?.includes(upperStat)) return;

    const updatedDefs = [...(currentMatch.statDefinitions || []), upperStat];
    const updatedPlayerStats = currentMatch.playerStats?.map(ps => ({
      ...ps,
      stats: { ...ps.stats, [upperStat]: 0 }
    }));

    setCurrentMatch({
      ...currentMatch,
      statDefinitions: updatedDefs,
      playerStats: updatedPlayerStats
    });
  };

  const handleRemoveStatDefinition = (statToRemove: string) => {
    if (!currentMatch) return;
    const updatedDefs = currentMatch.statDefinitions?.filter(s => s !== statToRemove);
    setCurrentMatch({
      ...currentMatch,
      statDefinitions: updatedDefs
    });
  };

  const exportToPDF = async (match: MatchStatsType) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Match Stats: ${match.matchTitle}`, 14, 22);
    doc.setFontSize(12);
    doc.text(`Date: ${match.date}`, 14, 32);
    doc.text(`Team: ${match.teamName} vs ${match.opponentName}`, 14, 40);

    const defs = match.statDefinitions || [];
    const tableData = match.playerStats.map(ps => [
      ps.playerName,
      ...defs.map(d => ps.stats?.[d] || 0)
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Player', ...defs]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [6, 182, 212] },
    });

    doc.save(`${match.matchTitle}_stats.pdf`);
  };

  const handleGetAiTips = async (match: MatchStatsType) => {
    if (aiLoading) return;
    if (aiMatchId === match.id && aiResult) { setAiMatchId(null); setAiResult(null); return; }
    setAiMatchId(match.id);
    setAiResult(null);
    setAiLoading(true);
    try {
      const statsText = match.playerStats.map(ps =>
        `${ps.playerName}: ${Object.entries(ps.stats).map(([k, v]) => `${k}=${v}`).join(', ')}`
      ).join('\n');
      const prompt = `You are a basketball coach analyst. Based on these match stats from "${match.matchTitle}" (${match.teamName} vs ${match.opponentName}), identify the top 3 skill areas the team should focus on in training. For each, give one concrete drill tip in 1 sentence. Be specific and practical. Stats:\n${statsText}\n\nRespond in this format:\n1. [Skill Area]: [Drill tip]\n2. [Skill Area]: [Drill tip]\n3. [Skill Area]: [Drill tip]`;
      const result = await callAI({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      setAiResult(result || 'No response generated.');
    } catch (e: any) {
      setAiResult(`Error: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleGetAiTrainingPlan = async (player: PlayerProfile) => {
    if (aiPlanLoading) return;
    if (aiPlanPlayerId === player.id && aiPlanResult) {
      setAiPlanPlayerId(null);
      setAiPlanResult(null);
      return;
    }

    const playerMatches = matches
      .filter(m => m.playerStats.some(ps => ps.playerId === player.id))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (playerMatches.length === 0) return;

    setAiPlanPlayerId(player.id);
    setAiPlanResult(null);
    setAiPlanLoading(true);
    try {
      const statsText = playerMatches.map(m => {
        const ps = m.playerStats.find(p => p.playerId === player.id);
        const statsStr = ps ? Object.entries(ps.stats).map(([k, v]) => `${k}=${v}`).join(', ') : 'no data';
        return `${m.date} vs ${m.opponentName}: ${statsStr}`;
      }).join('\n');

      const prompt = `You are a basketball development coach. Based on ${player.name}'s match statistics over ${playerMatches.length} games, identify their 2 biggest areas for improvement and give a specific, actionable training recommendation for each (1 sentence). Focus on the stats that are lowest or trending down.\n\nStats:\n${statsText}\n\nFormat:\n1. [Area]: [Training tip]\n2. [Area]: [Training tip]`;
      const result = await callAI({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      setAiPlanResult(result || 'No response generated.');
    } catch (e: any) {
      setAiPlanResult(`Error: ${e.message}`);
    } finally {
      setAiPlanLoading(false);
    }
  };

  const renderTeamOverview = () => {
    if (profiles.length === 0) return null;

    return (
      <div className="space-y-4">
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">Select a player to see their progress</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {profiles.map(player => {
            const playerMatches = matches
              .filter(m => m.playerStats.some(ps => ps.playerId === player.id))
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const matchCount = playerMatches.length;
            const allStatDefs = Array.from(new Set(playerMatches.flatMap(m => m.statDefinitions || [])));

            const avgStats: Record<string, number> = {};
            allStatDefs.forEach(stat => {
              const vals = playerMatches.map(m => m.playerStats.find(ps => ps.playerId === player.id)?.stats?.[stat] ?? 0);
              avgStats[stat] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            });

            const topStat = [...allStatDefs].sort((a, b) => (avgStats[b] || 0) - (avgStats[a] || 0))[0];
            const trendStat = allStatDefs.includes('PTS') ? 'PTS' : allStatDefs[0];
            const trendVals = playerMatches.map(m => m.playerStats.find(ps => ps.playerId === player.id)?.stats?.[trendStat] ?? 0);
            const trend = trendVals.length >= 2 ? trendVals[trendVals.length - 1] - trendVals[0] : 0;

            return (
              <button
                key={player.id}
                onClick={() => { setProgressPlayerId(player.id); setHiddenStats(new Set()); setAiPlanResult(null); setAiPlanPlayerId(null); }}
                className="bg-[#0b1224] border border-slate-800 rounded-[2rem] p-5 flex flex-col gap-3 text-left hover:border-ha-brand/40 active:scale-95 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-ha-bg border border-slate-800 rounded-xl overflow-hidden shrink-0">
                    {player.photoUrl
                      ? <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-700"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black italic uppercase text-white truncate leading-tight">{player.name}</p>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{matchCount} {matchCount === 1 ? 'match' : 'matches'}</p>
                  </div>
                </div>
                {matchCount > 0 && topStat ? (
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">avg {topStat}</p>
                      <p className="text-2xl font-black italic text-white">{avgStats[topStat]?.toFixed(1)}</p>
                    </div>
                    {trendStat && (
                      <div className={`text-[10px] font-black uppercase ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                        {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {trendStat}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">No matches yet</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProgressChart = () => {
    if (!progressPlayerId) return null;
    const player = profiles.find(p => p.id === progressPlayerId);
    if (!player) return null;

    const playerMatches = matches
      .filter(m => m.playerStats.some(ps => ps.playerId === progressPlayerId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (playerMatches.length < 2) {
      return (
        <div className="bg-[#0b1224] border-2 border-dashed border-slate-800 rounded-[3rem] p-16 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-slate-500 font-black uppercase text-sm tracking-widest">Need at least 2 matches to show progress</p>
        </div>
      );
    }

    const allStats = Array.from(new Set(playerMatches.flatMap(m => m.statDefinitions || [])));
    const CHART_COLORS = ['#06b6d4','#a855f7','#f59e0b','#10b981','#f43f5e','#3b82f6','#ec4899','#84cc16'];

    const W = 600, H = 200, PAD = { top: 16, right: 16, bottom: 32, left: 32 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const allValues = playerMatches.flatMap(m => {
      const ps = m.playerStats.find(p => p.playerId === progressPlayerId);
      return ps ? Object.values(ps.stats) : [];
    });
    const maxVal = Math.max(...allValues, 1);

    const xStep = innerW / (playerMatches.length - 1);
    const yScale = (v: number) => innerH - (v / maxVal) * innerH;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setProgressPlayerId(null); setHiddenStats(new Set()); setAiPlanResult(null); setAiPlanPlayerId(null); }}
              className="p-2 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">{player.name}</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{playerMatches.length} matches</span>
            <button
              onClick={() => handleGetAiTrainingPlan(player)}
              disabled={aiPlanLoading && aiPlanPlayerId === player.id}
              className={`px-4 py-2.5 border rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center gap-1.5 ${aiPlanPlayerId === player.id && aiPlanResult ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50'}`}
            >
              {aiPlanLoading && aiPlanPlayerId === player.id ? (
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/></svg>
              )}
              AI Plan
            </button>
          </div>
        </div>

        {aiPlanPlayerId === player.id && aiPlanResult && (
          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-5 space-y-3 animate-in fade-in duration-300">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">AI Training Plan</p>
            {aiPlanResult.split('\n').filter(Boolean).map((line, i) => (
              <p key={i} className="text-sm text-slate-300 font-medium leading-relaxed">{line}</p>
            ))}
          </div>
        )}

        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-6 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
            <g transform={`translate(${PAD.left},${PAD.top})`}>
              {[0, 0.25, 0.5, 0.75, 1].map(t => (
                <line key={t} x1={0} x2={innerW} y1={yScale(maxVal * t)} y2={yScale(maxVal * t)} stroke="#1e293b" strokeWidth={1} />
              ))}
              {playerMatches.map((m, i) => (
                <text key={m.id} x={i * xStep} y={innerH + 20} textAnchor="middle" fill="#475569" fontSize={9} fontWeight="bold">
                  {m.date.slice(5)}
                </text>
              ))}
              {allStats.slice(0, CHART_COLORS.length).map((stat, si) => {
                const isHidden = hiddenStats.has(stat);
                const pts = playerMatches.map((m, i) => {
                  const ps = m.playerStats.find(p => p.playerId === progressPlayerId);
                  const v = ps?.stats?.[stat] ?? 0;
                  return `${i * xStep},${yScale(v)}`;
                });
                return (
                  <g key={stat} opacity={isHidden ? 0.1 : 1} style={{ transition: 'opacity 0.2s' }}>
                    <polyline points={pts.join(' ')} fill="none" stroke={CHART_COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {playerMatches.map((m, i) => {
                      const ps = m.playerStats.find(p => p.playerId === progressPlayerId);
                      const v = ps?.stats?.[stat] ?? 0;
                      return <circle key={m.id} cx={i * xStep} cy={yScale(v)} r={3.5} fill={CHART_COLORS[si]} />;
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="flex flex-wrap gap-2 mt-4 px-2">
            {allStats.slice(0, CHART_COLORS.length).map((stat, si) => (
              <button
                key={stat}
                onClick={() => setHiddenStats(prev => { const next = new Set(prev); if (next.has(stat)) next.delete(stat); else next.add(stat); return next; })}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all ${hiddenStats.has(stat) ? 'opacity-30' : 'opacity-100'}`}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[si] }} />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{stat}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {allStats.slice(0, 8).map((stat, si) => {
            const vals = playerMatches.map(m => m.playerStats.find(p => p.playerId === progressPlayerId)?.stats?.[stat] ?? 0);
            const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
            const trend = vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0;
            return (
              <div key={stat} className="bg-[#0b1224] border border-slate-800 rounded-2xl p-4 space-y-1 text-center">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{stat}</p>
                <p className="text-2xl font-black italic text-white">{avg}</p>
                <p className={`text-[9px] font-black uppercase tracking-widest ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                  {trend > 0 ? `+${trend.toFixed(0)}` : trend < 0 ? trend.toFixed(0) : '—'} trend
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isEditingPlayer && currentPlayer) {
    return (
      <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom duration-500">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsEditingPlayer(false)} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter">{currentPlayer.id ? 'Edit Player' : 'New Player'}</h2>
          </div>
        </div>

        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
          <div className="flex flex-col items-center gap-6">
            <div className="relative group">
              <div className="w-32 h-32 bg-ha-bg border-2 border-dashed border-slate-800 rounded-full flex items-center justify-center overflow-hidden shadow-inner">
                {currentPlayer.photoUrl ? (
                  <img src={currentPlayer.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                )}
                {uploadProgress !== null && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-ha-brand text-slate-950 rounded-full shadow-xl hover:scale-110 transition-transform"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Full Name</label>
              <input 
                type="text" 
                value={currentPlayer.name} 
                onChange={e => setCurrentPlayer({...currentPlayer, name: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="PLAYER NAME..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Position</label>
              <input 
                type="text" 
                value={currentPlayer.position} 
                onChange={e => setCurrentPlayer({...currentPlayer, position: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="PG, SG, SF, PF, C..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Height</label>
              <input 
                type="text" 
                value={currentPlayer.height} 
                onChange={e => setCurrentPlayer({...currentPlayer, height: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="6'5, 195cm..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Weight</label>
              <input 
                type="text" 
                value={currentPlayer.weight} 
                onChange={e => setCurrentPlayer({...currentPlayer, weight: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="210 lbs, 95kg..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Shooting Hand</label>
              <select 
                value={currentPlayer.shootingHand} 
                onChange={e => setCurrentPlayer({...currentPlayer, shootingHand: e.target.value as any})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
              >
                <option value="Right">Right</option>
                <option value="Left">Left</option>
                <option value="Both">Both</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Preferred Dribble Moves</label>
              <input 
                type="text" 
                value={currentPlayer.preferredDribbleMoves} 
                onChange={e => setCurrentPlayer({...currentPlayer, preferredDribbleMoves: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="Crossover, Stepback..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Notes / Scouting Report</label>
              <textarea 
                value={currentPlayer.notes} 
                onChange={e => setCurrentPlayer({...currentPlayer, notes: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner min-h-[120px]"
                placeholder="Strengths, weaknesses, tendencies..."
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button onClick={() => setIsEditingPlayer(false)} className="flex-1 py-5 bg-slate-900 text-slate-500 rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">Abort</button>
            <button onClick={handleSavePlayer} disabled={isSavingPlayer} className="flex-[2] py-5 bg-cyan-600 text-slate-950 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50">
              {isSavingPlayer ? 'Syncing...' : 'Save Player'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isEditingMatch && currentMatch) {
    return (
      <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom duration-500">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsEditingMatch(false)} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter">{currentMatch.id ? 'Edit Match Stats' : 'New Match Stats'}</h2>
          </div>
        </div>

        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Match Title</label>
              <input 
                type="text" 
                value={currentMatch.matchTitle} 
                onChange={e => setCurrentMatch({...currentMatch, matchTitle: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="MATCH TITLE..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Date</label>
              <input 
                type="date" 
                value={currentMatch.date} 
                onChange={e => setCurrentMatch({...currentMatch, date: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Your Team</label>
              <input 
                type="text" 
                value={currentMatch.teamName} 
                onChange={e => setCurrentMatch({...currentMatch, teamName: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="YOUR TEAM..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">Opponent</label>
              <input 
                type="text" 
                value={currentMatch.opponentName} 
                onChange={e => setCurrentMatch({...currentMatch, opponentName: e.target.value})}
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-ha-brand transition-all shadow-inner"
                placeholder="OPPONENT..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Tracked Stats</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  id="newStatInput"
                  placeholder="ADD STAT (e.g. 3PM)..."
                  className="bg-ha-bg border border-slate-800 rounded-lg px-3 py-1 text-[10px] font-bold text-white outline-none focus:border-ha-brand"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddStatDefinition((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-2">
              {currentMatch.statDefinitions?.map(stat => (
                <div key={stat} className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] font-black text-white uppercase">{stat}</span>
                  <button 
                    onClick={() => handleRemoveStatDefinition(stat)}
                    className="text-red-500/50 hover:text-red-500 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Player Selection</h3>
              <button 
                onClick={handleAddPlayer}
                className="px-4 py-2 bg-cyan-600/10 border border-ha-brand/20 text-ha-brand rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-cyan-600/20 transition-all"
              >
                + Create New Player
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {profiles.map(p => (
                <button 
                  key={p.id}
                  onClick={() => handleAddPlayerToMatch(p)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:text-ha-brand hover:border-ha-brand/50 transition-all"
                >
                  + {p.name}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {currentMatch.playerStats?.map(ps => (
                <div key={ps.playerId} className="bg-ha-bg border border-slate-900 rounded-3xl p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-black italic uppercase text-white tracking-tight">{ps.playerName}</h4>
                    <button 
                      onClick={() => setCurrentMatch({...currentMatch, playerStats: currentMatch.playerStats?.filter(p => p.playerId !== ps.playerId)})}
                      className="text-red-500/50 hover:text-red-500 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
                    {currentMatch.statDefinitions?.map(statKey => (
                      <div key={statKey} className="space-y-2 text-center">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{statKey}</label>
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => updatePlayerStat(ps.playerId, statKey, (ps.stats?.[statKey] || 0) + 1)} className="w-full py-1 bg-slate-900 rounded-lg text-ha-brand hover:bg-slate-800">+</button>
                          <input 
                            type="number"
                            value={ps.stats?.[statKey] || 0}
                            onChange={(e) => updatePlayerStat(ps.playerId, statKey, parseInt(e.target.value) || 0)}
                            className="w-full bg-transparent text-center text-sm font-black text-white outline-none focus:text-ha-brand transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button onClick={() => updatePlayerStat(ps.playerId, statKey, (ps.stats?.[statKey] || 0) - 1)} className="w-full py-1 bg-slate-900 rounded-lg text-red-400 hover:bg-slate-800">-</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button onClick={() => setIsEditingMatch(false)} className="flex-1 py-5 bg-slate-900 text-slate-500 rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">Abort</button>
            <button onClick={handleSaveMatch} disabled={isSavingMatch} className="flex-[2] py-5 bg-cyan-600 text-slate-950 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50">
              {isSavingMatch ? 'Syncing...' : 'Save Stats'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="space-y-0.5">
            <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">{t.statsHQ}</h2>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.performanceTracking}</p>
          </div>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'matches' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            {t.matchesTab}
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'players' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            {t.playersTab}
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'progress' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            {t.progressTab}
          </button>
        </div>
      </div>

      {activeTab === 'progress' ? (
        <div className="space-y-8">
          {profiles.length === 0 ? (
            <div className="bg-[#0b1224] border-2 border-dashed border-slate-800 rounded-[3rem] p-16 flex flex-col items-center gap-4 text-center">
              <p className="text-slate-500 font-black uppercase text-sm tracking-widest">Add players first in the Players tab</p>
            </div>
          ) : progressPlayerId ? renderProgressChart() : renderTeamOverview()}
        </div>
      ) : activeTab === 'players' ? (
        <div className="space-y-8">
          <div className="flex justify-end px-2">
            <button onClick={handleAddPlayer} className="px-6 py-3 bg-ha-brand text-slate-950 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Player
            </button>
          </div>
          {loadingPlayers ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Accessing Roster...</p>
            </div>
          ) : profiles.length === 0 ? (
            <div className="bg-[#0b1224] border-2 border-dashed border-slate-800 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-slate-700">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <h3 className="text-xl font-black italic uppercase text-white">No Players Found</h3>
              <button onClick={handleAddPlayer} className="px-8 py-4 bg-cyan-600 text-slate-950 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all">Add Player</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-1">
              {profiles.map(profile => (
                <div key={profile.id} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-6 flex flex-col gap-6 shadow-2xl group hover:border-ha-brand/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-ha-bg border border-slate-800 rounded-2xl overflow-hidden shadow-inner shrink-0">
                      {profile.photoUrl ? <img src={profile.photoUrl} alt={profile.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-800"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black italic uppercase text-white truncate">{profile.name}</h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{profile.position || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditPlayer(profile)} className="flex-1 py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-black uppercase text-[9px] tracking-widest hover:text-white transition-all">{t.editLabel}</button>
                    <button onClick={() => handleDeletePlayer(profile.id)} className="p-3 bg-slate-900 border border-slate-800 text-red-500/40 rounded-xl hover:bg-red-600 hover:text-white transition-all"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-end px-2">
            <button onClick={handleAddMatch} className="px-6 py-3 bg-ha-brand text-slate-950 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {t.newMatch}
            </button>
          </div>
          {loadingMatches ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Accessing Archive...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="bg-[#0b1224] border-2 border-dashed border-slate-800 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-slate-700">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <h3 className="text-xl font-black italic uppercase text-white">No Matches Found</h3>
              <button onClick={handleAddMatch} className="px-8 py-4 bg-cyan-600 text-slate-950 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all">{t.newMatch}</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 px-1">
              {matches.map(match => (
                <div key={match.id} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 flex flex-col gap-6 shadow-2xl group hover:border-ha-brand/30 transition-all">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="space-y-2 text-center md:text-left">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{match.date}</p>
                      <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">{match.matchTitle}</h3>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest italic">{match.teamName} vs {match.opponentName}</p>
                    </div>
                    <div className="flex gap-3 flex-wrap justify-center">
                      <button
                        onClick={() => handleGetAiTips(match)}
                        disabled={aiLoading && aiMatchId === match.id}
                        className={`px-5 py-4 border rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl flex items-center gap-2 ${aiMatchId === match.id && aiResult ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50'}`}
                      >
                        {aiLoading && aiMatchId === match.id ? (
                          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/></svg>
                        )}
                        {t.aiTips}
                      </button>
                      <button onClick={() => exportToPDF(match)} className="p-4 bg-slate-900 border border-slate-800 text-ha-brand rounded-2xl hover:text-white hover:border-ha-brand/50 transition-all shadow-xl">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button onClick={() => handleEditMatch(match)} className="px-6 py-4 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:text-white transition-all shadow-xl">{t.editLabel}</button>
                      <button onClick={() => handleDeleteMatch(match.id)} className="p-4 bg-slate-900 border border-slate-800 text-red-500/40 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-xl"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </div>
                  </div>
                  {aiMatchId === match.id && aiResult && (
                    <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-6 space-y-3 animate-in fade-in duration-300">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">AI Drill Recommendations</p>
                      {aiResult.split('\n').filter(Boolean).map((line, i) => (
                        <p key={i} className="text-sm text-slate-300 font-medium leading-relaxed">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MatchStats;
