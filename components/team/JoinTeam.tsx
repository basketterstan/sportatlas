
import React, { useState } from 'react';
import { getDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Team, TeamMember } from '../../types';

interface JoinTeamProps {
  onBack: () => void;
  onJoined: (team: Team) => void;
}

const JoinTeam: React.FC<JoinTeamProps> = ({ onBack, onJoined }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.toUpperCase().trim();
    if (!auth.currentUser || cleanCode.length !== 6) return;

    setError(null);
    setLoading(true);

    try {
      const codeDocRef = doc(db, "joinCodes", cleanCode);
      const codeDocSnap = await getDoc(codeDocRef);

      if (!codeDocSnap.exists()) {
        setError("Tactical link failed: Code not recognized.");
        setLoading(false);
        return;
      }

      // Fix: Cast codeDocSnap.data() to any
      const codeData = codeDocSnap.data() as any;
      const { teamId } = codeData;
      const teamDocRef = doc(db, "teams", teamId);
      const teamDocSnap = await getDoc(teamDocRef);

      if (!teamDocSnap.exists()) {
        setError("Squad no longer exists in database.");
        setLoading(false);
        return;
      }

      // Fix: Check doc existence and cast team data
      const teamDataRaw = teamDocSnap.data() as any;
      const teamData = { ...teamDataRaw, id: teamDocSnap.id } as Team;

      if (teamData.members.some(m => m.uid === auth.currentUser?.uid)) {
        setError("Signal established: Already part of this roster.");
        setLoading(false);
        return;
      }

      const playerMember: TeamMember = {
        uid: auth.currentUser.uid,
        name: auth.currentUser.displayName || 'Player',
        email: auth.currentUser.email || '',
        role: 'player'
      };

      await updateDoc(teamDocRef, {
        members: arrayUnion(playerMember),
        memberUids: arrayUnion(auth.currentUser.uid)
      });

      onJoined(teamData);
    } catch (err: any) {
      console.error("Join error", err);
      setError("Connection error: Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-ha-bg text-slate-50 relative overflow-hidden">
      <button onClick={onBack} className="absolute top-10 left-8 p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-500 hover:text-white transition-all shadow-xl z-20">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>

      <div className="w-full max-w-sm space-y-10 animate-in fade-in zoom-in duration-500 relative z-10">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-ha-brand/10 border-2 border-ha-brand/30 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(6,182,212,0.2)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight italic uppercase text-white leading-none">Squad <span className="text-ha-brand">Link</span></h1>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Establish tactical connection</p>
          </div>
        </div>

        <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] shadow-3xl space-y-8">
          <form onSubmit={handleJoin} className="space-y-6">
            <div className="space-y-3 text-center">
              <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600">Deployment Code</label>
              <input 
                required 
                maxLength={6}
                type="text" 
                value={code} 
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))} 
                placeholder="H-XXXXXX" 
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl px-5 py-6 text-4xl text-center text-ha-brand font-black tracking-widest focus:ring-2 focus:ring-ha-brand transition-all placeholder:text-slate-900 outline-none shadow-inner" 
              />
            </div>

            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest">{error}</div>}

            <button 
              type="submit" 
              disabled={loading || code.length < 5} 
              className="w-full py-5 bg-ha-brand text-slate-950 font-black uppercase tracking-widest rounded-2xl transition-all active:scale-[0.98] shadow-2xl shadow-cyan-900/30 disabled:opacity-30"
            >
              {loading ? 'TRANSMITTING...' : 'ESTABLISH LINK'}
            </button>
          </form>
        </div>
      </div>
      
      <div className="absolute bottom-12 left-0 w-full text-center opacity-20 pointer-events-none">
        <p className="text-[8px] font-black uppercase tracking-[0.6em] text-white">SportAtlas Security Protocol</p>
      </div>
    </div>
  );
};

export default JoinTeam;
