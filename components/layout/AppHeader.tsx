import React from 'react';
import { type User } from 'firebase/auth';
import { ViewState } from '../../types';
import { useAppContext } from '../../contexts/AppContext';
import { getTranslation } from '../../utils/i18n';

interface Props {
  user: User | null;
  partnerBannerEnabled: boolean;
  globalAlert: string;
  unreadCount: number;
  onNavigate: (view: ViewState, drillId?: string, mode?: 'login' | 'signup' | 'create') => void;
}

const getViewLabels = (t: ReturnType<typeof import('../../utils/i18n').getTranslation>): Partial<Record<ViewState, string>> => ({
  home: t.home,
  library: t.drillLibrary,
  discover: t.drillLibrary,
  create: t.drillMaker,
  edit: 'Edit Drill',
  detail: 'Drill Detail',
  playbooks: t.playbook,
  teams: t.teams,
  'team-calendar': 'Team Calendar',
  'match-archive': t.games,
  'match-stats': t.stats,
  'match-analysis': 'Match Analysis',
  settings: t.settings,
  chats: t.messages,
  'tournament-builder': t.tournamentBuilder,
  'club-hq': t.clubHQ,
  support: 'Support',
  about: 'About',
});

const AppHeader: React.FC<Props> = ({ user, partnerBannerEnabled, globalAlert, unreadCount, onNavigate }) => {
  const { view, userProfile, searchQuery, setSearchQuery } = useAppContext();
  const t = getTranslation(userProfile);
  const VIEW_LABELS = getViewLabels(t);

  const topClass = partnerBannerEnabled && globalAlert
    ? 'top-24'
    : (partnerBannerEnabled || globalAlert)
      ? 'top-10'
      : 'top-0';

  const viewLabel = VIEW_LABELS[view] || t.dashboardLabel;
  const initials = userProfile?.name
    ? userProfile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.displayName
      ? user.displayName.slice(0, 2).toUpperCase()
      : 'HA';

  const roleLabel = userProfile?.role === 'coach'
    ? t.headCoach
    : userProfile?.role
      ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
      : t.coach;

  return (
    <>
      {/* ── Mobile header (hidden on lg+) ── */}
      <header
        className={`lg:hidden fixed ${topClass} left-0 w-full z-[60] px-3 flex items-center justify-between bg-ha-bg border-b border-ha-line transition-all duration-500`}
        style={{ height: 52 }}
      >
        <a href="https://app.sportatlas.com" className="flex items-center gap-2 cursor-pointer">
          <div className="w-7 h-7 bg-ha-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs tracking-tight">SA</span>
          </div>
          <span className="font-semibold text-ha-textHi" style={{ fontSize: 15, letterSpacing: -0.2 }}>Sport Atlas</span>
        </a>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('chats')}
            className="w-9 h-9 rounded-ha-md border-none bg-transparent text-ha-textMid flex items-center justify-center relative"
            aria-label="Notifications"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-ha-brand rounded-full border border-ha-bg" />
            )}
          </button>
          {!user ? (
            <button
              onClick={() => onNavigate('auth', undefined, 'login')}
              className="px-4 py-2 bg-ha-brand text-white rounded-ha-md font-semibold text-sm active:scale-95 transition-transform"
            >
              Log In
            </button>
          ) : (
            <button
              onClick={() => onNavigate('settings')}
              className="w-9 h-9 bg-ha-surface rounded-ha-md flex items-center justify-center font-semibold text-ha-textHi text-xs border border-ha-line"
            >
              {initials}
            </button>
          )}
        </div>
      </header>

      {/* ── Desktop header (hidden below lg) ── */}
      <header
        className={`hidden lg:flex fixed ${topClass} left-56 right-0 z-[60] px-6 items-center justify-between bg-ha-bg border-b border-ha-line transition-all duration-500`}
        style={{ height: 52 }}
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm flex-shrink-0">
          <span className="text-ha-textLow">{t.dashboardLabel}</span>
          <span className="text-ha-textLow">·</span>
          <span className="font-semibold text-ha-textHi">{viewLabel}</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-sm mx-6">
          <div className="flex items-center gap-2 bg-ha-surface border border-ha-line rounded-ha-md px-3" style={{ height: 34 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ha-textLow flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.searchDrillsPlaceholder}
              className="flex-1 bg-transparent text-sm text-ha-textHi placeholder-ha-textLow outline-none min-w-0"
            />
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onNavigate('create')}
            className="flex items-center gap-1.5 px-3 bg-ha-surface border border-ha-line rounded-ha-md text-sm font-medium text-ha-textHi hover:bg-ha-surface2 transition-all"
            style={{ height: 34 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t.newButton}
          </button>

          <button
            onClick={() => onNavigate('chats')}
            className="w-9 h-9 rounded-ha-md bg-transparent text-ha-textMid flex items-center justify-center relative hover:bg-ha-surface transition-all"
            aria-label="Notifications"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-ha-brand rounded-full border border-ha-bg" />
            )}
          </button>

          {user ? (
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center gap-2 hover:bg-ha-surface rounded-ha-md px-2 transition-all"
              style={{ height: 36 }}
            >
              <div className="w-7 h-7 bg-ha-brand rounded-ha-md flex items-center justify-center font-semibold text-white text-xs flex-shrink-0">
                {initials}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-ha-textHi leading-none" style={{ fontSize: 13 }}>
                  {userProfile?.name || user.displayName || 'User'}
                </p>
                <p className="text-ha-textLow mt-0.5" style={{ fontSize: 11 }}>{roleLabel}</p>
              </div>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('auth', undefined, 'login')}
              className="px-4 py-2 bg-ha-brand text-white rounded-ha-md font-semibold text-sm"
            >
              Log In
            </button>
          )}
        </div>
      </header>
    </>
  );
};

export default AppHeader;
