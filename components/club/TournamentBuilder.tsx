
import React, { useState, useMemo, useEffect } from 'react';
import { doc, setDoc, deleteDoc, onSnapshot, getDoc, collection, query, where } from 'firebase/firestore';
import { auth, db, cleanRecord } from '../../utils/firebase';
import { TournamentTeam, TournamentMatch, UserProfile } from '../../types';
import AdBanner from '../shared/AdBanner';

interface TournamentBuilderProps {
  userProfile?: UserProfile | null;
  onBack: () => void;
}

type LiveSubTab = 'matches' | 'standings' | 'rosters';
type TournamentPhase = 'pool' | 'knockout';
type BuilderMode = 'menu' | 'setup' | 'participants' | 'live' | 'watch_input';

interface TournamentMetadata {
  id: string;
  name: string;
  code: string;
  step: BuilderMode;
  phase: TournamentPhase;
  updatedAt: number;
}

const TournamentBuilder: React.FC<TournamentBuilderProps> = ({ userProfile, onBack }) => {
  const [mode, setMode] = useState<BuilderMode>('menu');
  const [isWatching, setIsWatching] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [watchCodeInput, setWatchCodeInput] = useState('');
  const [myTournaments, setMyTournaments] = useState<TournamentMetadata[]>([]);
  
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester;
  const isBasic = plan === 'basic';
  const tournamentLimit = isPro ? Infinity : (isBasic ? 4 : 1);
  const canCreateMore = myTournaments.length < tournamentLimit;
  
  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [scoreConfirm, setScoreConfirm] = useState<{ matchId: string, team: 'A' | 'B', delta: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [liveTab, setLiveTab] = useState<LiveSubTab>('matches');
  const [phase, setPhase] = useState<TournamentPhase>('pool');
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentCode, setTournamentCode] = useState('');
  const [inputMode, setInputMode] = useState<'players' | 'teams'>('players');
  const [rawInput, setRawInput] = useState('');
  const [teamSize, setTeamSize] = useState(3);
  const [numCourts, setNumCourts] = useState(1);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generateCode = () => `H-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || mode !== 'menu') return;

    const q = query(
      collection(db, 'public_tournaments'),
      where('ownerId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: TournamentMetadata[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || 'UNNAMED UNIT',
          code: data.code || d.id,
          step: data.step,
          phase: data.phase,
          updatedAt: data.updatedAt || 0
        });
      });
      setMyTournaments(list.sort((a, b) => b.updatedAt - a.updatedAt));
    }, (err) => {
      console.error("Tournament Sync Error:", err);
    });

    return () => unsub();
  }, [mode]);

  useEffect(() => {
    if (!tournamentCode || mode === 'menu' || mode === 'setup' || mode === 'watch_input') return;

    const docRef = doc(db, 'public_tournaments', tournamentCode);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTournamentName(data.name || '');
        setTeams(data.teams || []);
        setMatches(data.matches || []);
        setPhase(data.phase || 'pool');
        setTeamSize(data.teamSize || 3);
        setNumCourts(data.numCourts || 1);
        
        if (isWatching) {
           setMode('live');
        }
      } else if (isWatching) {
        setMode('menu');
      }
    }, (err) => {
      console.error("Firestore Sync Error", err);
    });

    return () => unsub();
  }, [tournamentCode, isWatching]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || isWatching || mode === 'menu' || mode === 'watch_input' || !tournamentCode) return;

    const saveToCloud = async () => {
      const docRef = doc(db, 'public_tournaments', tournamentCode);
      const data = cleanRecord({
        name: tournamentName,
        code: tournamentCode,
        ownerId: user.uid,
        teams,
        matches,
        step: mode,
        phase,
        teamSize,
        numCourts,
        inputMode,
        rawInput,
        updatedAt: Date.now()
      });

      try {
        await setDoc(docRef, data, { merge: true });
      } catch (e) {
        console.error("Cloud save error", e);
      }
    };

    const timer = setTimeout(saveToCloud, 800);
    return () => clearTimeout(timer);
  }, [tournamentName, teams, matches, mode, phase, teamSize, numCourts, tournamentCode, isWatching, rawInput, inputMode]);

  const handleStartNew = () => {
    setTournamentName('');
    setTeams([]);
    setMatches([]);
    setRawInput('');
    setNumCourts(1);
    const newCode = generateCode();
    setTournamentCode(newCode);
    setIsWatching(false);
    setMode('setup');
  };

  const handleLoadTournament = async (docId: string) => {
    setIsLoading(true);
    try {
      const snap = await getDoc(doc(db, 'public_tournaments', docId));
      if (snap.exists()) {
        const data = snap.data();
        setTournamentCode(docId);
        setTournamentName(data.name);
        setTeams(data.teams || []);
        setMatches(data.matches || []);
        setPhase(data.phase || 'pool');
        setInputMode(data.inputMode || 'players');
        setRawInput(data.rawInput || '');
        setTeamSize(data.teamSize || 3);
        setNumCourts(data.numCourts || 1);
        setIsWatching(false);
        setMode(data.step || 'setup');
      }
    } catch (e) {
      alert("Failed to load operational data.");
    } finally {
      setIsLoading(false);
    }
  };

  const executePurge = async (docId: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'public_tournaments', docId));
      if (tournamentCode === docId) {
        setTournamentCode('');
        setTournamentName('');
        setTeams([]);
        setMatches([]);
        setMode('menu');
      }
      setConfirmDeleteId(null);
    } catch (e: any) {
      console.error("Delete error", e);
      alert("Failed to purge mission data.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleWatchSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = watchCodeInput.trim().toUpperCase();
    if (!code) return;
    
    setIsLoading(true);
    try {
      const snap = await getDoc(doc(db, 'public_tournaments', code));
      if (snap.exists()) {
        setTournamentCode(code);
        setIsWatching(true);
        setMode('live');
      } else {
        alert("Invalid tournament code.");
      }
    } catch (e) {
      alert("Link failure.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSynthesizeTeams = () => {
    const items = rawInput.split(/,|\n/).map(i => i.trim()).filter(i => i.length > 0);
    if (inputMode === 'players') {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      const generatedTeams: TournamentTeam[] = [];
      for (let i = 0; i < shuffled.length; i += teamSize) {
        const teamPlayers = shuffled.slice(i, i + teamSize);
        if (teamPlayers.length > 0) {
          generatedTeams.push({ id: crypto.randomUUID(), name: `TEAM ${generatedTeams.length + 1}`, players: teamPlayers });
        }
      }
      setTeams(generatedTeams);
    } else {
      setTeams(items.map((name) => ({ id: crypto.randomUUID(), name: name.toUpperCase(), players: [] })));
    }
    setMode('participants');
  };

  const generatePoolSchedule = () => {
    const pairings: TournamentMatch[] = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        pairings.push({ 
          id: crypto.randomUUID(), 
          teamAId: teams[i].id, 
          teamBId: teams[j].id, 
          scoreA: 0, 
          scoreB: 0, 
          status: 'pending', 
          round: 0 
        });
      }
    }

    const shuffledPairings = pairings.sort(() => Math.random() - 0.5);
    const scheduledMatches: TournamentMatch[] = [];
    const teamLastSlot: Record<string, number> = {};
    teams.forEach(t => teamLastSlot[t.id] = -2);

    let currentSlot = 0;
    let pendingPairings = [...shuffledPairings];

    while (pendingPairings.length > 0) {
      let matchesInSlot = 0;
      let teamsInCurrentSlot = new Set<string>();

      for (let i = 0; i < pendingPairings.length; i++) {
        if (matchesInSlot >= numCourts) break;

        const match = pendingPairings[i];
        const canPlay = !teamsInCurrentSlot.has(match.teamAId) && !teamsInCurrentSlot.has(match.teamBId);
        const rested = teamLastSlot[match.teamAId] < currentSlot - 1 && teamLastSlot[match.teamBId] < currentSlot - 1;

        if (canPlay && rested) {
          match.slot = currentSlot;
          match.court = matchesInSlot + 1;
          scheduledMatches.push(match);
          teamsInCurrentSlot.add(match.teamAId);
          teamsInCurrentSlot.add(match.teamBId);
          teamLastSlot[match.teamAId] = currentSlot;
          teamLastSlot[match.teamBId] = currentSlot;
          pendingPairings.splice(i, 1);
          matchesInSlot++;
          i--;
        }
      }

      if (matchesInSlot < numCourts) {
        for (let i = 0; i < pendingPairings.length; i++) {
          if (matchesInSlot >= numCourts) break;
          const match = pendingPairings[i];
          const canPlay = !teamsInCurrentSlot.has(match.teamAId) && !teamsInCurrentSlot.has(match.teamBId);

          if (canPlay) {
            match.slot = currentSlot;
            match.court = matchesInSlot + 1;
            scheduledMatches.push(match);
            teamsInCurrentSlot.add(match.teamAId);
            teamsInCurrentSlot.add(match.teamBId);
            teamLastSlot[match.teamAId] = currentSlot;
            teamLastSlot[match.teamBId] = currentSlot;
            pendingPairings.splice(i, 1);
            matchesInSlot++;
            i--;
          }
        }
      }

      currentSlot++;
      if (currentSlot > 1000) break;
    }

    setMatches(scheduledMatches);
    setPhase('pool');
    setMode('live');
    setLiveTab('matches');
  };

  const generateKnockoutPhase = () => {
    const sorted = standings;
    const knockoutMatches: TournamentMatch[] = [];
    if (sorted.length >= 4) {
      knockoutMatches.push({ id: 'sf1', teamAId: sorted[0].id, teamBId: sorted[3].id, scoreA: 0, scoreB: 0, status: 'pending', round: 1, slot: 99, court: 1 });
      knockoutMatches.push({ id: 'sf2', teamAId: sorted[1].id, teamBId: sorted[2].id, scoreA: 0, scoreB: 0, status: 'pending', round: 1, slot: 99, court: 2 });
    } else if (sorted.length >= 2) {
      knockoutMatches.push({ id: 'final', teamAId: sorted[0].id, teamBId: sorted[1].id, scoreA: 0, scoreB: 0, status: 'pending', round: 2, slot: 100, court: 1 });
    }
    setMatches(prev => [...prev, ...knockoutMatches]);
    setPhase('knockout');
  };

  const generateFinal = () => {
    const semis = matches.filter(m => m.round === 1 && m.status === 'finished');
    if (semis.length < 2) return;
    const winner1 = semis[0].scoreA > semis[0].scoreB ? semis[0].teamAId : semis[0].teamBId;
    const winner2 = semis[1].scoreA > semis[1].scoreB ? semis[1].teamAId : semis[1].teamBId;
    setMatches(prev => [...prev, { id: 'final', teamAId: winner1, teamBId: winner2, scoreA: 0, scoreB: 0, status: 'pending', round: 2, slot: 100, court: 1 }]);
  };

  const updateScore = (matchId: string, team: 'A' | 'B', delta: number) => {
    if (isWatching) return;
    const match = matches.find(m => m.id === matchId);
    if (match?.status === 'finished') {
      setScoreConfirm({ matchId, team, delta });
      return;
    }
    executeScoreUpdate(matchId, team, delta);
  };

  const executeScoreUpdate = (matchId: string, team: 'A' | 'B', delta: number) => {
    setMatches(prev => prev.map(m => (m.id === matchId) ? { 
      ...m, 
      scoreA: team === 'A' ? Math.max(0, m.scoreA + delta) : m.scoreA, 
      scoreB: team === 'B' ? Math.max(0, m.scoreB + delta) : m.scoreB, 
      status: 'live' 
    } : m));
    setScoreConfirm(null);
  };

  const finalizeMatch = (matchId: string) => {
    if (isWatching) return;
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'finished' } : m));
  };

  const standings = useMemo(() => {
    const stats: Record<string, { wins: number, pointsFor: number, pointsAgainst: number }> = {};
    teams.forEach(t => stats[t.id] = { wins: 0, pointsFor: 0, pointsAgainst: 0 });
    matches.filter(m => m.status === 'finished' && m.round === 0).forEach(m => {
      if (stats[m.teamAId] && stats[m.teamBId]) {
        stats[m.teamAId].pointsFor += m.scoreA; stats[m.teamAId].pointsAgainst += m.scoreB;
        stats[m.teamBId].pointsFor += m.scoreB; stats[m.teamBId].pointsAgainst += m.scoreA;
        if (m.scoreA > m.scoreB) stats[m.teamAId].wins += 1;
        else if (m.scoreB > m.scoreA) stats[m.teamBId].wins += 1;
      }
    });
    return teams.map(t => ({ ...t, wins: stats[t.id]?.wins || 0, diff: (stats[t.id]?.pointsFor || 0) - (stats[t.id]?.pointsAgainst || 0) }))
      .sort((a, b) => b.wins - a.wins || b.diff - a.diff);
  }, [teams, matches]);

  const poolFinished = matches.filter(m => m.round === 0).length > 0 && matches.filter(m => m.round === 0).every(m => m.status === 'finished');
  const semisFinished = matches.filter(m => m.round === 1).length > 0 && matches.filter(m => m.round === 1).every(m => m.status === 'finished');
  const hasFinal = matches.some(m => m.round === 2);
  const getWinner = () => {
    const final = matches.find(m => m.round === 2 && m.status === 'finished');
    if (!final) return null;
    return teams.find(t => t.id === (final.scoreA > final.scoreB ? final.teamAId : final.teamBId));
  };
  const winner = getWinner();

  if (isLoading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 animate-in fade-in">
      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Accessing Intelligence Grid...</p>
    </div>
  );

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500 max-w-4xl mx-auto px-1">
      {showInstructions && (
        <div className="fixed inset-0 z-[200] bg-ha-bg/95 backdrop-blur-xl flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-8 md:p-12 w-full max-w-2xl shadow-3xl animate-in zoom-in relative">
            <button onClick={() => setShowInstructions(false)} className="absolute top-8 right-8 p-3 bg-slate-900 border border-slate-800 rounded-xl text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="space-y-2 mb-10">
              <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">Operational <span className="text-amber-400">Manual</span></h3>
              <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.3em]">Protocol Instructions</p>
            </div>
            <div className="space-y-8 text-slate-300">
              <section className="space-y-2">
                <p className="text-amber-400 font-black uppercase text-xs italic tracking-widest">Step 1: Initialization</p>
                <p className="text-sm font-medium leading-relaxed">Create a new unit by giving it an identity. This unit is automatically synced to the cloud, allowing you to prepare long before game day.</p>
              </section>
              <section className="space-y-2">
                <p className="text-amber-400 font-black uppercase text-xs italic tracking-widest">Step 2: Personnel Loading</p>
                <p className="text-sm font-medium leading-relaxed">Input individual player names or existing teams. For individual inputs, use the "Unit Size" selector to let the engine auto-synthesize balanced squads.</p>
              </section>
              <section className="space-y-2">
                <p className="text-amber-400 font-black uppercase text-xs italic tracking-widest">Step 3: Tactical Deployment</p>
                <p className="text-sm font-medium leading-relaxed">Choose the number of available courts. The engine generates a fair round-robin schedule instantly, ensuring balanced rest periods for all teams.</p>
              </section>
              <section className="space-y-2">
                <p className="text-amber-400 font-black uppercase text-xs italic tracking-widest">Step 4: Live Surveillance</p>
                <p className="text-sm font-medium leading-relaxed">Update scores in real-time. Standings and point differentials are calculated dynamically. Matches are grouped by Time Slot for clear field management.</p>
              </section>
            </div>
            <button onClick={() => setShowInstructions(false)} className="w-full mt-10 py-5 bg-amber-500 text-slate-950 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl">Understood</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between sticky top-0 bg-ha-bg py-4 z-50 px-2">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">Tourney <span className="text-amber-400">Hub</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">{isWatching ? 'Observer Mode' : 'Operational Engine'}</p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'menu' && (
             <button onClick={() => setShowInstructions(true)} className="px-5 py-3 bg-indigo-600 border border-indigo-500 rounded-xl text-white shadow-xl active:scale-90 font-black text-[9px] uppercase tracking-widest whitespace-nowrap">How it works</button>
          )}
          <button onClick={mode === 'menu' ? onBack : () => setMode('menu')} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {mode === 'menu' && (
        <div className="space-y-10 px-2 animate-in slide-in-from-bottom-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative group">
                {!canCreateMore && (
                  <div className="absolute -top-4 right-6 bg-amber-500 text-slate-950 text-[7px] font-black px-3 py-1 rounded-full shadow-xl z-20 animate-bounce">
                    LIMIT REACHED
                  </div>
                )}
                <button 
                  onClick={() => canCreateMore ? handleStartNew() : alert(`MISSION LIMIT: Free users are restricted to 1 operational unit, and Basic users to 4. Upgrade to Basic or Pro for more deployment.`)} 
                  className={`w-full group relative p-8 rounded-[3rem] text-left transition-all shadow-2xl overflow-hidden active:scale-95 ${canCreateMore ? 'bg-amber-500 border border-amber-400 hover:brightness-110' : 'bg-slate-900 border border-slate-800 opacity-60 grayscale'}`}
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full"></div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border mb-4 transition-colors ${canCreateMore ? 'bg-white/20 text-white border-white/20' : 'bg-ha-bg text-slate-600 border-slate-800'}`}>
                      {canCreateMore ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      )}
                    </div>
                    <h3 className={`text-2xl font-black italic uppercase tracking-tight leading-none ${canCreateMore ? 'text-slate-950' : 'text-slate-500'}`}>
                      {canCreateMore ? 'Make New' : 'Limit Reached'}
                    </h3>
                    <p className={`text-[10px] font-black uppercase tracking-widest mt-2 ${canCreateMore ? 'text-slate-900' : 'text-slate-600'}`}>
                      {canCreateMore ? 'Initialize fresh operational units' : `Max ${tournamentLimit} units for ${isBasic ? 'Basic' : 'Free'}`}
                    </p>
                </button>
              </div>

              <button onClick={() => setMode('watch_input')} className="group relative bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] text-left hover:border-ha-brand/40 transition-all shadow-2xl overflow-hidden active:scale-95">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-ha-brand/5 blur-3xl rounded-full"></div>
                  <div className="w-12 h-12 bg-ha-brand/10 rounded-2xl flex items-center justify-center text-ha-brand border border-ha-brand/20 mb-4"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
                  <h3 className="text-2xl font-black italic uppercase text-white tracking-tight leading-none">Watch Live</h3>
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-2">Uplink to an active broadcast</p>
              </button>
           </div>

           <section className="space-y-6">
              <div className="flex items-center justify-between px-2">
                 <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic">My Operational Repertoire</h3>
                 <span className="text-[8px] font-black text-slate-800 uppercase">{myTournaments.length} UNITS SYNCED</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                 {myTournaments.map(trn => {
                   const isAwaitingPurge = confirmDeleteId === trn.id;
                   return (
                     <div key={trn.id} className={`group bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-indigo-500/30 transition-all shadow-xl relative overflow-hidden ${isAwaitingPurge ? 'border-red-500/40' : ''}`}>
                        {isAwaitingPurge && (
                          <div className="absolute inset-0 bg-red-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 z-20 animate-in fade-in zoom-in duration-300">
                             <p className="text-white font-black italic uppercase mb-4 text-center">Purge {trn.name}?</p>
                             <div className="flex gap-4 w-full max-w-xs">
                                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest">Abort</button>
                                <button onClick={() => executePurge(trn.id)} disabled={isDeleting} className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-xl">
                                  {isDeleting ? 'PURGING...' : 'YES, PURGE'}
                                </button>
                             </div>
                          </div>
                        )}

                        <div className="flex items-center gap-6 w-full md:w-auto">
                           <div className="w-16 h-16 bg-ha-bg border border-slate-900 rounded-2xl flex items-center justify-center text-indigo-400 font-black italic text-xl shadow-inner group-hover:scale-105 transition-transform shrink-0">
                              {trn.name.charAt(0)}
                           </div>
                           <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                 <h4 className="text-xl font-black italic uppercase text-white tracking-tight leading-none">{trn.name}</h4>
                                 <span className={`text-[6px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter ${trn.step === 'live' ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                                   {trn.step === 'live' ? 'LIVE' : trn.step === 'participants' ? 'DRAFTED' : 'SETUP'}
                                 </span>
                              </div>
                              <div className="flex items-center gap-3">
                                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CODE: {trn.code}</p>
                                 <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                                 <p className="text-[8px] font-bold text-slate-700 uppercase">{new Date(trn.updatedAt).toLocaleDateString()}</p>
                              </div>
                           </div>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full md:w-auto">
                           <button onClick={() => handleLoadTournament(trn.id)} className="flex-1 md:flex-none px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Launch Operations</button>
                           <button 
                             onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(trn.id); }} 
                             className="p-4 bg-red-950/20 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-inner active:scale-90"
                             title="Purge Tournament"
                           >
                             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                           </button>
                        </div>
                     </div>
                   );
                 })}

                 {myTournaments.length === 0 && (
                   <div className="py-20 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]">
                      <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">Inventory empty. Awaiting mission briefing.</p>
                   </div>
                 )}
              </div>
           </section>
        </div>
      )}

      {mode === 'watch_input' && (
        <div className="max-w-md mx-auto w-full px-4 animate-in zoom-in">
           <form onSubmit={handleWatchSubmit} className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-8 shadow-3xl text-center">
              <div className="space-y-2">
                 <h3 className="text-2xl font-black italic uppercase text-white">Establish Link</h3>
                 <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Enter frequency for live reception</p>
              </div>
              <input 
                autoFocus
                value={watchCodeInput}
                onChange={e => setWatchCodeInput(e.target.value.toUpperCase())}
                placeholder="H-XXXXX"
                className="w-full bg-ha-bg border-2 border-slate-800 p-6 rounded-2xl text-3xl text-center text-ha-brand font-black tracking-widest outline-none focus:border-ha-brand shadow-inner"
              />
              <button type="submit" className="w-full py-5 bg-ha-brand text-slate-950 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Link Operations</button>
              <button type="button" onClick={() => setMode('menu')} className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Abort</button>
           </form>
        </div>
      )}

      {mode === 'setup' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 px-2">
          <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-8 shadow-3xl">
             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Operation Name</label>
                <input value={tournamentName} onChange={e => setTournamentName(e.target.value.toUpperCase())} placeholder="TOURNAMENT NAME..." className="w-full bg-ha-bg border border-slate-800 p-6 rounded-2xl text-sm text-white font-black uppercase outline-none focus:border-amber-500 shadow-inner" />
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Input Mode</label>
                   <div className="flex bg-ha-bg p-1 rounded-xl border border-slate-800">
                      <button onClick={() => setInputMode('players')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${inputMode === 'players' ? 'bg-amber-500 text-slate-950' : 'text-slate-600'}`}>Players</button>
                      <button onClick={() => setInputMode('teams')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${inputMode === 'teams' ? 'bg-amber-500 text-slate-950' : 'text-slate-600'}`}>Teams</button>
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Unit Size</label>
                   <input type="number" value={teamSize} onChange={e => setTeamSize(parseInt(e.target.value))} className="w-full bg-ha-bg border border-slate-800 rounded-xl p-3 text-center text-xs text-amber-400 font-black outline-none" />
                </div>
             </div>

             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Available Courts</label>
                <div className="grid grid-cols-4 gap-2">
                   {[1, 2, 3, 4].map(n => (
                     <button 
                        key={n} 
                        onClick={() => setNumCourts(n)}
                        className={`py-4 rounded-xl font-black transition-all border ${numCourts === n ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                      >
                        {n}
                      </button>
                   ))}
                </div>
                <p className="text-[8px] text-slate-700 font-black uppercase tracking-widest text-center italic">The engine will distribute matches across {numCourts} sector(s).</p>
             </div>

             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic ml-2">Personnel List (CSV or Line)</label>
                <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder={inputMode === 'players' ? "John Doe\nJane Smith..." : "LAKERS\nWARRIORS..."} className="w-full bg-ha-bg border border-slate-800 p-6 rounded-3xl text-xs text-slate-300 font-medium h-48 resize-none outline-none focus:border-amber-500 shadow-inner" />
             </div>

             <div className="grid grid-cols-1 gap-3">
                <button onClick={handleSynthesizeTeams} disabled={!tournamentName || !rawInput} className="w-full py-6 bg-amber-500 text-slate-950 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all disabled:opacity-30">Define Squads</button>
                <button onClick={() => setMode('menu')} className="w-full py-4 text-[9px] font-black text-slate-700 uppercase tracking-[0.4em]">Save for Later</button>
             </div>
          </div>
        </div>
      )}

      {mode === 'participants' && (
        <div className="space-y-10 animate-in slide-in-from-right-4 px-2">
           <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-xl">
              <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Squad <span className="text-amber-400">Review</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {teams.map((team) => (
                   <div key={team.id} className="bg-ha-bg border border-slate-800 p-6 rounded-[2rem] space-y-3">
                      <p className="text-sm font-black italic text-white uppercase">{team.name}</p>
                      <div className="flex flex-wrap gap-2">{(team.players || []).map((p, pIdx) => <span key={pIdx} className="text-[7px] font-black bg-slate-900 border border-slate-800 text-slate-500 px-2 py-0.5 rounded uppercase">{p}</span>)}</div>
                   </div>
                 ))}
              </div>
              <div className="flex flex-col gap-3">
                 <div className="flex gap-3">
                    <button onClick={() => setMode('setup')} className="flex-1 py-4 bg-slate-900 text-slate-500 rounded-xl font-black uppercase text-[10px]">Re-Draft</button>
                    <button onClick={generatePoolSchedule} className="flex-[2] py-4 bg-amber-500 text-slate-950 rounded-xl font-black uppercase text-[10px] shadow-lg">Start Pool Play</button>
                 </div>
                 <button onClick={() => setMode('menu')} className="w-full py-3 text-[9px] font-black text-slate-700 uppercase tracking-widest">Store Mission in Vault</button>
              </div>
           </div>
        </div>
      )}

      {mode === 'live' && (
        <div className="space-y-8 animate-in slide-in-from-right-4 px-2">
           <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2.5rem] flex items-center justify-between shadow-2xl">
              <div>
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">Operational Mission</p>
                <h3 className="text-xl font-black italic text-white uppercase tracking-tight">{tournamentName}</h3>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Reception Code</p>
                <p className="text-2xl font-black text-white italic">{tournamentCode}</p>
              </div>
           </div>

           {winner && (
             <div className="bg-gradient-to-r from-amber-500 to-yellow-600 p-8 rounded-[2.5rem] text-center shadow-3xl animate-bounce">
                <p className="text-[10px] font-black text-amber-950 uppercase tracking-[0.4em]">Tournament Champion</p>
                <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter">{winner.name}</h3>
             </div>
           )}

           <div className="flex bg-[#0b1224] p-1 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <button onClick={() => setLiveTab('matches')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${liveTab === 'matches' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-600'}`}>Matches</button>
              <button onClick={() => setLiveTab('standings')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${liveTab === 'standings' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-600'}`}>Standings</button>
              <button onClick={() => setLiveTab('rosters')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${liveTab === 'rosters' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}>Rosters</button>
           </div>

           {liveTab === 'matches' && (
             <div className="space-y-10">
                {!isWatching && poolFinished && phase === 'pool' && (
                   <div className="p-8 bg-indigo-600 rounded-[2.5rem] text-center space-y-4 shadow-2xl">
                      <button onClick={generateKnockoutPhase} className="w-full py-4 bg-white text-indigo-950 font-black uppercase rounded-2xl text-xs tracking-widest shadow-xl">Initialize Finals Bracket</button>
                   </div>
                )}
                {!isWatching && semisFinished && phase === 'knockout' && !hasFinal && (
                   <div className="p-8 bg-red-600 rounded-[2.5rem] text-center space-y-4 shadow-2xl">
                      <button onClick={generateFinal} className="w-full py-4 bg-white text-red-950 font-black uppercase rounded-2xl text-xs tracking-widest shadow-xl">Generate Championship</button>
                   </div>
                )}

                <div className="space-y-12">
                  {/* Pool Phase Grouped by Slots */}
                  {phase === 'pool' && (
                    <div className="space-y-12">
                      {Array.from(new Set(matches.filter(m => m.round === 0).map(m => m.slot))).sort((a: any, b: any) => (a || 0) - (b || 0)).map(slotNum => {
                        const slotMatches = matches.filter(m => m.round === 0 && m.slot === slotNum);
                        if (slotMatches.length === 0) return null;
                        return (
                          <div key={`slot-${slotNum}`} className="space-y-4">
                            <div className="flex items-center gap-3 px-4">
                               <div className="h-px flex-1 bg-slate-800"></div>
                               <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500 italic">TIME SLOT {slotNum}</h4>
                               <div className="h-px flex-1 bg-slate-800"></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {slotMatches.sort((a: any, b: any) => (a.court || 0) - (b.court || 0)).map(match => {
                                  const teamA = teams.find(t => t.id === match.teamAId);
                                  const teamB = teams.find(t => t.id === match.teamBId);
                                  return (
                                    <div key={match.id} className={`bg-[#0b1224] border rounded-[2.5rem] p-6 shadow-2xl transition-all relative overflow-hidden ${match.status === 'finished' ? 'border-slate-800 opacity-60' : 'border-indigo-500/20'}`}>
                                       <div className="absolute top-2 left-1/2 -translate-x-1/2">
                                          <span className="text-[6px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">COURT {match.court}</span>
                                       </div>
                                       <div className="grid grid-cols-3 items-center gap-2 mt-4">
                                          <div className="text-center space-y-2">
                                             <p className="text-[10px] font-black italic text-white uppercase line-clamp-1">{teamA?.name}</p>
                                             <div className="flex justify-center items-center gap-1">
                                                {!isWatching && <button onClick={() => updateScore(match.id, 'A', -1)} className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-xs">-</button>}
                                                <span className="text-2xl font-black italic text-white tabular-nums">{match.scoreA}</span>
                                                {!isWatching && <button onClick={() => updateScore(match.id, 'A', 1)} className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-xs">+</button>}
                                             </div>
                                          </div>
                                          <div className="text-center">
                                             <div className="w-8 h-8 bg-ha-bg rounded-full flex items-center justify-center mx-auto border border-slate-800 text-[8px] font-black italic text-slate-700">VS</div>
                                             <p className={`text-[6px] font-black uppercase mt-1 ${match.status === 'live' ? 'text-red-500 animate-pulse' : 'text-slate-600'}`}>{match.status}</p>
                                          </div>
                                          <div className="text-center space-y-2">
                                             <p className="text-[10px] font-black italic text-white uppercase line-clamp-1">{teamB?.name}</p>
                                             <div className="flex justify-center items-center gap-1">
                                                {!isWatching && <button onClick={() => updateScore(match.id, 'B', -1)} className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-xs">-</button>}
                                                <span className="text-2xl font-black italic text-white tabular-nums">{match.scoreB}</span>
                                                {!isWatching && <button onClick={() => updateScore(match.id, 'B', 1)} className="w-5 h-5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-xs">+</button>}
                                             </div>
                                          </div>
                                       </div>
                                       {!isWatching && match.status !== 'finished' && (
                                         <button onClick={() => finalizeMatch(match.id)} className="w-full mt-4 py-2 bg-ha-bg border border-slate-800 rounded-xl text-[7px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Finalize</button>
                                       )}
                                    </div>
                                  );
                               })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Knockout Brackets */}
                  {phase === 'knockout' && (
                    <div className="space-y-12">
                      {['Semi Finals', 'Championship'].map((label, roundIdx) => {
                        const filteredMatches = matches.filter(m => m.round === (roundIdx + 1));
                        if (filteredMatches.length === 0) return null;
                        return (
                          <div key={label} className="space-y-4">
                            <h4 className={`text-[10px] font-black uppercase tracking-[0.4em] ml-4 ${roundIdx === 1 ? 'text-amber-500' : 'text-slate-600'}`}>{label}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {filteredMatches.map(match => {
                                const teamA = teams.find(t => t.id === match.teamAId);
                                const teamB = teams.find(t => t.id === match.teamBId);
                                return (
                                  <div key={match.id} className={`bg-[#0b1224] border rounded-[2.5rem] p-8 shadow-2xl transition-all ${match.status === 'finished' ? 'border-slate-800 opacity-60' : 'border-amber-500/20'}`}>
                                     <div className="grid grid-cols-3 items-center gap-4">
                                        <div className="text-center space-y-2">
                                           <p className="text-xs font-black italic text-white uppercase">{teamA?.name}</p>
                                           <div className="flex justify-center items-center gap-2">
                                              {!isWatching && <button onClick={() => updateScore(match.id, 'A', -1)} className="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500">-</button>}
                                              <span className="text-3xl font-black italic text-white tabular-nums">{match.scoreA}</span>
                                              {!isWatching && <button onClick={() => updateScore(match.id, 'A', 1)} className="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500">+</button>}
                                           </div>
                                        </div>
                                        <div className="text-center">
                                           <div className="w-10 h-10 bg-ha-bg rounded-full flex items-center justify-center mx-auto border border-slate-800 text-[8px] font-black italic text-slate-700">VS</div>
                                           <p className={`text-[6px] font-black uppercase mt-1 ${match.status === 'live' ? 'text-red-500 animate-pulse' : 'text-slate-600'}`}>{match.status}</p>
                                        </div>
                                        <div className="text-center space-y-2">
                                           <p className="text-xs font-black italic text-white uppercase">{teamB?.name}</p>
                                           <div className="flex justify-center items-center gap-2">
                                              {!isWatching && <button onClick={() => updateScore(match.id, 'B', -1)} className="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500">-</button>}
                                              <span className="text-3xl font-black italic text-white tabular-nums">{match.scoreB}</span>
                                              {!isWatching && <button onClick={() => updateScore(match.id, 'B', 1)} className="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500">+</button>}
                                           </div>
                                        </div>
                                     </div>
                                     {!isWatching && match.status !== 'finished' && (
                                       <button onClick={() => finalizeMatch(match.id)} className="w-full mt-6 py-2 bg-ha-bg border border-slate-800 rounded-xl text-[8px] font-black text-slate-600 uppercase tracking-widest hover:text-white">Finalize</button>
                                     )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
             </div>
           )}

           {liveTab === 'standings' && (
             <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-3xl">
                <div className="divide-y divide-slate-900">
                   {standings.map((team, idx) => (
                     <div key={team.id} className={`p-6 flex items-center justify-between ${idx === 0 ? 'bg-amber-500/5' : ''}`}>
                        <div className="flex items-center gap-5">
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-sm ${idx < 3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-700'}`}>{idx + 1}</div>
                           <div>
                              <p className="text-sm font-black italic text-white uppercase">{team.name}</p>
                              <p className="text-[7px] font-black text-slate-600 uppercase">WINS: {team.wins}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className={`text-xl font-black italic ${team.diff > 0 ? 'text-emerald-400' : 'text-red-500'}`}>{team.diff > 0 ? `+${team.diff}` : team.diff}</p>
                           <p className="text-[7px] font-black text-slate-800 uppercase">DIFF</p>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           {liveTab === 'rosters' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map(team => (
                  <div key={team.id} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] shadow-xl space-y-4">
                     <h4 className="text-sm font-black italic text-white uppercase">{team.name}</h4>
                     <div className="space-y-2">
                        {team.players.map((p, pIdx) => <div key={pIdx} className="text-[10px] font-black text-slate-500 uppercase tracking-tight">• {p}</div>)}
                     </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      )}
      {scoreConfirm && (
        <div className="fixed inset-0 z-[300] bg-ha-bg/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
          <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 w-full max-w-sm shadow-3xl text-center space-y-6">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black italic uppercase text-white tracking-tight">Adjust Score?</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-relaxed">This match is finalized. Are you sure you want to modify the score?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScoreConfirm(null)} className="flex-1 py-4 bg-slate-900 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
              <button onClick={() => executeScoreUpdate(scoreConfirm.matchId, scoreConfirm.team, scoreConfirm.delta)} className="flex-[2] py-4 bg-amber-500 text-slate-950 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">Confirm Change</button>
            </div>
          </div>
        </div>
      )}
      {!isPaid && (
        <div className="py-8">
          <AdBanner adSlot="tournament_builder_bottom" isPaid={isPaid} onUpgrade={() => {}} />
        </div>
      )}
    </div>
  );
};

export default TournamentBuilder;
