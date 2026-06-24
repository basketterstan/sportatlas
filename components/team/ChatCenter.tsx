
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, limit, or, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { UserProfile, Team, PrivateMessage, TeamMember, SquadMessage } from '../../types';
import AdBanner from '../shared/AdBanner';

interface ChatCenterProps {
  userProfile: UserProfile;
  onOpenTeamChat: (team: Team) => void;
  onOpenPrivateChat: (player: any, team: Team) => void;
  onBack: () => void;
}

interface ChatThread {
  id: string;
  title: string;
  subtitle: string;
  lastMessage?: string;
  timestamp?: number;
  type: 'team' | 'private';
  metadata: any;
}

const ChatCenter: React.FC<ChatCenterProps> = ({ userProfile, onBack, onOpenTeamChat, onOpenPrivateChat }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [lastTeamMessages, setLastTeamMessages] = useState<Record<string, { content: string, timestamp: number }>>({});
  const [dmThreads, setDmThreads] = useState<Record<string, ChatThread>>({});
  const [personnel, setPersonnel] = useState<Record<string, ChatThread>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));

  useEffect(() => {
    if (!userProfile.uid) return;

    // 1. Sync Teams to identify ALL possible squads and personnel
    const qTeams = userProfile.role === 'player' || userProfile.role === 'parent'
      ? query(collection(db, "teams"), where("memberUids", "array-contains", userProfile.uid))
      : query(collection(db, "teams"), where("coachId", "==", userProfile.uid));

    const unsubTeams = onSnapshot(qTeams, (snap) => {
      const teamsList: Team[] = [];
      const squadPersonnel: Record<string, ChatThread> = {};

      snap.forEach(d => {
        const team = { ...d.data(), id: d.id } as Team;
        teamsList.push(team);

        team.members?.forEach((m: TeamMember) => {
          if (m.uid !== userProfile.uid) {
            squadPersonnel[m.uid] = {
              id: m.uid,
              title: m.name,
              subtitle: m.role === 'coach' ? 'Fleet Commander' : m.role === 'parent' ? 'Support Unit' : 'Operational Unit',
              type: 'private',
              metadata: { ...m, teamId: team.id }
            };
          }
        });
      });
      
      setTeams(teamsList);
      setPersonnel(squadPersonnel);
      
      // 2. Once teams are known, listen for the latest team messages to get timestamps for Locker Rooms
      if (teamsList.length > 0) {
        const teamIds = teamsList.map(t => t.id);
        // Firestore 'in' matches max 30 items
        const chunkedIds = [];
        for (let i = 0; i < teamIds.length; i += 30) chunkedIds.push(teamIds.slice(i, i + 30));

        chunkedIds.forEach(ids => {
          // FIX: Removed orderBy("createdAt", "desc") to avoid index requirement error.
          // We fetch a larger limit and find the latest in memory.
          const qTeamMsgs = query(
            collection(db, "squadMessages"),
            where("teamId", "in", ids),
            limit(300) 
          );

          onSnapshot(qTeamMsgs, (mSnap) => {
            const updates: Record<string, { content: string, timestamp: number }> = {};
            mSnap.forEach(mdoc => {
              const m = mdoc.data() as SquadMessage;
              // Only keep track of the absolute latest message per team
              if (!updates[m.teamId] || m.createdAt > updates[m.teamId].timestamp) {
                updates[m.teamId] = { content: m.content, timestamp: m.createdAt };
              }
            });
            setLastTeamMessages(prev => ({ ...prev, ...updates }));
          });
        });
      }
      setLoading(false);
    });

    // 3. Sync Private DM history
    const qDMs = query(
      collection(db, "privateMessages"),
      or(
        where("senderId", "==", userProfile.uid),
        where("receiverId", "==", userProfile.uid)
      ),
      limit(150)
    );

    const unsubDMs = onSnapshot(qDMs, (snap) => {
      const history: Record<string, ChatThread> = {};
      
      snap.forEach(d => {
        const msg = d.data() as PrivateMessage;
        const otherId = msg.senderId === userProfile.uid ? msg.receiverId : msg.senderId;
        const otherName = msg.senderId === userProfile.uid ? 'Personnel' : msg.senderName;
        
        if (!history[otherId] || (msg.createdAt > (history[otherId].timestamp || 0))) {
          history[otherId] = {
            id: otherId,
            title: otherName,
            subtitle: 'Private Signal',
            lastMessage: msg.content,
            timestamp: msg.createdAt,
            type: 'private',
            metadata: { uid: otherId, name: otherName, teamId: msg.teamId }
          };
        }
      });

      setDmThreads(history);
    });

    return () => { unsubTeams(); unsubDMs(); };
  }, [userProfile.uid]);

  // COMBINE ALL SOURCES AND SORT BY RECENCY
  const filteredItems = useMemo(() => {
    const list: ChatThread[] = [];

    // A. Add Teams (Locker Rooms) with their latest activity
    teams.forEach(team => {
      const last = lastTeamMessages[team.id];
      list.push({
        id: team.id,
        title: team.name,
        subtitle: `Locker Room • ${team.category}`,
        lastMessage: last?.content,
        timestamp: last?.timestamp,
        type: 'team',
        metadata: team
      });
    });

    // B. DMs with history (Override basic personnel data if history exists)
    const activeDmIds = new Set<string>();
    Object.values(dmThreads).forEach((dm: ChatThread) => {
      list.push(dm);
      activeDmIds.add(dm.id);
    });

    // C. Add all other personnel who don't have an active DM yet
    Object.values(personnel).forEach((p: ChatThread) => {
      if (!activeDmIds.has(p.id)) {
        list.push(p);
      }
    });

    // D. Filter by search
    const q = searchQuery.toLowerCase().trim();
    const results = q 
      ? list.filter(item => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q))
      : list;

    // E. Sort: Newest Activity (Timestamp) always on top.
    return results.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      
      // Both have timestamps -> Newest first
      if (timeA && timeB) return timeB - timeA;
      // Only A has timestamp -> A first
      if (timeA) return -1;
      // Only B has timestamp -> B first
      if (timeB) return 1;
      
      // Neither have timestamps -> Teams first, then Alphabetical
      if (a.type === 'team' && b.type !== 'team') return -1;
      if (b.type === 'team' && a.type !== 'team') return 1;
      return a.title.localeCompare(b.title);
    });
  }, [teams, lastTeamMessages, dmThreads, personnel, searchQuery]);

  const renderMessagePreview = (content: string) => {
    if (content.startsWith('[TACTICAL_CLIP]:')) return "🎬 Shared a tactical highlight";
    return content;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-32 px-2">
      <div className="flex items-center justify-between sticky top-0 bg-ha-bg py-4 z-50 px-1">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">Inbox <span className="text-ha-brand">Hub</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Tactical Communications</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="relative group px-1">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-600 group-focus-within:text-ha-brand transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="SEARCH PERSONNEL OR SQUADS..." 
          className="w-full bg-[#0b1224] border border-slate-800 rounded-[2rem] py-5 pl-14 pr-6 text-[10px] font-black uppercase text-white outline-none focus:border-ha-brand shadow-inner transition-all"
        />
      </div>

      <div className="space-y-4 px-1">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-4">
             <div className="w-10 h-10 border-4 border-ha-brand border-t-transparent rounded-full animate-spin"></div>
             <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest">Scanning Uplinks...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          filteredItems.map(item => (
            <div 
              key={`${item.type}-${item.id}`} 
              onClick={() => {
                if (item.type === 'team') onOpenTeamChat(item.metadata);
                else onOpenPrivateChat(item.metadata, { id: item.metadata.teamId } as Team);
              }}
              className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] flex items-center justify-between group cursor-pointer hover:border-indigo-500/30 transition-all shadow-xl active:scale-[0.98]"
            >
              <div className="flex items-center gap-6 overflow-hidden">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black italic text-xl shadow-inner border-2 shrink-0 ${item.type === 'team' ? 'bg-ha-brand/10 border-ha-brand text-ha-brand' : 'bg-indigo-500/10 border-indigo-500 text-indigo-400'}`}>
                  {item.title.charAt(0)}
                </div>
                <div className="space-y-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xl font-black italic uppercase text-white tracking-tight group-hover:text-white transition-colors leading-none truncate">{item.title}</h4>
                    {item.timestamp && <div className="w-1.5 h-1.5 rounded-full bg-ha-brand animate-pulse shrink-0"></div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-[10px] font-black uppercase tracking-widest leading-none shrink-0 ${item.type === 'team' ? 'text-slate-600' : 'text-indigo-500/60'}`}>{item.subtitle}</p>
                    {item.timestamp && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0"></span>
                        <p className="text-[8px] font-bold text-slate-700 uppercase shrink-0">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </>
                    )}
                  </div>
                  {item.lastMessage && (
                    <p className="text-[11px] text-slate-400 truncate max-w-full mt-1 italic">
                      "{renderMessagePreview(item.lastMessage)}"
                    </p>
                  )}
                </div>
              </div>
              <div className="w-10 h-10 bg-ha-bg border border-slate-800 rounded-xl flex items-center justify-center text-slate-700 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          ))
        ) : (
          <div className="py-32 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]">
            <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No personnel or squads match your search criteria.</p>
            <button onClick={() => setSearchQuery('')} className="mt-4 text-ha-brand font-black uppercase text-[8px] tracking-widest border-b border-ha-brand/40 pb-0.5">Clear Search</button>
          </div>
        )}
      </div>

      <div className="text-center opacity-30">
        <p className="text-[8px] font-black text-slate-800 uppercase tracking-[0.5em]">Encrypted Tactical Channel v2.2</p>
      </div>

      {!isPaid && (
        <div className="py-8">
          <AdBanner adSlot="chat_center_bottom" isPaid={isPaid} onUpgrade={() => {}} />
        </div>
      )}
    </div>
  );
};

export default ChatCenter;
