
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDocs, updateDoc, limit, addDoc, deleteDoc, or } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { UserProfile, Team, AttendanceRecord, Drill, SkillFocus, Level, ViewState } from '../../types';
import AdBanner from '../shared/AdBanner';
import { getTranslation } from '../../utils/i18n';

interface ClubHQProps {
  userProfile: UserProfile;
  onBack: () => void;
  onViewDrill: (id: string) => void;
  onNavigate: (view: ViewState) => void;
}

type ClubTab = 'dashboard' | 'personnel' | 'squads' | 'vault';

const ClubHQ: React.FC<ClubHQProps> = ({ userProfile, onBack, onViewDrill, onNavigate }) => {
  const t = getTranslation(userProfile);
  const [activeTab, setActiveTab] = useState<ClubTab>('dashboard');
  const [coaches, setCoaches] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [clubDrills, setClubDrills] = useState<Drill[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Team Creation State
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamLevel, setNewTeamLevel] = useState<Level>(Level.U14);

  const clubId = userProfile.uid;
  const currentPlan = userProfile.plan;
  const isSubscriptionActive = userProfile.subscriptionActive;
  
  const isPaidClub = useMemo(() => {
    return ['club10', 'club20', 'clubUnlimited'].includes(currentPlan) && isSubscriptionActive;
  }, [currentPlan, isSubscriptionActive]);

  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));

  const coachLimit = useMemo(() => {
    if (!isSubscriptionActive) return 0;
    if (currentPlan === 'club10') return 10;
    if (currentPlan === 'club20') return 20;
    if (currentPlan === 'clubUnlimited') return Infinity;
    return 0; 
  }, [currentPlan, isSubscriptionActive]);

  useEffect(() => {
    if (!clubId) return;

    const qCoaches = query(collection(db, "users"), where("clubId", "==", clubId), where("role", "==", "coach"));
    const unsubCoaches = onSnapshot(qCoaches, (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push({ ...d.data(), uid: d.id } as UserProfile));
      setCoaches(list);
    }, (err) => {
      console.error("Club Coaches Listener Error:", err);
      if (err.code === 'permission-denied') setError("Permission denied for personnel sync.");
    });

    const managedUids = userProfile.managedCoachUids || [];
    let unsubCoachTeams = () => {};

    const qTeams = query(collection(db, "teams"), where("clubId", "==", clubId));
    const unsubTeams = onSnapshot(qTeams, (snap) => {
      const byClubId: Team[] = [];
      snap.forEach((d) => byClubId.push({ ...d.data(), id: d.id } as Team));
      setTeams(prev => {
        const coachTeams = prev.filter(t => !byClubId.find(b => b.id === t.id));
        const merged = new Map<string, Team>();
        [...coachTeams, ...byClubId].forEach(t => merged.set(t.id, t));
        return Array.from(merged.values());
      });
      setLoading(false);
    }, (err) => {
      console.error("Club Teams Listener Error:", err);
      setLoading(false);
    });

    if (managedUids.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < managedUids.length; i += 10) chunks.push(managedUids.slice(i, i + 10));
      const teamsByCoach = new Map<string, Team>();
      const unsubChunks = chunks.map(chunk => {
        const q = query(collection(db, "teams"), where("coachId", "in", chunk));
        return onSnapshot(q, (snap) => {
          snap.forEach(d => teamsByCoach.set(d.id, { ...d.data(), id: d.id } as Team));
          setTeams(prev => {
            const merged = new Map<string, Team>(prev.map(t => [t.id, t]));
            teamsByCoach.forEach((t, id) => merged.set(id, t));
            return Array.from(merged.values());
          });
        }, () => {});
      });
      unsubCoachTeams = () => unsubChunks.forEach(u => u());
    }

    const qDrills = query(collection(db, "drills"), where("clubId", "==", clubId));
    const unsubDrills = onSnapshot(qDrills, (snap) => {
      const list: Drill[] = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Drill));
      setClubDrills(list);
    }, (err) => {
      console.error("Club Vault Drills Listener Error:", err);
      if (err.code === 'permission-denied') setError("Permission denied for tactical vault sync.");
    });

    return () => {
      unsubCoaches();
      unsubTeams();
      unsubCoachTeams();
      unsubDrills();
    };
  }, [clubId]);

  const handleInviteCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail || isInviting) return;
    
    if (!isPaidClub) {
      alert("UPGRADE REQUIRED: You need an active Club Tier to sponsor coaches.");
      return;
    }

    if (coaches.length >= coachLimit) { 
      alert(t.planLimitReached || "Member limit reached for your current plan."); 
      return; 
    }

    setIsInviting(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", cleanEmail), limit(1));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert("COACH NOT FOUND: Ensure the coach has already created a SportAtlas account with this email address.");
      } else {
        const coachDoc = snap.docs[0];
        const coachData = coachDoc.data();

        if (coachData.clubId && coachData.clubId !== clubId) {
          alert("COACH UNAVAILABLE: This personnel unit is already linked to another organization.");
          setIsInviting(false);
          return;
        }

        await updateDoc(doc(db, "users", coachDoc.id), {
          clubId: clubId,
          managedByUid: clubId,
          plan: 'pro',
          subscriptionActive: true,
          updatedAt: Date.now()
        });

        // Sync managedCoachUids on owner
        const currentManaged = userProfile.managedCoachUids || [];
        if (!currentManaged.includes(coachDoc.id)) {
          await updateDoc(doc(db, "users", clubId!), {
            managedCoachUids: [...currentManaged, coachDoc.id],
            updatedAt: Date.now()
          });
        }

        alert("COACH SPONSORED: Pro access granted and linked to organization.");
        setInviteEmail('');
      }
    } catch (err: any) { 
      console.error("Invite error:", err);
      if (err.code === 'permission-denied') {
        alert("UPLINK DENIED: Security protocol prevented cross-user update. Ensure your Club Tier is active.");
      } else {
        alert("AUTHORIZATION ERROR: " + err.message); 
      }
    }
    finally { setIsInviting(false); }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      await addDoc(collection(db, "teams"), {
        clubId: clubId,
        coachId: clubId, 
        name: newTeamName.toUpperCase(),
        category: newTeamLevel,
        members: [],
        memberUids: [],
        createdAt: Date.now()
      });
      setNewTeamName('');
      setIsCreatingTeam(false);
    } catch (e) { alert("Squad initialization failed."); }
  };

  const removeCoach = async (uid: string) => {
    if (!window.confirm("Revoke Sponsored Pro access and remove from club?")) return;
    try {
      await updateDoc(doc(db, "users", uid), { 
        clubId: null, 
        managedByUid: null,
        plan: 'free', 
        subscriptionActive: false,
        updatedAt: Date.now()
      });

      // Sync managedCoachUids on owner
      const currentManaged = userProfile.managedCoachUids || [];
      if (currentManaged.includes(uid)) {
        await updateDoc(doc(db, "users", clubId!), {
          managedCoachUids: currentManaged.filter(id => id !== uid),
          updatedAt: Date.now()
        });
      }

      alert("Coach credentials revoked.");
    } catch (e) {
      alert("Revocation protocol failed.");
    }
  };

  const usagePercent = coachLimit === Infinity || coachLimit === 0 ? 0 : Math.round((coaches.length / coachLimit) * 100);

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">CLUB <span className="text-indigo-400">HQ</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">{userProfile.name} • Admin Console</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {error && (
        <div className="mx-2 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest animate-pulse">
          {error}
        </div>
      )}

      <div className="bg-[#0b1224] p-1.5 rounded-[1.5rem] border border-slate-800 flex gap-1.5 shadow-2xl overflow-x-auto no-scrollbar">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: '📊' },
          { id: 'personnel', label: 'Personnel', icon: '👥' },
          { id: 'squads', label: 'Squads', icon: '🏀' },
          { id: 'vault', label: 'Vault', icon: '🔐' }
        ].map((tab) => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as ClubTab)} 
            className={`flex-1 min-w-[100px] py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
           {!isSubscriptionActive && (
             <div className="bg-red-600/10 border border-red-500/30 p-6 rounded-[2rem] flex flex-col gap-4 text-center">
                <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em]">License Inactive / Expired</p>
                <p className="text-slate-400 text-[11px] font-medium leading-relaxed uppercase">Upgrade your account to enable organization-wide tactical synchronization and coach sponsoring.</p>
                <button onClick={onBack} className="w-full py-3 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest">Upgrade Now</button>
             </div>
           )}

           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-2">
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Authorized Coaches</p>
                 <div className="flex items-baseline gap-2">
                   <p className="text-3xl font-black italic text-white">{coaches.length}</p>
                   <p className="text-[10px] font-black text-slate-700">/ {coachLimit === Infinity ? '∞' : coachLimit}</p>
                 </div>
                 <div className="w-full h-1 bg-slate-900 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${usagePercent}%` }}></div>
                 </div>
              </div>
              <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-2">
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Active Squads</p>
                 <p className="text-3xl font-black italic text-ha-brand">{teams.length}</p>
              </div>
              <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-2">
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Tactical Units</p>
                 <p className="text-3xl font-black italic text-purple-400">{clubDrills.length}</p>
              </div>
              <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-2">
                 <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Engagement</p>
                 <p className="text-3xl font-black italic text-emerald-400">92%</p>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'personnel' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
           <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] space-y-4">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black italic">!</div>
                 <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Connection Protocol</h3>
              </div>
              <div className="space-y-3">
                 <div className="flex gap-3 items-start">
                    <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-500 shrink-0 mt-0.5">1</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight tracking-wide">Coach creates a SportAtlas account first.</p>
                 </div>
                 <div className="flex gap-3 items-start">
                    <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-500 shrink-0 mt-0.5">2</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight tracking-wide">Enter the coach's exact email address below.</p>
                 </div>
                 <div className="flex gap-3 items-start">
                    <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-500 shrink-0 mt-0.5">3</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight tracking-wide">Coach receives Sponsored Pro status instantly.</p>
                 </div>
              </div>
           </div>

           {!isPaidClub ? (
             <div className="bg-indigo-600/5 border border-indigo-500/20 p-8 rounded-[2.5rem] text-center space-y-4">
                <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em]">Coach Sponsoring Locked</p>
                <p className="text-slate-500 text-[11px] font-medium leading-relaxed uppercase">Upgrade to a Club Tier to grant Pro access to your coaching staff.</p>
                <button onClick={onBack} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">View Pricing</button>
             </div>
           ) : (
             <form onSubmit={handleInviteCoach} className="bg-[#0b1224] border border-indigo-500/30 p-8 rounded-[2.5rem] space-y-6 shadow-3xl relative overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full"></div>
                <div className="space-y-1">
                   <h3 className="text-xl font-black italic uppercase text-white">Staff Recruitment</h3>
                   <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Authorized coaches receive Sponsored Pro status instantly.</p>
                </div>
                <div className="flex flex-col gap-3">
                   <input 
                    required 
                    type="email" 
                    value={inviteEmail} 
                    onChange={(e) => setInviteEmail(e.target.value)} 
                    placeholder="COACH EMAIL ADDRESS..." 
                    className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner"
                   />
                   <button type="submit" disabled={isInviting} className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 disabled:opacity-50">
                      {isInviting ? 'Uplinking...' : 'Authorize & Grant Pro Access'}
                   </button>
                </div>
             </form>
           )}

           <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] ml-2 italic">Active Fleet ({(coaches.length)} Personnel)</p>
              {coaches.map(coach => (
                <div key={coach.uid} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between shadow-xl group hover:border-indigo-500/40 transition-all">
                   <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black italic text-xl text-indigo-400">{(coach.name || 'C').charAt(0)}</div>
                      <div className="space-y-0.5">
                         <div className="flex items-center gap-2">
                           <p className="text-sm font-black text-white italic uppercase">{coach.name}</p>
                           <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[6px] font-black px-1.5 py-0.5 rounded uppercase">Sponsored Pro</span>
                         </div>
                         <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{coach.email}</p>
                      </div>
                   </div>
                   <button onClick={() => removeCoach(coach.uid!)} className="p-3 bg-red-900/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                   </button>
                </div>
              ))}
              {coaches.length === 0 && (
                <div className="py-12 text-center bg-slate-900 border border-dashed border-slate-800 rounded-[2rem]">
                   <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No personnel synced to this sector.</p>
                </div>
              )}
           </div>
        </div>
      )}

      {activeTab === 'squads' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
           {isCreatingTeam ? (
             <form onSubmit={handleCreateTeam} className="bg-[#0b1224] border border-ha-brand/30 p-8 rounded-[2.5rem] space-y-6 shadow-3xl">
                <div className="space-y-1">
                  <h3 className="text-xl font-black italic uppercase text-white">New Sector Initialization</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Define the next competitive tactical unit.</p>
                </div>
                <div className="space-y-4">
                   <input required type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="SQUAD NAME (E.G. U16 ELITE)" className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-ha-brand shadow-inner" />
                   <select className="w-full bg-ha-bg border border-slate-800 p-5 rounded-xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-ha-brand shadow-inner" value={newTeamLevel} onChange={e => setNewTeamLevel(e.target.value as Level)}>
                      {Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                   </select>
                </div>
                <div className="flex gap-2">
                   <button type="button" onClick={() => setIsCreatingTeam(false)} className="flex-1 py-4 bg-slate-900 text-slate-500 rounded-xl font-black uppercase text-[10px]">Abort</button>
                   <button type="submit" className="flex-[2] py-4 bg-cyan-600 text-white rounded-xl font-black uppercase text-[10px] shadow-xl">Initialize Squad</button>
                </div>
             </form>
           ) : (
             <button onClick={() => setIsCreatingTeam(true)} className="w-full py-8 bg-slate-900 border border-dashed border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 group hover:border-ha-brand/50 transition-all shadow-inner">
                <div className="w-12 h-12 bg-ha-bg rounded-2xl flex items-center justify-center text-slate-700 group-hover:text-ha-brand border border-slate-900 transition-all shadow-inner">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white">Initialize New Squad</span>
             </button>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map(team => (
                <div key={team.id} className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] space-y-6 shadow-xl group hover:border-ha-brand/30 transition-all">
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                         <span className="bg-ha-brand/10 text-ha-brand text-[8px] font-black px-2 py-0.5 rounded border border-ha-brand/30 uppercase">{team.category}</span>
                         <h4 className="text-2xl font-black italic uppercase text-white tracking-tighter">{team.name}</h4>
                      </div>
                      <div className="w-10 h-10 bg-ha-bg border border-slate-800 rounded-xl flex items-center justify-center text-slate-800 group-hover:text-ha-brand transition-all">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                   </div>
                   <div className="pt-5 border-t border-slate-900 flex items-center justify-between">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{(team.memberUids || []).length} PERSONNEL</p>
                      <span className="text-[7px] font-bold text-slate-800 uppercase italic">ID: {team.id.slice(0,8)}</span>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'vault' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
           <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 p-10 rounded-[3rem] text-center space-y-6 shadow-3xl">
              <div className="w-16 h-16 bg-purple-600 text-white rounded-[1.25rem] flex items-center justify-center mx-auto shadow-2xl text-2xl">🔐</div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">Tactical Vault</h3>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-widest max-w-xs mx-auto leading-relaxed">
                  Standard organization systems. Units deployed here are synced to all authorized staff libraries automatically.
                </p>
              </div>
              <button 
                onClick={() => onNavigate('create')}
                className="px-10 py-5 bg-white text-slate-950 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all"
              >
                Create New System
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clubDrills.map(drill => (
                <div key={drill.id} onClick={() => onViewDrill(drill.id)} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] flex items-center justify-between shadow-xl cursor-pointer hover:border-purple-500/40 transition-all">
                   <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-black italic text-xl text-purple-400 shadow-inner">V</div>
                      <div className="space-y-0.5">
                         <p className="text-sm font-black text-white italic uppercase">{drill.title}</p>
                         <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{drill.focus} • {drill.duration}m</p>
                      </div>
                   </div>
                   <div className="text-purple-400 opacity-20 group-hover:opacity-100 transition-all">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
                   </div>
                </div>
              ))}
              {clubDrills.length === 0 && (
                <div className="col-span-full py-20 text-center bg-slate-900 border border-dashed border-slate-800 rounded-[2.5rem]">
                   <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">Master Playbook is currently empty.</p>
                </div>
              )}
           </div>
        </div>
      )}
      {!isPaid && (
        <div className="px-4 max-w-5xl mx-auto py-8">
          <AdBanner adSlot="club_hq_bottom" isPaid={isPaid} onUpgrade={() => onNavigate('settings')} />
        </div>
      )}
    </div>
  );
};

export default ClubHQ;
