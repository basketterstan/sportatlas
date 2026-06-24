
import React, { useState, useEffect } from 'react';
import { ViewState, UserProfile, CalendarEvent, Team, SubscriptionPlan, AttendanceStatus, AttendanceRecord } from '../../types';
import { collection, query, where, onSnapshot, doc, setDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../utils/firebase';
import { getTranslation } from '../../utils/i18n';
import Logo from '../layout/Logo';
import ContactForm from '../misc/ContactForm';
import AdBanner from '../shared/AdBanner';
import { useAppContext } from '../../contexts/AppContext';

interface LandingPageProps {
  onNavigate: (view: ViewState, drillId?: string, mode?: 'login' | 'signup' | 'create', streamId?: string) => void;
  isLoggedIn: boolean;
  userProfile?: UserProfile | null;
  myTeams?: Team[];
  onUpgradeRequest: (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;
  sharedMatchCode?: string | null;
  globalAnnouncement?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  isLoggedIn,
  userProfile,
  myTeams,
  onUpgradeRequest,
  globalAnnouncement = false
}) => {
  const t = getTranslation(userProfile);
  const { drills, trainingSessions } = useAppContext();
  const [cycle, setCycle] = useState<'month' | 'year'>('month');
  const isClubAccount = userProfile?.role === 'club';
  const [pricingType, setPricingType] = useState<'individual' | 'club'>(isClubAccount ? 'club' : 'individual');
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [eventAttendance, setEventAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [playerAttendance, setPlayerAttendance] = useState<AttendanceStatus | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now()));
  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester || (userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());
  const isClub = plan.includes('club') || userProfile?.isAdmin || userProfile?.isTester;
  const currentPlan = plan;
  const isPlayer = userProfile?.role === 'player';
  const isCoach = userProfile?.role === 'coach';
  const isParent = userProfile?.role === 'parent';
  const isProTier = isPro;
  const showPricing = (!isLoggedIn || !isProTier || isClubAccount) && !isParent && !isPlayer;

  const upcomingEvent = upcomingEvents[0] || null;

  useEffect(() => {
    if (isClubAccount) setPricingType('club');
  }, [isClubAccount]);

  // Fetch upcoming events for all roles
  useEffect(() => {
    if (!isLoggedIn || !userProfile?.uid) return;

    const qTeams = query(collection(db, 'teams'), where('memberUids', 'array-contains', userProfile.uid), limit(10));
    const unsubTeams = onSnapshot(qTeams, (snap) => {
      const teamIds: string[] = [];
      snap.forEach(d => teamIds.push(d.id));

      if (teamIds.length === 0) return;

      const qEvents = query(collection(db, 'events'), where('teamId', 'in', teamIds));
      const unsubEvents = onSnapshot(qEvents, (eSnap) => {
        const today = new Date().toISOString().split('T')[0];
        const allEvents = eSnap.docs.map(d => ({ ...d.data(), id: d.id } as CalendarEvent));
        const upcoming = allEvents
          .filter(e => e.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        setUpcomingEvents(upcoming);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'events'));
      return () => unsubEvents();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'teams'));
    return () => unsubTeams();
  }, [isLoggedIn, userProfile?.uid]);

  // Fetch attendance for tonight's event
  useEffect(() => {
    if (!upcomingEvent) return;

    const q = query(collection(db, 'attendance'), where('eventId', '==', upcomingEvent.id));
    const unsub = onSnapshot(q, (snap) => {
      const records: Record<string, AttendanceStatus> = {};
      snap.forEach(d => {
        const data = d.data() as AttendanceRecord;
        records[data.userId] = data.status;
      });
      setEventAttendance(records);
      if (userProfile?.uid) {
        setPlayerAttendance(records[userProfile.uid] || null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'attendance'));
    return () => unsub();
  }, [upcomingEvent?.id, userProfile?.uid]);

  // Live match count
  useEffect(() => {
    const unsubLive = onSnapshot(query(collection(db, 'liveMatches'), where('status', '==', 'live')), (snap) => {
      const unsubMatches = onSnapshot(query(collection(db, 'matches'), where('isLive', '==', true)), (mSnap) => {
        setLiveCount(snap.size + mSnap.size);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'matches'));
      return () => unsubMatches();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'liveMatches'));
    return () => unsubLive();
  }, []);

  const handleQuickAttendance = async (status: AttendanceStatus) => {
    if (!userProfile?.uid || !upcomingEvent) return;
    const attId = `${upcomingEvent.id}_${userProfile.uid}`;
    const docRef = doc(db, 'attendance', attId);
    try {
      await setDoc(docRef, {
        id: attId,
        eventId: upcomingEvent.id,
        teamId: upcomingEvent.teamId,
        userId: userProfile.uid,
        status,
        updatedAt: Date.now()
      });
    } catch (e) { console.error(e); }
  };

  const handleUpgradeClick = (plan: SubscriptionPlan) => {
    if (!isLoggedIn) {
      onNavigate('auth', undefined, 'signup');
    } else {
      onUpgradeRequest(plan, cycle);
    }
  };

  const PricingCard = ({ title, price, features, plan, accent, isCurrent }: { title: string; price: string; features: string[]; plan: SubscriptionPlan; accent: string; isCurrent?: boolean }) => (
    <div className={`bg-[#0b1224] border ${accent === 'indigo' ? 'border-indigo-500/40 shadow-indigo-500/10' : accent === 'orange' ? 'border-orange-500/40 shadow-orange-500/10' : 'border-slate-800'} p-8 rounded-[2.5rem] flex flex-col gap-6 shadow-2xl relative overflow-hidden group`}>
      {accent === 'indigo' && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[7px] font-black px-4 py-1.5 uppercase tracking-widest rounded-bl-xl shadow-lg">Most Popular</div>}
      {accent === 'orange' && <div className="absolute top-0 right-0 bg-orange-500 text-white text-[7px] font-black px-4 py-1.5 uppercase tracking-widest rounded-bl-xl shadow-lg">Add-on</div>}
      {isCurrent && <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[7px] font-black px-4 py-1.5 uppercase tracking-widest rounded-br-xl shadow-lg">Active Plan</div>}
      <div className="space-y-1">
        <h3 className="text-xl font-black italic uppercase text-white tracking-tight">{title}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black italic text-white">{price}</span>
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">/ {cycle}</span>
        </div>
      </div>
      <div className="space-y-3 flex-1">
        {features.map((f, i) => (
          <div key={i} className="flex gap-3 items-start">
            <svg className={`shrink-0 mt-0.5 ${accent === 'indigo' ? 'text-indigo-400' : accent === 'orange' ? 'text-orange-400' : 'text-ha-brand'}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-tight">{f}</p>
          </div>
        ))}
      </div>
      <button
        onClick={() => handleUpgradeClick(plan)}
        disabled={isCurrent}
        className={`w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-xl ${isCurrent ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : accent === 'indigo' ? 'bg-indigo-600 text-white hover:bg-indigo-500' : accent === 'orange' ? 'bg-orange-500 text-white hover:bg-orange-400' : 'bg-slate-900 border border-slate-800 text-white hover:border-ha-brand'}`}
      >
        {isCurrent ? 'Active Plan' : `Get ${title}`}
      </button>
    </div>
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const formatEventDate = (date: string, time: string) => {
    const d = new Date(`${date}T${time}`);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { day: days[d.getDay()], dateNum: d.getDate(), time };
  };

  const eventTeam = upcomingEvent ? (myTeams || []).find(t => t.id === upcomingEvent.teamId) : null;
  const teamPlayers = eventTeam?.members?.filter(m => m.role === 'player') || [];
  const confirmedCount = teamPlayers.filter(m => eventAttendance[m.uid] === 'present').length;
  const totalCount = teamPlayers.length;
  const attendancePct = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;

  const thisWeekEvents = upcomingEvents.slice(0, 5);
  const drillsThisMonth = drills.filter(d => d.createdAt > Date.now() - 30 * 24 * 60 * 60 * 1000).length;
  const recentSessions = trainingSessions.slice(0, 3);
  const recentDrillTags = Array.from(new Set(drills.flatMap(d => d.tags || []))).slice(0, 5);

  // ── Logged-in Dashboard ───────────────────────────────────────────────────────

  if (isLoggedIn) {
    return (
      <div className="min-h-screen text-white font-sans overflow-x-hidden selection:bg-ha-brand/30">
        <ContactForm isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />

        <div className="pt-14 lg:pt-0 pb-4 px-4 lg:px-6 max-w-[1400px] mx-auto space-y-4">

          {/* ── Row 1: Tonight's Session + Attendance ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 pt-4">

            {/* Tonight's Session */}
            <div
              className="rounded-ha-lg p-6 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #C96A2A 0%, #E8743C 40%, #D4834A 100%)' }}
            >
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
              <div className="absolute bottom-0 left-1/2 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', transform: 'translate(-20%, 40%)' }} />

              <div className="relative z-10 space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
                  {upcomingEvent
                    ? `${upcomingEvent.type === 'game' ? "Tonight's Game" : "Tonight's Session"} · ${upcomingEvent.time}`
                    : t.noSessionToday}
                </p>
                <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
                  {upcomingEvent ? upcomingEvent.title : t.restDay}
                </h2>
                {upcomingEvent && (
                  <p className="text-sm text-white/80">
                    {recentSessions[0]?.drillIds?.length ? `${recentSessions[0].drillIds.length} drills · ` : ''}
                    {confirmedCount > 0 || totalCount > 0
                      ? `${confirmedCount} of ${totalCount} attending`
                      : upcomingEvent.location || ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {upcomingEvent ? (
                    <>
                      <button
                        onClick={() => onNavigate('team-calendar')}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 rounded-ha-md font-semibold text-sm hover:bg-white/90 transition-all active:scale-95"
                      >
                        Start session →
                      </button>
                      <button
                        onClick={() => onNavigate('playbooks')}
                        className="px-4 py-2 bg-white/20 text-white rounded-ha-md font-medium text-sm hover:bg-white/30 transition-all border border-white/20"
                      >
                        Edit plan
                      </button>
                      <button
                        onClick={() => onNavigate('teams')}
                        className="px-4 py-2 bg-white/20 text-white rounded-ha-md font-medium text-sm hover:bg-white/30 transition-all border border-white/20"
                      >
                        Share with team
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onNavigate('team-calendar')}
                      className="px-4 py-2 bg-white/20 text-white rounded-ha-md font-medium text-sm hover:bg-white/30 transition-all border border-white/20"
                    >
                      {t.viewCalendar}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Tonight */}
            <div className="bg-ha-surface border border-ha-line rounded-ha-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">{t.attendanceTonight}</p>
                <span className="text-lg font-bold text-ha-textHi">{confirmedCount}/{totalCount || '—'}</span>
              </div>

              {totalCount > 0 ? (
                <>
                  <div className="text-3xl font-bold text-ha-textHi">{attendancePct}% confirmed</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {teamPlayers.slice(0, 6).map(member => {
                      const status = eventAttendance[member.uid];
                      return (
                        <div key={member.uid} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-ha-surface2 border border-ha-line flex items-center justify-center text-xs font-semibold text-ha-textMid flex-shrink-0">
                              {member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-sm text-ha-textHi">{member.name.split(' ')[0]} {member.name.split(' ').slice(-1)[0]?.charAt(0)}.</span>
                          </div>
                          {status === 'present' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ha-success/15 text-ha-success border border-ha-success/30">In</span>
                          ) : status === 'absent' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ha-danger/15 text-ha-danger border border-ha-danger/30">Out</span>
                          ) : status === 'late' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ha-warning/15 text-ha-warning border border-ha-warning/30">Maybe</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ha-surface2 text-ha-textLow border border-ha-line">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {(isPlayer || isParent) && upcomingEvent && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleQuickAttendance('present')}
                        className={`flex-1 py-2 rounded-ha-md text-xs font-semibold transition-all ${playerAttendance === 'present' ? 'bg-ha-success text-white' : 'bg-ha-surface2 text-ha-textMid hover:text-ha-textHi border border-ha-line'}`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleQuickAttendance('absent')}
                        className={`flex-1 py-2 rounded-ha-md text-xs font-semibold transition-all ${playerAttendance === 'absent' ? 'bg-ha-danger text-white' : 'bg-ha-surface2 text-ha-textMid hover:text-ha-textHi border border-ha-line'}`}
                      >
                        Absent
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ha-textLow">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <p className="text-sm text-ha-textLow text-center">{t.noTeamData}</p>
                  <button onClick={() => onNavigate('teams')} className="text-xs text-ha-brand hover:underline">{t.setUpTeam}</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 2: Playbook + Drill Maker (coaches only) ── */}
          {!isPlayer && !isParent && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Playbook */}
            <div className="bg-ha-surface border border-ha-line rounded-ha-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-ha-md bg-ha-surface2 border border-ha-line flex items-center justify-center text-ha-textMid">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                      <path d="M8 7h6" /><path d="M8 11h8" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-ha-textHi text-sm">{t.playbookLabel}</h3>
                    <p className="text-xs text-ha-textLow">Build sessions, plays &amp; game plans</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-ha-textLow">{trainingSessions.length} saved</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {recentSessions.length > 0 ? recentSessions.map(s => {
                  const drillCount = s.drillIds?.length || 0;
                  const totalMins = drills.filter(d => s.drillIds?.includes(d.id)).reduce((sum, d) => sum + (d.duration || 0), 0);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onNavigate('playbooks')}
                      className="bg-ha-surface2 border border-ha-line rounded-ha-md p-3 text-left hover:border-ha-brand/30 transition-all active:scale-95"
                    >
                      <p className="text-xs font-semibold text-ha-textHi leading-tight">{s.name}</p>
                      <p className="text-[10px] text-ha-textLow mt-1">
                        {drillCount} drills{totalMins > 0 ? ` · ${totalMins} min` : ''}
                      </p>
                    </button>
                  );
                }) : (
                  <div className="col-span-3 py-6 flex flex-col items-center gap-2">
                    <p className="text-sm text-ha-textLow">No sessions yet</p>
                    <button onClick={() => onNavigate('playbooks')} className="text-xs text-ha-brand hover:underline">Create your first session</button>
                  </div>
                )}
              </div>

              <button
                onClick={() => onNavigate('playbooks')}
                className="w-full py-2 text-xs font-medium text-ha-textMid hover:text-ha-textHi border border-ha-line hover:border-ha-brand/30 rounded-ha-md transition-all"
              >
                {t.viewAllPlaybooks}
              </button>
            </div>

            {/* Drill Maker */}
            <div className="bg-ha-surface border border-ha-line rounded-ha-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-ha-md bg-ha-surface2 border border-ha-line flex items-center justify-center text-ha-textMid">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ha-textHi text-sm">{t.drillMakerLabel}</h3>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">AI</span>
                    </div>
                    <p className="text-xs text-ha-textLow">{t.describeItWeDiagram}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-ha-textLow">{drills.length} drills</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {recentDrillTags.length > 0
                  ? recentDrillTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => onNavigate('discover')}
                        className="px-3 py-1 bg-ha-surface2 border border-ha-line rounded-full text-xs text-ha-textMid hover:text-ha-textHi hover:border-ha-brand/30 transition-all"
                      >
                        {tag}
                      </button>
                    ))
                  : ['Pick &amp; roll', 'Zone offense', 'Press break', '3-spot shooting', 'Transition D'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => onNavigate('discover')}
                        className="px-3 py-1 bg-ha-surface2 border border-ha-line rounded-full text-xs text-ha-textMid hover:text-ha-textHi hover:border-ha-brand/30 transition-all"
                        dangerouslySetInnerHTML={{ __html: tag }}
                      />
                    ))}
              </div>

              <button
                onClick={() => onNavigate('create')}
                className="flex items-center gap-2 px-4 py-2 bg-ha-brand text-white rounded-ha-md text-sm font-semibold hover:bg-ha-brandDim transition-all active:scale-95"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t.newDrill}
              </button>
            </div>
          </div>}

          {/* ── Row 3: This Week + Team Pulse ── */}
          <div className={`grid grid-cols-1 ${!isPlayer && !isParent ? 'md:grid-cols-2' : ''} gap-4`}>

            {/* This Week */}
            <div className="bg-ha-surface border border-ha-line rounded-ha-lg p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">{t.thisWeek}</p>
              {thisWeekEvents.length > 0 ? (
                <div className="space-y-1">
                  {thisWeekEvents.map(event => {
                    const { day, dateNum, time } = formatEventDate(event.date, event.time);
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 py-2.5 px-3 rounded-ha-md hover:bg-ha-surface2 transition-all cursor-pointer group"
                        onClick={() => onNavigate('team-calendar')}
                      >
                        <div className="w-11 h-11 rounded-ha-md bg-ha-surface2 border border-ha-line flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-ha-textLow uppercase">{day}</span>
                          <span className="text-sm font-bold text-ha-textHi leading-none">{dateNum}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ha-textHi truncate">{event.title}</p>
                          <p className="text-xs text-ha-textLow">{time}{event.location ? ` · ${event.location}` : ''}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                          event.type === 'game'
                            ? 'bg-ha-brand/15 text-ha-brand border border-ha-brand/30'
                            : 'bg-ha-surface2 text-ha-textLow border border-ha-line'
                        }`}>
                          {event.type === 'game' ? 'Game' : 'Training'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ha-textLow">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <p className="text-sm text-ha-textLow">{t.noEventsThisWeek}</p>
                  <button onClick={() => onNavigate('team-calendar')} className="text-xs text-ha-brand hover:underline">{t.addAnEvent}</button>
                </div>
              )}
            </div>

            {/* Team Pulse (coaches only) */}
            {!isPlayer && !isParent && <div className="bg-ha-surface border border-ha-line rounded-ha-lg p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">{t.teamPulse}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-ha-surface2 border border-ha-line rounded-ha-md p-4 space-y-1">
                  <p className="text-2xl font-bold text-ha-textHi">{myTeams?.length || 0}</p>
                  <p className="text-xs text-ha-textLow">{t.teamsLabel}</p>
                </div>
                <div className="bg-ha-surface2 border border-ha-line rounded-ha-md p-4 space-y-1">
                  <p className="text-2xl font-bold text-ha-textHi">
                    {myTeams?.reduce((sum, t) => sum + (t.memberUids?.length || t.members?.length || 0), 0) || 0}
                  </p>
                  <p className="text-xs text-ha-textLow">{t.playersLabel}</p>
                </div>
                <div className="bg-ha-surface2 border border-ha-line rounded-ha-md p-4 space-y-1">
                  <p className="text-2xl font-bold text-ha-textHi">{attendancePct > 0 ? `${attendancePct}%` : '—'}</p>
                  <p className="text-xs text-ha-textLow">{t.attendanceLabel}</p>
                </div>
                <div className="bg-ha-surface2 border border-ha-line rounded-ha-md p-4 space-y-1">
                  <p className="text-2xl font-bold text-ha-textHi">{drillsThisMonth}</p>
                  <p className="text-xs text-ha-textLow">{t.drillsThisMonth}</p>
                </div>
              </div>
            </div>}
          </div>

          {/* Pricing section (if applicable) */}
          <AdBanner isPaid={isPaid} adSlot="landing_page_mid" />

          {showPricing && (
            <section className="space-y-12 py-12">
              <div className="text-center space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Tier Selection</h2>
                <h3 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white">UPGRADE YOUR <span className="text-indigo-500">OPERATIONS.</span></h3>

                <div className="flex flex-col items-center gap-8 pt-6">
                  {!isClubAccount && (
                    <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
                      <button onClick={() => setPricingType('individual')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${pricingType === 'individual' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-600 hover:text-white'}`}>Individual</button>
                      <button onClick={() => setPricingType('club')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${pricingType === 'club' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-white'}`}>Club</button>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-6">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${cycle === 'month' ? 'text-white' : 'text-slate-600'}`}>Monthly</span>
                    <button onClick={() => setCycle(cycle === 'month' ? 'year' : 'month')} className="w-14 h-7 bg-slate-800 rounded-full relative p-1 transition-all">
                      <div className={`w-5 h-5 bg-white rounded-full transition-all duration-300 ${cycle === 'year' ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${cycle === 'year' ? 'text-white' : 'text-slate-600'}`}>Yearly <span className="text-emerald-500 ml-1">(-20%)</span></span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pricingType === 'individual' ? (
                  <>
                    <PricingCard title="Basic" price={cycle === 'month' ? '€9.99' : '€99.99'} plan="basic" accent="slate" isCurrent={userProfile?.plan === 'basic'} features={['20 Tactical Units', '4 Tournaments', 'PDF Exports', 'Basic Analytics']} />
                    <PricingCard title="Pro" price={cycle === 'month' ? '€14.99' : '€149.00'} plan="pro" accent="indigo" isCurrent={userProfile?.plan === 'pro'} features={['Unlimited Units', 'Unlimited Tournaments', 'Squad Hub Access', 'Playbook', 'Tactical AI Vision', 'Magic Coach Synthesis']} />
                    <PricingCard title="Game Analysis Pro" price={cycle === 'month' ? '€49.99' : '€499'} plan="gameAnalysis" accent="orange" isCurrent={userProfile?.plan === 'gameAnalysis'} features={['8h AI game analysis/month', 'Automatic team & player insights', 'Offensive & defensive analysis', 'Key moments & coaching points', 'Match reports with improvement areas']} />
                  </>
                ) : (
                  <>
                    <PricingCard title="Club 10" price={cycle === 'month' ? '€99' : '€999'} plan="club10" accent="slate" isCurrent={userProfile?.plan === 'club10'} features={['For Small Clubs', '10 Coach Pro Licenses', 'Central Playbook Sync', 'Club HQ Console']} />
                    <PricingCard title="Club 20" price={cycle === 'month' ? '€169' : '€1699'} plan="club20" accent="indigo" isCurrent={userProfile?.plan === 'club20'} features={['For Large Clubs', '20 Coach Pro Licenses', 'Advanced Staff Sync', 'Shared Tactical Vault']} />
                    <PricingCard title="Unlimited" price={cycle === 'month' ? '€249' : '€2499'} plan="clubUnlimited" accent="slate" isCurrent={userProfile?.plan === 'clubUnlimited'} features={['Elite Organization', 'Unlimited Pro Licenses', 'Full White-Labeling', '24/7 Priority Ops']} />
                  </>
                )}
              </div>

              <div className="mt-6 max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 text-left">
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2">Subscription Terms</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">🔄 Automatically renews {cycle === 'month' ? 'every month' : 'every year'} at the price shown above unless cancelled.</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">❌ Cancel anytime in Settings or Google Play before your renewal date.</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">✅ A free plan is available — no subscription required to use basic features.</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">💳 Payment charged to your account upon confirmation of purchase.</p>
              </div>
            </section>
          )}

        </div>
      </div>
    );
  }

  // ── Logged-out landing page (unchanged) ──────────────────────────────────────

  return (
    <div className="min-h-screen text-white font-sans overflow-x-hidden relative selection:bg-ha-brand/30">
      <ContactForm isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} />

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.1),transparent_70%)] pointer-events-none" />

      <main className={`${globalAnnouncement ? 'pt-40' : 'pt-24'} pb-24 px-6 flex flex-col items-center text-center space-y-16 transition-all duration-500`}>

        <div className="space-y-8 pt-8 max-w-4xl">
          <h2 className="text-7xl md:text-[130px] font-black italic uppercase tracking-tighter leading-[0.8] animate-in slide-in-from-bottom-8 duration-700">
            THE COACH <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-ha-brand via-blue-500 to-indigo-600 drop-shadow-[0_0_30px_rgba(232,116,60,0.2)]">APP.</span>
          </h2>
          <p className="max-w-xl mx-auto text-slate-500 text-sm md:text-xl font-medium uppercase tracking-tight leading-relaxed opacity-80">
            The ultimate tactical operating system for modern basketball organizations and elite staff.
          </p>
        </div>

        <div className="flex flex-col gap-5 w-full max-md:max-w-xs md:max-w-xl mx-auto animate-in slide-in-from-bottom duration-700 delay-200">
          <button
            onClick={() => onNavigate('auth', undefined, 'signup')}
            className="group relative w-full py-8 bg-gradient-to-r from-ha-brand to-blue-600 rounded-[3rem] text-[15px] font-black uppercase tracking-[0.4em] text-white shadow-[0_20px_60px_rgba(6,182,212,0.3)] active:scale-95 transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <span className="relative z-10">Start for free</span>
          </button>

          <div className="flex flex-col md:flex-row gap-4 w-full">
            <button
              onClick={() => onNavigate('match-archive')}
              className="flex-1 py-6 bg-[#0b1224] border border-slate-800 text-white rounded-[2.5rem] text-[13px] font-black uppercase tracking-[0.3em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 hover:border-indigo-500/50 relative"
            >
              {liveCount > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] font-black px-3 py-1 rounded-full shadow-lg animate-bounce flex items-center gap-1">
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                  {liveCount} LIVE
                </div>
              )}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              Watch Games
            </button>

            <button
              onClick={() => onNavigate('about')}
              className="flex-1 py-6 bg-slate-900 border border-white/5 rounded-[2.5rem] text-[13px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-white transition-all"
            >
              About HoopsAtlas
            </button>
          </div>
        </div>

        <section className="pt-32 w-full max-w-6xl mx-auto space-y-16">
          <div className="text-center space-y-6">
            <h2 className="text-[11px] font-black uppercase tracking-[0.6em] text-slate-600">Select Operating Tier</h2>
            <h3 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-white">UPGRADE YOUR <br /> <span className="text-ha-brand">PLAYBOOK.</span></h3>

            <div className="flex flex-col items-center gap-10 pt-12">
              <div className="flex bg-[#0b1224] p-2 rounded-[2rem] border border-slate-800 shadow-3xl overflow-hidden">
                <button onClick={() => setPricingType('individual')} className={`px-12 py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${pricingType === 'individual' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-600 hover:text-white'}`}>Individual</button>
                <button onClick={() => setPricingType('club')} className={`px-12 py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${pricingType === 'club' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Organization</button>
              </div>

              <div className="flex items-center justify-center gap-8 pt-4">
                <span className={`text-[11px] font-black uppercase tracking-widest transition-colors ${cycle === 'month' ? 'text-white' : 'text-slate-600'}`}>Monthly</span>
                <button onClick={() => setCycle(cycle === 'month' ? 'year' : 'month')} className="w-16 h-8 bg-slate-800 rounded-full relative p-1.5 transition-all">
                  <div className={`w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-xl ${cycle === 'year' ? 'translate-x-8' : 'translate-x-0'}`} />
                </button>
                <span className={`text-[11px] font-black uppercase tracking-widest transition-colors ${cycle === 'year' ? 'text-white' : 'text-slate-600'}`}>Yearly <span className="text-emerald-500 ml-1">(-20%)</span></span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            {pricingType === 'individual' ? (
              <>
                <PricingCard title="Basic" price={cycle === 'month' ? '€9.99' : '€99.99'} plan="basic" accent="slate" features={['Unlimited Units', 'PDF Exports', 'Basic AI Vision', 'Squad Hub Access']} />
                <PricingCard title="Pro" price={cycle === 'month' ? '€14.99' : '€149.00'} plan="pro" accent="indigo" features={['Everything in Basic', 'Advanced AI Vision', 'Magic Coach Synthesis', 'HD Social Exports', 'Motion Engine Video']} />
                <PricingCard title="Game Analysis Pro" price={cycle === 'month' ? '€49.99' : '€499'} plan="gameAnalysis" accent="orange" features={['8h AI game analysis/month', 'Automatic team & player insights', 'Offensive & defensive analysis', 'Key moments & coaching points', 'Match reports with improvement areas']} />
</>
            ) : (
              <>
                <PricingCard title="Club 10" price={cycle === 'month' ? '€99' : '€999'} plan="club10" accent="slate" features={['For Small Clubs', '10 Pro Licenses', 'Central Playbook Vault', 'Admin Ops Console']} />
                <PricingCard title="Club 20" price={cycle === 'month' ? '€169' : '€1699'} plan="club20" accent="indigo" features={['For Large Clubs', '20 Pro Licenses', 'Central Playbook Vault', 'Shared Tactical Sync']} />
                <PricingCard title="Unlimited" price={cycle === 'month' ? '€249' : '€2499'} plan="clubUnlimited" accent="slate" features={['Elite Organization', 'Unlimited Licenses', 'White-Labeling', '24/7 Priority Ops']} />
              </>
            )}
          </div>

          <p className="text-center text-[9px] text-slate-600 font-medium leading-relaxed mt-8 max-w-lg mx-auto">
            Subscriptions automatically renew {cycle === 'month' ? 'monthly' : 'yearly'} at the price shown. Cancel anytime before your renewal date. A free plan is available — no subscription required to use basic features.
          </p>
        </section>
      </main>

      <footer className="w-full bg-ha-bg border-t border-white/5 mt-32 pt-32 pb-16 px-10 relative z-10">
        <div className="max-w-6xl mx-auto space-y-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
            <div className="col-span-2 space-y-8">
              <Logo variant="professional" />
              <p className="text-slate-600 text-[11px] font-bold uppercase tracking-widest max-w-sm leading-relaxed italic">
                THE ULTIMATE TACTICAL OPERATING SYSTEM FOR MODERN BASKETBALL ORGANIZATIONS.
              </p>
            </div>
            <div className="space-y-6">
              <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-white">Platform</h4>
              <ul className="space-y-3">
                <li><button onClick={() => onNavigate('about')} className="text-[10px] font-bold text-slate-500 hover:text-ha-brand uppercase tracking-[0.2em] transition-colors">About HoopsAtlas</button></li>
                <li><button onClick={() => onNavigate('support')} className="text-[10px] font-bold text-slate-500 hover:text-ha-brand uppercase tracking-[0.2em] transition-colors">Ops Support</button></li>
                <li><button onClick={() => onNavigate('partners')} className="text-[10px] font-bold text-slate-500 hover:text-ha-brand uppercase tracking-[0.2em] transition-colors">Partner Program</button></li>
              </ul>
            </div>
            <div className="space-y-6">
              <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-white">Legal</h4>
              <ul className="space-y-3">
                <li><button onClick={() => onNavigate('privacy')} className="text-[10px] font-bold text-slate-500 hover:text-ha-brand uppercase tracking-[0.2em] transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => onNavigate('subscription-terms')} className="text-[10px] font-bold text-slate-500 hover:text-ha-brand uppercase tracking-[0.2em] transition-colors">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="pt-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 opacity-40">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.6em]">HOOPSATLAS COMMAND © 2026 • EST. BELGIUM</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
