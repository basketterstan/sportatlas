import React, { Suspense } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import ProGate from '../shared/ProGate';

const LandingPage       = React.lazy(() => import('../pages/LandingPage'));
const AboutPage         = React.lazy(() => import('../pages/AboutPage'));
const PrivacyPolicy     = React.lazy(() => import('../pages/PrivacyPolicy'));
const SubscriptionTerms = React.lazy(() => import('../pages/SubscriptionTerms'));
const AccountDeletion   = React.lazy(() => import('../pages/AccountDeletion'));
const SupportPage       = React.lazy(() => import('../pages/SupportPage'));
const DrillLibrary      = React.lazy(() => import('../drills/DrillLibrary'));
const DrillDetail       = React.lazy(() => import('../drills/DrillDetail'));
const DrillBrief        = React.lazy(() => import('../drills/DrillBrief'));
const DrillForm         = React.lazy(() => import('../drills/DrillForm'));
const MatchStats        = React.lazy(() => import('../match/MatchStats'));
const TrainingSelection = React.lazy(() => import('../drills/TrainingSelection'));
const Auth              = React.lazy(() => import('../auth/Auth'));
const Settings          = React.lazy(() => import('../pages/Settings'));
const AdminDashboard    = React.lazy(() => import('../pages/AdminDashboard'));
const MatchAnalysis     = React.lazy(() => import('../match/MatchAnalysis'));
const MatchBroadcaster  = React.lazy(() => import('../match/MatchBroadcaster'));
const MatchViewer       = React.lazy(() => import('../match/MatchViewer'));
const MatchUploadForm   = React.lazy(() => import('../match/MatchUploadForm'));
const TikTokStudio      = React.lazy(() => import('../content/TikTokStudio'));
const TeamManager       = React.lazy(() => import('../team/TeamManager'));
const TeamCalendar      = React.lazy(() => import('../team/TeamCalendar'));
const JoinTeam          = React.lazy(() => import('../team/JoinTeam'));
const ChatCenter        = React.lazy(() => import('../team/ChatCenter'));
const ClubHQ            = React.lazy(() => import('../club/ClubHQ'));
const TrainingSessions  = React.lazy(() => import('../drills/TrainingSessions'));
const TournamentBuilder = React.lazy(() => import('../club/TournamentBuilder'));
const MatchArchive      = React.lazy(() => import('../match/MatchArchive'));
const LocalCourts       = React.lazy(() => import('../pages/LocalCourts'));
const PartnerPage       = React.lazy(() => import('../pages/PartnerPage'));
const CoachHub          = React.lazy(() => import('../community/CoachHub'));
const CoachHubPost      = React.lazy(() => import('../community/CoachHubPost'));
const ScrimmageHub      = React.lazy(() => import('../community/ScrimmageHub'));

const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 bg-ha-brand rounded-xl animate-pulse" />
  </div>
);

