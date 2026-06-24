
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  addDoc,
  deleteDoc,
  writeBatch,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import { db } from '../../utils/firebase';
import { Team, Level, TeamMember, UserProfile, SubscriptionPlan } from '../../types';
import AdBanner from '../shared/AdBanner';
import { getTranslation } from '../../utils/i18n';

interface TeamManagerProps {
  user: User | null;
  userProfile?: UserProfile | null;
  onBack: () => void;
  onOpenCalendar: (team: Team) => void;
  onJoinTeam?: () => void;
  onUpgradeRequest?: (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;
}

const TeamManager: React.FC<TeamManagerProps> = ({ user, userProfile, onBack, onOpenCalendar, onJoinTeam, onUpgradeRequest }) => {
  const t = getTranslation(userProfile);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCategory, setNewTeamCategory] = useState<Level>(Level.U14);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isPlayer = userProfile?.role === 'player';
  const isParent = userProfile?.role === 'parent';
  const isNormalUser = isPlayer || isParent;
  
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    let qTeams;
    if (isNormalUser) {
      qTeams = query(collection(db, "teams"), where("memberUids", "array-contains", user.uid));
    } else {
      qTeams = query(collection(db, "teams"), where("coachId", "==", user.uid));
    }

    const unsubTeams = onSnapshot(qTeams, (snap) => {
      const list: Team[] = [];
      (snap as any).forEach((doc: any) => list.push({ ...doc.data(), id: doc.id } as Team));
      setTeams(list);
      setLoading(false);
    }, (error) => {
      console.error("Teams sync error:", error);
      setLoading(false);
    });

