import { useState, useEffect } from 'react';
import { type User } from 'firebase/auth';
import { ViewState, SubscriptionPlan, UserProfile, Team, TeamMember } from '../types';

type UpgradeHandler = (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;

const VALID_VIEWS: ViewState[] = [
  'home', 'library', 'discover', 'coach-search', 'create', 'edit', 'detail',
  'settings', 'auth', 'privacy', 'teams', 'team-calendar', 'match-board',
  'subscription-terms', 'join-team', 'admin-dashboard', 'training-selection',
  'about', 'playbooks', 'data-erasure', 'tiktok-studio',
  'unsubscribe', 'club-hq', 'match-analysis', 'tournament-builder',
  'local-courts', 'match-archive', 'match-upload', 'drill-brief', 'chats',
  'match-broadcaster', 'match-viewer', 'match-stats', 'support', 'partners',
  'scrimmage-hub'
];

const parseView = (value: string | null): ViewState | null =>
  value && VALID_VIEWS.includes(value as ViewState) ? value as ViewState : null;

export function useNavigation(user: User | null, userProfile: UserProfile | null, handleUpgradeRequest: UpgradeHandler) {
  const [view, setView] = useState<ViewState>(() => {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, "");
    if (path === '/login' || path === '/signup') return 'auth';
    if (path === '/support') return 'support';
    if (path === '/privacy') return 'privacy';
    if (path === '/terms') return 'subscription-terms';
    if (path === '/delete-data' || path === '/remove') return 'data-erasure';
    if (path === '/partners') return 'partners';
    const vParam = new URLSearchParams(window.location.search).get('view');
    const parsedView = parseView(vParam);
    if (parsedView) return parsedView;
    return 'home';
  });

  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'create'>(() => {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, "");
    return path === '/signup' ? 'signup' : 'login';
  });

  const [redirectTarget, setRedirectTarget] = useState<ViewState | null>(null);
  const [selectedDrillId, setSelectedDrillId] = useState<string | undefined>();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [initialMatchCode, setInitialMatchCode] = useState<string | null>(null);
  const [chatInitialTab, setChatInitialTab] = useState<string | undefined>();
  const [chatInitialPlayer, setChatInitialPlayer] = useState<TeamMember | undefined>();

  // Browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/$/, "");
      if (path === '/login') { setView('auth'); setAuthMode('login'); return; }
      if (path === '/signup') { setView('auth'); setAuthMode('signup'); return; }
      if (path === '/privacy') { setView('privacy'); return; }
      if (path === '/support') { setView('support'); return; }
      if (path === '/terms') { setView('subscription-terms'); return; }
      if (path === '/delete-data' || path === '/remove') { setView('data-erasure'); return; }
      if (path === '/partners') { setView('partners'); return; }
      const params = new URLSearchParams(window.location.search);
      const vParam = params.get('view');
      setView(parseView(vParam) || 'home');
      const dId = params.get('drillId');
      if (dId) setSelectedDrillId(dId);
      if (params.get('playbookId')) setView('playbooks');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect logged-in users away from auth screen
  useEffect(() => {
    console.log(`[AuthEffect] User: ${user ? user.uid : 'null'}, View: ${view}, RedirectTarget: ${redirectTarget}`);
    if (user && view === 'auth') {
      console.log("[AuthEffect] Logged in user on auth page, redirecting...");
      setView(redirectTarget || 'home');
      setRedirectTarget(null);
    }
  }, [user, view, redirectTarget]);

  const handleNavigate = (newView: ViewState, drillId?: string, mode?: 'login' | 'signup' | 'create', streamId?: string) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (newView !== 'team-calendar') { setChatInitialTab(undefined); setChatInitialPlayer(undefined); }

    const protectedViews: ViewState[] = [
      'edit', 'teams', 'team-calendar', 'club-hq', 'settings',
      'match-analysis', 'playbooks', 'tournament-builder', 'local-courts',
      'training-selection', 'match-upload', 'chats', 'library', 'discover',
      'admin-dashboard', 'tiktok-studio', 'match-broadcaster', 'match-archive',
      'join-team', 'match-viewer'
    ];

    if (!user && protectedViews.includes(newView)) {
      setRedirectTarget(newView);
      setAuthMode('login');
      setView('auth');
      return;
    }

    if (newView === 'auth' && mode) setAuthMode(mode);
    setSelectedDrillId(drillId);
    if (streamId) setSelectedStreamId(streamId);

    let newPath = '/';
    if (newView === 'auth') newPath = mode === 'signup' ? '/signup' : '/login';
    else if (newView === 'home') newPath = '/';
    else if (newView === 'support') newPath = '/support';
    else if (newView === 'privacy') newPath = '/privacy';
    else if (newView === 'subscription-terms') newPath = '/terms';
    else if (newView === 'data-erasure') newPath = '/delete-data';
    else if (newView === 'partners') newPath = '/partners';
    else {
      newPath = `/?view=${newView}`;
      if (drillId) newPath += `&drillId=${drillId}`;
    }

    try {
      if (window.location.pathname !== newPath || window.location.search !== (newPath.includes('?') ? '?' + newPath.split('?')[1] : '')) {
        window.history.pushState({}, '', newPath);
      }
    } catch (e) {
      console.warn("History push failed", e);
    }

    setView(newView);
  };

  return {
    view, setView,
    authMode, setAuthMode,
    redirectTarget, setRedirectTarget,
    selectedDrillId, setSelectedDrillId,
    selectedTeam, setSelectedTeam,
    selectedStreamId, setSelectedStreamId,
    initialMatchCode, setInitialMatchCode,
    chatInitialTab, setChatInitialTab,
    chatInitialPlayer, setChatInitialPlayer,
    handleNavigate,
  };
}
