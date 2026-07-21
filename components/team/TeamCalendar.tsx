
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  writeBatch,
  limit,
  getDocs,
  or,
  and,
  orderBy
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../../utils/firebase';
import { Team, CalendarEvent, Drill, AttendanceRecord, AttendanceStatus, SquadMessage, EventType, UserProfile, DrillAssignment, ViewState, TeamMember, PrivateMessage, UploadedMatch } from '../../types';
import MatchAnalysis from '../match/MatchAnalysis';
import ExternalMatchImport from '../match/ExternalMatchImport';

interface TeamCalendarProps {
  user: User | null;
  team: Team;
  drills: Drill[];
  onBack: () => void;
  onViewDrill?: (drillId: string) => void;
  userProfile?: UserProfile | null;
  onNavigate: (view: ViewState, drillId?: string, mode?: 'login' | 'signup') => void;
  initialTab?: string;
  initialPlayer?: TeamMember;
}

const TeamCalendar: React.FC<TeamCalendarProps> = ({ user, team: initialTeam, drills, onBack, onViewDrill, userProfile, onNavigate, initialTab, initialPlayer }) => {
  const isParent = userProfile?.role === 'parent';
  const defaultTab = isParent ? 'schedule' : (initialTab as any) || 'schedule';
  const [activeTab, setActiveTab] = useState<'schedule' | 'playbook' | 'locker-room' | 'roster' | 'analysis' | 'highlights'>(defaultTab);
  
  const [team, setTeam] = useState<Team>(initialTeam);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [messages, setMessages] = useState<SquadMessage[]>([]);
  const [assignments, setAssignments] = useState<DrillAssignment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(new Date().toISOString().split('T')[0]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showManifestId, setShowManifestId] = useState<string | null>(null);
  const [isPickingMatch, setIsPickingMatch] = useState(false);
  const [availableMatches, setAvailableMatches] = useState<UploadedMatch[]>([]);
  const [selectedMatchForClip, setSelectedMatchForClip] = useState<UploadedMatch | null>(null);

  const [selectedPlayer, setSelectedPlayer] = useState<TeamMember | null>(initialPlayer || null);
  const [showPrivateChat, setShowPrivateChat] = useState(!!initialPlayer);
  const [showPersonalDrillSelect, setShowPersonalDrillSelect] = useState(false);
  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [newPrivateMsg, setNewPrivateMsg] = useState('');
  const privateEndRef = useRef<HTMLDivElement>(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showMatchImport, setShowMatchImport] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newType, setNewType] = useState<EventType>('practice');
  const [newLocation, setNewLocation] = useState('');
  const [newHomeTeam, setNewHomeTeam] = useState('');
  const [newAwayTeam, setNewAwayTeam] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatCount, setRepeatCount] = useState(1);
  const [parentInviteLink, setParentInviteLink] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [externalFeedUrl, setExternalFeedUrl] = useState('');
  const [showFeedSync, setShowFeedSync] = useState(false);
  const [syncingFeed, setSyncingFeed] = useState(false);
  
  const [assignDrillId, setAssignDrillId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);

  const isCoach = user?.uid === team.coachId || userProfile?.isAdmin;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  const scrollPrivateToBottom = () => {
    privateEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === 'locker-room') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  useEffect(() => {
    if (showPrivateChat) {
      scrollPrivateToBottom();
    }
  }, [privateMessages, showPrivateChat]);

  useEffect(() => {
    if (initialPlayer) {
      setSelectedPlayer(initialPlayer);
      setShowPrivateChat(true);
    }
  }, [initialPlayer]);

  useEffect(() => {
    if (!user || !initialTeam.id) return;

    const unsubTeam = onSnapshot(doc(db, "teams", initialTeam.id), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as any;
        setTeam({ ...data, id: doc.id } as Team);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `teams/${initialTeam.id}`));

    const qEvents = query(collection(db, "events"), where("teamId", "==", initialTeam.id));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      const list: CalendarEvent[] = [];
      snap.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as CalendarEvent));
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      setEvents(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, "events"));

    const qAttendance = query(collection(db, "attendance"), where("teamId", "==", initialTeam.id));
    const unsubAttendance = onSnapshot(qAttendance, (snap) => {
      const all: AttendanceRecord[] = [];
      const userRecs: Record<string, AttendanceStatus> = {};
      snap.forEach((doc) => {
        const data = doc.data() as AttendanceRecord;
        all.push(data);
        if (data.userId === user.uid) {
          userRecs[data.eventId] = data.status;
        }
      });
      setAllAttendance(all);
      setAttendance(userRecs);
    }, (err) => handleFirestoreError(err, OperationType.GET, "attendance"));

    const qMessages = query(collection(db, "squadMessages"), where("teamId", "==", initialTeam.id), limit(100));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      const list: SquadMessage[] = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id } as SquadMessage));
      list.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, "squadMessages"));

    const qAssignments = query(
      collection(db, "assignments"), 
      where("teamId", "==", initialTeam.id)
    );
    const unsubAssignments = onSnapshot(qAssignments, (snap) => {
       const list: DrillAssignment[] = [];
       snap.forEach((d) => {
         const data = d.data() as DrillAssignment;
         if (!data.playerId || data.playerId === user.uid || isCoach) {
            list.push({ ...data, id: d.id });
         }
       });
       setAssignments(list.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    }, (err) => handleFirestoreError(err, OperationType.GET, "assignments"));

    return () => { unsubTeam(); unsubEvents(); unsubAttendance(); unsubMessages(); unsubAssignments(); };
  }, [user, initialTeam.id, isCoach]);

  useEffect(() => {
    if (!user || !selectedPlayer || !showPrivateChat) return;

    const q = query(
      collection(db, "privateMessages"),
      and(
        where("teamId", "==", team.id),
        or(
          where("senderId", "==", user.uid),
          where("receiverId", "==", user.uid)
        )
      )
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: PrivateMessage[] = [];
      snap.forEach(d => {
        const msg = d.data() as PrivateMessage;
        if ((msg.senderId === user.uid && msg.receiverId === selectedPlayer.uid) || 
            (msg.senderId === selectedPlayer.uid && msg.receiverId === user.uid)) {
          list.push({ ...msg, id: d.id });
        }
      });
      setPrivateMessages(list.sort((a, b) => a.createdAt - b.createdAt));
    }, (err) => handleFirestoreError(err, OperationType.GET, "privateMessages"));

    return () => unsub();
  }, [user, selectedPlayer, showPrivateChat, team.id]);

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; 
    for (let i = startOffset; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), current: false });
    for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), current: true });
    while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - (lastDay.getDate() + startOffset) + 1), current: false });
    return days;
  }, [currentMonth]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate || !newTime) return;
    try {
      const batch = writeBatch(db);
      const startDate = new Date(newDate);
      const count = repeatWeekly ? Math.min(repeatCount, 52) : 1;
      for (let i = 0; i < count; i++) {
        const eventDate = new Date(startDate);
        eventDate.setDate(startDate.getDate() + (i * 7));
        const dateString = eventDate.toISOString().split('T')[0];
        const eventRef = doc(collection(db, "events"));
        batch.set(eventRef, { teamId: team.id, title: newTitle.toUpperCase(), date: dateString, time: newTime, type: newType, location: newLocation, ...(newType === 'game' && newHomeTeam ? { homeTeam: newHomeTeam.toUpperCase() } : {}), ...(newType === 'game' && newAwayTeam ? { awayTeam: newAwayTeam.toUpperCase() } : {}), createdAt: Date.now() });
      }
      await batch.commit();
      setNewTitle(''); setNewHomeTeam(''); setNewAwayTeam(''); setShowEventForm(false); setRepeatWeekly(false); setRepeatCount(1);
    } catch (e) { alert("Deployment failed."); }
  };

  const handleAssignDrill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignDrillId || !assignDueDate) return;
    try {
      await addDoc(collection(db, "assignments"), { teamId: team.id, drillId: assignDrillId, dueDate: assignDueDate, coachId: user?.uid, playerId: targetPlayerId || null, createdAt: Date.now() });
      setShowAssignForm(false); setAssignDrillId(''); setAssignDueDate(''); setTargetPlayerId(null);
    } catch (e) { alert("Assignment failure."); }
  };

  const handleQuickAssignPersonal = async (drill: Drill) => {
    if (!selectedPlayer || !user) return;
    try {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dueDate = nextWeek.toISOString().split('T')[0];
      await addDoc(collection(db, "assignments"), { teamId: team.id, drillId: drill.id, dueDate: dueDate, coachId: user.uid, playerId: selectedPlayer.uid, createdAt: Date.now() });
      alert(`Unit "${drill.title}" transmitted to ${selectedPlayer.name}.`);
      setShowPersonalDrillSelect(false); setSelectedPlayer(null);
    } catch (e) { alert("Personal transmission failed."); }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!window.confirm("Intrek opdracht?")) return;
    try { await deleteDoc(doc(db, "assignments", id)); } catch (e) {
      console.error("Failed to remove assignment:", e);
      alert("Verwijderen mislukt. Probeer opnieuw.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    try {
      await addDoc(collection(db, "squadMessages"), { teamId: team.id, senderId: user.uid, senderName: user.displayName || 'Coach', content: newMessage.trim(), createdAt: Date.now() });
      setNewMessage('');
    } catch (e) { alert("Message transmit failed."); }
  };

  const shareMatchClip = async (matchId: string, time: number, label: string, matchTitle: string) => {
    if (!user) return;
    try {
      const content = `[TACTICAL_CLIP]:${matchId}|${time}|${label}|${matchTitle}`;
      await addDoc(collection(db, "squadMessages"), { teamId: team.id, senderId: user.uid, senderName: user.displayName || 'Coach', content: content, createdAt: Date.now() });
      setIsPickingMatch(false); setSelectedMatchForClip(null); setActiveTab('locker-room');
    } catch (e) { alert("Clip sharing failed."); }
  };

  const handleOpenMatchPicker = async () => {
    if (!auth.currentUser) return;
    try {
      const qPub = query(collection(db, "matches"), where("visibility", "==", "public"), limit(30));
      const snapPub = await getDocs(qPub);
      const qOwn = query(collection(db, "matches"), where("userId", "==", auth.currentUser.uid), limit(30));
      const snapOwn = await getDocs(qOwn);
      const listMap = new Map<string, UploadedMatch>();
      snapPub.forEach(d => listMap.set(d.id, { ...d.data(), id: d.id } as UploadedMatch));
      snapOwn.forEach(d => listMap.set(d.id, { ...d.data(), id: d.id } as UploadedMatch));
      setAvailableMatches(Array.from(listMap.values()).sort((a, b) => b.createdAt - a.createdAt));
      setIsPickingMatch(true);
    } catch (e) { alert("Could not load matches archive."); }
  };

  const handleSendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrivateMsg.trim() || !user || !selectedPlayer) return;
    try {
      await addDoc(collection(db, "privateMessages"), { teamId: team.id, senderId: user.uid, receiverId: selectedPlayer.uid, senderName: user.displayName || 'Coach', content: newPrivateMsg.trim(), createdAt: Date.now() });
      setNewPrivateMsg('');
    } catch (e) { alert("DM failed."); }
  };

  const handleToggleAttendance = async (eventId: string, status: AttendanceStatus) => {
    if (!user) return;
    const attendanceId = `${eventId}_${user.uid}`;
    const docRef = doc(db, "attendance", attendanceId);
    try {
      if (attendance[eventId] === status) await deleteDoc(docRef);
      else await setDoc(docRef, { id: attendanceId, eventId, teamId: team.id, userId: user.uid, status, updatedAt: Date.now() });
    } catch (e) { console.error(e); }
  };

  const getAttendanceSummary = (eventId: string) => {
    const records = allAttendance.filter(r => r.eventId === eventId);
    const presentCount = records.filter(r => r.status === 'present').length;
    return { present: presentCount, total: (team.members || []).length };
  };

  const getManifestForEvent = (eventId: string) => {
    const records = allAttendance.filter(r => r.eventId === eventId);
    return (team.members || []).map(member => ({ ...member, status: (records.find(r => r.userId === member.uid)?.status || 'unresponsive') as any }));
  };

  const exportToIcs = (event: CalendarEvent) => {
    const formatIcsDate = (dateStr: string, timeStr: string) => dateStr.replace(/-/g, '') + 'T' + timeStr.replace(/:/g, '') + '00';
    const startDate = formatIcsDate(event.date, event.time);
    const [hours, minutes] = event.time.split(':').map(Number);
    const endDate = formatIcsDate(event.date, `${((hours + 2) % 24).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    const icsContent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SportAtlas//Operational Intel//EN', 'BEGIN:VEVENT', `UID:${event.id}@sportatlas.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `DTSTART:${startDate}`, `DTEND:${endDate}`, `SUMMARY:${event.title}`, `DESCRIPTION:${event.description || 'Tactical Session'}`, `LOCATION:${event.location || 'Tactical Grounds'}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${event.title.replace(/\s+/g, '_').toUpperCase()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedDayEvents = events.filter(e => e.date === selectedDay);
  const sharedClips = useMemo(() => messages.filter(m => m.content.startsWith('[TACTICAL_CLIP]:')), [messages]);

  const renderContent = (content: string) => {
    if (content.startsWith('[TACTICAL_CLIP]:')) {
      const parts = content.replace('[TACTICAL_CLIP]:', '').split('|');
      const [matchId, time, label, matchTitle] = parts;
      const formattedTime = `${Math.floor(parseInt(time) / 60)}:${(parseInt(time) % 60).toString().padStart(2, '0')}`;
      return (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-3 shadow-xl w-full max-w-[280px]">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
              <div className="flex-1 overflow-hidden"><p className="text-[10px] font-black text-white uppercase italic truncate">{matchTitle}</p><p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">GAME HIGHLIGHT</p></div>
           </div>
           <div className="bg-ha-bg p-3 rounded-xl border border-slate-800 flex items-center justify-between"><span className="text-[10px] font-black text-indigo-400 font-mono">{formattedTime}</span><span className="text-[9px] font-black text-slate-400 uppercase truncate ml-2">{label}</span></div>
           <button onClick={() => { const url = new URL(window.location.origin + window.location.pathname); url.searchParams.set('matchCode', matchId); url.searchParams.set('t', time); window.history.replaceState({}, '', url.toString()); onNavigate('match-archive'); }} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-500 transition-all active:scale-95">Bekijk Highlight</button>
        </div>
      );
    }

    // Detect YouTube Links
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const ytMatch = content.match(ytRegex);
    if (ytMatch) {
      const videoId = ytMatch[1];
      return (
        <div className="space-y-3">
          <p className="text-[11px] font-medium leading-relaxed uppercase tracking-tight">{content}</p>
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-4 space-y-3 shadow-xl w-full max-w-[280px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-black text-white uppercase italic truncate">YouTube Live Feed</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">EXTERNAL BROADCAST</p>
              </div>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
              <iframe 
                width="100%" 
                height="100%" 
                src={`https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&rel=0`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      );
    }

    return <p className="text-[11px] font-medium leading-relaxed uppercase tracking-tight">{content}</p>;
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || addingPlayer) return;
    setAddingPlayer(true);
    try {
      const placeholder = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newMember: TeamMember = {
        uid: placeholder,
        name: newPlayerName.trim(),
        email: newPlayerEmail.trim().toLowerCase(),
        role: 'player'
      };
      const teamRef = doc(db, 'teams', team.id);
      await updateDoc(teamRef, {
        members: [...(team.members || []), newMember]
      });
      setNewPlayerName('');
      setNewPlayerEmail('');
      setShowAddPlayer(false);
    } catch (err: any) {
      alert('Error adding player: ' + err.message);
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleRemovePlayer = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name} from the roster?`)) return;
    try {
      const teamRef = doc(db, 'teams', team.id);
      const updatedMembers = (team.members || []).filter(m => m.uid !== member.uid);
      const updatedMemberUids = (team.memberUids || []).filter(uid => uid !== member.uid);
      await updateDoc(teamRef, { members: updatedMembers, memberUids: updatedMemberUids });
    } catch (err: any) {
      alert('Error removing player: ' + err.message);
    }
  };

  if (activeTab === 'analysis' && userProfile) return <MatchAnalysis userProfile={userProfile} team={team} onBack={() => setActiveTab('schedule')} />;

  const handleGenerateParentInvite = async () => {
    if (!user) return;
    setGeneratingInvite(true);
    try {
      const token = `team_${team.id}`;
      await setDoc(doc(db, 'parentInvites', token), {
        token,
        teamId: team.id,
        teamName: team.name,
        coachId: user.uid,
        createdAt: Date.now(),
      });
      const link = `${window.location.origin}/parent-portal/${token}`;
      setParentInviteLink(link);
    } catch (err: any) {
      alert('Kon uitnodigingslink niet genereren: ' + err.message);
    } finally {
      setGeneratingInvite(false);
    }
  };

  const parseIcal = (text: string) => {
    const results: Array<{summary: string; date: string; time: string; location: string; homeTeam: string; awayTeam: string}> = [];
    const blocks = text.split('BEGIN:VEVENT').slice(1);
    for (const block of blocks) {
      const get = (key: string) => {
        const m = block.match(new RegExp(`^${key}[^:\\r\\n]*:(.+)$`, 'm'));
        return m ? m[1].trim() : '';
      };
      const dtstart = get('DTSTART');
      if (!dtstart || dtstart.length < 8) continue;
      const year = dtstart.slice(0, 4), month = dtstart.slice(4, 6), day = dtstart.slice(6, 8);
      const hasTime = dtstart.includes('T');
      const hour = hasTime ? dtstart.slice(9, 11) : '00';
      const min = hasTime ? dtstart.slice(11, 13) : '00';
      const date = `${year}-${month}-${day}`;
      const time = `${hour}:${min}`;
      const summary = get('SUMMARY');
      const location = get('LOCATION');
      const dashIdx = summary.indexOf(' - ');
      const homeTeam = dashIdx !== -1 ? summary.slice(0, dashIdx).trim() : summary;
      const awayTeam = dashIdx !== -1 ? summary.slice(dashIdx + 3).trim() : '';
      results.push({ summary, date, time, location, homeTeam, awayTeam });
    }
    return results;
  };

  const handleSyncExternalFeed = async () => {
    if (!externalFeedUrl.trim() || !user) return;
    setSyncingFeed(true);
    try {
      const httpUrl = externalFeedUrl.trim().replace(/^webcal:\/\//, 'https://');
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(httpUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseIcal(text);
      const today = new Date().toISOString().split('T')[0];
      const future = parsed.filter(e => e.date >= today);
      if (future.length === 0) { alert('Geen toekomstige wedstrijden gevonden in de kalender.'); return; }
      const batch = writeBatch(db);
      for (const evt of future) {
        const ref = doc(collection(db, 'events'));
        batch.set(ref, { teamId: team.id, title: evt.summary.toUpperCase(), date: evt.date, time: evt.time, type: 'game', location: evt.location || '', homeTeam: evt.homeTeam.toUpperCase(), awayTeam: evt.awayTeam.toUpperCase(), createdAt: Date.now() });
      }
      await batch.commit();
      setShowFeedSync(false);
      alert(`${future.length} wedstrijden geïmporteerd!`);
    } catch (err: any) {
      alert('Sync mislukt: ' + err.message);
    } finally {
      setSyncingFeed(false);
    }
  };

  const availableTabs = isParent
    ? [{ id: 'schedule', label: 'Schedule', icon: '📅' }, { id: 'roster', label: 'Roster', icon: '👥' }]
    : [{ id: 'schedule', label: 'Schedule', icon: '📅' }, { id: 'locker-room', label: 'Locker Room', icon: '💬' }, { id: 'highlights', label: 'Highlights', icon: '🎬' }, { id: 'playbook', label: 'Playbook', icon: '📚' }, { id: 'roster', label: 'Roster', icon: '👥' }, { id: 'analysis', label: 'Vision', icon: '👁️' }];

  const isAnyChatOpen = showPrivateChat || activeTab === 'locker-room';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24 relative">
      {/* Conditionally hide standard header/tabs when focused on a chat */}
      {!isAnyChatOpen && (
        <>
          <div className="flex items-center justify-between bg-ha-bg py-2 sticky top-0 z-30 px-1">
            <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="text-center">
              <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter leading-none">{team.name}</h2>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">SQUAD HUB • {team.joinCode}</p>
            </div>
            <div className="w-12"></div>
          </div>

          <div className="flex bg-[#0b1224] p-1.5 rounded-[1.5rem] border border-slate-800 shadow-2xl overflow-x-auto no-scrollbar gap-1 mx-1">
            {availableTabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex-1 min-w-[70px] py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex flex-col items-center gap-1 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-white'}`}
              >
                <span className="text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 px-1">
           <div className="flex items-center justify-between bg-[#0b1224] border border-slate-800 p-2 rounded-2xl shadow-xl">
              <button onClick={() => changeMonth(-1)} className="p-3 text-slate-500 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg></button>
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white italic">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => changeMonth(1)} className="p-3 text-slate-500 hover:text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="9 18 15 12 9 6"/></svg></button>
           </div>
           <div className="bg-[#0b1224] border border-slate-800 rounded-[2rem] overflow-hidden shadow-3xl">
              <div className="grid grid-cols-7 border-b border-slate-800">{['M','T','W','T','F','S','S'].map((d, i) => (<div key={i} className="py-3 text-center text-[8px] font-black text-slate-700 uppercase tracking-widest">{d}</div>))}</div>
              <div className="grid grid-cols-7 p-2 gap-1">
                 {calendarDays.map((day, idx) => {
                    const dateStr = day.date.toISOString().split('T')[0];
                    const isSelected = selectedDay === dateStr;
                    const dayEvents = events.filter(e => e.date === dateStr);
                    const hasPractice = dayEvents.some(e => e.type === 'practice'), hasGame = dayEvents.some(e => e.type === 'game'), hasOther = dayEvents.some(e => e.type === 'other');
                    return (<button key={idx} onClick={() => setSelectedDay(dateStr)} className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-90 ${!day.current ? 'opacity-20' : ''} ${isSelected ? 'bg-indigo-600/20 border border-indigo-500' : 'hover:bg-slate-900 border border-transparent'}`}><span className={`text-[10px] font-black ${day.current ? 'text-white' : 'text-slate-600'}`}>{day.date.getDate()}</span><div className="absolute bottom-1.5 flex gap-0.5">{hasPractice && <div className="w-2.5 h-0.5 bg-ha-brand rounded-full"></div>}{hasGame && <div className="w-2.5 h-0.5 bg-indigo-500 rounded-full"></div>}{hasOther && <div className="w-2.5 h-0.5 bg-amber-500 rounded-full"></div>}</div></button>);
                 })}
              </div>
           </div>
           <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic">Agenda: {selectedDay}</h4>
                {isCoach && (
                  <div className="flex gap-3">
                    <button onClick={() => setShowMatchImport(true)} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest border-b border-indigo-500/30 hover:text-indigo-300">Import Matches</button>
                    <button onClick={() => setShowFeedSync(true)} className="text-[9px] font-black text-amber-400 uppercase tracking-widest border-b border-amber-500/30 hover:text-amber-300">Sync Kalender</button>
                    <button onClick={() => setShowEventForm(true)} className="text-[9px] font-black text-ha-brand uppercase tracking-widest border-b border-ha-brand/30 hover:text-ha-brand">+ New Mission</button>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                 {selectedDayEvents.length > 0 ? selectedDayEvents.map(event => {
                   const { present, total } = getAttendanceSummary(event.id);
                   const isGame = event.type === 'game';
                   const attendanceClasses = isGame
                     ? {
                       button: 'bg-indigo-600/10 border-indigo-500/20',
                       dot: 'bg-indigo-500',
                       text: 'text-indigo-400',
                     }
                     : {
                       button: 'bg-cyan-600/10 border-ha-brand/20',
                       dot: 'bg-ha-brand',
                       text: 'text-ha-brand',
                     };
                   return (
                     <div key={event.id} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] shadow-xl space-y-4 group hover:border-indigo-500/30 transition-all">
                        <div className="flex justify-between items-start"><div className="space-y-1"><div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border ${isGame ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-ha-brand/10 border-ha-brand/30 text-ha-brand'}`}>{event.type}</span><span className="text-[10px] font-black text-white italic">{event.time}</span></div><h4 className="text-xl font-black italic uppercase text-white tracking-tight">{event.title}</h4>{isGame && event.homeTeam && event.awayTeam && (<div className="flex items-center gap-2 mt-1"><span className="text-[10px] font-black text-white uppercase tracking-tight">{event.homeTeam}</span><span className="text-[8px] font-black text-slate-600 uppercase">vs</span><span className="text-[10px] font-black text-white uppercase tracking-tight">{event.awayTeam}</span></div>)}<p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{event.location || 'Tactical Grounds Unspecified'}</p></div><div className="flex flex-col items-end gap-2"><button onClick={() => exportToIcs(event)} className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-500 hover:text-indigo-400 transition-all"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div></div>
                        <div className="pt-4 border-t border-slate-900 flex items-center justify-between"><div className="flex items-center gap-3">{isCoach ? (<button onClick={() => setShowManifestId(event.id)} className={`flex items-center gap-2 ${attendanceClasses.button} border px-3 py-1.5 rounded-lg active:scale-95 transition-all`}><div className={`w-1.5 h-1.5 rounded-full ${attendanceClasses.dot} animate-pulse`}></div><p className={`text-[10px] font-black ${attendanceClasses.text} uppercase tracking-widest`}>{present} / {total} Personnel Ready</p></button>) : (<p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Attendance: {present}/{total}</p>)}</div>{!isCoach && !isParent && (<div className="flex gap-2"><button onClick={() => handleToggleAttendance(event.id, 'present')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${attendance[event.id] === 'present' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-600 border border-slate-800'}`}>Present</button><button onClick={() => handleToggleAttendance(event.id, 'absent')} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${attendance[event.id] === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-600 border border-slate-800'}`}>Absent</button></div>)}{isCoach && (<button onClick={async () => { if(window.confirm("Purge event?")) await deleteDoc(doc(db, "events", event.id)); }} className="text-[8px] font-black text-red-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Cancel Mission</button>)}</div>
                     </div>
                   );
                 }) : (<div className="py-12 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[2rem]"><p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No missions scheduled for this vector.</p></div>)}
              </div>
           </div>
        </div>
      )}

      {showManifestId && (
        <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
           <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-lg shadow-3xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-ha-brand/5 blur-3xl rounded-full"></div>
              <div className="flex justify-between items-start relative z-10"><div className="space-y-1"><h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">Mission <span className="text-ha-brand">Manifest</span></h3><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">Personnel Ready-Status Verification</p></div><button onClick={() => setShowManifestId(null)} className="p-4 bg-ha-bg border border-slate-800 rounded-2xl text-white hover:text-red-500 transition-colors shadow-xl active:scale-90"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
              <div className="bg-ha-bg/50 border border-slate-900 rounded-[2.5rem] p-4 max-h-[50vh] overflow-y-auto custom-scrollbar relative z-10 space-y-2 shadow-inner">
                 {getManifestForEvent(showManifestId).map((person, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-[#0b1224] border border-slate-800 rounded-2xl hover:border-ha-brand/20 transition-all"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-sm border ${person.status === 'present' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : person.status === 'absent' ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>{person.name.charAt(0)}</div><div><p className="text-xs font-black italic uppercase text-white">{person.name}</p><p className="text-[7px] font-bold text-slate-700 uppercase tracking-widest">{person.role === 'coach' ? 'Lead Personnel' : 'Unit'}</p></div></div><div className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${person.status === 'present' ? 'bg-emerald-600 text-white shadow-lg border-emerald-400' : person.status === 'absent' ? 'bg-red-600 text-white shadow-lg border-red-400' : 'bg-slate-900 text-slate-600 border-slate-800'}`}>{person.status === 'present' ? 'READY' : person.status === 'absent' ? 'NEGATIVE' : 'NO SIGNAL'}</div></div>
                 ))}
                 {(getManifestForEvent(showManifestId).length === 0) && (<p className="py-10 text-center text-[10px] text-slate-700 font-black uppercase italic">No personnel detected in sector.</p>)}
              </div>
              <button onClick={() => setShowManifestId(null)} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-3xl active:scale-95 transition-all relative z-10">Close Log</button>
           </div>
        </div>
      )}

      {activeTab === 'locker-room' && !isParent && (
        <div className="flex flex-col h-[75vh] bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-3xl animate-in slide-in-from-right-4 mx-1">
           {/* Dedicated header for Locker Room Chat */}
           <div className="p-5 border-b border-slate-800 bg-ha-bg/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('schedule')} className="p-2 text-slate-500 hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
                 </button>
                 <div className="space-y-0.5">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white italic">Locker Room</h3>
                    <div className="flex items-center gap-1.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                       <p className="text-[8px] text-slate-600 font-black uppercase">SECURED FREQUENCY</p>
                    </div>
                 </div>
              </div>
              <button onClick={handleOpenMatchPicker} className="px-4 py-2 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-600 hover:text-white transition-all">Share Match Clip</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.map((msg, idx) => {
                 const isMe = msg.senderId === user?.uid;
                 return (
                   <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                      <div className="flex items-center gap-2 mb-1 px-2">
                         <span className="text-[8px] font-black text-slate-500 uppercase italic">{msg.senderName}</span>
                         <span className="text-[7px] text-slate-700 uppercase">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`max-w-[85%] px-5 py-3 rounded-2xl shadow-lg ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'}`}>
                         {renderContent(msg.content)}
                      </div>
                   </div>
                 );
              })}
              <div ref={messagesEndRef} />
           </div>
           <form onSubmit={handleSendMessage} className="p-4 bg-ha-bg/80 backdrop-blur-md border-t border-slate-800 flex gap-2">
              <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="TRANSMIT MESSAGE..." className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 text-xs text-white font-medium outline-none focus:border-indigo-500 shadow-inner" />
              <button type="submit" className="w-14 h-14 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-xl active:scale-90 transition-all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
           </form>
        </div>
      )}

      {activeTab === 'highlights' && !isParent && (
        <div className="space-y-6 animate-in slide-in-from-right-4 px-1">
           <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic px-2">Shared Tactical Records</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sharedClips.length > 0 ? sharedClips.map((msg) => {
                 const parts = msg.content.replace('[TACTICAL_CLIP]:', '').split('|');
                 const [matchId, time, label, matchTitle] = parts;
                 return (<div key={msg.id} className="bg-[#0b1224] border border-indigo-500/20 p-6 rounded-[2.5rem] shadow-xl space-y-4 hover:border-indigo-500/40 transition-all group"><div className="flex justify-between items-start"><div className="space-y-1"><p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">CLIP RECOVERY</p><h4 className="text-xl font-black italic uppercase text-white tracking-tight">{label}</h4></div><div className="bg-ha-bg px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-indigo-400 font-mono">{Math.floor(parseInt(time) / 60)}:{(parseInt(time) % 60).toString().padStart(2, '0')}</div></div><p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic line-clamp-1">{matchTitle}</p><div className="pt-4 border-t border-slate-900 flex items-center justify-between"><span className="text-[7px] text-slate-700 uppercase">Shared by {msg.senderName}</span><button onClick={() => { const url = new URL(window.location.origin + window.location.pathname); url.searchParams.set('matchCode', matchId); url.searchParams.set('t', time); window.history.replaceState({}, '', url.toString()); onNavigate('match-archive'); }} className="text-[9px] font-black text-ha-brand uppercase tracking-widest hover:text-white transition-colors">Watch Intel →</button></div></div>);
              }) : (<div className="col-span-full py-24 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]"><p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">No shared clips in archive.</p></div>)}
           </div>
        </div>
      )}

      {activeTab === 'playbook' && !isParent && (
        <div className="space-y-8 animate-in slide-in-from-right-4 px-1">
           <div className="flex items-center justify-between px-2"><h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic">Tactical Assignments</h3>{isCoach && (<button onClick={() => setShowAssignForm(true)} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest border-b border-indigo-500/30">+ New Assignment</button>)}</div>
           <div className="grid grid-cols-1 gap-4">
              {assignments.map(assign => {
                 const drill = drills.find(d => d.id === assign.drillId);
                 if (!drill) return null;
                 const targetPlayer = team.members?.find(m => m.uid === assign.playerId);
                 return (<div key={assign.id} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] flex items-center justify-between shadow-xl group hover:border-ha-brand/40 transition-all"><div className="flex items-center gap-6"><div className="w-12 h-12 bg-ha-bg border border-slate-900 rounded-2xl flex items-center justify-center text-ha-brand shadow-inner group-hover:scale-105 transition-transform"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6"/><path d="M8 11h8"/></svg></div><div className="space-y-0.5"><h4 className="text-xl font-black italic uppercase text-white group-hover:text-ha-brand transition-colors">{drill.title}</h4><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Due: {assign.dueDate} • {assign.playerId ? `Unit: ${targetPlayer?.name}` : 'Squad Task'}</p></div></div><div className="flex items-center gap-3"><button onClick={() => onViewDrill?.(drill.id)} className="px-6 py-3 bg-slate-900 border border-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">View Intel</button>{isCoach && <button onClick={() => handleRemoveAssignment(assign.id)} className="p-3 text-red-500/30 hover:text-red-500 transition-colors"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>}</div></div>);
              })}
              {assignments.length === 0 && (<div className="py-24 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-[3rem]"><p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">Inventory clear. No active assignments.</p></div>)}
           </div>
        </div>
      )}

      {activeTab === 'roster' && (
        <div className="space-y-6 animate-in slide-in-from-right-4 px-1">
          {/* Join code — prominent voor coaches */}
          {isCoach && team.joinCode && (
            <div className="bg-ha-brand/5 border border-ha-brand/30 rounded-[2rem] p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-ha-brand/60">Team Join Code</p>
                <p className="text-3xl font-black italic tracking-widest text-ha-brand">{team.joinCode}</p>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Spelers gebruiken dit bij registratie</p>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(team.joinCode || ''); }}
                className="p-4 bg-ha-brand/10 border border-ha-brand/20 text-ha-brand rounded-2xl hover:bg-ha-brand/20 transition-all active:scale-90"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          )}

          {isCoach && (
            <button
              onClick={() => generatingInvite ? undefined : handleGenerateParentInvite()}
              disabled={generatingInvite}
              className="w-full bg-emerald-500/5 border border-emerald-500/30 rounded-[2rem] p-6 flex items-center justify-between hover:bg-emerald-500/10 transition-all active:scale-[0.99] disabled:opacity-60"
            >
              <div className="space-y-1 text-left">
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/60">Ouder Portaal</p>
                <p className="text-base font-black italic text-emerald-400">Genereer Uitnodigingslink</p>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Ouders kiezen zelf hun kind</p>
              </div>
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
                {generatingInvite
                  ? <div className="w-[18px] h-[18px] border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                }
              </div>
            </button>
          )}

          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] italic">Squad Personnel ({(team.members || []).length})</h3>
            {!isCoach && !isParent && team.joinCode && (
              <div className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Code: {team.joinCode}</span>
              </div>
            )}
            {isCoach && (
              <button onClick={() => setShowAddPlayer(true)} className="flex items-center gap-2 px-4 py-2 bg-ha-brand/10 border border-ha-brand/30 text-ha-brand rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-ha-brand/20 transition-all active:scale-95">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Player
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(team.members || []).map(member => {
              const isMemberMe = member.uid === user?.uid;
              const canMessage = isParent ? member.role === 'coach' : true;
              const isPlaceholder = member.uid.startsWith('manual_');
              return (
                <div key={member.uid} className={`bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between shadow-xl group hover:border-indigo-500/40 transition-all ${isMemberMe ? 'border-indigo-500/20 bg-indigo-500/5' : ''}`}>
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-xl shadow-inner border-2 ${member.role === 'coach' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : member.role === 'parent' ? 'bg-emerald-600/10 border-emerald-500 text-emerald-400' : 'bg-ha-brand/10 border-ha-brand text-ha-brand'}`}>
                      {member.name.charAt(0)}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-black text-white italic uppercase tracking-tight">{member.name} {isMemberMe && '(You)'}</p>
                      <p className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.2em]">
                        {member.role === 'coach' ? 'Fleet Commander' : member.role === 'parent' ? 'Support Unit' : 'Operational Unit'}
                        {isPlaceholder && <span className="ml-2 text-amber-500/60">· no account yet</span>}
                      </p>
                      {member.email && <p className="text-[7px] text-slate-700 font-medium">{member.email}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isMemberMe && canMessage && !isPlaceholder && (
                      <button onClick={() => { setSelectedPlayer(member); setShowPrivateChat(true); }} className="p-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl hover:text-indigo-400 transition-all active:scale-90">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </button>
                    )}
                    {isCoach && !isMemberMe && member.role === 'player' && !isPlaceholder && (
                      <button onClick={() => { setSelectedPlayer(member); setShowPersonalDrillSelect(true); }} className="p-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl hover:text-ha-brand transition-all active:scale-90">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg>
                      </button>
                    )}
                    {isCoach && !isMemberMe && member.role !== 'coach' && (
                      <button onClick={() => handleRemovePlayer(member)} className="p-4 bg-slate-900 border border-slate-800 text-slate-500 rounded-2xl hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-90">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add player modal */}
          {showAddPlayer && (
            <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
              <form onSubmit={handleAddPlayer} className="bg-[#0b1224] border border-ha-brand/30 p-10 rounded-[3rem] w-full max-w-md shadow-3xl space-y-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Add <span className="text-ha-brand">Player</span></h3>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Speler hoeft nog geen account te hebben</p>
                  </div>
                  <button type="button" onClick={() => setShowAddPlayer(false)} className="p-3 bg-ha-bg border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Name *</label>
                    <input required autoFocus type="text" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} placeholder="e.g. Kevin Durant" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-black uppercase tracking-tight outline-none focus:border-ha-brand transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Email <span className="text-slate-700">(optioneel)</span></label>
                    <input type="email" value={newPlayerEmail} onChange={e => setNewPlayerEmail(e.target.value)} placeholder="speler@email.com" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white outline-none focus:border-ha-brand transition-all" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAddPlayer(false)} className="flex-1 py-4 bg-slate-900 text-slate-500 font-black uppercase text-[10px] rounded-xl">Cancel</button>
                  <button type="submit" disabled={addingPlayer || !newPlayerName.trim()} className="flex-[2] py-4 bg-ha-brand text-slate-950 font-black uppercase text-[10px] rounded-xl disabled:opacity-50">
                    {addingPlayer ? 'Adding...' : 'Add to Roster'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {showPrivateChat && selectedPlayer && (
        <div className="fixed inset-0 z-[110] bg-ha-bg flex flex-col animate-in slide-in-from-right duration-400">
           <div className="p-8 pt-20 bg-slate-900/40 backdrop-blur-xl border-b border-white/5">
              <div className="flex justify-between items-center px-2">
                 <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-600/10 border-2 border-indigo-500/30 rounded-2xl flex items-center justify-center font-black italic text-2xl text-indigo-400">{selectedPlayer.name.charAt(0)}</div>
                    <div><h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">{selectedPlayer.name}</h3><p className="text-[8px] font-black text-indigo-500/60 uppercase tracking-[0.3em] mt-2">Personal Tactical Frequency</p></div>
                 </div>
                 <button onClick={() => { setShowPrivateChat(false); setSelectedPlayer(null); }} className="p-4 bg-white/10 rounded-2xl text-white active:scale-90 shadow-xl"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
           </div>
           <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {privateMessages.length > 0 ? privateMessages.map((msg, idx) => {
                 const isMe = msg.senderId === user?.uid;
                 return (<div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}><div className="flex items-center gap-2 mb-1 px-2"><span className="text-[8px] font-black text-slate-600 uppercase italic">{isMe ? 'You' : selectedPlayer.name}</span><span className="text-[7px] text-slate-800 uppercase">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>                      <div className={`max-w-[85%] px-6 py-4 rounded-3xl shadow-2xl ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-[#0b1224] border border-slate-800 text-slate-200 rounded-tl-none'}`}>
                        {renderContent(msg.content)}
                      </div>
</div>);
              }) : (<div className="h-full flex items-center justify-center opacity-20"><p className="text-[10px] font-black uppercase tracking-[0.5em]">No signal history detected.</p></div>)}
              <div ref={privateEndRef} />
           </div>
           <form onSubmit={handleSendPrivateMessage} className="p-6 pb-12 bg-slate-900/80 backdrop-blur-md border-t border-white/5 flex gap-3"><input autoFocus type="text" value={newPrivateMsg} onChange={e => setNewPrivateMsg(e.target.value)} placeholder="DIRECT TRANSMISSION..." className="flex-1 bg-ha-bg border border-slate-800 rounded-2xl px-6 py-5 text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner" /><button type="submit" className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-3xl active:scale-90 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></form>
        </div>
      )}

      {showPersonalDrillSelect && selectedPlayer && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-2xl flex flex-col p-8 animate-in zoom-in duration-300"><div className="max-w-2xl mx-auto w-full space-y-10 pt-10"><div className="flex justify-between items-start"><div className="space-y-1"><h3 className="text-4xl font-black italic uppercase text-white tracking-tighter">Unit <span className="text-ha-brand">Transmission</span></h3><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assigning to {selectedPlayer.name}</p></div><button onClick={() => { setShowPersonalDrillSelect(false); setSelectedPlayer(null); }} className="p-4 bg-slate-900 rounded-2xl text-white active:scale-90 shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-6 max-h-[60vh] overflow-y-auto custom-scrollbar shadow-3xl space-y-3">{drills.map(drill => (<div key={drill.id} onClick={() => handleQuickAssignPersonal(drill)} className="bg-ha-bg border border-slate-900 p-6 rounded-[2.5rem] flex items-center justify-between group cursor-pointer hover:border-ha-brand/40 transition-all shadow-xl active:scale-[0.98]"><div className="flex items-center gap-6"><div className="w-12 h-12 bg-ha-brand/10 border-2 border-ha-brand/30 rounded-2xl flex items-center justify-center text-ha-brand shadow-inner group-hover:scale-110 transition-transform"><span className="text-xl font-black italic">{drill.title.charAt(0)}</span></div><div className="space-y-0.5"><h4 className="text-sm font-black italic uppercase text-white group-hover:text-ha-brand transition-colors leading-none">{drill.title}</h4><p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">{drill.focus} • {drill.duration} MIN</p></div></div><div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-ha-brand group-hover:translate-x-1 transition-transform shadow-inner"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg></div></div>))}{drills.length === 0 && <p className="py-20 text-center text-[10px] text-slate-700 font-black uppercase tracking-widest italic">No tactical units available for transmission.</p>}</div><p className="text-center text-[8px] font-black text-slate-800 uppercase tracking-[0.5em]">SportAtlas Personal Uplink Protocol</p></div></div>
      )}

      {isPickingMatch && (
        <div className="fixed inset-0 z-[130] bg-ha-bg/95 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in"><div className="bg-[#0b1224] border border-indigo-500/20 rounded-[3.5rem] p-10 w-full max-w-2xl shadow-3xl space-y-8 relative overflow-hidden"><div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-3xl rounded-full"></div><div className="flex justify-between items-start relative z-10"><div className="space-y-1"><h3 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">Share <span className="text-indigo-400">Moment</span></h3><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">{selectedMatchForClip ? 'Select tactical clip to distribute' : 'Select operational record'}</p></div><button onClick={() => { setIsPickingMatch(false); setSelectedMatchForClip(null); }} className="p-4 bg-ha-bg border border-slate-800 rounded-2xl text-white hover:text-red-500 transition-colors"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>{!selectedMatchForClip ? (<div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar p-2 relative z-10">{availableMatches.map(match => (<div key={match.id} onClick={() => setSelectedMatchForClip(match)} className="bg-ha-bg border border-slate-800 p-6 rounded-[2.5rem] cursor-pointer hover:border-indigo-500/40 transition-all shadow-xl active:scale-95"><div className="flex justify-between items-start mb-3"><h4 className="text-sm font-black italic uppercase text-white tracking-tight leading-none">{match.title}</h4>{match.visibility === 'private' && (<span className="text-[5px] font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.5 rounded uppercase">Private</span>)}</div><div className="flex items-center justify-between"><span className="text-[7px] font-black text-slate-600 uppercase tracking-widest italic">{match.ownerName}</span><span className="text-[7px] font-black bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded uppercase">{(match.highlights?.length || 0)} CLIPS</span></div></div>))}</div>) : (<div className="space-y-6 relative z-10 animate-in slide-in-from-right-4"><button onClick={() => setSelectedMatchForClip(null)} className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mb-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="15 18 9 12 15 6"/></svg> Back to Matches</button><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto custom-scrollbar p-2">{selectedMatchForClip.highlights?.map((h, hIdx) => (<button key={hIdx} onClick={() => shareMatchClip(selectedMatchForClip.id, h.time, h.label, selectedMatchForClip.title)} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-emerald-500/40 transition-all text-left"><div className="space-y-1"><p className="text-xs font-black italic text-white uppercase group-hover:text-emerald-400 transition-colors">{h.label}</p><p className="text-[8px] font-black text-indigo-400 font-mono">{Math.floor(h.time / 60)}:{(h.time % 60).toString().padStart(2, '0')}</p></div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700 group-hover:text-emerald-500 transition-all"><polyline points="9 18 15 12 9 6"/></svg></button>))}{(!selectedMatchForClip.highlights || selectedMatchForClip.highlights.length === 0) && (<div className="col-span-full py-12 text-center opacity-30"><p className="text-[10px] font-black uppercase tracking-[0.4em]">No highlights detected in this record.</p></div>)}</div></div>)}<div className="flex justify-center opacity-20 relative z-10"><p className="text-[8px] font-black text-white uppercase tracking-[0.5em]">Secure Distribution Bridge</p></div></div></div>
      )}

      {showMatchImport && (
        <ExternalMatchImport 
          team={team} 
          onClose={() => setShowMatchImport(false)} 
          onImportComplete={() => {
            // Refresh events is handled by onSnapshot automatically
            setShowMatchImport(false);
          }} 
        />
      )}

      {showEventForm && (
        <div className="fixed inset-0 z-[140] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in duration-300"><form onSubmit={handleCreateEvent} className="bg-[#0b1224] border border-ha-brand/30 p-10 rounded-[3rem] w-full max-w-lg shadow-3xl space-y-8 relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-ha-brand/5 blur-3xl rounded-full"></div><div className="flex justify-between items-start relative z-10"><div className="space-y-1"><h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">Command <span className="text-ha-brand">Scheduler</span></h3><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">Mission Parameters Initialization</p></div><button type="button" onClick={() => setShowEventForm(false)} className="p-4 bg-ha-bg border border-slate-800 rounded-2xl text-white hover:text-red-500 transition-colors shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div className="space-y-4 relative z-10"><input required type="text" placeholder="MISSION TITLE (E.G. TEAM PRACTICE)" value={newTitle} onChange={e => setNewTitle(e.target.value.toUpperCase())} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-ha-brand shadow-inner" /><div className="grid grid-cols-2 gap-4"><input required type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase outline-none focus:border-ha-brand shadow-inner" /><input required type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase outline-none focus:border-ha-brand shadow-inner" /></div><input type="text" placeholder="LOCATION (TACTICAL GROUNDS)" value={newLocation} onChange={e => setNewLocation(e.target.value.toUpperCase())} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-ha-brand shadow-inner" /><div className="grid grid-cols-3 gap-2">{['practice', 'game', 'other'].map(t => (<button key={t} type="button" onClick={() => setNewType(t as any)} className={`py-4 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${newType === t ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-ha-bg border-slate-900 text-slate-600'}`}>{t}</button>))}</div>{newType === 'game' && (<div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2"><input type="text" placeholder="THUISPLOEG" value={newHomeTeam} onChange={e => setNewHomeTeam(e.target.value.toUpperCase())} className="w-full bg-ha-bg border border-indigo-500/30 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner" /><input type="text" placeholder="UITPLOEG" value={newAwayTeam} onChange={e => setNewAwayTeam(e.target.value.toUpperCase())} className="w-full bg-ha-bg border border-indigo-500/30 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner" /></div>)}<div className="pt-4 border-t border-slate-900 space-y-4"><button type="button" onClick={() => setRepeatWeekly(!repeatWeekly)} className="flex items-center gap-3 group"><div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${repeatWeekly ? 'bg-ha-brand border-ha-brand text-slate-950' : 'border-slate-800 text-slate-800 group-hover:border-slate-600'}`}>{repeatWeekly && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}</div><span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300">Repeat Mission Weekly</span></button>{repeatWeekly && (<div className="space-y-2 animate-in slide-in-from-top-2"><label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-2">Iteration Count (Weeks)</label><input type="number" min="2" max="52" value={repeatCount} onChange={e => setRepeatCount(parseInt(e.target.value) || 1)} className="w-full bg-ha-bg border border-slate-800 p-4 rounded-xl text-xs text-ha-brand font-black outline-none focus:border-ha-brand" /></div>)}</div></div><button type="submit" className="w-full py-6 bg-cyan-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.4em] shadow-3xl active:scale-95 transition-all relative z-10">Deploy Mission Sequence</button></form></div>
      )}

      {showFeedSync && (
        <div className="fixed inset-0 z-[160] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
          <div className="bg-[#0b1224] border border-amber-500/30 p-10 rounded-[3rem] w-full max-w-md shadow-3xl space-y-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Kalender <span className="text-amber-400">Sync</span></h3>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Importeer wedstrijden van externe kalender (VBL, enz.)</p>
              </div>
              <button onClick={() => setShowFeedSync(false)} className="p-3 bg-ha-bg border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Plak je webcal:// of https:// kalender URL</p>
              <input
                type="text"
                value={externalFeedUrl}
                onChange={e => setExternalFeedUrl(e.target.value)}
                placeholder="webcal://vblcal.wisseq.eu/vblcalsync/..."
                className="w-full bg-ha-bg border border-amber-500/30 p-5 rounded-2xl text-xs text-white font-mono outline-none focus:border-amber-500 shadow-inner"
              />
            </div>
            <button
              onClick={handleSyncExternalFeed}
              disabled={syncingFeed || !externalFeedUrl.trim()}
              className="w-full py-4 bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {syncingFeed
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Bezig...</>
                : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Importeer Wedstrijden</>
              }
            </button>
          </div>
        </div>
      )}

      {parentInviteLink && (
        <div className="fixed inset-0 z-[160] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
          <div className="bg-[#0b1224] border border-emerald-500/30 p-10 rounded-[3rem] w-full max-w-md shadow-3xl space-y-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Ouder <span className="text-emerald-400">Uitnodiging</span></h3>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Stuur deze link naar de ouder/voogd</p>
              </div>
              <button onClick={() => setParentInviteLink(null)} className="p-3 bg-ha-bg border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="bg-ha-bg border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
              <p className="flex-1 text-xs text-slate-400 font-mono break-all leading-relaxed">{parentInviteLink}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(parentInviteLink); }}
                className="flex-1 py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Kopieer Link
              </button>
              {navigator.share && (
                <button
                  onClick={() => navigator.share({ title: `${team.name} Ouder Portaal`, url: parentInviteLink })}
                  className="p-4 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl hover:text-white transition-all active:scale-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAssignForm && (
        <div className="fixed inset-0 z-[140] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in duration-300"><form onSubmit={handleAssignDrill} className="bg-[#0b1224] border border-indigo-500/30 p-10 rounded-[3rem] w-full max-w-lg shadow-3xl space-y-8 relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div><div className="flex justify-between items-start relative z-10"><div className="space-y-1"><h3 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">Tactical <span className="text-indigo-400">Assignment</span></h3><p className="text-[9px] text-slate-500 font-black uppercase tracking-widest italic">Unit Personnel Deployment</p></div><button type="button" onClick={() => setShowAssignForm(false)} className="p-4 bg-ha-bg border border-slate-800 rounded-2xl text-white hover:text-red-500 transition-colors shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div className="space-y-5 relative z-10"><div className="space-y-2"><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Target Tactical Unit</label><select required value={assignDrillId} onChange={e => setAssignDrillId(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner"><option value="">SELECT INTEL...</option>{drills.map(d => (<option key={d.id} value={d.id}>{d.title.toUpperCase()}</option>))}</select></div><div className="space-y-2"><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Assigned Personnel</label><select value={targetPlayerId || ""} onChange={e => setTargetPlayerId(e.target.value || null)} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-inner"><option value="">WHOLE SQUAD</option>{(team.members || []).filter(m => m.role === 'player').map(m => (<option key={m.uid} value={m.uid}>{m.name.toUpperCase()}</option>))}</select></div><div className="space-y-2"><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2 italic">Mission Deadline</label><input required type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)} className="w-full bg-ha-bg border border-slate-800 p-5 rounded-2xl text-xs text-white font-black uppercase outline-none focus:border-indigo-500 shadow-inner" /></div></div><button type="submit" className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.4em] shadow-3xl active:scale-95 transition-all relative z-10">Transmit Assignment</button></form></div>
      )}
    </div>
  );
};

export default TeamCalendar;