    return () => unsubTeams();
  }, [user, isNormalUser]);

  const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTeamName.trim()) return;

    if (!isPaid) {
      alert("BASIC FEATURE: Squad Hub creation is only available for Basic users and above.");
      if (onUpgradeRequest) onUpgradeRequest('basic', 'month');
      return;
    }

    setLoading(true);
    try {
      const joinCode = generateJoinCode();
      const coachMember: TeamMember = {
        uid: user.uid,
        name: user.displayName || 'Coach',
        email: user.email || '',
        role: 'coach'
      };

      const teamRef = await addDoc(collection(db, "teams"), {
        coachId: user.uid,
        ...(userProfile?.managedByUid ? { clubId: userProfile.managedByUid } : {}),
        name: newTeamName.trim().toUpperCase(),
        category: newTeamCategory,
        members: [coachMember],
        memberUids: [user.uid],
        joinCode: joinCode,
        createdAt: Date.now()
      });

      await setDoc(doc(db, "joinCodes", joinCode), {
        teamId: teamRef.id,
        coachId: user.uid,
        createdAt: Date.now()
      });

      setNewTeamName('');
      setIsCreating(false);
    } catch (err: any) {
      console.error("Squad activation error:", err);
      alert("A technical error occurred while activating the squad.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (e: React.MouseEvent, team: Team) => {
    e.stopPropagation(); 
    const confirmMessage = isNormalUser 
      ? `Are you sure you want to leave "${team.name}"?`
      : `Are you sure you want to delete "${team.name}"? All squad data will be erased.`;
      
    if (!window.confirm(confirmMessage)) return;
    
    setDeletingId(team.id);
    try {
      if (isNormalUser) {
        const teamRef = doc(db, "teams", team.id);
        const updatedMembers = (team.members || []).filter(m => m.uid !== user?.uid);
        const updatedMemberUids = (team.memberUids || []).filter(uid => uid !== user?.uid);
        await updateDoc(teamRef, {
          members: updatedMembers,
          memberUids: updatedMemberUids
        });
      } else {
        const batch = writeBatch(db);
        batch.delete(doc(db, "teams", team.id));
        if (team.joinCode) {
          batch.delete(doc(db, "joinCodes", team.joinCode));
        }
        await batch.commit();
      }
    } catch (err: any) {
      alert("Error: " + (err.message || "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-2">
          <h2 className="text-3xl font-black italic uppercase tracking-tight">{isNormalUser ? 'My' : 'Coach'} <span className="text-ha-brand">{isNormalUser ? 'Squads' : 'HQ'}</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">{isNormalUser ? 'Manage your team connections' : t.selectSquad}</p>
        </div>
        <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {!isNormalUser && (
        isCreating ? (
          <form onSubmit={handleCreateTeam} className="bg-[#0b1224] border border-slate-800 rounded-[2rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-top-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest italic text-center">Initialize New Squad</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1">Team Name</label>
                <input required type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="E.G. U14 ELITE" className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-black uppercase tracking-widest outline-none shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1">Category</label>
                <select className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-black uppercase tracking-widest outline-none" value={newTeamCategory} onChange={(e) => setNewTeamCategory(e.target.value as Level)}>
                  {Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsCreating(false)} className="flex-1 py-4 bg-slate-900 text-slate-500 font-black uppercase text-[10px] rounded-xl">Cancel</button>
              <button type="submit" disabled={loading} className="flex-[2] py-4 bg-ha-brand text-slate-950 font-black uppercase text-[10px] rounded-xl disabled:opacity-50">
                {loading ? 'TRANSMITTING...' : 'ACTIVATE SQUAD'}
              </button>
            </div>
          </form>
        ) : (
          <div className="relative group">
            {!isPro && (
              <div className="absolute -top-4 right-6 bg-amber-500 text-slate-950 text-[7px] font-black px-3 py-1 rounded-full shadow-xl z-10 animate-bounce">
                PRO FEATURE
              </div>
            )}
            <button 
              onClick={() => isPaid ? setIsCreating(true) : (onUpgradeRequest ? onUpgradeRequest('basic', 'month') : alert("UPGRADE REQUIRED: Squad creation is a Basic feature."))} 
              className={`w-full py-8 bg-slate-900/30 border border-slate-800 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-3 group transition-all shadow-inner ${!isPaid ? 'opacity-60 grayscale hover:grayscale-0' : 'hover:bg-slate-900/50 hover:border-ha-brand/50'}`}
            >
              <div className={`w-12 h-12 bg-ha-bg rounded-2xl flex items-center justify-center text-slate-600 transition-colors shadow-lg border border-slate-800 ${isPaid ? 'group-hover:text-ha-brand' : ''}`}>
                {isPaid ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                )}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isPaid ? 'text-slate-500 group-hover:text-white' : 'text-slate-600'}`}>
                {isPaid ? t.launchNewSquadFleet : 'Unlock Squad Creation'}
              </span>
            </button>
          </div>
        )
      )}

      {isNormalUser && (
        <button onClick={onJoinTeam} className="w-full py-8 bg-ha-brand/10 border border-ha-brand/30 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-3 group hover:bg-ha-brand/20 hover:border-ha-brand transition-all shadow-xl">
          <div className="w-12 h-12 bg-ha-bg rounded-2xl flex items-center justify-center text-ha-brand group-hover:scale-110 transition-transform border border-ha-brand/20 shadow-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
            </svg>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-ha-brand">Join Squad with Deployment Code</span>
        </button>
      )}

      <div className="space-y-6">
        {loading && !isCreating ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : teams.length > 0 ? (
          teams.map(team => (
            <div 
              key={team.id} 
              onClick={() => onOpenCalendar(team)}
              className={`group relative bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all cursor-pointer hover:border-ha-brand/50 hover:scale-[1.01] active:scale-95 ${deletingId === team.id ? 'opacity-40 grayscale scale-95 pointer-events-none' : ''}`}
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-ha-brand/30 text-ha-brand rounded-md bg-ha-brand/5">{team.category}</span>
                      {!isNormalUser && team.joinCode && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-amber-500/30 text-amber-500 rounded-md bg-amber-500/5">CODE: {team.joinCode}</span>
                      )}
                    </div>
                    <h4 className="text-3xl font-black italic uppercase tracking-tighter text-white group-hover:text-ha-brand transition-colors leading-none">{team.name}</h4>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => handleDeleteTeam(e, team)}
                      className="p-3 bg-red-500/5 border border-red-500/10 text-red-500/50 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        {isNormalUser ? (
                          <>
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                          </>
                        ) : (
                          <>
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </>
                        )}
                      </svg>
                    </button>
                    <div className="w-14 h-14 bg-ha-bg border border-slate-800 rounded-2xl flex items-center justify-center text-slate-800 group-hover:text-ha-brand group-hover:border-ha-brand/30 transition-all shadow-inner">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-3">
                      {(team.members || []).slice(0, 4).map((m, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-[#0b1224] flex items-center justify-center shadow-lg">
                           <span className="text-[10px] font-black text-ha-brand italic">{m.name.charAt(0)}</span>
                        </div>
                      ))}
                      {(team.members || []).length > 4 && (
                        <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-[#0b1224] flex items-center justify-center shadow-lg text-[8px] font-black text-slate-500">
                          +{(team.members || []).length - 4}
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest italic">{(team.members || []).length} {t.personnelSynced}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase text-ha-brand/40 tracking-widest group-hover:translate-x-1 transition-transform">{t.deployHub}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-24 text-slate-700 font-black uppercase tracking-widest text-[10px] bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]">No active squads detected in current sector.</div>
        )}
      </div>

      {!isPaid && (
        <div className="py-8">
          <AdBanner adSlot="team_manager_bottom" isPaid={isPaid} onUpgrade={() => onUpgradeRequest?.('basic', 'month')} />
        </div>
      )}
    </div>
  );
};

export default TeamManager;
