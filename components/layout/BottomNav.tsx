import React, { useState } from 'react';
import { ViewState, UserProfile } from '../../types';
import { getTranslation } from '../../utils/i18n';

interface BottomNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  userProfile?: UserProfile | null;
  unreadCount?: number;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, userProfile, unreadCount = 0 }) => {
  const t = getTranslation(userProfile);
  const isPlayer = userProfile?.role === 'player';
  const isParent = userProfile?.role === 'parent';
  const [showMore, setShowMore] = useState(false);

  const isActive = (views: ViewState[]) => views.includes(currentView);

  const handleNavigate = (view: ViewState) => {
    setShowMore(false);
    onNavigate(view);
  };

  const NavItem = ({
    id,
    label,
    icon,
    activeViews,
    badge = false,
    onClick,
  }: {
    id: ViewState;
    label: string;
    icon: React.ReactNode;
    activeViews?: ViewState[];
    badge?: boolean;
    onClick?: () => void;
  }) => {
    const active = isActive(activeViews || [id]);
    return (
      <button
        onClick={onClick ?? (() => handleNavigate(id))}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-0 border-none bg-transparent cursor-pointer active:scale-90 transition-transform relative"
        style={{ color: active ? '#E8743C' : '#A8ADB8' }}
      >
        {badge && unreadCount > 0 && (
          <div className="absolute top-1 right-1/2 translate-x-3 min-w-[14px] h-[14px] bg-ha-danger rounded-full flex items-center justify-center border border-ha-bg z-10">
            <span className="text-[7px] font-bold text-white leading-none">{unreadCount > 9 ? '9+' : unreadCount}</span>
          </div>
        )}
        <div className="flex items-center justify-center">{icon}</div>
        <span className="font-medium leading-none" style={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: active ? 600 : 500 }}>
          {label}
        </span>
      </button>
    );
  };

  // More sheet item
  const MoreItem = ({ id, label, icon, activeViews }: { id: ViewState; label: string; icon: React.ReactNode; activeViews?: ViewState[] }) => {
    const active = isActive(activeViews || [id]);
    return (
      <button
        onClick={() => handleNavigate(id)}
        className={`flex items-center gap-4 w-full px-5 py-3.5 rounded-ha-md transition-all active:scale-95 ${active ? 'bg-ha-brandSoft text-ha-brand' : 'text-ha-textMid hover:bg-ha-surface2 hover:text-ha-textHi'}`}
      >
        <span style={{ color: active ? '#E8743C' : '#6B7280' }}>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-ha-brand" />}
      </button>
    );
  };

  if (isParent) {
    return (
      <nav
        className="absolute bottom-2 left-2 right-2 flex border border-ha-line shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        style={{ height: 60, background: '#16191F', borderRadius: 24 }}
      >
        <NavItem id="home" label={t.home} activeViews={['home']} icon={<HomeIcon />} />
        <NavItem id="chats" label={t.messages} badge activeViews={['chats']} icon={<ChatIcon />} />
        <NavItem id="match-archive" label={t.games} activeViews={['match-archive']} icon={<GamesIcon />} />
        <NavItem id="teams" label={t.teams} activeViews={['teams', 'team-calendar', 'join-team']} icon={<TeamIcon />} />
      </nav>
    );
  }

  if (isPlayer) {
    return (
      <nav
        className="absolute bottom-2 left-2 right-2 flex border border-ha-line shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        style={{ height: 60, background: '#16191F', borderRadius: 24 }}
      >
        <NavItem id="home" label={t.home} activeViews={['home']} icon={<HomeIcon />} />
        <NavItem id="chats" label={t.messages} badge activeViews={['chats']} icon={<ChatIcon />} />
        <NavItem id="match-archive" label={t.games} activeViews={['match-archive']} icon={<GamesIcon />} />
        <NavItem id="teams" label={t.teams} activeViews={['teams', 'team-calendar', 'join-team']} icon={<TeamIcon />} />
      </nav>
    );
  }

  // Coach: Home, Drills, Plans, Teams, More
  const moreIsActive = isActive(['match-archive', 'match-stats', 'match-analysis', 'tournament-builder', 'settings', 'chats', 'tiktok-studio', 'club-hq', 'community', 'community-post', 'scrimmage-hub']);

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-[55]"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-[88px] left-2 right-2 bg-ha-surface border border-ha-line rounded-ha-xl shadow-[0_-8px_32px_rgba(0,0,0,0.4)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-ha-line">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ha-textLow">{t.more}</p>
            </div>
            <div className="p-2 space-y-0.5">
              <MoreItem id="community" label={t.coachHub} activeViews={['community', 'community-post']} icon={<CommunityIcon size={20} />} />
              <MoreItem id="scrimmage-hub" label={t.scrimmageHub} activeViews={['scrimmage-hub']} icon={<ScrimmageIcon size={20} />} />
              <MoreItem id="match-archive" label={t.games} activeViews={['match-archive', 'match-analysis']} icon={<GamesIcon size={20} />} />
              <MoreItem id="match-stats" label={t.stats} activeViews={['match-stats']} icon={<StatsIcon size={20} />} />
              <MoreItem id="chats" label={t.messages} activeViews={['chats']} icon={<ChatIcon size={20} />} />
              <MoreItem id="tournament-builder" label={t.tournamentBuilder} activeViews={['tournament-builder']} icon={<TourneyIcon size={20} />} />
              <MoreItem id="settings" label={t.settings} activeViews={['settings']} icon={<SettingsIcon size={20} />} />
            </div>
          </div>
        </div>
      )}

      <nav
        className="absolute bottom-2 left-2 right-2 flex border border-ha-line shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        style={{ height: 60, background: '#16191F', borderRadius: 24 }}
      >
        <NavItem id="home" label={t.home} activeViews={['home']} icon={<HomeIcon />} />
        <NavItem id="discover" label={t.drills} activeViews={['library', 'detail', 'edit', 'discover', 'create']} icon={<DrillsIcon />} />
        <NavItem id="playbooks" label={t.plans} activeViews={['playbooks']} icon={<PlansIcon />} />
        <NavItem id="teams" label={t.teams} activeViews={['teams', 'team-calendar', 'join-team']} icon={<TeamIcon />} />
        <button
          onClick={() => setShowMore(v => !v)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-0 border-none bg-transparent cursor-pointer active:scale-90 transition-transform"
          style={{ color: moreIsActive || showMore ? '#E8743C' : '#A8ADB8' }}
        >
          <MoreIcon />
          <span className="font-medium leading-none" style={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: moreIsActive || showMore ? 600 : 500 }}>
            {t.more}
          </span>
        </button>
      </nav>
    </>
  );
};

// ─── Icons ───────────────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const DrillsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
    <path d="M8 7h6" /><path d="M8 11h8" />
  </svg>
);

const PlansIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const TeamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GamesIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const StatsIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ChatIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const TourneyIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const SettingsIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const MoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

const ScrimmageIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M4.93 4.93c1.56 2.17 2.5 4.83 2.5 7.07s-.94 4.9-2.5 7.07"/>
    <path d="M19.07 4.93c-1.56 2.17-2.5 4.83-2.5 7.07s.94 4.9 2.5 7.07"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
  </svg>
);

const CommunityIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default BottomNav;
