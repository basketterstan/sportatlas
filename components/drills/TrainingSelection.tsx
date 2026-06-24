
import React, { useState, useMemo, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { Drill, SkillFocus, Level, DrillAssignment, UserProfile, Sport } from '../../types';
import { FOUNDATION_UNITS, getFoundationDrillsBySport } from '../../data/foundationDrills';
import { getSportConfig } from '../../data/sports';

interface TrainingSelectionProps {
  hubDrills: Drill[];
  onSelect: (drill: Drill) => void;
  onBack: () => void;
  userProfile?: UserProfile | null;
}

const TrainingSelection: React.FC<TrainingSelectionProps> = ({ hubDrills, onSelect, onBack, userProfile }) => {
  const userSport: Sport = userProfile?.sport ?? Sport.BASKETBALL;
  const sportConfig = getSportConfig(userSport);
  const sportFoundationDrills = getFoundationDrillsBySport(userSport);

  const [filter, setFilter] = useState<string>('ALL');
  const [assignedTasks, setAssignedTasks] = useState<Drill[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Sync assigned tasks for the player
  useEffect(() => {
    if (!userProfile?.uid) return;

    const q = query(
      collection(db, "assignments"),
      where("playerId", "==", userProfile.uid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const drillList: Drill[] = [];
      const assignments = snap.docs.map(doc => doc.data() as DrillAssignment);

      for (const assign of assignments) {
        const found = FOUNDATION_UNITS.find(d => d.id === assign.drillId) ||
                      hubDrills.find(d => d.id === assign.drillId);
        if (found) {
          drillList.push(found);
        }
      }
      setAssignedTasks(drillList);
      setLoadingTasks(false);
    });

    return () => unsub();
  }, [userProfile?.uid, hubDrills]);

  const dailyDrill = useMemo(() => {
    const today = new Date();
    const dateString = today.getFullYear().toString() + today.getMonth().toString() + today.getDate().toString();
    const hash = Array.from(dateString).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pool = sportFoundationDrills.length > 0 ? sportFoundationDrills : FOUNDATION_UNITS;
    return pool[hash % pool.length];
  }, [sportFoundationDrills]);

  const filteredDrills = useMemo(() => {
    // Foundation drills filtered by sport + hub drills filtered by sport
    const sportHubDrills = hubDrills.filter(d =>
      d.sport === userSport || (!d.sport && userSport === Sport.BASKETBALL)
    );
    const combined = [...sportFoundationDrills, ...sportHubDrills];
    if (filter === 'ALL') return combined;
    return combined.filter(d => d.focus === filter);
  }, [filter, hubDrills, sportFoundationDrills, userSport]);

  const getIconForFocus = (focus: SkillFocus | string) => {
    switch (focus) {
      case SkillFocus.SHOOTING: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>;
      case SkillFocus.BALL_HANDLING: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><circle cx="12" cy="12" r="10"/></svg>;
      case SkillFocus.PASSING: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 8L22 12L18 16"/><path d="M2 12H22"/></svg>;
      case SkillFocus.DEFENSE: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
      case SkillFocus.CONDITIONING: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
      default: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M2 12h20"/></svg>;
    }
  };

  const getAccent = (focus: SkillFocus | string) => {
    switch (focus) {
      case SkillFocus.SHOOTING: return 'text-ha-brand border-ha-brand/20 bg-ha-brand/5';
      case SkillFocus.BALL_HANDLING: return 'text-purple-400 border-purple-500/20 bg-purple-500/5';
      case SkillFocus.PASSING: return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      case SkillFocus.DEFENSE: return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
      case SkillFocus.CONDITIONING: return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      default: return 'text-slate-400 border-slate-500/20 bg-slate-500/5';
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-24 px-2 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-5xl font-black italic uppercase tracking-tighter leading-none">Training <span className="text-ha-brand">Hub</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em] mt-2">Solo Skill Protocols Online</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* COACH ASSIGNMENTS SECTION */}
      {assignedTasks.length > 0 && (
        <section className="space-y-6 animate-in slide-in-from-left duration-500">
           <div className="flex items-center gap-3 px-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] italic">Coach's Orders</h3>
           </div>
           <div className="grid grid-cols-1 gap-4">
              {assignedTasks.map(drill => (
                <div 
                  key={`assigned-${drill.id}`}
                  onClick={() => onSelect(drill)}
                  className="bg-indigo-600 border border-indigo-400 p-8 rounded-[2.5rem] flex items-center justify-between shadow-2xl group cursor-pointer active:scale-95 transition-all"
                >
                   <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white border border-white/20">
                         {getIconForFocus(drill.focus)}
                      </div>
                      <div>
                         <h4 className="text-2xl font-black italic uppercase text-white tracking-tight">{drill.title}</h4>
                         <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-widest">Priority Assigned Unit • {drill.duration}m</p>
                      </div>
                   </div>
                   <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/40 group-hover:translate-x-1 transition-transform">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg>
                   </div>
                </div>
              ))}
           </div>
        </section>
      )}

      {/* DAILY SUGGESTED SECTION */}
      <section 
        onClick={() => onSelect(dailyDrill)}
        className="group relative bg-[#0b1224] border-2 border-ha-brand/30 rounded-[3rem] p-10 cursor-pointer hover:border-ha-brand transition-all shadow-[0_0_50px_rgba(6,182,212,0.1)] overflow-hidden"
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-ha-brand/10 blur-[100px] rounded-full group-hover:bg-ha-brand/20 transition-all"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
           <div className="space-y-4">
              <div className="flex items-center gap-3">
                 <span className="bg-ha-brand text-slate-950 text-[8px] font-black px-3 py-1 rounded uppercase tracking-[0.2em] animate-pulse">Daily Suggestion</span>
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">{dailyDrill.title}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">{dailyDrill.focus} • {dailyDrill.duration} MIN • {dailyDrill.level}</p>
           </div>
           <div className="bg-ha-brand text-slate-950 px-8 py-5 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl group-hover:scale-105 transition-transform">Start Daily Session →</div>
        </div>
      </section>

      {/* FILTER TABS */}
      <div className="flex bg-[#0b1224] p-1.5 rounded-[1.75rem] border border-slate-800 shadow-2xl overflow-x-auto no-scrollbar gap-1">
        <button onClick={() => setFilter('ALL')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${filter === 'ALL' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}>All</button>
        {sportConfig.skills.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 min-w-[100px] py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-white'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* DRILLS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredDrills.map((drill, idx) => (
          <div 
            key={drill.id}
            onClick={() => onSelect(drill)}
            className={`group relative bg-[#0b1224]/50 border border-slate-800/80 rounded-[2.5rem] p-8 text-left overflow-hidden shadow-2xl hover:border-indigo-500/40 cursor-pointer active:scale-95 transition-all`}
            style={{ animationDelay: `${idx * 20}ms` }}
          >
            <div className="flex flex-col gap-6 relative z-10">
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${getAccent(drill.focus)}`}>
                  {getIconForFocus(drill.focus)}
                </div>
                <div className="bg-ha-bg border border-slate-800 px-3 py-1 rounded-lg">
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{drill.level}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter leading-tight group-hover:text-indigo-400 transition-colors">{drill.title}</h3>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{drill.duration} MIN • PROTOCOL {drill.id.startsWith('s-') ? 'FOUNDATION' : 'VARIATION'}</p>
              </div>

              <div className="pt-5 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-black text-ha-brand uppercase tracking-[0.2em]">View Intel →</span>
                <div className="flex gap-1">
                   <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                   <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                   <div className="w-1 h-1 rounded-full bg-slate-800"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrainingSelection;