const AppRouter: React.FC = () => {
  const {
    view, user, userProfile, drills, publicDrills, trainingSessions, publicSessions,
    myTeams, activeDrill, selectedDrillId, selectedTeam, setSelectedTeam, selectedStreamId,
    initialMatchCode, authMode, chatInitialTab, setChatInitialTab, chatInitialPlayer, setChatInitialPlayer,
    searchQuery, setSearchQuery, filterFocus, setFilterFocus, filterLevel, setFilterLevel,
    showFavoritesOnly, setShowFavoritesOnly, sortBy, setSortBy,
    onNavigate, onSaveDrill, onTogglePinDrill, onTogglePinSession, onAddToPlaybook,
    onUpgradeRequest, onClearInitialCode, isSyncingSubscription, onSyncSubscription,
    partnerBannerEnabled, globalAlert,
  } = useAppContext();

  const plan = (userProfile?.plan || 'free').toLowerCase();
  const isPro = plan === 'pro' || plan.includes('club') || !!userProfile?.isAdmin || !!userProfile?.isTester || !!(userProfile?.proExpiresAt && userProfile.proExpiresAt > Date.now());
  const isBasic = plan === 'basic' || isPro;
  const isClub = plan.includes('club') || !!userProfile?.isAdmin || !!userProfile?.isTester;
  const isPlayer = userProfile?.role === 'player';
  const isParent = userProfile?.role === 'parent';

  // Profile is still loading: authenticated but no profile data yet
  const profileReady = !user || userProfile !== null;

  let content: React.ReactNode = null;

  if (!profileReady) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <ViewLoader />
      </Suspense>
    );
  }

  if (view === 'home') {
    content = <LandingPage onNavigate={onNavigate} isLoggedIn={!!user} userProfile={userProfile} myTeams={myTeams} onUpgradeRequest={onUpgradeRequest} sharedMatchCode={initialMatchCode} globalAnnouncement={!!globalAlert || partnerBannerEnabled} />;
  } else if (view === 'about') {
    content = <div className="px-4 max-w-5xl mx-auto"><AboutPage onBack={() => onNavigate('home')} /></div>;
  } else if (view === 'privacy') {
    content = <div className="px-4 max-w-5xl mx-auto"><PrivacyPolicy onBack={() => onNavigate('home')} /></div>;
  } else if (view === 'subscription-terms') {
    content = <div className="px-4 max-w-5xl mx-auto"><SubscriptionTerms onBack={() => onNavigate('home')} /></div>;
  } else if (view === 'data-erasure') {
    content = <div className="px-4 max-w-5xl mx-auto"><AccountDeletion onBack={() => onNavigate('home')} /></div>;
  } else if (view === 'support') {
    content = <div className="px-4 max-w-5xl mx-auto"><SupportPage onBack={() => onNavigate('home')} /></div>;
  } else if (view === 'library' || view === 'discover') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <DrillLibrary
          isCommunity={view === 'discover'}
          drills={view === 'discover' ? publicDrills : drills}
          personalDrillsCount={drills.length}
          userProfile={userProfile}
          onSelectDrill={(id) => onNavigate('detail', id)}
          onToggleFavorite={() => {}}
          onTogglePin={onTogglePinDrill}
          onVote={() => {}}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterFocus={filterFocus}
          setFilterFocus={setFilterFocus}
          filterLevel={filterLevel}
          setFilterLevel={setFilterLevel}
          showFavoritesOnly={showFavoritesOnly}
          setShowFavoritesOnly={setShowFavoritesOnly}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onSwitchView={onNavigate}
          onUpgradeRequest={onUpgradeRequest}
          onAddToPlaybook={(id) => onAddToPlaybook(id)}
        />
      </div>
    );
  } else if (view === 'detail' && activeDrill) {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <DrillDetail
          drill={activeDrill}
          isOwn={activeDrill.userId === user?.uid}
          userProfile={userProfile}
          onBack={() => onNavigate('library')}
          onEdit={() => onNavigate('edit', activeDrill.id)}
          onDelete={() => onNavigate('library')}
          onToggleFavorite={() => {}}
          onTogglePin={onTogglePinDrill}
          onLogin={() => onNavigate('auth')}
          onDuplicate={() => {}}
          onAddToPlaybook={(id) => onAddToPlaybook(id)}
        />
      </div>
    );
  } else if (view === 'drill-brief' && activeDrill) {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <DrillBrief drill={activeDrill} onBack={() => onNavigate('training-selection')} />
      </div>
    );
  } else if (view === 'match-stats') {
    content = (
      <ProGate hasAccess={isBasic} requiredPlan="basic" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <MatchStats userProfile={userProfile} onBack={() => onNavigate('home')} />
        </div>
      </ProGate>
    );
  } else if (view === 'create' || view === 'edit') {
    content = (
      <div className="max-w-5xl mx-auto min-h-screen">
        <DrillForm
          initialDrill={view === 'edit' ? (activeDrill || undefined) : undefined}
          userProfile={userProfile}
          sessions={trainingSessions}
          onSave={onSaveDrill}
          onCancel={() => onNavigate('library')}
          onRequestLogin={() => onNavigate('auth', undefined, 'signup')}
        />
      </div>
    );
  } else if (view === 'training-selection') {
    content = (
      <ProGate hasAccess={isPro} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <TrainingSelection
            hubDrills={publicDrills}
            userProfile={userProfile}
            onSelect={(d) => { onNavigate('drill-brief', d.id); }}
            onBack={() => onNavigate('home')}
          />
        </div>
      </ProGate>
    );
  } else if (view === 'auth') {
    content = <Auth onNavigate={onNavigate} initialMode={authMode === 'create' ? 'login' : authMode} />;
  } else if (view === 'settings') {
    content = (
      <Settings
        drills={drills}
        userProfile={userProfile}
        onImport={() => {}}
        onClearAll={() => {}}
        onManageTeams={() => onNavigate('teams')}
        onOpenAdmin={() => onNavigate('admin-dashboard')}
        onNavigate={onNavigate}
        onSyncSubscription={onSyncSubscription}
        isSyncingSubscription={isSyncingSubscription}
      />
    );
  } else if (view === 'admin-dashboard' && userProfile?.isAdmin) {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <AdminDashboard
          userProfile={userProfile}
          onBack={() => onNavigate('settings')}
          onOpenStudio={() => onNavigate('tiktok-studio')}
        />
      </div>
    );
  } else if (view === 'match-analysis' && userProfile) {
    content = (
      <ProGate hasAccess={isPro} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <MatchAnalysis userProfile={userProfile} onBack={() => onNavigate('home')} onNavigate={onNavigate} />
        </div>
      </ProGate>
    );
  } else if (view === 'match-broadcaster' && userProfile) {
    content = (
      <ProGate hasAccess={isPro} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <MatchBroadcaster userProfile={userProfile} onBack={() => onNavigate('match-analysis')} />
      </ProGate>
    );
  } else if (view === 'match-viewer' && selectedStreamId) {
    content = <MatchViewer streamId={selectedStreamId} userProfile={userProfile} onBack={() => onNavigate('home')} />;
  } else if (view === 'match-upload') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <MatchUploadForm matchId={selectedDrillId} userProfile={userProfile} onBack={() => onNavigate('match-archive')} />
      </div>
    );
  } else if (view === 'tiktok-studio' && userProfile) {
    content = (
      <ProGate hasAccess={isPro} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <TikTokStudio drills={drills} publicDrills={publicDrills} onBack={() => onNavigate('home')} />
        </div>
      </ProGate>
    );
  } else if (view === 'teams') {
    content = (
      <ProGate hasAccess={isPro || isPlayer || isParent} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <TeamManager
            user={user}
            userProfile={userProfile}
            onBack={() => onNavigate('settings')}
            onOpenCalendar={(team) => { setSelectedTeam(team); onNavigate('team-calendar'); }}
            onJoinTeam={() => onNavigate('join-team')}
            onUpgradeRequest={onUpgradeRequest}
          />
        </div>
      </ProGate>
    );
  } else if (view === 'team-calendar' && selectedTeam) {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <TeamCalendar
          user={user}
          team={selectedTeam}
          drills={drills}
          onBack={() => onNavigate('teams')}
          onViewDrill={(id) => onNavigate('detail', id)}
          userProfile={userProfile}
          onNavigate={onNavigate}
          initialTab={chatInitialTab}
          initialPlayer={chatInitialPlayer}
        />
      </div>
    );
  } else if (view === 'join-team') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <JoinTeam
          onBack={() => onNavigate('teams')}
          onJoined={(team) => { setSelectedTeam(team); onNavigate('team-calendar'); }}
        />
      </div>
    );
  } else if (view === 'chats' && userProfile) {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <ChatCenter
          userProfile={userProfile}
          onBack={() => onNavigate('home')}
          onOpenTeamChat={(t) => { setSelectedTeam(t); setChatInitialTab('locker-room'); onNavigate('team-calendar'); }}
          onOpenPrivateChat={(p, t) => { setSelectedTeam(t); setChatInitialTab('roster'); setChatInitialPlayer(p); onNavigate('team-calendar'); }}
        />
      </div>
    );
  } else if (view === 'club-hq' && userProfile) {
    content = (
      <ProGate hasAccess={isClub} requiredPlan="club" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <ClubHQ userProfile={userProfile} onBack={() => onNavigate('home')} onViewDrill={(id) => onNavigate('detail', id)} onNavigate={onNavigate} />
        </div>
      </ProGate>
    );
  } else if (view === 'playbooks') {
    content = (
      <ProGate hasAccess={isPro} requiredPlan="pro" onUpgrade={onUpgradeRequest}>
        <div className="px-4 max-w-5xl mx-auto">
          <TrainingSessions
            drills={drills}
            sessions={trainingSessions}
            publicSessions={publicSessions}
            publicDrills={publicDrills}
            userPlan={userProfile?.plan}
            userRole={userProfile?.role}
            isAdmin={userProfile?.isAdmin}
            userName={userProfile?.name}
            userProfile={userProfile}
            onBack={() => onNavigate('home')}
            onViewDrill={(id) => onNavigate('detail', id)}
            onEditDrill={(id) => onNavigate('edit', id)}
            onTogglePin={onTogglePinSession}
            onDrillCreated={async () => {}}
            initialCreate={authMode === 'create'}
            initialPlaybookId={new URLSearchParams(window.location.search).get('playbookId') || undefined}
          />
        </div>
      </ProGate>
    );
  } else if (view === 'tournament-builder') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <TournamentBuilder userProfile={userProfile} onBack={() => onNavigate('home')} />
      </div>
    );
  } else if (view === 'match-archive') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <MatchArchive
          userProfile={userProfile}
          onBack={() => onNavigate('home')}
          onNavigate={onNavigate}
          initialMatchCode={initialMatchCode}
          onClearInitialCode={onClearInitialCode}
        />
      </div>
    );
  } else if (view === 'local-courts') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <LocalCourts onBack={() => onNavigate('home')} />
      </div>
    );
  } else if (view === 'partners') {
    content = (
      <div className="px-4 max-w-5xl mx-auto">
        <PartnerPage onBack={() => onNavigate('home')} />
      </div>
    );
  } else if (view === 'community' && user) {
    content = (
      <CoachHub user={user} userProfile={userProfile} onBack={() => onNavigate('home')} />
    );
  } else if (view === 'scrimmage-hub') {
    content = (
      <ScrimmageHub user={user} userProfile={userProfile} onBack={() => onNavigate('home')} onLoginRequired={() => onNavigate('auth')} />
    );
  }

  return (
    <Suspense fallback={<ViewLoader />}>
      {content}
    </Suspense>
  );
};

export default AppRouter;
