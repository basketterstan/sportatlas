import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, where, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { CalendarEvent, AttendanceStatus, Team, TeamMember } from '../../types';

interface ParentPortalProps {
  token: string;
}

interface InviteData {
  teamId: string;
  teamName: string;
  coachId: string;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ token }) => {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<TeamMember | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const loadInvite = async () => {
      try {
        const inviteDoc = await getDoc(doc(db, 'parentInvites', token));
        if (!inviteDoc.exists()) {
          setError('Deze uitnodigingslink is ongeldig of verlopen.');
          setLoading(false);
          return;
        }
        const inv = inviteDoc.data() as InviteData;
        setInvite(inv);

        const teamDoc = await getDoc(doc(db, 'teams', inv.teamId));
        if (!teamDoc.exists()) {
          setError('Team niet gevonden.');
          setLoading(false);
          return;
        }
        setTeam({ ...teamDoc.data(), id: teamDoc.id } as Team);
      } catch (e) {
        console.error('[ParentPortal] load error', e);
        setError('Er is iets misgegaan. Probeer het later opnieuw.');
      } finally {
        setLoading(false);
      }
    };
    loadInvite();
  }, [token]);

  useEffect(() => {
    if (!selectedPlayer || !invite) return;
    const loadEventsAndAttendance = async () => {
      setLoadingEvents(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const eventsSnap = await getDocs(
          query(
            collection(db, 'events'),
            where('teamId', '==', invite.teamId),
            where('date', '>=', today),
            orderBy('date', 'asc')
          )
        );
        setEvents(eventsSnap.docs.map(d => ({ ...d.data(), id: d.id }) as CalendarEvent));

        const attSnap = await getDocs(
          query(
            collection(db, 'attendance'),
            where('teamId', '==', invite.teamId),
            where('userId', '==', selectedPlayer.uid)
          )
        );
        const attMap: Record<string, AttendanceStatus> = {};
        attSnap.docs.forEach(d => {
          const data = d.data();
          attMap[data.eventId] = data.status;
        });
        setAttendance(attMap);
      } finally {
        setLoadingEvents(false);
      }
    };
    loadEventsAndAttendance();
  }, [selectedPlayer, invite]);

  const handleAttendance = async (eventId: string, status: AttendanceStatus) => {
    if (!invite || !selectedPlayer) return;
    setSavingId(eventId);
    const attId = `${eventId}_${selectedPlayer.uid}`;
    const ref = doc(db, 'attendance', attId);
    try {
      if (attendance[eventId] === status) {
        await deleteDoc(ref);
        setAttendance(prev => { const next = { ...prev }; delete next[eventId]; return next; });
      } else {
        await setDoc(ref, {
          id: attId,
          eventId,
          teamId: invite.teamId,
          userId: selectedPlayer.uid,
          status,
          parentToken: token,
          updatedAt: Date.now(),
        });
        setAttendance(prev => ({ ...prev, [eventId]: status }));
      }
    } catch (e) {
      console.error('[ParentPortal] attendance write error', e);
    } finally {
      setSavingId(null);
    }
  };

  const eventTypeLabel = (type: string) => {
    if (type === 'practice') return 'Training';
    if (type === 'game') return 'Wedstrijd';
    return 'Evenement';
  };

  const eventTypeColor = (type: string) => {
    if (type === 'practice') return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    if (type === 'game') return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const addToCalendar = (event: CalendarEvent) => {
    const [h, m] = (event.time || '00:00').split(':').map(Number);
    const startDt = new Date(event.date + 'T00:00:00');
    startDt.setHours(h, m, 0, 0);
    const endDt = new Date(startDt.getTime() + 90 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HoopsAtlas//Parent Portal//NL',
      'BEGIN:VEVENT',
      `UID:${event.id}@hoopsatlas`,
      `DTSTART:${fmt(startDt)}`,
      `DTEND:${fmt(endDt)}`,
      `SUMMARY:${event.title} – ${invite?.teamName || ''}`,
      event.location ? `LOCATION:${event.location}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !invite || !team) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p className="text-white font-black text-lg uppercase tracking-tight">{error || 'Ongeldige link'}</p>
          <p className="text-slate-500 text-sm">Vraag de coach om een nieuwe uitnodigingslink te sturen.</p>
        </div>
      </div>
    );
  }

  const players = (team.members || []).filter(m => m.role === 'player');

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Header */}
      <div className="bg-[#0b1224] border-b border-slate-800 px-6 py-8">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center font-black text-sm text-white italic">H</div>
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">HoopsAtlas</span>
          </div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter leading-none text-white">
            {invite.teamName}
          </h1>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Ouder Portaal · Aanwezigheid</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Player picker */}
        {!selectedPlayer ? (
          <div className="space-y-4">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] px-2">Kies je kind</p>
            {players.length === 0 ? (
              <div className="text-center py-16 opacity-30">
                <p className="text-[11px] font-black uppercase tracking-[0.4em]">Geen spelers gevonden</p>
              </div>
            ) : (
              players.map(player => (
                <button
                  key={player.uid}
                  onClick={() => setSelectedPlayer(player)}
                  className="w-full bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between shadow-xl hover:border-orange-500/40 transition-all active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center font-black italic text-xl text-orange-400">
                      {player.name.charAt(0)}
                    </div>
                    <p className="text-base font-black italic uppercase tracking-tight text-white group-hover:text-orange-400 transition-colors">
                      {player.name}
                    </p>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-700 group-hover:text-orange-400 transition-colors"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Back to player select */}
            <button
              onClick={() => { setSelectedPlayer(null); setEvents([]); setAttendance({}); }}
              className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"/></svg>
              Ander kind kiezen
            </button>

            <div className="bg-orange-500/5 border border-orange-500/20 rounded-[2rem] p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center font-black italic text-xl text-orange-400">
                {selectedPlayer.name.charAt(0)}
              </div>
              <div>
                <p className="text-lg font-black italic uppercase tracking-tight text-white">{selectedPlayer.name}</p>
                <p className="text-[8px] font-black text-orange-400/60 uppercase tracking-widest">Aanwezigheid instellen</p>
              </div>
            </div>

            {/* Events */}
            {loadingEvents ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-16 opacity-30">
                <p className="text-[11px] font-black uppercase tracking-[0.4em]">Geen geplande evenementen</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] px-2">Komende evenementen</p>
                {events.map(event => {
                  const status = attendance[event.id];
                  const isSaving = savingId === event.id;
                  return (
                    <div key={event.id} className="bg-[#0b1224] border border-slate-800 rounded-[2rem] p-6 space-y-4 shadow-xl">
                      <div className="space-y-1.5">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${eventTypeColor(event.type)}`}>
                          {eventTypeLabel(event.type)}
                        </span>
                        <h3 className="text-base font-black italic uppercase tracking-tight text-white leading-tight pt-1">
                          {event.title}
                        </h3>
                        {event.type === 'game' && event.homeTeam && event.awayTeam && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-white uppercase">{event.homeTeam}</span>
                            <span className="text-[9px] font-black text-slate-600 uppercase">vs</span>
                            <span className="text-[11px] font-black text-white uppercase">{event.awayTeam}</span>
                          </div>
                        )}
                        <p className="text-[10px] font-bold text-slate-400 capitalize">
                          {formatDate(event.date)} · {event.time}
                        </p>
                        {event.location && (
                          <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">{event.location}</p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-900 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
                            {selectedPlayer.name} is:
                          </p>
                          <button
                            onClick={() => addToCalendar(event)}
                            className="flex items-center gap-1.5 text-[8px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-300 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Agenda
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAttendance(event.id, 'present')}
                            disabled={isSaving}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-50 ${
                              status === 'present'
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-emerald-500/40 hover:text-emerald-400'
                            }`}
                          >
                            {status === 'present' ? '✓ Aanwezig' : 'Aanwezig'}
                          </button>
                          <button
                            onClick={() => handleAttendance(event.id, 'absent')}
                            disabled={isSaving}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-50 ${
                              status === 'absent'
                                ? 'bg-red-600 border-red-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-red-500/40 hover:text-red-400'
                            }`}
                          >
                            {status === 'absent' ? '✕ Afwezig' : 'Afwezig'}
                          </button>
                          <button
                            onClick={() => handleAttendance(event.id, 'late')}
                            disabled={isSaving}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-50 ${
                              status === 'late'
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-amber-500/40 hover:text-amber-400'
                            }`}
                          >
                            {status === 'late' ? '~ Te laat' : 'Te laat'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="pt-4 text-center">
          <p className="text-[8px] font-black text-slate-800 uppercase tracking-[0.5em]">Powered by HoopsAtlas</p>
        </div>
      </div>
    </div>
  );
};

export default ParentPortal;
