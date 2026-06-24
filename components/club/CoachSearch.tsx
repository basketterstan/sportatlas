
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile } from '../../types';

interface CoachSearchProps {
  onBack: () => void;
}

const CoachSearch: React.FC<CoachSearchProps> = ({ onBack }) => {
  const [coaches, setCoaches] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, "users"), 
      where("role", "==", "coach"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: UserProfile[] = [];
      (snap as any).forEach((doc: any) => {
        list.push({ ...doc.data() as UserProfile, uid: doc.id });
      });
      setCoaches(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredCoaches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return coaches;
    return coaches.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.username.toLowerCase().includes(q)
    );
  }, [coaches, searchQuery]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-2">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter leading-none">Coach <span className="text-ha-brand">Scout</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">Find verified tactical experts</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-ha-brand/20 to-blue-500/20 rounded-[1.5rem] blur opacity-50 group-focus-within:opacity-100 transition-opacity"></div>
        <div className="relative bg-[#0b1224] border border-slate-800 rounded-[1.5rem] flex items-center shadow-2xl overflow-hidden">
          <input 
            type="text"
            placeholder="Search by name or @username..."
            className="w-full bg-transparent py-6 pl-14 pr-6 text-white focus:outline-none placeholder:text-slate-700 text-xs font-bold uppercase tracking-[0.2em]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg className="absolute left-5 text-ha-brand" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Scanning Network...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCoaches.length > 0 ? filteredCoaches.map((coach) => (
            <div key={coach.uid} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-xl relative overflow-hidden group hover:border-ha-brand/40 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-ha-brand/5 blur-3xl rounded-full"></div>
              
              <div className="flex items-center gap-6 relative z-10">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-slate-800 text-ha-brand font-black italic text-2xl shadow-inner group-hover:border-ha-brand/30 transition-all">
                  {coach.name.charAt(0)}
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-black italic uppercase text-white tracking-tight">{coach.name}</h4>
                  <p className="text-[10px] font-black text-ha-brand/60 uppercase tracking-widest">@{coach.username}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-900 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-black uppercase px-2 py-1 rounded border ${coach.plan === 'pro' ? 'text-purple-400 border-purple-500/30 bg-purple-500/5' : 'text-slate-500 border-slate-800 bg-slate-900'}`}>
                    {coach.plan} Edition
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                   <span className="text-[8px] font-black uppercase tracking-widest">Verified Coach</span>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-20 text-center space-y-4 bg-slate-900/10 border border-dashed border-slate-800 rounded-[2.5rem]">
               <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No coaches found for this search</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CoachSearch;
