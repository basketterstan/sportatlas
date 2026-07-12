import React from 'react';
import { ViewState, UserProfile, Team } from '../../types';
import { getTranslation } from '../../utils/i18n';

interface SideNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  userProfile?: UserProfile | null;
  selectedTeam?: Team | null;
  myTeams?: Team[];
}

const SideNav: React.FC<SideNavProps> = ({ currentView, onNavigate, userProfile, selectedTeam, myTeams }) => {
  const t = getTranslation(userProfile);
  const isActive = (views: ViewState[]) => views.includes(currentView);

  const isPlayer = userProfile?.role === 'player';
  const isParent = userProfile?.role === 'parent';

  const navItems: Array<{ id: ViewState; label: string; activeViews: ViewState[]; icon: React.ReactNode }> = isParent
    ? [
        { id: 'home', label: t.home, activeViews: ['home'], icon: <HomeIcon /> },
        { id: 'chats', label: t.messages, activeViews: ['chats'], icon: <ChatIcon /> },
        { id: 'match-archive', label: t.games, activeViews: ['match-archive', 'match-analysis'], icon: <GamesIcon /> },
        { id: 'teams', label: t.squad, activeViews: ['teams', 'team-calendar', 'join-team'], icon: <TeamIcon /> },
      ]
    : isPlayer
    ? [
        { id: 'home', label: t.home, activeViews: ['home'], icon: <HomeIcon /> },
        { id: 'chats', label: t.messages, activeViews: ['chats'], icon: <ChatIcon /> },
        { id: 'match-archive', label: t.games, activeViews: ['match-archive', 'match-analysis'], icon: <GamesIcon /> },
        { id: 'teams', label: t.squad, activeViews: ['teams', 'team-calendar', 'join-team'], icon: <TeamIcon /> },
      ]
    : [
        { id: 'home', label: t.home, activeViews: ['home'], icon: <HomeIcon /> },
        { id: 'playbooks', label: t.playbook, activeViews: ['playbooks'], icon: <PlaybookIcon /> },
        { id: 'discover', label: t.drillLibrary, activeViews: ['library', 'detail', 'edit', 'discover'], icon: <LibraryIcon /> },
        { id: 'create', label: t.drillMaker, activeViews: ['create'], icon: <DrillMakerIcon /> },
        { id: 'teams', label: t.squad, activeViews: ['teams', 'team-calendar', 'join-team', 'chats'], icon: <TeamIcon /> },
        { id: 'match-archive', label: t.games, activeViews: ['match-archive', 'match-analysis'], icon: <GamesIcon /> },
        { id: 'match-stats', label: t.stats, activeViews: ['match-stats'], icon: <StatsIcon /> },
        { id: 'tournament-builder', label: t.tournamentBuilder, activeViews: ['tournament-builder'], icon: <TourneyIcon /> },
        { id: 'community', label: t.coachHub, activeViews: ['community', 'community-post'], icon: <CommunityIcon /> },
        { id: 'scrimmage-hub', label: t.scrimmageHub, activeViews: ['scrimmage-hub'], icon: <ScrimmageIcon /> },
      ];

  const team = selectedTeam || myTeams?.[0];
  const memberCount = team?.memberUids?.length ?? team?.members?.length ?? 0;

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-56 bg-ha-surface border-r border-ha-line flex-col z-50">
      {/* Logo */}
      <div className="h-[52px] flex items-center px-4 border-b border-ha-line flex-shrink-0">
        <img src="/sportatlas-logo.png" alt="SportAtlas" className="h-8 w-auto object-contain invert" />
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ha-textLow px-2 mb-3">{t.workspace}</p>
        <nav className="space-y-0.5">
          {navItems.map(item => {
            const active = isActive(item.activeViews);
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-ha-md text-sm font-medium transition-all text-left ${
                  active
                    ? 'bg-ha-brandSoft text-ha-brand'
                    : 'text-ha-textMid hover:bg-ha-surface2 hover:text-ha-textHi'
                }`}
              >
                <span style={{ color: active ? '#E8743C' : '#6B7280' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Team selector */}
      {team && (
        <div className="border-t border-ha-line px-3 py-3 flex-shrink-0">
          <button
            onClick={() => onNavigate('teams')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-ha-md bg-ha-surface2 hover:bg-ha-line transition-all"
          >
            <div className="w-7 h-7 bg-ha-brand rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-xs">
              {team.name?.charAt(0) ?? 'T'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-ha-textHi truncate leading-none">{team.name}</p>
              <p className="text-xs text-ha-textLow mt-0.5">{memberCount} {t.players}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ha-textLow flex-shrink-0">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
};

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const PlaybookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
    <path d="M8 7h6" />
    <path d="M8 11h8" />
  </svg>
);

const LibraryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
    <path d="M8 7h6" />
    <path d="M8 11h8" />
    <path d="M8 15h4" />
  </svg>
);

const DrillMakerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const TeamIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GamesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const StatsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const CommunityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ScrimmageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M4.93 4.93c1.56 2.17 2.5 4.83 2.5 7.07s-.94 4.9-2.5 7.07"/>
    <path d="M19.07 4.93c-1.56 2.17-2.5 4.83-2.5 7.07s.94 4.9 2.5 7.07"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
  </svg>
);

const TourneyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 21h8M12 17v4M17 3H7l-1 7h10L17 3z"/>
    <path d="M6 10c-1 2-1 4 0 5s3 2 6 2 5-1 6-2 1-3 0-5"/>
  </svg>
);

export default SideNav;
