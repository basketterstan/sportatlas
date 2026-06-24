import React, { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { collection, doc, updateDoc, setDoc, addDoc, writeBatch, increment } from 'firebase/firestore';
import { db, cleanRecord } from './utils/firebase';
import { Drill, SkillFocus, Level, SortOption } from './types';
import { toast } from './utils/toast';
import { FOUNDATION_UNITS } from './data/foundationDrills';
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { useSubscription } from './hooks/useSubscription';
import { useNavigation } from './hooks/useNavigation';
import { initializeAnonymous } from './utils/revenuecat';
import { loadPendingDrill, clearPendingDrill } from './utils/storage';
import { AppProvider } from './contexts/AppContext';
import { parseShareUrl, ShareData } from './utils/sharing';

import GlobalBanners from './components/layout/GlobalBanners';
import AppHeader from './components/layout/AppHeader';
import SideNav from './components/layout/SideNav';
import AppRouter from './components/layout/AppRouter';
import AddToPlaybookModal from './components/drills/AddToPlaybookModal';
import BottomNav from './components/layout/BottomNav';
import CheckoutModal from './components/misc/CheckoutModal';
import PaywallModal from './components/misc/PaywallModal';
import GameAnalysisPaywall from './components/misc/GameAnalysisPaywall';
import AdSenseHandler from './components/shared/AdSenseHandler';
import AdBanner from './components/shared/AdBanner';
import ErrorBoundary from './components/layout/ErrorBoundary';
import Toaster from './components/layout/Toaster';
import ImportModal from './components/shared/ImportModal';
import OnboardingTutorial, { ONBOARDING_STORAGE_KEY } from './components/misc/OnboardingTutorial';
import LanguagePicker from './components/misc/LanguagePicker';
import { AppLanguage, LANGUAGE_PICKED_KEY, LANGUAGE_STORAGE_KEY } from './utils/i18n';

const App: React.FC = () => {
  const { user, userProfile, authLoading, setAuthLoading } = useAuth();
  const { drills, publicDrills, trainingSessions, publicSessions, myTeams, unreadCount, partnerBannerEnabled, globalAlert } = useAppData(user, userProfile);
  const subscription = useSubscription(user, userProfile);
  const nav = useNavigation(user, userProfile, subscription.handleUpgradeRequest);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterFocus, setFilterFocus] = useState<SkillFocus | undefined>();
  const [filterLevel, setFilterLevel] = useState<Level | undefined>();
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(SortOption.NEWEST);
  const [drillToAddToPlaybook, setDrillToAddToPlaybook] = useState<string | null>(null);
  const [gameAnalysisConfirmed, setGameAnalysisConfirmed] = useState(false);
  const [shareToImport, setShareToImport] = useState<ShareData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  // Load Google Analytics and AdSense only on web — not on native iOS (Apple ATT compliance)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const gtagScript = document.createElement('script');
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-LP7PEEGHMB';
    gtagScript.async = true;
    document.head.appendChild(gtagScript);

    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: any[]) { (window as any).dataLayer.push(args); }
    gtag('js', new Date());
    gtag('config', 'G-LP7PEEGHMB');

    const adsScript = document.createElement('script');
    adsScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3879394539295746';
    adsScript.async = true;
    adsScript.crossOrigin = 'anonymous';
    document.head.appendChild(adsScript);

    const adsMeta = document.createElement('meta');
    adsMeta.name = 'google-adsense-account';
    adsMeta.content = 'ca-pub-3879394539295746';
    document.head.appendChild(adsMeta);
  }, []);

  // Initialize RevenueCat anonymously for non-logged-in users (Apple guideline 5.1.1)
  useEffect(() => {
    if (!authLoading && !user) {
      initializeAnonymous().then(() => subscription.refreshGuestPlan());
    }
  }, [authLoading, user]);

  // Activity heartbeat
  useEffect(() => {
    if (!user || !userProfile) return;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - (userProfile.lastActiveAt || 0) > SIX_HOURS) {
      updateDoc(doc(db, 'users', user.uid), { lastActiveAt: now, updatedAt: now, visitCount: increment(1) })
        .catch(e => console.warn("[Heartbeat] Failed to update lastActiveAt:", e));
    }
  }, [user, userProfile?.uid]);

  // Scrimmage Hub tracked link — /scrimmage path redirect
  useEffect(() => {
    if (window.location.pathname === '/scrimmage') {
      addDoc(collection(db, "partner_signals"), {
        source: 'scrimmage-hub',
        type: 'click',
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      }).catch(() => {});
      window.history.replaceState(null, '', '/?view=scrimmage-hub');
      nav.handleNavigate('scrimmage-hub' as any);
    }
  }, []);

  // Partner click attribution
  useEffect(() => {
    const partnerRef = new URLSearchParams(window.location.search).get('ref');
    if (partnerRef) {
      console.debug("Partner Signal Detected:", partnerRef);
      sessionStorage.setItem('ha_partner_ref', partnerRef);
      addDoc(collection(db, "partner_signals"), {
        source: partnerRef.toLowerCase(),
        type: 'click',
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      }).catch(e => console.warn("[Partner] Click signal failed:", e));
    }
  }, []);

  // Show language picker on first visit, then onboarding
  useEffect(() => {
    const viewParam = new URLSearchParams(window.location.search).get('view');
    if (!authLoading && !viewParam) {
      if (!localStorage.getItem(LANGUAGE_PICKED_KEY)) {
        setShowLanguagePicker(true);
      } else if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        setShowOnboarding(true);
      }
    }
  }, [authLoading]);

  const handleLanguagePicked = async (lang: AppLanguage) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    localStorage.setItem(LANGUAGE_PICKED_KEY, '1');
    setShowLanguagePicker(false);
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { language: lang }).catch(() => {});
    }
    if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setShowOnboarding(true);
    }
  };

  // Sync subscription status once userProfile loads + save pending drill after auth
  useEffect(() => {
    if (!user?.uid || !userProfile) return;
    subscription.syncSubscriptionStatus();
    // RevenueCat logIn is async — retry a few times to survive the race condition
    const t1 = setTimeout(() => subscription.syncSubscriptionStatus(true), 4000);
    const t2 = setTimeout(() => subscription.syncSubscriptionStatus(true), 12000);
    const pending = loadPendingDrill();
    if (pending) {
      clearPendingDrill();
      handleSaveDrill({ ...pending, userId: user.uid });
    }
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [userProfile?.uid]);

  // URL parameter handling
  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const dId = params.get('drillId');
    const mCode = params.get('matchCode');
    const status = params.get('status');
    const shareParam = params.get('share');
    const viewParam = params.get('view');

    // Handle share/import
    if (shareParam) {
      const shareData = parseShareUrl(`share=${shareParam}`);
      if (shareData) {
        setShareToImport(shareData);
      }
    }

    if (viewParam) {
      const guestAllowedViews = ['scrimmage-hub', 'match-archive', 'privacy', 'subscription-terms', 'about'];
      if (!user && !guestAllowedViews.includes(viewParam)) {
        sessionStorage.setItem('ha_redirect_view', viewParam);
        nav.handleNavigate('auth');
      } else {
        nav.handleNavigate(viewParam as any);
      }
    } else {
      const pendingView = sessionStorage.getItem('ha_redirect_view');
      if (pendingView && user) {
        sessionStorage.removeItem('ha_redirect_view');
        nav.handleNavigate(pendingView as any);
      }
    }

    if (dId) { nav.setSelectedDrillId(dId); nav.setView('detail'); }
    if (mCode && mCode !== nav.initialMatchCode) {
      nav.setInitialMatchCode(mCode);
      nav.handleNavigate('match-archive');
    }
    if (status === 'success') {
      subscription.setPaymentFeedback('success');
      const retryDelays = [2000, 5000, 10000];
      retryDelays.forEach(delay => {
        setTimeout(() => subscription.syncSubscriptionStatus(true), delay);
      });
    } else if (status === 'cancelled') {
      subscription.setPaymentFeedback('cancelled');
    }
  }, [authLoading, nav.initialMatchCode, userProfile?.uid]);

  const handlePartnerClick = async () => {
    updateDoc(doc(db, "system_config", "partner_clicks"), { basketVisionClicks: increment(1) })
      .catch(e => console.warn("[Partner] Click count update failed:", e));
    window.open('https://www.basketvision.be/en/', '_blank');
  };

  const activeDrill = useMemo(() => {
    if (!nav.selectedDrillId) return null;
    return FOUNDATION_UNITS.find(d => d.id === nav.selectedDrillId)
      || drills.find(d => d.id === nav.selectedDrillId)
      || publicDrills.find(d => d.id === nav.selectedDrillId)
      || null;
  }, [nav.selectedDrillId, drills, publicDrills]);

  const handleSaveDrill = async (drill: Drill, selectedPlaybookIds?: string[]) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'drills', drill.id),
        { ...cleanRecord(drill), userId: user.uid, authorName: userProfile?.name || 'Coach', clubId: userProfile?.clubId || null },
        { merge: true }
      );
      if (selectedPlaybookIds?.length) {
        const batch = writeBatch(db);
        selectedPlaybookIds.forEach(sessionId => {
          const session = trainingSessions.find(s => s.id === sessionId);
          if (session && !session.drillIds?.includes(drill.id)) {
            batch.update(doc(db, 'trainings', sessionId), {
              drillIds: [...(session.drillIds || []), drill.id],
              updatedAt: Date.now()
            });
          }
        });
        await batch.commit();
      }
      nav.setSelectedDrillId(drill.id);
      nav.setView('detail');
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Save failed. Try again.");
    }
  };

  const handleTogglePinDrill = async (drillId: string) => {
    if (!user) return;
    const drill = drills.find(d => d.id === drillId);
    if (!drill) return;
    try {
      await updateDoc(doc(db, 'drills', drillId), { isPinned: !drill.isPinned, updatedAt: Date.now() });
    } catch (e) {
      console.error("Pin toggle failed:", e);
      toast.error("Could not pin drill. Try again.");
    }
  };

  const handleTogglePinSession = async (sessionId: string) => {
    if (!user) return;
    const session = trainingSessions.find(s => s.id === sessionId);
    if (!session) return;
    try {
      await updateDoc(doc(db, 'trainings', sessionId), { isPinned: !session.isPinned, updatedAt: Date.now() });
    } catch (e) {
      console.error("Pin toggle failed:", e);
      toast.error("Could not pin session. Try again.");
    }
  };

  const isPaid = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin || subscription.guestPlan !== 'free');
  const hideNav = ['tiktok-studio', 'auth', 'create', 'edit', 'local-courts', 'match-upload', 'match-broadcaster', 'match-viewer', 'join-team'].includes(nav.view);

  const publicViews: string[] = ['privacy', 'subscription-terms', 'data-erasure', 'support', 'about', 'partners'];

  if (authLoading && !publicViews.includes(nav.view)) {
    return (
      <div className="min-h-screen bg-ha-bg flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 bg-ha-brand rounded-2xl animate-pulse"></div>
        <div className="text-slate-400 text-sm animate-pulse">HoopsAtlas wordt geladen...</div>
        <button
          onClick={() => setAuthLoading(false)}
          className="mt-8 text-slate-500 text-xs hover:text-slate-300 transition-colors"
        >
          Duurt het te lang? Klik hier.
        </button>
      </div>
    );
  }

  const contextValue = {
    user, userProfile,
    drills, publicDrills, trainingSessions, publicSessions, myTeams,
    unreadCount, partnerBannerEnabled, globalAlert,
    view: nav.view, authMode: nav.authMode,
    selectedDrillId: nav.selectedDrillId,
    selectedTeam: nav.selectedTeam, setSelectedTeam: nav.setSelectedTeam,
    selectedStreamId: nav.selectedStreamId,
    initialMatchCode: nav.initialMatchCode,
    chatInitialTab: nav.chatInitialTab, setChatInitialTab: nav.setChatInitialTab,
    chatInitialPlayer: nav.chatInitialPlayer, setChatInitialPlayer: nav.setChatInitialPlayer,
    onNavigate: nav.handleNavigate,
    searchQuery, setSearchQuery,
    filterFocus, setFilterFocus,
    filterLevel, setFilterLevel,
    showFavoritesOnly, setShowFavoritesOnly,
    sortBy, setSortBy,
    activeDrill,
    onSaveDrill: handleSaveDrill,
    onTogglePinDrill: handleTogglePinDrill,
    onTogglePinSession: handleTogglePinSession,
    onAddToPlaybook: setDrillToAddToPlaybook,
    onUpgradeRequest: subscription.handleUpgradeRequest,
    onClearInitialCode: () => nav.setInitialMatchCode(null),
    isSyncingSubscription: subscription.isSyncingSubscription,
    onSyncSubscription: () => subscription.syncSubscriptionStatus(true),
    guestPlan: subscription.guestPlan,
  };

  const showSidebar = !!user && !hideNav;

  const mainPtMobile = hideNav
    ? 'pt-0'
    : nav.view === 'home'
      ? 'pt-0'
      : (partnerBannerEnabled && globalAlert)
        ? 'pt-52'
        : (partnerBannerEnabled || globalAlert)
          ? 'pt-36'
          : 'pt-14';

  const mainPtDesktop = hideNav
    ? 'lg:pt-0'
    : (partnerBannerEnabled && globalAlert)
      ? 'lg:pt-[148px]'
      : (partnerBannerEnabled || globalAlert)
        ? 'lg:pt-[92px]'
        : 'lg:pt-[52px]';

  return (
    <ErrorBoundary>
    <AppProvider value={contextValue}>
    <div className={`flex flex-col min-h-screen bg-ha-bg text-ha-textHi ${showSidebar ? 'lg:pl-56' : ''}`}>
      <Toaster />
      <AdSenseHandler isPaid={isPaid} />

      {showSidebar && (
        <SideNav
          currentView={nav.view}
          onNavigate={nav.handleNavigate}
          userProfile={userProfile}
          selectedTeam={nav.selectedTeam}
          myTeams={myTeams}
        />
      )}

      {!hideNav && (
        <GlobalBanners
          partnerBannerEnabled={partnerBannerEnabled}
          globalAlert={globalAlert}
          onPartnerClick={handlePartnerClick}
        />
      )}

      {!hideNav && (
        <AppHeader
          user={user}
          partnerBannerEnabled={partnerBannerEnabled}
          globalAlert={globalAlert}
          onNavigate={nav.handleNavigate}
          unreadCount={unreadCount}
        />
      )}

      <main className={`flex-1 ${mainPtMobile} ${mainPtDesktop} ${hideNav ? 'pb-0' : 'pb-40 lg:pb-8'} w-full`}>
        <AppRouter />

        {!isPaid && !hideNav && (
          <div className="px-4 max-w-5xl mx-auto py-8">
            <AdBanner adSlot="app_main_bottom" isPaid={isPaid} onUpgrade={() => nav.handleNavigate('settings')} />
          </div>
        )}
      </main>

      {(Capacitor.getPlatform() === 'web' || subscription.checkoutPlan === 'gameAnalysis') && !!subscription.checkoutPlan && (subscription.checkoutPlan !== 'gameAnalysis' || gameAnalysisConfirmed) && (
        <CheckoutModal
          isOpen={true}
          onClose={() => { subscription.setCheckoutPlan(null); setGameAnalysisConfirmed(false); }}
          plan={subscription.checkoutPlan || 'basic'}
          price={subscription.checkoutPrice}
          period={subscription.checkoutCycle}
          lookupKey={subscription.checkoutLookupKey}
          onSuccess={() => { subscription.setCheckoutPlan(null); setGameAnalysisConfirmed(false); subscription.setPaymentFeedback('success'); }}
          onNavigate={nav.handleNavigate}
        />
      )}

      {subscription.checkoutPlan === 'gameAnalysis' && !gameAnalysisConfirmed && (
        <GameAnalysisPaywall
          onClose={() => subscription.setCheckoutPlan(null)}
          onUpgrade={(cycle) => {
            subscription.setCheckoutCycle(cycle);
            setGameAnalysisConfirmed(true);
          }}
        />
      )}

      <PaywallModal
        isOpen={subscription.showPaywall}
        onClose={() => subscription.setShowPaywall(false)}
        onSuccess={() => {
          subscription.setShowPaywall(false);
          if (user) {
            subscription.syncSubscriptionStatus(true);
            const retryDelays = [2000, 5000, 10000];
            retryDelays.forEach(delay => {
              setTimeout(() => subscription.syncSubscriptionStatus(true), delay);
            });
          } else {
            subscription.refreshGuestPlan();
          }
        }}
        onWebFallback={() => subscription.setShowPaywall(false)}
        isLoggedIn={!!user}
        onRequestLogin={() => {
          subscription.setShowPaywall(false);
          nav.handleNavigate('auth', undefined, 'signup');
        }}
      />

      {!hideNav && (
        <div className="lg:hidden fixed bottom-10 left-1/2 -translate-x-1/2 w-[92%] max-w-5xl z-[60]">
          <BottomNav
            currentView={nav.view}
            onNavigate={nav.handleNavigate}
            userProfile={userProfile}
            unreadCount={unreadCount}
          />
        </div>
      )}

      {drillToAddToPlaybook && user && (
        <AddToPlaybookModal
          drillId={drillToAddToPlaybook}
          trainingSessions={trainingSessions}
          user={user}
          userProfile={userProfile}
          onClose={() => setDrillToAddToPlaybook(null)}
        />
      )}

      {shareToImport && (
        <ImportModal
          shareData={shareToImport}
          onClose={() => setShareToImport(null)}
          onImported={() => {
            // Clean up URL after import
            window.history.replaceState({}, '', window.location.pathname);
          }}
        />
      )}
      <LanguagePicker
        show={showLanguagePicker}
        onSelect={handleLanguagePicked}
      />
      <OnboardingTutorial
        show={showOnboarding}
        onDone={() => setShowOnboarding(false)}
        onCreateDrill={() => nav.handleNavigate('create')}
      />
    </div>
    </AppProvider>
    </ErrorBoundary>
  );
};

export default App;
