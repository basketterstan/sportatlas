
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, doc, updateDoc, setDoc, onSnapshot, writeBatch, deleteDoc, addDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, handleFirestoreError, OperationType } from '../../utils/firebase';
import { UserProfile, Drill, CancellationRequest, SubscriptionPlan, Feedback, FilmRequest } from '../../types';
import LeadManager from '../misc/LeadManager';

interface AdminDashboardProps {
  userProfile?: UserProfile | null;
  onBack: () => void;
  onOpenStudio: (drill?: Drill) => void;
  defaultTab?: AdminTab;
}

interface Stats {
  users: number;
  paidUsers: number;
  monthlySubscribers: number;
  yearlySubscribers: number;
  active24h: number;
  active7d: number;
  active30d: number;
  totalMRR: number;
  totalARR: number;
  projectedARR: number;
  drills: number;
  teams: number;
  newFeedback: number;
  newCancellations: number;
  newFilmRequests: number;
  totalReferrals: number;
  totalTesters: number;
  checkoutClicks: number;
  tierCounts: Record<string, number>;
  tierRevenue: Record<string, number>;
  tierRevenueBilling: Record<string, { monthly: number; yearly: number }>;
  basketVisionClicks: number;
  scrimmageHubClicks: number;
  topDrills: Drill[];
  latestIosVersion?: string;
  latestIosIpaUrl?: string;
}

type AdminTab = 'personnel' | 'partners' | 'partner-apps' | 'games' | 'broadcast' | 'push' | 'requests' | 'film-reqs' | 'leads' | 'studio' | 'metrics' | 'feedback' | 'releases' | 'changelog' | 'finance' | 'mailing';

interface ExpenseItem {
  id: string;
  label: string;
  amount: number;
  type: 'monthly' | 'yearly' | 'once';
}
type GrowthRange = '7d' | '30d' | '90d' | 'all';

const PLAN_PRICES_MONTHLY: Record<string, number> = {
  'free': 0,
  'basic': 9.99,
  'pro': 14.99,
  'club10': 99,
  'club20': 169,
  'clubUnlimited': 249
};

const PLAN_PRICES_YEARLY: Record<string, number> = {
  'free': 0,
  'basic': 99.99,
  'pro': 149.00,
  'club10': 999,
  'club20': 1699,
  'clubUnlimited': 2499
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ userProfile, onBack, onOpenStudio, defaultTab }) => {
  const [stats, setStats] = useState<Stats>({
    users: 0, paidUsers: 0, monthlySubscribers: 0, yearlySubscribers: 0,
    active24h: 0, active7d: 0, active30d: 0, totalMRR: 0, totalARR: 0, projectedARR: 0,
    drills: 0, teams: 0, newFeedback: 0, newCancellations: 0, newFilmRequests: 0,
    totalReferrals: 0, totalTesters: 0, checkoutClicks: 0, tierCounts: {}, tierRevenue: {},
    tierRevenueBilling: {}, basketVisionClicks: 0, scrimmageHubClicks: 0, topDrills: []
  });
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userDrillCounts, setUserDrillCounts] = useState<Record<string, number>>({});
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [filmRequests, setFilmRequests] = useState<FilmRequest[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [partnerSignals, setPartnerSignals] = useState<any[]>([]);
  const [checkoutSignals, setCheckoutSignals] = useState<any[]>([]);
  const [onboardingSignals, setOnboardingSignals] = useState<any[]>([]);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [partnerApplications, setPartnerApplications] = useState<any[]>([]);
  const [assignedCodes, setAssignedCodes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultTab || 'personnel');
  const [userSearchQuery, setSearchQuery] = useState('');
  
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterTester, setFilterTester] = useState<string>('all');
  
  const [growthRange, setGrowthRange] = useState<GrowthRange>('30d');
  const [selectedDataIndex, setSelectedDataIndex] = useState<number | null>(null);
  
  const [selectedUserUids, setSelectedUserUids] = useState<Set<string>>(new Set());
  const [filterCheckoutOnly, setFilterCheckoutOnly] = useState(false);
  const [filterActive24h, setFilterActive24h] = useState(false);
  const [filterMinVisits, setFilterMinVisits] = useState(0);
  const [filterSport, setFilterSport] = useState<string>('all');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [mailingSearchQuery, setMailingSearchQuery] = useState('');

  const [globalAlert, setGlobalAlert] = useState<string>("");
  const [isSyncingAlert, setIsSyncingAlert] = useState(false);
  const [partnerBannerEnabled, setPartnerBannerEnabled] = useState(false);

  // Push Broadcast state
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [isSendingPush, setIsSendingPush] = useState(false);

  // Finance / P&L state
  const [expenses, setExpenses] = useState<ExpenseItem[]>([
    { id: 'spaceship', label: 'Spaceship', amount: 0, type: 'monthly' },
    { id: 'android_studio', label: 'Android Studio', amount: 0, type: 'yearly' },
    { id: 'apple_developer', label: 'Apple Developer', amount: 0, type: 'yearly' },
    { id: 'claude', label: 'Claude (AI)', amount: 0, type: 'monthly' },
    { id: 'navity', label: 'Navity', amount: 0, type: 'monthly' },
    { id: 'sportatlas', label: 'Sportatlas', amount: 0, type: 'once' },
    { id: 'api_keys', label: 'API Keys', amount: 0, type: 'monthly' },
  ]);
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseType, setNewExpenseType] = useState<'monthly' | 'yearly' | 'once'>('monthly');
  const [isSavingExpenses, setIsSavingExpenses] = useState(false);

  // Lifetime revenue tracking
  const [lifetimeRevenue, setLifetimeRevenue] = useState(126.08);
  const [revenueHistory, setRevenueHistory] = useState<{ month: string; amount: number; expenses: number; net?: number; autoClose?: boolean }[]>([]);
  const [isClosingMonth, setIsClosingMonth] = useState(false);

  useEffect(() => {
    if (!userProfile?.isAdmin) return;

    const errorHandler = (collectionName: string, err: any) => {
      handleFirestoreError(err, OperationType.GET, collectionName);
      if (err.code === 'permission-denied') {
        setPermissionError(`No access to ${collectionName}. Check Firestore Security Rules.`);
      }
    };

    const unsubAlert = onSnapshot(doc(db, "system_config", "announcements"), (snap) => {
      if (snap.exists()) setGlobalAlert(snap.data().message || "");
    }, (err) => errorHandler("Announcements", err));

    const unsubReleases = onSnapshot(doc(db, "system_config", "releases"), (snap) => {
      if (snap.exists()) {
        setStats(prev => ({ 
          ...prev, 
          latestIosVersion: snap.data().iosVersion,
          latestIosIpaUrl: snap.data().iosIpaUrl
        }));
      }
    }, (err) => errorHandler("Releases Config", err));

    const unsubFeatures = onSnapshot(doc(db, "system_config", "features"), (snap) => {
      if (snap.exists()) setPartnerBannerEnabled(!!snap.data().partnerBanner);
    }, (err) => errorHandler("Features Config", err));

    const unsubPartner = onSnapshot(doc(db, "system_config", "partner_clicks"), (snap) => {
      if (snap.exists()) setStats(prev => ({ ...prev, basketVisionClicks: snap.data().basketVisionClicks || 0 }));
    }, (err) => errorHandler("Partner Config", err));

    const unsubDrills = onSnapshot(collection(db, "drills"), (snap) => {
      const counts: Record<string, number> = {};
      const allDrills: Drill[] = [];
      snap.forEach(d => {
        const data = d.data();
        const drill = { ...data, id: d.id } as Drill;
        allDrills.push(drill);
        const uid = data.userId || data.ownerId || data.uId || data.authorUid;
        if (uid) {
          counts[uid] = (counts[uid] || 0) + 1;
        }
      });
      const top = allDrills
        .filter(d => d.isPublic)
        .sort((a, b) => (b.likes || 0) - (a.likes || 0))
        .slice(0, 10);

      setUserDrillCounts(counts);
      setStats(prev => ({ ...prev, drills: snap.size, topDrills: top }));
    }, (err) => errorHandler("Drills Collection", err));

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: UserProfile[] = [];
      let paidCount = 0; 
      let dau = 0; let wau = 0; let mau = 0;
      let mrr = 0; let arr = 0; let totalRefs = 0; let testerCount = 0;
      let monthlyCount = 0; let yearlyCount = 0;
      const tiers: Record<string, number> = { 'free': 0, 'basic': 0, 'pro': 0, 'club10': 0, 'club20': 0, 'clubUnlimited': 0 };
      const revenues: Record<string, number> = { 'basic': 0, 'pro': 0, 'club10': 0, 'club20': 0, 'clubUnlimited': 0 };
      const revBilling: Record<string, { monthly: number; yearly: number }> = {};
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const SEVEN_DAYS = 7 * ONE_DAY;
      const THIRTY_DAYS = 30 * ONE_DAY;

      snap.forEach((d) => {
        const u = { ...d.data(), uid: d.id } as UserProfile;
        list.push(u);
        const plan = u.plan || 'free';
        if (tiers[plan] !== undefined) tiers[plan]++;
        if (u.referredBy) totalRefs++;
        if (u.isTester) testerCount++;

        const lastActive = u.lastActiveAt || 0;
        if (now - lastActive < ONE_DAY) dau++;
        if (now - lastActive < SEVEN_DAYS) wau++;
        if (now - lastActive < THIRTY_DAYS) mau++;

        const isPaid = ((u.subscriptionActive || u.isSubscribed) || (u.proExpiresAt && u.proExpiresAt > Date.now())) && !u.isTester;
        if (plan !== 'free' && isPaid) {
          paidCount++;
          const isYearly = u.billingPeriod === 'yearly';
          if (isYearly) {
            yearlyCount++;
            const yearlyPrice = PLAN_PRICES_YEARLY[plan] || 0;
            const monthlyEquiv = yearlyPrice / 12;
            mrr += monthlyEquiv;
            arr += yearlyPrice;
            revenues[plan] = (revenues[plan] || 0) + monthlyEquiv;
            if (!revBilling[plan]) revBilling[plan] = { monthly: 0, yearly: 0 };
            revBilling[plan].yearly += yearlyPrice;
          } else {
            monthlyCount++;
            const monthlyPrice = PLAN_PRICES_MONTHLY[plan] || 0;
            mrr += monthlyPrice;
            arr += monthlyPrice * 12;
            revenues[plan] = (revenues[plan] || 0) + monthlyPrice;
            if (!revBilling[plan]) revBilling[plan] = { monthly: 0, yearly: 0 };
            revBilling[plan].monthly += monthlyPrice;
          }
        }
      });
      setAllUsers(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      setStats(prev => ({ ...prev, users: snap.size, paidUsers: paidCount, monthlySubscribers: monthlyCount, yearlySubscribers: yearlyCount, active24h: dau, active7d: wau, active30d: mau, totalMRR: mrr, totalARR: arr, projectedARR: arr, totalReferrals: totalRefs, totalTesters: testerCount, tierCounts: tiers, tierRevenue: revenues, tierRevenueBilling: revBilling }));
      setLoading(false);
    }, (err) => errorHandler("User Collection", err));

    const unsubCancels = onSnapshot(collection(db, "cancellation_requests"), (snap) => {
      const list: CancellationRequest[] = []; let pendingCount = 0;
      snap.forEach((d) => { const r = { ...d.data(), id: d.id } as CancellationRequest; list.push(r); if (r.status === 'pending') pendingCount++; });
      setCancellationRequests(list.sort((a, b) => b.createdAt - a.createdAt));
      setStats(prev => ({ ...prev, newCancellations: pendingCount }));
    }, (err) => errorHandler("Cancel Requests", err));

    const unsubFilm = onSnapshot(collection(db, "film_requests"), (snap) => {
      const list: FilmRequest[] = []; let pendingCount = 0;
      snap.forEach((d) => { const r = { ...d.data(), id: d.id } as FilmRequest; list.push(r); if (r.status === 'pending') pendingCount++; });
      setFilmRequests(list.sort((a, b) => b.createdAt - a.createdAt));
      setStats(prev => ({ ...prev, newFilmRequests: pendingCount }));
    }, (err) => errorHandler("Film Requests", err));

    const unsubFeedback = onSnapshot(collection(db, "feedback"), (snap) => {
      const list: Feedback[] = []; let newCount = 0;
      snap.forEach((d) => { const item = { ...d.data(), id: d.id } as Feedback; list.push(item); if (item.status === 'new') newCount++; });
      setFeedbackList(list.sort((a, b) => b.createdAt - a.createdAt));
      setStats(prev => ({ ...prev, newFeedback: newCount }));
    }, (err) => errorHandler("Feedback Collection", err));

    const unsubSignals = onSnapshot(collection(db, "partner_signals"), (snap) => {
      const list: any[] = [];
      let scrimmageCount = 0;
      snap.forEach(d => {
        const data = d.data();
        list.push(data);
        if (data.source === 'scrimmage-hub') scrimmageCount++;
      });
      setPartnerSignals(list);
      setStats(prev => ({ ...prev, scrimmageHubClicks: scrimmageCount }));
    }, (err) => errorHandler("Partner Signals", err));

    const unsubCheckoutSignals = onSnapshot(collection(db, "checkout_signals"), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push(d.data()));
      setCheckoutSignals(list);
      setStats(prev => ({ ...prev, checkoutClicks: snap.size }));
    }, (err) => errorHandler("Checkout Signals", err));

    const unsubOnboarding = onSnapshot(collection(db, "onboarding_signals"), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push(d.data()));
      setOnboardingSignals(list.sort((a, b) => b.timestamp - a.timestamp));
    }, (err) => errorHandler("Onboarding Signals", err));

    const unsubMatches = onSnapshot(collection(db, "matches"), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setAllMatches(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (err) => errorHandler("Matches Collection", err));

    const unsubPartnerApps = onSnapshot(collection(db, "partner_applications"), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setPartnerApplications(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (err) => errorHandler("Partner Applications", err));

    const unsubExpenses = onSnapshot(doc(db, "system_config", "expenses"), (snap) => {
      if (snap.exists() && snap.data().items) {
        setExpenses(snap.data().items);
      }
    }, (err) => errorHandler("Expenses Config", err));

    const unsubFinance = onSnapshot(doc(db, "system_config", "lifetime_finance"), (snap) => {
      if (snap.exists()) {
        setLifetimeRevenue(snap.data().totalRevenue ?? 126.08);
        setRevenueHistory(snap.data().history ?? []);
      }
    }, (err) => errorHandler("Lifetime Finance", err));

    return () => { unsubAlert(); unsubUsers(); unsubCancels(); unsubFilm(); unsubFeedback(); unsubPartner(); unsubFeatures(); unsubSignals(); unsubCheckoutSignals(); unsubOnboarding(); unsubDrills(); unsubMatches(); unsubPartnerApps(); unsubExpenses(); unsubFinance(); };
  }, [userProfile]);

  const togglePartnerBanner = async () => {
    try {
      await setDoc(doc(db, "system_config", "features"), { partnerBanner: !partnerBannerEnabled }, { merge: true });
    } catch (e) { alert("Failed to toggle feature."); }
  };

  const saveExpenses = async () => {
    setIsSavingExpenses(true);
    try {
      await setDoc(doc(db, "system_config", "expenses"), { items: expenses, updatedAt: Date.now() });
    } catch (e) { alert("Save expenses failed."); } finally { setIsSavingExpenses(false); }
  };

  const addExpense = () => {
    if (!newExpenseLabel.trim() || !newExpenseAmount) return;
    const newItem: ExpenseItem = { id: Date.now().toString(), label: newExpenseLabel.trim(), amount: parseFloat(newExpenseAmount) || 0, type: newExpenseType };
    setExpenses(prev => [...prev, newItem]);
    setNewExpenseLabel('');
    setNewExpenseAmount('');
  };

  const removeExpense = (id: string) => setExpenses(prev => prev.filter(e => e.id !== id));

  const updateExpenseAmount = (id: string, val: string) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, amount: parseFloat(val) || 0 } : e));
  };

  const updateExpenseType = (id: string, type: 'monthly' | 'yearly' | 'once') => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, type } : e));
  };

  const closeMonth = async (monthlyRevenue: number, monthlyBurn: number) => {
    const netThisMonth = monthlyRevenue - monthlyBurn;
    if (!window.confirm(`Maand afsluiten?\n\nInkomsten: €${monthlyRevenue.toFixed(2)}\nUitgaven: €${monthlyBurn.toFixed(2)}\nNetto: ${netThisMonth >= 0 ? '+' : ''}€${netThisMonth.toFixed(2)}\n\nDit voegt €${netThisMonth.toFixed(2)} toe aan je lifetime totaal.`)) return;
    setIsClosingMonth(true);
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const newTotal = lifetimeRevenue + netThisMonth;
      const newEntry = { month: monthKey, amount: monthlyRevenue, expenses: monthlyBurn, net: netThisMonth, autoClose: false };
      const updatedHistory = [...revenueHistory.filter(h => h.month !== monthKey), newEntry].sort((a, b) => a.month.localeCompare(b.month));
      await setDoc(doc(db, "system_config", "lifetime_finance"), {
        totalRevenue: newTotal,
        history: updatedHistory,
        lastUpdated: Date.now()
      });
    } catch (e) { alert("Opslaan mislukt."); } finally { setIsClosingMonth(false); }
  };

  const updateLifetimeRevenue = async (newVal: number) => {
    try {
      await setDoc(doc(db, "system_config", "lifetime_finance"), {
        totalRevenue: newVal,
        history: revenueHistory,
        lastUpdated: Date.now()
      });
    } catch (e) { alert("Opslaan mislukt."); }
  };

  // Auto-close any past months not yet in history
  useEffect(() => {
    if (loading || !stats.totalMRR && stats.totalMRR !== 0) return;

    const now = new Date();
    // Build list of months from Jan 2025 up to (but not including) current month
    const missingMonths: string[] = [];
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    while (true) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      if (key >= thisMonth) break;
      if (!revenueHistory.find(h => h.month === key)) missingMonths.push(key);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    if (missingMonths.length === 0) return;

    // Calculate current monthly burn from stored expenses
    const monthlyExp = expenses.filter(e => e.type === 'monthly').reduce((s, e) => s + e.amount, 0);
    const yearlyExp = expenses.filter(e => e.type === 'yearly').reduce((s, e) => s + e.amount, 0);
    const burn = monthlyExp + yearlyExp / 12;
    const rev = stats.totalMRR;
    const net = rev - burn;

    const newEntries = missingMonths.map(month => ({ month, amount: rev, expenses: burn, net, autoClose: true }));
    const updatedHistory = [...revenueHistory, ...newEntries].sort((a, b) => a.month.localeCompare(b.month));
    const addedNet = net * missingMonths.length;
    const newTotal = lifetimeRevenue + addedNet;

    setDoc(doc(db, "system_config", "lifetime_finance"), {
      totalRevenue: newTotal,
      history: updatedHistory,
      lastUpdated: Date.now(),
      lastAutoClose: missingMonths[missingMonths.length - 1]
    }).catch(() => {});
  }, [loading, revenueHistory.length, expenses.length]);

  const handleUpdateUser = async () => {
    if (!editingUser?.uid) return;
    setIsSavingUser(true);
    try {
      const isSubscribed = editingUser.plan !== 'free' || (editingUser.proExpiresAt && editingUser.proExpiresAt > Date.now());
      await updateDoc(doc(db, 'users', editingUser.uid), {
        plan: editingUser.plan,
        isAdmin: !!editingUser.isAdmin,
        isTester: !!editingUser.isTester,
        subscriptionActive: !!isSubscribed,
        isSubscribed: !!isSubscribed,
        proExpiresAt: editingUser.proExpiresAt || null,
        billingPeriod: editingUser.billingPeriod || null,
        subscriptionStartedAt: editingUser.subscriptionStartedAt || null,
        updatedAt: Date.now()
      });
      setEditingUser(null);
    } catch (e) { alert("Save failed."); } finally { setIsSavingUser(false); }
  };

  const handleDeleteUser = async () => {
    if (!editingUser?.uid) return;
    const confirmed = window.confirm(
      `Permanent verwijderen: ${editingUser.name} (${editingUser.email})?\n\nDit verwijdert het account volledig uit Firebase Auth en Firestore. Dit kan niet ongedaan worden.`
    );
    if (!confirmed) return;
    setIsDeletingUser(true);
    try {
      const fns = getFunctions();
      const deleteUserAccount = httpsCallable(fns, 'deleteUserAccount');
      await deleteUserAccount({ uid: editingUser.uid });
      setEditingUser(null);
      alert(`Account van ${editingUser.name} is verwijderd.`);
    } catch (e: any) {
      alert(`Verwijderen mislukt: ${e?.message || 'Onbekende fout'}`);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleSendPushBroadcast = async () => {
    if (!pushTitle || !pushBody) return;
    setIsSendingPush(true);
    try {
      const tokens = allUsers.filter(u => u.fcmToken).map(u => u.fcmToken);
      if (tokens.length === 0) { alert("No active tokens found."); return; }
      await addDoc(collection(db, "push_queue"), { title: pushTitle, body: pushBody, tokens: tokens, status: 'pending', createdAt: Date.now() });
      alert(`Push message for ${tokens.length} users queued.`);
      setPushTitle(""); setPushBody("");
    } catch (e) { alert("Push failed."); }
    finally { setIsSendingPush(false); }
  };

  const filteredPersonnel = useMemo(() => {
    const q = userSearchQuery.toLowerCase().trim();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let list = allUsers;

    if (filterPlan !== 'all') {
      if (filterPlan === 'club') {
        list = list.filter(u => u.plan?.toLowerCase().startsWith('club'));
      } else {
        list = list.filter(u => (u.plan || 'free').toLowerCase() === filterPlan);
      }
    }

    if (filterTester === 'testers') list = list.filter(u => u.isTester);
    if (filterTester === 'non-testers') list = list.filter(u => !u.isTester);

    if (filterCheckoutOnly) {
      const clickerUids = new Set(checkoutSignals.map(s => s.userId));
      list = list.filter(u => clickerUids.has(u.uid!));
    }

    if (filterActive24h) {
      list = list.filter(u => u.lastActiveAt && now - u.lastActiveAt < ONE_DAY);
      list = [...list].sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
    }

    if (filterMinVisits > 0) {
      list = list.filter(u => (u.visitCount || 0) >= filterMinVisits);
      if (!filterActive24h) {
        list = [...list].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
      }
    }

    if (filterSport !== 'all') {
      list = list.filter(u => (u.sport || '') === filterSport);
    }

    if (!q) return list;
    return list.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }, [allUsers, userSearchQuery, filterPlan, filterTester, filterCheckoutOnly, filterActive24h, filterMinVisits, filterSport, checkoutSignals]);

  const partnerReport = useMemo(() => {
    const stats: Record<string, { clicks: number, users: number }> = {};
    partnerSignals.forEach(s => {
      if (s.source) {
        if (!stats[s.source]) stats[s.source] = { clicks: 0, users: 0 };
        stats[s.source].clicks++;
      }
    });
    allUsers.forEach(u => {
      const ref = ((u as any).partnerRef || '').toLowerCase();
      if (ref) {
        if (!stats[ref]) stats[ref] = { clicks: 0, users: 0 };
        stats[ref].users++;
      }
    });
    return Object.entries(stats).sort((a, b) => b[1].users - a[1].users);
  }, [allUsers, partnerSignals]);

  const toggleUserSelection = (uid: string) => {
    const newSelection = new Set(selectedUserUids);
    if (newSelection.has(uid)) newSelection.delete(uid);
    else newSelection.add(uid);
    setSelectedUserUids(newSelection);
  };

  const selectAllFiltered = () => {
    if (selectedUserUids.size === filteredPersonnel.length) setSelectedUserUids(new Set());
    else setSelectedUserUids(new Set(filteredPersonnel.map(u => u.uid!)));
  };

  const selectNext50 = () => {
    const currentSelected = new Set(selectedUserUids);
    let added = 0;
    for (const u of filteredPersonnel) {
      if (!currentSelected.has(u.uid!)) {
        currentSelected.add(u.uid!);
        added++;
      }
      if (added >= 50) break;
    }
    setSelectedUserUids(currentSelected);
  };

  const copySelectedEmails = () => {
    const selectedEmails = allUsers
      .filter(u => selectedUserUids.has(u.uid!))
      .map(u => u.email)
      .filter(Boolean);
    
    const emailString = selectedEmails.join(', ');
    
    if (emailString) {
      navigator.clipboard.writeText(emailString);
      alert(`Copied ${selectedEmails.length} emails to clipboard.`);
    } else {
      alert("No emails to copy.");
    }
  };

  const downloadSelectedCSV = () => {
    const selectedUsers = allUsers.filter(u => selectedUserUids.has(u.uid!));
    if (selectedUsers.length === 0) {
      alert("No users selected.");
      return;
    }

    const headers = ['Name', 'Email', 'Plan', 'Role', 'Sport', 'Created At', 'Last Active', 'Is Tester', 'Is Admin'];
    const rows = selectedUsers.map(u => [
      u.name || '',
      u.email || '',
      u.plan || 'free',
      u.role || 'coach',
      u.sport || '',
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
      u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : '',
      u.isTester ? 'Yes' : 'No',
      u.isAdmin ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sportatlas_personnel_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const mailingList = useMemo(() => {
    return allUsers.filter(u => u.isSubscribed !== false);
  }, [allUsers]);

  const filteredMailingList = useMemo(() => {
    if (!mailingSearchQuery.trim()) return mailingList;
    const q = mailingSearchQuery.toLowerCase();
    return mailingList.filter(u => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
  }, [mailingList, mailingSearchQuery]);

  const downloadMailingCSV = () => {
    const rows = filteredMailingList.map(u => [
      u.name || '',
      u.email || '',
      u.plan?.toUpperCase() || 'FREE',
      u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
    ]);
    const header = ['Name', 'Email', 'Plan', 'Registered'];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sportatlas_mailing_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeFromMailingList = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isSubscribed: false });
    } catch (e) { alert("Verwijderen uit mailinglijst mislukt."); }
  };

  const growthData = useMemo(() => {
    const now = new Date(); let startDate = new Date();
    if (growthRange === '7d') startDate.setDate(now.getDate() - 7);
    else if (growthRange === '30d') startDate.setDate(now.getDate() - 30);
    else if (growthRange === '90d') startDate.setDate(now.getDate() - 90);
    else startDate = new Date(2025, 0, 1); 
    const filtered = allUsers.filter(u => u.createdAt && u.createdAt >= startDate.getTime());
    const sorted = [...filtered].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const dailyMap: Record<string, number> = {};
    sorted.forEach(u => { const dateKey = new Date(u.createdAt!).toISOString().split('T')[0]; dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1; });
    const labels = Object.keys(dailyMap).sort(); const values = labels.map(l => dailyMap[l]);
    let runningTotal = allUsers.length - filtered.length; 
    const cumulativeValues = values.map(v => { runningTotal += v; return runningTotal; });
    return { labels, values, cumulativeValues };
  }, [allUsers, growthRange]);

  const handleBroadcastAlert = async (clear: boolean = false) => {
    setIsSyncingAlert(true);
    try {
      await setDoc(doc(db, "system_config", "announcements"), { message: clear ? "" : globalAlert, updatedAt: Date.now(), author: userProfile?.name || 'Admin' });
      if (clear) setGlobalAlert("");
    } catch (e) { alert("Broadcast failed."); } finally { setIsSyncingAlert(false); }
  };

  const updateRequestStatus = async (collectionName: string, id: string, status: string) => {
    try { await updateDoc(doc(db, collectionName, id), { status }); } catch (e) { alert("Status update failed."); }
  };

  const deleteRequest = async (collectionName: string, id: string) => {
    if (window.confirm("Permanently delete this record?")) {
      try { await deleteDoc(doc(db, collectionName, id)); } catch (e) { alert("Delete failed."); }
    }
  };

  const renderGrowthChart = () => {
    const { cumulativeValues, labels } = growthData;
    if (cumulativeValues.length < 2) return <div className="h-40 flex items-center justify-center text-[10px] text-slate-700 font-black uppercase tracking-widest">Awaiting more data points...</div>;
    const maxVal = Math.max(...cumulativeValues, 1); const minVal = Math.min(...cumulativeValues); const range = maxVal - minVal || 1;
    const chartHeight = 160; const chartWidth = 800;
    const points = cumulativeValues.map((v, i) => {
      const x = (i / (cumulativeValues.length - 1)) * chartWidth;
      const y = chartHeight - ((v - minVal) / range) * chartHeight;
      return { x, y, v, date: labels[i] };
    });
    const pathPoints = points.map(p => `${p.x},${p.y}`).join(' '); 
    const areaPoints = `0,${chartHeight} ${pathPoints} ${chartWidth},${chartHeight}`;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <div className="space-y-0.5">
              <h4 className="text-sm font-black italic uppercase text-white">Personnel Expansion</h4>
              <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Cumulative User Growth</p>
           </div>
           <div className="flex gap-1.5 bg-ha-bg p-1 rounded-xl border border-slate-900">
              {(['7d', '30d', '90d', 'all'] as GrowthRange[]).map(r => (
                <button key={r} onClick={() => { setGrowthRange(r); setSelectedDataIndex(null); }} className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${growthRange === r ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-white'}`}>{r}</button>
              ))}
           </div>
        </div>
        <div className="relative h-56 w-full group select-none">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
            {[0, 0.25, 0.5, 0.75, 1].map(p => (<line key={p} x1="0" y1={chartHeight * p} x2={chartWidth} y2={chartHeight * p} stroke="#1e293b" strokeWidth="1" strokeDasharray="4,4" />))}
            <polyline points={areaPoints} fill="url(#growthGradient)" />
            <polyline points={pathPoints} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            
            {points.map((p, idx) => {
              const isSelected = selectedDataIndex === idx;
              return (
                <React.Fragment key={idx}>
                  {isSelected && (
                    <g className="animate-in fade-in zoom-in duration-300">
                      <line x1={p.x} y1="0" x2={p.x} y2={chartHeight} stroke="#22d3ee" strokeWidth="1" strokeDasharray="2,2" />
                      <circle cx={p.x} cy={p.y} r="6" fill="#22d3ee" className="animate-pulse" />
                      <rect x={p.x - 35} y={p.y - 35} width="70" height="25" rx="4" fill="#0E1013" stroke="#22d3ee" strokeWidth="1" />
                      <text x={p.x} y={p.y - 20} textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900" className="italic">{p.v}</text>
                      <text x={p.x} y={p.y + 20} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="900" className="uppercase">{p.date}</text>
                    </g>
                  )}
                  <rect 
                    x={idx === 0 ? 0 : points[idx-1].x + (p.x - points[idx-1].x)/2} 
                    y="0" 
                    width={idx === points.length - 1 ? (chartWidth - p.x) + (p.x - points[idx-1].x)/2 : (points[idx+1].x - p.x)} 
                    height={chartHeight} 
                    fill="transparent" 
                    className="cursor-pointer" 
                    onClick={() => setSelectedDataIndex(idx)} 
                  />
                </React.Fragment>
              );
            })}
            
            <defs>
              <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-4xl font-black italic uppercase text-white tracking-tighter">Command <span className="text-ha-brand">HQ</span></h2>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Full Operational Surveillance</p>
        </div>
        <button onClick={onBack} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-xl active:scale-90"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      {permissionError && (
        <div className="mx-2 bg-red-600/10 border border-red-500/40 p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <p className="text-[10px] font-black uppercase text-red-500">{permissionError}</p>
           <button onClick={() => setPermissionError(null)} className="ml-auto text-red-500/60 hover:text-red-500 text-[10px] font-black uppercase tracking-widest">Close</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 px-2">
           <div className="bg-[#0b1224] border border-emerald-500/30 p-6 rounded-3xl space-y-1 shadow-xl"><p className="text-[7px] font-black uppercase text-emerald-500 tracking-widest">MRR</p><p className="text-3xl font-black italic text-emerald-400">€{stats.totalMRR.toFixed(2)}</p></div>
           <button 
             onClick={() => { setActiveTab('personnel'); setFilterCheckoutOnly(true); }}
             className="bg-[#0b1224] border border-indigo-500/40 p-6 rounded-3xl space-y-1 shadow-xl text-left hover:bg-indigo-500/5 transition-all active:scale-95"
           >
             <p className="text-[7px] font-black uppercase text-indigo-400 tracking-widest">Checkout Clicks</p>
             <p className="text-3xl font-black italic text-white">{stats.checkoutClicks}</p>
           </button>
           <div className="bg-[#0b1224] border border-indigo-500/40 p-6 rounded-3xl space-y-1 shadow-xl"><p className="text-[7px] font-black uppercase text-indigo-400 tracking-widest">Partner Intel</p><p className="text-3xl font-black italic text-white">{stats.basketVisionClicks}</p></div>
           <div className="bg-[#0b1224] border border-orange-500/40 p-6 rounded-3xl space-y-1 shadow-xl"><p className="text-[7px] font-black uppercase text-orange-400 tracking-widest">Scrimmage Hub</p><p className="text-3xl font-black italic text-white">{stats.scrimmageHubClicks}</p></div>
           <button 
             onClick={() => { setActiveTab('personnel'); setFilterPlan('all'); setFilterTester('all'); setFilterCheckoutOnly(false); }}
             className="bg-[#0b1224] border border-slate-800 p-6 rounded-3xl space-y-1 text-left hover:bg-white/5 transition-all active:scale-95"
           >
             <p className="text-[7px] font-black uppercase text-slate-600 tracking-widest">Personnel</p>
             <p className="text-3xl font-black italic text-white">{stats.users}</p>
           </button>
           <button
             onClick={() => { setActiveTab('personnel'); setFilterActive24h(true); }}
             className="bg-[#0b1224] border border-emerald-500/40 p-6 rounded-3xl space-y-1 text-left hover:bg-emerald-500/5 transition-all active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
           >
             <p className="text-[7px] font-black uppercase text-emerald-400 tracking-widest">Active (24h)</p>
             <p className="text-3xl font-black italic text-white">{stats.active24h}</p>
           </button>
           <div className="bg-[#0b1224] border border-red-500/20 p-6 rounded-3xl space-y-1"><p className="text-[7px] font-black uppercase text-red-500 tracking-widest">Feedback</p><p className="text-3xl font-black italic text-red-500">{stats.newFeedback}</p></div>
      </div>

      <div className="bg-[#0b1224] p-1.5 rounded-[1.5rem] border border-slate-800 flex gap-1.5 shadow-2xl overflow-x-auto no-scrollbar mx-2">
        {[
          { id: 'personnel', label: 'Personnel', icon: '👥' },
          { id: 'mailing', label: `Mailing (${mailingList.length})`, icon: '📧' },
          { id: 'partner-apps', label: `Partners (${partnerApplications.filter(a => a.status === 'pending').length})`, icon: '📝' },
          { id: 'games', label: 'Games Archive', icon: '🏀' },
          { id: 'partners', label: 'Partner Tracking', icon: '🤝' },
          { id: 'broadcast', label: 'Broadcast', icon: '📡' },
          { id: 'push', label: 'Push App', icon: '📱' },
          { id: 'film-reqs', label: `Filming (${stats.newFilmRequests})`, icon: '🎥' },
          { id: 'requests', label: `Cancellations (${stats.newCancellations})`, icon: '🛑' },
          { id: 'leads', label: 'Lead Hub', icon: '🎯' },
          { id: 'finance', label: 'Winst/Verlies', icon: '💰' },
          { id: 'metrics', label: 'Revenue', icon: '📊' },
          { id: 'studio', label: 'TikTok Studio', icon: '🎬' },
          { id: 'releases', label: 'Releases', icon: '🚀' },
          { id: 'changelog', label: 'Changelog', icon: '📋' },
          { id: 'feedback', label: `Intel (${stats.newFeedback})`, icon: '✉️' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as AdminTab)} className={`flex-1 min-w-[110px] py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
            <span className="text-sm">{tab.icon}</span><span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="px-2">
        {activeTab === 'personnel' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
             <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] space-y-6 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex-1 w-full">
                      <input type="text" value={userSearchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="SEARCH PERSONNEL..." className="w-full bg-ha-bg border border-slate-800 rounded-2xl py-5 px-6 text-[10px] font-black uppercase text-white outline-none focus:border-ha-brand shadow-inner" />
                    </div>
                    <div className="bg-slate-900 border border-indigo-500/20 px-6 py-4 rounded-2xl flex flex-col items-center shadow-lg">
                       <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">System Load</span>
                       <span className="text-2xl font-black italic text-indigo-400">{stats.drills} UNITS</span>
                    </div>
                </div>
                
                <div className="space-y-4 pt-2 border-t border-slate-900/50">
                   <div className="flex flex-col gap-3">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-1">Tier Protocol</p>
                      <div className="flex flex-wrap gap-2">
                         {['all', 'free', 'basic', 'pro', 'club'].map(p => (
                           <button 
                             key={p} 
                             onClick={() => setFilterPlan(p)}
                             className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterPlan === p ? 'bg-ha-brand border-ha-brand text-slate-950' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                           >
                             {p}
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="flex flex-col gap-3">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-1">Personnel Type</p>
                      <div className="flex flex-wrap gap-2">
                         {[
                           {id: 'all', label: 'All Units'}, 
                           {id: 'testers', label: 'Testers Only'}, 
                           {id: 'non-testers', label: 'Regular Fleet'}
                         ].map(t => (
                           <button 
                             key={t.id} 
                             onClick={() => setFilterTester(t.id)}
                             className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterTester === t.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                           >
                             {t.label}
                           </button>
                         ))}
                         <button
                           onClick={() => setFilterCheckoutOnly(!filterCheckoutOnly)}
                           className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterCheckoutOnly ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                         >
                           {filterCheckoutOnly ? '✓ Checkout Clickers' : 'Show Checkout Clickers'}
                         </button>
                         <button
                           onClick={() => setFilterActive24h(!filterActive24h)}
                           className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterActive24h ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                         >
                           {filterActive24h ? '● Online 24h' : 'Online 24h'}
                         </button>
                      </div>
                   </div>

                   <div className="flex flex-col gap-3">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-1">Bezoeken</p>
                      <div className="flex flex-wrap gap-2">
                        {[0, 5, 10, 20, 30, 50, 100].map(n => (
                          <button
                            key={n}
                            onClick={() => setFilterMinVisits(n)}
                            className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterMinVisits === n ? 'bg-violet-600 border-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                          >
                            {n === 0 ? 'Alle' : `${n}+`}
                          </button>
                        ))}
                      </div>
                   </div>

                   <div className="flex flex-col gap-3">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-1">Sport</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'all', label: 'All', emoji: '🌐' },
                          { id: 'basketball', label: 'Basketball', emoji: '🏀' },
                          { id: 'soccer', label: 'Soccer', emoji: '⚽' },
                          { id: 'volleyball', label: 'Volleyball', emoji: '🏐' },
                          { id: 'american-football', label: 'Am. Football', emoji: '🏈' },
                          { id: 'rugby', label: 'Rugby', emoji: '🏉' },
                          { id: 'tennis', label: 'Tennis', emoji: '🎾' },
                        ].map(s => (
                          <button
                            key={s.id}
                            onClick={() => setFilterSport(s.id)}
                            className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase transition-all border ${filterSport === s.id ? 'bg-sky-600 border-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]' : 'bg-ha-bg border border-slate-800 text-slate-600'}`}
                          >
                            {s.emoji} {s.label}
                          </button>
                        ))}
                      </div>
                   </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 px-2 pt-4 border-t border-slate-900">
                   <div className="flex items-center gap-4">
                      <button onClick={selectAllFiltered} className="text-[10px] font-black text-ha-brand uppercase tracking-widest flex items-center gap-2">
                        {selectedUserUids.size === filteredPersonnel.length ? 'Deselect All' : `Select All (${filteredPersonnel.length})`}
                      </button>
                      <button onClick={selectNext50} className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        Select +50
                      </button>
                   </div>
                   <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{selectedUserUids.size} Selected</span>
                      {selectedUserUids.size > 0 && (
                        <div className="flex gap-2">
                          <button onClick={copySelectedEmails} className="px-4 py-2 bg-slate-900 border border-slate-800 text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                            Copy Emails
                          </button>
                          <button onClick={downloadSelectedCSV} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                            Download CSV
                          </button>
                        </div>
                      )}
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 gap-4">
               {filteredPersonnel.map(u => (
                 <div key={u.uid} className={`bg-[#0b1224] border transition-all rounded-[2rem] p-6 flex items-center justify-between shadow-xl ${selectedUserUids.has(u.uid!) ? 'border-ha-brand/5 bg-ha-brand/5' : 'border-slate-800'}`}>
                   <div className="flex items-center gap-5">
                      <button onClick={() => toggleUserSelection(u.uid!)} className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${selectedUserUids.has(u.uid!) ? 'bg-ha-brand border-ha-brand' : 'bg-ha-bg border border-slate-800'}`}>
                         {selectedUserUids.has(u.uid!) && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-3 flex-wrap">
                           <p className="text-sm font-black text-white italic uppercase">{u.name}</p>
                           {u.lastActiveAt && (
                             <span className="bg-slate-800 text-slate-400 text-[6px] font-black px-1.5 py-0.5 rounded border border-slate-700 uppercase">
                               {(() => {
                                 const diff = Date.now() - u.lastActiveAt;
                                 const mins = Math.floor(diff / 60000);
                                 if (mins < 60) return `${mins}m geleden`;
                                 const hrs = Math.floor(mins / 60);
                                 if (hrs < 24) return `${hrs}u geleden`;
                                 const days = Math.floor(hrs / 24);
                                 return `${days}d geleden`;
                               })()}
                             </span>
                           )}
                           {u.visitCount !== undefined && u.visitCount > 0 && (
                             <span className="bg-violet-500/10 text-violet-400 text-[6px] font-black px-1.5 py-0.5 rounded border border-violet-500/20 uppercase">
                               {u.visitCount}x bezocht
                             </span>
                           )}
                           {onboardingSignals.some(s => s.userId === u.uid) && (
                             <span className="bg-indigo-500/10 text-indigo-300 text-[6px] font-black px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase">
                               {onboardingSignals.some(s => s.userId === u.uid && s.action === 'drill_clicked') ? '🏀 Drill CTA' : '✓ Tutorial'}
                             </span>
                           )}
                           {u.sport && (
                             <span className="bg-sky-500/10 text-sky-400 text-[6px] font-black px-1.5 py-0.5 rounded border border-sky-500/20 uppercase">
                               {u.sport === 'basketball' ? '🏀' : u.sport === 'soccer' ? '⚽' : u.sport === 'volleyball' ? '🏐' : u.sport === 'american-football' ? '🏈' : u.sport === 'rugby' ? '🏉' : u.sport === 'tennis' ? '🎾' : ''} {u.sport}
                             </span>
                           )}
                           {u.isTester && <span className="bg-amber-500/10 text-amber-500 text-[6px] font-black px-1.5 py-0.5 rounded border border-amber-500/20 uppercase">Tester</span>}
                           {u.billingPeriod === 'yearly' && <span className="bg-emerald-500/10 text-emerald-400 text-[6px] font-black px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase">Jaarlijks</span>}
                           {u.billingPeriod === 'monthly' && <span className="bg-indigo-500/10 text-indigo-400 text-[6px] font-black px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase">Maandelijks</span>}
                           <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 shadow-sm">
                             <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse"></div>
                             <span className="text-indigo-400 text-[9px] font-black uppercase tracking-widest">
                               {userDrillCounts[u.uid!] || 0} UNITS
                             </span>
                           </div>
                        </div>
                        <p className="text-[8px] text-slate-600 font-bold uppercase">
                          {u.email} • {u.plan?.toUpperCase() || 'FREE'}
                          {u.proExpiresAt && u.proExpiresAt > Date.now() && (
                            <span className="text-emerald-500 ml-2">
                              • EXPIRES: {new Date(u.proExpiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                        {(u as any).partnerRef && <p className="text-[7px] text-indigo-400 font-black uppercase tracking-widest">Source: {(u as any).partnerRef}</p>}
                        {u.subscriptionStartedAt && <p className="text-[7px] text-slate-600 font-black uppercase tracking-widest">Abonnement gestart: {new Date(u.subscriptionStartedAt).toLocaleDateString()}</p>}
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                     <button 
                       onClick={async () => {
                         const currentExpiry = u.proExpiresAt && u.proExpiresAt > Date.now() ? u.proExpiresAt : Date.now();
                         const expiry = currentExpiry + (7 * 24 * 60 * 60 * 1000);
                         try {
                           await updateDoc(doc(db, 'users', u.uid!), { 
                             plan: 'pro', 
                             proExpiresAt: expiry,
                             subscriptionActive: true,
                             isSubscribed: true,
                             updatedAt: Date.now() 
                           });
                         } catch (e) { alert("Quick grant failed."); }
                       }}
                       className="px-4 py-3 bg-ha-brand/10 border border-ha-brand/20 text-ha-brand hover:bg-ha-brand hover:text-slate-950 rounded-xl text-[9px] font-black uppercase transition-all"
                     >
                       1W Free
                     </button>
                     <button onClick={() => setEditingUser({ ...u })} className="px-6 py-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-[9px] font-black uppercase">Manage</button>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'mailing' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2.5rem] space-y-6 shadow-xl">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Mailing List</h3>
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
                    {mailingList.length} subscribers · {allUsers.length - mailingList.length} unsubscribed
                  </p>
                </div>
                <button
                  onClick={downloadMailingCSV}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  Export CSV ({filteredMailingList.length})
                </button>
              </div>
              <input
                type="text"
                value={mailingSearchQuery}
                onChange={e => setMailingSearchQuery(e.target.value)}
                placeholder="ZOEK OP NAAM OF EMAIL..."
                className="w-full bg-ha-bg border border-slate-800 rounded-2xl py-4 px-5 text-[10px] font-black uppercase text-white outline-none focus:border-ha-brand shadow-inner"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredMailingList.map(u => (
                <div key={u.uid} className="bg-[#0b1224] border border-slate-800 rounded-[2rem] p-5 flex items-center justify-between shadow-xl">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm font-black text-white italic uppercase">{u.name}</p>
                      <span className={`text-[6px] font-black px-1.5 py-0.5 rounded border uppercase ${u.plan === 'free' ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                        {u.plan?.toUpperCase() || 'FREE'}
                      </span>
                    </div>
                    <p className="text-[8px] text-slate-500 font-bold uppercase">{u.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`${u.name} (${u.email}) verwijderen uit mailinglijst?`)) {
                        removeFromMailingList(u.uid!);
                      }
                    }}
                    className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase transition-all"
                  >
                    Verwijder
                  </button>
                </div>
              ))}
              {filteredMailingList.length === 0 && (
                <div className="text-center py-16 text-slate-700 text-[10px] font-black uppercase tracking-widest">
                  Geen resultaten
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-10 animate-in fade-in">
             {/* Engagement Intelligence Summary */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0b1224] border border-emerald-500/20 p-8 rounded-[2.5rem] shadow-xl space-y-4">
                   <div className="flex justify-between items-start">
                      <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-500">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      </div>
                      <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20">DAU / MAU</span>
                   </div>
                   <div className="space-y-1">
                      <p className="text-4xl font-black italic text-white">{Math.round((stats.active24h / (stats.active30d || 1)) * 100)}%</p>
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Stickiness Factor</p>
                   </div>
                   <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                      <div>
                        <p className="text-[7px] font-black text-slate-500 uppercase">Weekly</p>
                        <p className="text-lg font-black text-white italic">{stats.active7d}</p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-500 uppercase">Monthly</p>
                        <p className="text-lg font-black text-white italic">{stats.active30d}</p>
                      </div>
                   </div>
                </div>

                <div className="bg-[#0b1224] border border-indigo-500/20 p-8 rounded-[2.5rem] shadow-xl space-y-4 md:col-span-2">
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="text-sm font-black italic uppercase text-white">Personnel Health Bar</h4>
                        <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Active Retention Distribution</p>
                      </div>
                   </div>
                   <div className="space-y-6">
                      <div className="flex h-3 w-full rounded-full overflow-hidden bg-ha-bg border border-slate-900">
                         <div className="h-full bg-emerald-500" style={{ width: `${(stats.active7d / stats.users) * 100}%` }} title="Active"></div>
                         <div className="h-full bg-amber-500" style={{ width: `${((stats.active30d - stats.active7d) / stats.users) * 100}%` }} title="Standby"></div>
                         <div className="h-full bg-red-600" style={{ width: `${((stats.users - stats.active30d) / stats.users) * 100}%` }} title="Signal Lost"></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                         <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                               <p className="text-[8px] font-black text-white uppercase tracking-widest">Operational</p>
                            </div>
                            <p className="text-[7px] text-slate-600 font-black uppercase">{Math.round((stats.active7d / stats.users) * 100)}% (7d)</p>
                         </div>
                         <div className="space-y-1 text-center">
                            <div className="flex items-center gap-1.5 justify-center">
                               <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                               <p className="text-[8px] font-black text-white uppercase tracking-widest">Standby</p>
                            </div>
                            <p className="text-[7px] text-slate-600 font-black uppercase">{Math.round(((stats.active30d - stats.active7d) / stats.users) * 100)}% (30d)</p>
                         </div>
                         <div className="space-y-1 text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                               <div className="w-1.5 h-1.5 rounded-full bg-red-600"></div>
                               <p className="text-[8px] font-black text-white uppercase tracking-widest">Signal Lost</p>
                            </div>
                            <p className="text-[7px] text-slate-600 font-black uppercase">{Math.round(((stats.users - stats.active30d) / stats.users) * 100)}% (+30d)</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] shadow-xl overflow-hidden">
                {renderGrowthChart()}
             </div>

             <div className="bg-indigo-600 p-10 rounded-[3.5rem] text-center shadow-3xl relative overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-white/5 blur-3xl rounded-full"></div>
                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.4em] mb-2 relative z-10">ARR (Jaarlijks · {stats.monthlySubscribers}m + {stats.yearlySubscribers}j)</p>
                <h3 className="text-7xl font-black italic text-white tracking-tighter relative z-10">€{(stats.totalARR || 0).toFixed(2)}</h3>
             </div>
          </div>
        )}

        {activeTab === 'finance' && (() => {
          const monthlyExpenses = expenses.filter(e => e.type === 'monthly').reduce((s, e) => s + e.amount, 0);
          const yearlyExpenses = expenses.filter(e => e.type === 'yearly').reduce((s, e) => s + e.amount, 0);
          const onceExpenses = expenses.filter(e => e.type === 'once').reduce((s, e) => s + e.amount, 0);
          const monthlyEquivOfYearly = yearlyExpenses / 12;
          const totalMonthlyBurn = monthlyExpenses + monthlyEquivOfYearly;
          const revenue = stats.totalMRR;
          const netPL = revenue - totalMonthlyBurn;
          const isProfit = netPL >= 0;
          const unknownBilling = stats.paidUsers - stats.monthlySubscribers - stats.yearlySubscribers;
          return (
            <div className="space-y-8 animate-in fade-in">
              {/* Lifetime Revenue Banner */}
              <div className="bg-[#0a0f1e] border border-yellow-500/30 p-10 rounded-[3.5rem] shadow-3xl relative overflow-hidden">
                <div className="absolute top-[-20%] right-[-5%] w-64 h-64 bg-yellow-500/5 blur-3xl rounded-full"></div>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-black text-yellow-500/70 uppercase tracking-[0.4em] mb-1">Netto Winst Ooit</p>
                    <h3 className="text-7xl font-black italic text-yellow-400 tracking-tighter">€{lifetimeRevenue.toFixed(2)}</h3>
                    <p className="text-[8px] font-black text-yellow-500/40 uppercase tracking-widest mt-1">
                      {revenueHistory.length} maanden geregistreerd
                      {revenueHistory.length > 0 && ` · laatste: ${revenueHistory[revenueHistory.length - 1]?.month}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 items-end">
                    <button
                      onClick={() => closeMonth(revenue, totalMonthlyBurn)}
                      disabled={isClosingMonth}
                      className="px-8 py-4 bg-yellow-500 text-slate-950 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                    >
                      {isClosingMonth ? 'Opslaan...' : `Sluit maand af (netto ${netPL >= 0 ? '+' : ''}€${netPL.toFixed(2)})`}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-slate-600 font-black uppercase">Handmatig aanpassen:</span>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={lifetimeRevenue.toFixed(2)}
                        onBlur={e => updateLifetimeRevenue(parseFloat(e.target.value) || lifetimeRevenue)}
                        className="w-28 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-black text-yellow-400 text-right outline-none focus:border-yellow-500"
                      />
                    </div>
                  </div>
                </div>
                {revenueHistory.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-yellow-500/10 relative z-10">
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                      {[...revenueHistory].reverse().map(h => {
                        const net = h.net ?? (h.amount - h.expenses);
                        const isPos = net >= 0;
                        const isAuto = !!h.autoClose;
                        return (
                          <div key={h.month} className={`flex-shrink-0 border rounded-2xl px-4 py-3 text-center min-w-[110px] ${isPos ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                            <p className="text-[7px] font-black text-slate-500 uppercase flex items-center justify-center gap-1">
                              {h.month}
                              {isAuto && <span title="Auto afgesloten" className="text-slate-600">⚙</span>}
                            </p>
                            <p className={`text-sm font-black italic ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{isPos ? '+' : ''}€{net.toFixed(2)}</p>
                            <p className="text-[7px] font-black text-slate-600 uppercase">€{h.amount.toFixed(2)} - €{h.expenses.toFixed(2)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* P&L Summary Banner */}
              <div className={`p-10 rounded-[3.5rem] text-center shadow-3xl relative overflow-hidden ${isProfit ? 'bg-emerald-600' : 'bg-red-600'}`}>
                <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-white/5 blur-3xl rounded-full"></div>
                <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.4em] mb-2 relative z-10">Maandelijks Saldo</p>
                <h3 className="text-7xl font-black italic text-white tracking-tighter relative z-10">{isProfit ? '+' : ''}€{netPL.toFixed(2)}</h3>
                <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-2 relative z-10">{isProfit ? 'WINST' : 'VERLIES'} deze maand</p>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1 relative z-10">Burn: €{monthlyExpenses.toFixed(2)}/mo + €{monthlyEquivOfYearly.toFixed(2)}/mo (jaarlijks ÷12) = €{totalMonthlyBurn.toFixed(2)}/mo</p>
              </div>

              {/* Billing split cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0b1224] border border-indigo-500/30 p-6 rounded-[2rem] shadow-xl space-y-2 text-center">
                  <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest">Maandelijks</p>
                  <p className="text-4xl font-black italic text-white">{stats.monthlySubscribers}</p>
                  <p className="text-[8px] font-black text-slate-600 uppercase">users</p>
                </div>
                <div className="bg-[#0b1224] border border-emerald-500/30 p-6 rounded-[2rem] shadow-xl space-y-2 text-center">
                  <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">Jaarlijks</p>
                  <p className="text-4xl font-black italic text-white">{stats.yearlySubscribers}</p>
                  <p className="text-[8px] font-black text-slate-600 uppercase">users · ARR €{stats.totalARR.toFixed(0)}</p>
                </div>
                <div className="bg-[#0b1224] border border-slate-700 p-6 rounded-[2rem] shadow-xl space-y-2 text-center">
                  <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Onbekend</p>
                  <p className="text-4xl font-black italic text-slate-400">{unknownBilling}</p>
                  <p className="text-[8px] font-black text-slate-600 uppercase">stel in via Manage</p>
                </div>
              </div>

              {/* Revenue vs Expenses split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0b1224] border border-emerald-500/30 p-8 rounded-[2.5rem] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Inkomsten (MRR)</p>
                      <p className="text-[8px] text-slate-600 font-black uppercase">Echte betalende users · geen testers</p>
                    </div>
                    <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    </div>
                  </div>
                  <p className="text-5xl font-black italic text-emerald-400">€{revenue.toFixed(2)}</p>
                  <div className="space-y-2 pt-4 border-t border-slate-900">
                    {Object.entries(stats.tierRevenueBilling).filter(([, v]) => v.monthly > 0 || v.yearly > 0).map(([plan, billing]) => (
                      <div key={plan} className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase">{plan}</p>
                        {billing.monthly > 0 && (
                          <div className="flex justify-between items-center pl-3">
                            <span className="text-[8px] font-black text-slate-600 uppercase">↳ maandelijks</span>
                            <span className="text-[10px] font-black text-indigo-400">€{billing.monthly.toFixed(2)}/mo</span>
                          </div>
                        )}
                        {billing.yearly > 0 && (
                          <div className="flex justify-between items-center pl-3">
                            <span className="text-[8px] font-black text-slate-600 uppercase">↳ jaarlijks (÷12)</span>
                            <span className="text-[10px] font-black text-emerald-400">€{(billing.yearly / 12).toFixed(2)}/mo · €{billing.yearly.toFixed(0)}/yr</span>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-900/50">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Testers (uitgesloten)</span>
                      <span className="text-[11px] font-black text-amber-500">{stats.totalTesters} users</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0b1224] border border-red-500/20 p-8 rounded-[2.5rem] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[7px] font-black text-red-400 uppercase tracking-widest">Uitgaven</p>
                      <p className="text-[8px] text-slate-600 font-black uppercase">Maandelijkse kosten</p>
                    </div>
                    <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center text-red-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                    </div>
                  </div>
                  <p className="text-5xl font-black italic text-red-400">€{totalMonthlyBurn.toFixed(2)}<span className="text-lg text-slate-500">/mo</span></p>
                  <div className="space-y-3 pt-4 border-t border-slate-900">
                    {(['monthly', 'yearly', 'once'] as const).map(type => {
                      const group = expenses.filter(e => e.type === type);
                      if (group.length === 0) return null;
                      const groupTotal = group.reduce((s, e) => s + e.amount, 0);
                      const label = type === 'monthly' ? 'Maandelijks' : type === 'yearly' ? 'Jaarlijks' : 'Eenmalig';
                      const color = type === 'monthly' ? 'text-red-400' : type === 'yearly' ? 'text-orange-400' : 'text-slate-500';
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className={`text-[8px] font-black uppercase tracking-widest ${color}`}>{label} — €{groupTotal.toFixed(2)}{type === 'yearly' ? ` (÷12 = €${(groupTotal/12).toFixed(2)}/mo)` : type === 'monthly' ? '/mo' : ' (eenmalig)'}</span>
                          </div>
                          {group.map(e => (
                            <div key={e.id} className="flex justify-between items-center pl-3">
                              <span className="text-[8px] font-black text-slate-600 uppercase">↳ {e.label}</span>
                              <span className={`text-[9px] font-black ${color}`}>€{e.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Visual bar */}
              <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl space-y-6">
                <h4 className="text-sm font-black italic uppercase text-white">Inkomsten vs Maandelijkse Burn</h4>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black text-emerald-500 uppercase">Inkomsten €{revenue.toFixed(2)}/mo</span>
                      <span className="text-[8px] font-black text-slate-600 uppercase">{Math.round((revenue / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%</span>
                    </div>
                    <div className="h-4 bg-slate-900 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (revenue / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black text-red-400 uppercase">Maandelijks €{monthlyExpenses.toFixed(2)}</span>
                      <span className="text-[8px] font-black text-slate-600 uppercase">{Math.round((monthlyExpenses / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%</span>
                    </div>
                    <div className="h-4 bg-slate-900 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${Math.min(100, (monthlyExpenses / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black text-orange-400 uppercase">Jaarlijks ÷12 €{monthlyEquivOfYearly.toFixed(2)}/mo  (€{yearlyExpenses.toFixed(2)}/yr)</span>
                      <span className="text-[8px] font-black text-slate-600 uppercase">{Math.round((monthlyEquivOfYearly / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%</span>
                    </div>
                    <div className="h-4 bg-slate-900 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${Math.min(100, (monthlyEquivOfYearly / (Math.max(revenue, totalMonthlyBurn) || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                  {onceExpenses > 0 && (
                    <div className="pt-2 border-t border-slate-900 flex justify-between items-center">
                      <span className="text-[8px] font-black text-slate-500 uppercase">Eenmalige kosten (niet in P&L)</span>
                      <span className="text-[10px] font-black text-slate-500">€{onceExpenses.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expense editor */}
              <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black italic uppercase text-white">Uitgaven Beheren</h4>
                    <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Wordt opgeslagen in Firestore</p>
                  </div>
                  <button
                    onClick={saveExpenses}
                    disabled={isSavingExpenses}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSavingExpenses ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </div>

                <div className="space-y-2">
                  {(['monthly', 'yearly', 'once'] as const).map(type => {
                    const group = expenses.filter(e => e.type === type);
                    const typeLabel = type === 'monthly' ? 'Maandelijks' : type === 'yearly' ? 'Jaarlijks' : 'Eenmalig';
                    const typeColor = type === 'monthly' ? 'text-red-400 border-red-500/20' : type === 'yearly' ? 'text-orange-400 border-orange-500/20' : 'text-slate-500 border-slate-700';
                    return (
                      <div key={type} className="space-y-2">
                        <p className={`text-[8px] font-black uppercase tracking-widest ${typeColor.split(' ')[0]} mt-3 first:mt-0`}>{typeLabel}</p>
                        {group.map(e => (
                          <div key={e.id} className={`flex items-center gap-3 bg-ha-bg border rounded-2xl px-5 py-3 ${typeColor.split(' ')[1]}`}>
                            <span className="flex-1 text-[10px] font-black text-white uppercase">{e.label}</span>
                            <div className="flex gap-1">
                              {(['monthly', 'yearly', 'once'] as const).map(t => (
                                <button key={t} onClick={() => updateExpenseType(e.id, t)} className={`px-2 py-1 rounded-lg text-[7px] font-black uppercase transition-all ${e.type === t ? (t === 'monthly' ? 'bg-red-600 text-white' : t === 'yearly' ? 'bg-orange-600 text-white' : 'bg-slate-600 text-white') : 'bg-slate-900 text-slate-600 hover:text-white'}`}>
                                  {t === 'monthly' ? 'Mo' : t === 'yearly' ? 'Jr' : '1x'}
                                </button>
                              ))}
                            </div>
                            <span className="text-slate-500 text-[10px] font-black">€</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={e.amount}
                              onChange={ev => updateExpenseAmount(e.id, ev.target.value)}
                              className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-black text-white text-right outline-none focus:border-ha-brand"
                            />
                            <button onClick={() => removeExpense(e.id)} className="text-slate-700 hover:text-red-500 transition-colors p-1">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        ))}
                        {group.length === 0 && <p className="text-[8px] text-slate-700 font-black uppercase pl-2">Geen {typeLabel.toLowerCase()} kosten</p>}
                      </div>
                    );
                  })}
                </div>

                {/* Add new expense */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-900">
                  <input
                    type="text"
                    value={newExpenseLabel}
                    onChange={e => setNewExpenseLabel(e.target.value)}
                    placeholder="Naam (bv. Firebase)"
                    className="flex-1 min-w-[140px] bg-ha-bg border border-slate-800 rounded-2xl py-3 px-5 text-[10px] font-black uppercase text-white outline-none focus:border-ha-brand"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newExpenseAmount}
                    onChange={e => setNewExpenseAmount(e.target.value)}
                    placeholder="Bedrag"
                    className="w-28 bg-ha-bg border border-slate-800 rounded-2xl py-3 px-4 text-[10px] font-black text-white outline-none focus:border-ha-brand"
                  />
                  <div className="flex gap-1 bg-ha-bg border border-slate-800 rounded-2xl px-3 items-center">
                    {([['monthly', 'Mo', 'bg-red-600'], ['yearly', 'Jr', 'bg-orange-600'], ['once', '1x', 'bg-slate-600']] as const).map(([t, lbl, col]) => (
                      <button key={t} onClick={() => setNewExpenseType(t as any)} className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase transition-all ${newExpenseType === t ? `${col} text-white` : 'text-slate-600 hover:text-white'}`}>{lbl}</button>
                    ))}
                  </div>
                  <button onClick={addExpense} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">
                    + Toevoegen
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'studio' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in">
             <div className="bg-[#0b1224] border border-slate-800 p-10 rounded-[3rem] text-center space-y-8 shadow-2xl">
                <div className="w-24 h-24 bg-indigo-600/10 border-2 border-indigo-500/30 rounded-[2rem] mx-auto flex items-center justify-center text-indigo-400">
                   <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div className="space-y-3">
                   <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">TikTok Creator Studio</h3>
                   <p className="text-xs font-medium text-slate-500 leading-relaxed max-w-sm mx-auto">
                     Generate high-impact vertical content for social media. Export plays and drills in 9:16 HD format to promote SportAtlas.
                   </p>
                </div>
                <button 
                  onClick={() => onOpenStudio()}
                  className="w-full py-6 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                   Launch TikTok Studio
                </button>
                
             </div>

             {/* Top Content to Promote */}
             <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                   <h4 className="text-sm font-black italic uppercase text-white">Top Content to Promote</h4>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Based on Engagement</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {stats.topDrills.slice(0, 4).map((drill, idx) => (
                      <div key={drill.id} className="bg-[#0b1224] border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between group hover:border-indigo-500/40 transition-all">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-indigo-400 font-black italic">
                               {idx + 1}
                            </div>
                            <div>
                               <p className="text-xs font-black text-white uppercase italic truncate max-w-[150px]">{drill.title}</p>
                               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{drill.likes || 0} Likes • {drill.focus}</p>
                            </div>
                         </div>
                         <button 
                           onClick={() => onOpenStudio()}
                           className="p-3 bg-indigo-600/10 text-indigo-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                         >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                         </button>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {/* Existing tabs content preserved... */}
        {activeTab === 'games' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
                <div className="space-y-1">
                   <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Games Performance</h3>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Surveillance of match engagement and tactical archive</p>
                </div>
                <div className="bg-ha-bg border border-slate-800 rounded-2xl overflow-hidden">
                   <div className="grid grid-cols-4 p-4 bg-slate-900/50 border-b border-slate-800">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Match Title</p>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">Owner</p>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">Views</p>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Likes</p>
                   </div>
                   <div className="divide-y divide-slate-900">
                     {allMatches.map(match => (
                       <div key={match.id} className="grid grid-cols-4 p-4 items-center hover:bg-slate-900/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-black italic text-white uppercase truncate">{match.title}</p>
                            <p className="text-[7px] text-slate-600 font-black uppercase">{new Date(match.createdAt).toLocaleDateString()}</p>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 text-center uppercase truncate">{match.ownerName}</p>
                          <p className="text-xl font-black italic text-ha-brand text-center">{match.viewCount || 0}</p>
                          <p className="text-xl font-black italic text-emerald-400 text-right">{match.likes || 0}</p>
                       </div>
                     ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'partners' && (
          <div className="space-y-8 animate-in zoom-in">
             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
                <div className="space-y-1">
                   <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Checkout Intelligence</h3>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Tracking users who initiated checkout but may not have completed</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-ha-bg p-6 rounded-2xl border border-slate-900">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Conversion Funnel</p>
                      <div className="space-y-4">
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Checkout Clicks</span>
                            <span className="text-lg font-black italic text-white">{stats.checkoutClicks}</span>
                         </div>
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Paid Users</span>
                            <span className="text-lg font-black italic text-emerald-400">{stats.paidUsers}</span>
                         </div>
                         <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (stats.paidUsers / (stats.checkoutClicks || 1)) * 100)}%` }}></div>
                         </div>
                         <p className="text-[7px] font-black text-slate-600 uppercase text-right">Conversion: {Math.round((stats.paidUsers / (stats.checkoutClicks || 1)) * 100)}%</p>
                      </div>

                      <div className="mt-8 pt-6 border-t border-slate-900 space-y-4">
                         <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Recovery Templates (Code: HOOPS364)</p>
                         <div className="grid grid-cols-2 gap-2">
                            <button 
                               onClick={() => {
                                  const text = `Subject: A little something for your SportAtlas journey 🏆\n\nHi [Name],\n\nI noticed you were checking out our Pro features on SportAtlas recently!\n\nTo help you get started and see the full power of our tactical tools, I'd like to offer you 1 month for free.\n\nUse the code HOOPS364 at checkout to claim your free month.\n\nIf you have any questions or need help setting up your team, just let me know!\n\nBest,\nStan from SportAtlas`;
                                  navigator.clipboard.writeText(text);
                                  alert("English template copied!");
                               }}
                               className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-3 rounded-xl text-[8px] font-black uppercase text-indigo-400 transition-all"
                            >
                               Copy English
                            </button>
                            <button 
                               onClick={() => {
                                  const text = `Onderwerp: Een cadeautje voor je SportAtlas avontuur 🏆\n\nHoi [Naam],\n\nIk zag dat je onlangs interesse had in onze Pro-functies op SportAtlas!\n\nOm je op weg te helpen en de volledige kracht van onze tactische tools te laten ervaren, wil ik je graag 1 maand gratis aanbieden.\n\nGebruik de code HOOPS364 bij het afrekenen om je gratis maand te claimen.\n\nHeb je vragen of hulp nodig bij het instellen van je team? Laat het me weten!\n\nGroetjes,\nStan van SportAtlas`;
                                  navigator.clipboard.writeText(text);
                                  alert("Nederlandse template gekopieerd!");
                               }}
                               className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-3 rounded-xl text-[8px] font-black uppercase text-ha-brand transition-all"
                            >
                               Copy Dutch
                            </button>
                         </div>
                      </div>
                   </div>
                   <div className="bg-ha-bg p-6 rounded-2xl border border-slate-900">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Recent Signals</p>
                      <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                         {checkoutSignals.slice(-20).reverse().map((s, i) => {
                           const u = allUsers.find(user => user.uid === s.userId);
                           return (
                             <div key={i} className="flex justify-between items-start text-[8px] font-black uppercase border-b border-white/5 pb-2 last:border-0">
                               <div className="flex flex-col gap-0.5">
                                 <span className="text-white italic">{u ? u.name : 'Anonymous'}</span>
                                 <span className="text-slate-600 lowercase">{u ? u.email : (s.userId === 'anonymous' ? 'Not Logged In' : s.userId)}</span>
                               </div>
                               <div className="text-right flex flex-col gap-0.5">
                                 <span className="text-indigo-400 italic">{s.plan} ({s.cycle})</span>
                                 <span className="text-slate-700">{new Date(s.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                               </div>
                             </div>
                           );
                         })}
                      </div>
                   </div>
                </div>
             </div>

             {/* Onboarding Tutorial Signals */}
             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
                <div className="space-y-1">
                   <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Onboarding Intelligence</h3>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Who completed the tutorial and who clicked Create Your First Drill</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-ha-bg border border-indigo-500/20 rounded-2xl p-5 space-y-1">
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Tutorial Completed</p>
                      <p className="text-4xl font-black italic text-white">{onboardingSignals.filter(s => s.action === 'completed').length}</p>
                   </div>
                   <div className="bg-ha-bg border border-emerald-500/20 rounded-2xl p-5 space-y-1">
                      <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Drill CTA Clicked</p>
                      <p className="text-4xl font-black italic text-white">{onboardingSignals.filter(s => s.action === 'drill_clicked').length}</p>
                   </div>
                </div>
                <div className="bg-ha-bg p-6 rounded-2xl border border-slate-900">
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Recent Events</p>
                   <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                      {onboardingSignals.length === 0 && (
                        <p className="text-[8px] font-black text-slate-700 uppercase">No signals yet</p>
                      )}
                      {onboardingSignals.slice(0, 30).map((s, i) => {
                        const u = allUsers.find(user => user.uid === s.userId);
                        return (
                          <div key={i} className="flex justify-between items-start text-[8px] font-black uppercase border-b border-white/5 pb-2 last:border-0">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-white italic">{u ? u.name : 'Anonymous'}</span>
                              <span className="text-slate-600 lowercase">{u ? u.email : (s.userId === 'anonymous' ? 'Not Logged In' : s.userId)}</span>
                            </div>
                            <div className="text-right flex flex-col gap-0.5">
                              <span className={s.action === 'drill_clicked' ? 'text-emerald-400 italic' : 'text-indigo-400 italic'}>
                                {s.action === 'drill_clicked' ? 'Drill CTA' : 'Completed'}
                              </span>
                              <span className="text-slate-700">{new Date(s.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
             </div>

             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
                <div className="space-y-1">
                   <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Partner Intelligence</h3>
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Tracking conversion and engagement by '?ref=' parameter</p>
                </div>
                <div className="bg-ha-bg border border-slate-800 rounded-2xl overflow-hidden">
                   <div className="grid grid-cols-3 p-4 bg-slate-900/50 border-b border-slate-800">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Partner Source</p>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center">Clicks (Visitors)</p>
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Users (Reg)</p>
                   </div>
                   <div className="divide-y divide-slate-900">
                     {partnerReport.map(([source, data]) => (
                       <div key={source} className="grid grid-cols-3 p-4 items-center">
                          <p className="text-xs font-black italic text-indigo-400 uppercase tracking-tight">{source}</p>
                          <p className="text-xl font-black italic text-slate-400 text-center">{data.clicks}</p>
                          <p className="text-xl font-black italic text-white text-right">{data.users}</p>
                       </div>
                     ))}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'partner-apps' && (
          <div className="space-y-6 animate-in zoom-in">
            <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">Partner Applications</h3>
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Review, assign a code and approve or reject applications</p>
                </div>
                <div className="flex gap-3 text-[8px] font-black uppercase tracking-widest">
                  <span className="px-3 py-1.5 rounded-full border border-yellow-400/20 bg-yellow-400/5 text-yellow-400">{partnerApplications.filter(a => a.status === 'pending').length} pending</span>
                  <span className="px-3 py-1.5 rounded-full border border-green-400/20 bg-green-400/5 text-green-400">{partnerApplications.filter(a => a.status === 'approved').length} approved</span>
                  <span className="px-3 py-1.5 rounded-full border border-red-400/20 bg-red-400/5 text-red-400">{partnerApplications.filter(a => a.status === 'rejected').length} rejected</span>
                </div>
              </div>

              {partnerApplications.length === 0 ? (
                <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest text-center py-12">No applications yet.</p>
              ) : (
                <div className="space-y-4">
                  {partnerApplications.map((app) => {
                    const isPending = app.status === 'pending';
                    const isApproved = app.status === 'approved';
                    const isRejected = app.status === 'rejected';
                    const statusColor = isPending
                      ? 'text-yellow-400 border-yellow-400/20 bg-yellow-400/5'
                      : isApproved
                      ? 'text-green-400 border-green-400/20 bg-green-400/5'
                      : 'text-red-400 border-red-400/20 bg-red-400/5';
                    const currentCode = assignedCodes[app.id] ?? (app.assignedCode || app.desiredCode || '');

                    return (
                      <div key={app.id} className={`bg-ha-bg border rounded-2xl p-6 space-y-4 ${isApproved ? 'border-green-500/20' : isRejected ? 'border-red-500/10' : 'border-slate-800'}`}>

                        {/* Header */}
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <p className="text-sm font-black italic text-white uppercase tracking-tight">{app.name}</p>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{app.email}</p>
                          </div>
                          <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${statusColor}`}>{app.status}</span>
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[9px] font-black uppercase tracking-widest">
                          <div>
                            <p className="text-slate-600">Organisation</p>
                            <p className="text-slate-300 mt-0.5">{app.organization}</p>
                          </div>
                          <div>
                            <p className="text-slate-600">Type</p>
                            <p className="text-slate-300 mt-0.5">{app.partnerType}</p>
                          </div>
                          <div>
                            <p className="text-slate-600">Requested Code</p>
                            <p className="text-ha-brand mt-0.5">{app.desiredCode}</p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <p className="text-slate-600">Social / Website</p>
                            <a href={app.socialLink} target="_blank" rel="noopener noreferrer" className="text-indigo-400 mt-0.5 block truncate hover:underline">{app.socialLink}</a>
                          </div>
                          <div>
                            <p className="text-slate-600">Applied</p>
                            <p className="text-slate-300 mt-0.5">{app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                          </div>
                          {isApproved && app.assignedCode && (
                            <div>
                              <p className="text-slate-600">Active Code</p>
                              <p className="text-green-400 mt-0.5 font-black">{app.assignedCode}</p>
                            </div>
                          )}
                        </div>

                        {app.paymentInfo && (
                          <div className="text-[9px] font-black uppercase tracking-widest">
                            <p className="text-slate-600">Bank Account / PayPal</p>
                            <p className="text-slate-300 mt-1 normal-case font-medium text-[10px] tracking-normal leading-relaxed">{app.paymentInfo}</p>
                          </div>
                        )}

                        {app.promotionPlan && (
                          <div className="text-[9px] font-black uppercase tracking-widest">
                            <p className="text-slate-600">Promotion Plan</p>
                            <p className="text-slate-400 mt-1 normal-case font-medium text-[10px] tracking-normal leading-relaxed">{app.promotionPlan}</p>
                          </div>
                        )}

                        {app.extraMessage && (
                          <div className="text-[9px] font-black uppercase tracking-widest">
                            <p className="text-slate-600">Extra Message</p>
                            <p className="text-slate-400 mt-1 normal-case font-medium text-[10px] tracking-normal leading-relaxed">{app.extraMessage}</p>
                          </div>
                        )}

                        {/* Assigned code input */}
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Assigned Discount Code</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={currentCode}
                              onChange={e => setAssignedCodes(prev => ({ ...prev, [app.id]: e.target.value.replace(/\s/g, '').toUpperCase() }))}
                              placeholder="e.g. BCBRUSSELS"
                              maxLength={20}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-[11px] text-white font-black uppercase tracking-widest focus:outline-none focus:border-ha-brand transition-all placeholder:text-slate-700"
                            />
                            <button
                              onClick={async () => {
                                const code = currentCode.trim();
                                if (!code) return;
                                try {
                                  await updateDoc(doc(db, 'partner_applications', app.id), { assignedCode: code });
                                  alert(`Code "${code}" saved.`);
                                } catch (e) { alert('Failed to save code.'); }
                              }}
                              className="px-5 py-3 bg-slate-800 border border-slate-700 text-slate-300 text-[9px] font-black uppercase tracking-widest rounded-xl hover:border-ha-brand hover:text-ha-brand transition-all"
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        {/* Stats update (only for approved) */}
                        {isApproved && (() => {
                          const basicKey = `basic_${app.id}`;
                          const proKey = `pro_${app.id}`;
                          const paidKey = `paid_${app.id}`;
                          const basicVal = assignedCodes[basicKey] ?? String(app.basicUses || 0);
                          const proVal = assignedCodes[proKey] ?? String(app.proUses || 0);
                          const paidVal = assignedCodes[paidKey] ?? String(app.paidOut || 0);
                          const totalEarned = (parseInt(basicVal) || 0) * 3 + (parseInt(proVal) || 0) * 5;
                          const pending = totalEarned - (parseFloat(paidVal) || 0);
                          return (
                            <div className="border-t border-slate-800 pt-4 space-y-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Earnings Tracker</p>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-600">Basic Uses</label>
                                  <input type="number" min="0" value={basicVal} onChange={e => setAssignedCodes(prev => ({ ...prev, [basicKey]: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] text-white font-black focus:outline-none focus:border-ha-brand transition-all" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-600">Pro Uses</label>
                                  <input type="number" min="0" value={proVal} onChange={e => setAssignedCodes(prev => ({ ...prev, [proKey]: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] text-white font-black focus:outline-none focus:border-indigo-400 transition-all" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-600">Paid Out (€)</label>
                                  <input type="number" min="0" step="0.01" value={paidVal} onChange={e => setAssignedCodes(prev => ({ ...prev, [paidKey]: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[11px] text-green-400 font-black focus:outline-none focus:border-green-400 transition-all" />
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="text-[9px] font-black uppercase tracking-widest space-x-4">
                                  <span className="text-slate-500">Earned: <span className="text-ha-brand">€{totalEarned}</span></span>
                                  <span className="text-slate-500">Pending: <span className={pending > 0 ? 'text-yellow-400' : 'text-slate-600'}>€{pending.toFixed(2)}</span></span>
                                </div>
                                <button
                                  onClick={async () => {
                                    try {
                                      await updateDoc(doc(db, 'partner_applications', app.id), {
                                        basicUses: parseInt(basicVal) || 0,
                                        proUses: parseInt(proVal) || 0,
                                        paidOut: parseFloat(paidVal) || 0,
                                      });
                                    } catch (e) { alert('Failed to save stats.'); }
                                  }}
                                  className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-[8px] font-black uppercase tracking-widest rounded-xl hover:border-ha-brand hover:text-ha-brand transition-all"
                                >
                                  Save Stats
                                </button>
                              </div>
                              <p className="text-[8px] font-black uppercase tracking-widest text-slate-700">Payment info: {app.paymentInfo || '—'}</p>
                            </div>
                          );
                        })()}

                        {/* Actions */}
                        <div className="flex gap-3 pt-1">
                          <button
                            onClick={async () => {
                              const code = currentCode.trim();
                              if (!code) { alert('Set an assigned code first.'); return; }
                              try {
                                await updateDoc(doc(db, 'partner_applications', app.id), { status: 'approved', assignedCode: code });
                              } catch (e) { alert('Failed to approve.'); }
                            }}
                            disabled={isApproved}
                            className="flex-1 py-3 bg-green-600/20 border border-green-600/30 text-green-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-green-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ✓ Approve & Set Code
                          </button>
                          <button
                            onClick={async () => {
                              try { await updateDoc(doc(db, 'partner_applications', app.id), { status: 'rejected' }); }
                              catch (e) { alert('Failed to reject.'); }
                            }}
                            disabled={isRejected}
                            className="flex-1 py-3 bg-red-600/20 border border-red-600/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-red-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'broadcast' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in">
             <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-6 shadow-2xl">
                <h3 className="text-xl font-black italic uppercase text-white">Global Controls</h3>
                <div className="flex items-center justify-between p-4 bg-ha-bg border border-slate-900 rounded-2xl">
                   <div className="space-y-0.5">
                      <p className="text-xs font-black italic text-white uppercase">Partner Banner</p>
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Toggle BasketVision visibility</p>
                   </div>
                   <button onClick={togglePartnerBanner} className={`w-14 h-7 rounded-full relative transition-all duration-300 ${partnerBannerEnabled ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                     <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 ${partnerBannerEnabled ? 'left-8' : 'left-1'}`}></div>
                   </button>
                </div>
                <div className="space-y-2">
                   <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">In-App Alert</p>
                   <textarea value={globalAlert} onChange={e => setGlobalAlert(e.target.value.toUpperCase())} placeholder="ENTER BROADCAST MESSAGE..." className="w-full bg-ha-bg border border-slate-800 rounded-2xl p-6 text-xs text-white font-black h-32 resize-none outline-none focus:border-ha-brand" />
                </div>
                <div className="flex gap-4">
                   <button onClick={() => handleBroadcastAlert(true)} className="flex-1 py-4 bg-slate-900 text-slate-500 rounded-xl font-black uppercase text-[10px]">Clear Alert</button>
                   <button onClick={() => handleBroadcastAlert(false)} disabled={isSyncingAlert} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] shadow-xl">Deploy Signal</button>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'changelog' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
            {[
              {
                version: 'v2.4',
                date: '19 apr 2025',
                label: 'AI Update',
                labelColor: 'indigo',
                entries: [
                  { type: 'new', title: 'Player Progression Charts', desc: 'Nieuw "Progress" tabblad in Stats HQ met SVG line charts per speler over meerdere wedstrijden. Toont gemiddelde en trendpijl per stat.' },
                  { type: 'new', title: 'AI Drill Aanbevelingen', desc: 'Per wedstrijd in Stats HQ: "AI Tips" knop die Gemini 2.0 Flash de stats analyseert en 3 concrete drill aanbevelingen geeft.' },
                  { type: 'new', title: 'Push Notifications voor teamevents', desc: 'Firebase Cloud Function notifyTeamOnNewEvent: stuurt automatisch FCM push naar alle teamleden bij nieuw agenda-item van de coach.' },
                ],
              },
              {
                version: 'v2.3',
                date: 'mrt 2025',
                label: 'Club & Stats',
                labelColor: 'emerald',
                entries: [
                  { type: 'new', title: 'Stats HQ — Match Stats tracker', desc: 'Bijhouden van spelersstatistieken per wedstrijd (PTS, REB, AST, ...). Spelerprofielen met foto-upload. PDF export van wedstrijdblad.' },
                  { type: 'new', title: 'Club HQ', desc: 'Centraal dashboard voor clubbeheerders. Overzicht van alle coaches, drills en teams binnen een club.' },
                  { type: 'new', title: 'Tournament Builder', desc: 'Bouw en beheer een toernooi met teams, rondes, scores en live bracketing.' },
                  { type: 'improved', title: 'Match Archive', desc: 'Ondersteuning voor multi-part video uploads, externe vault storage en toegangscodes per wedstrijd.' },
                ],
              },
              {
                version: 'v2.2',
                date: 'feb 2025',
                label: 'Team Tools',
                labelColor: 'cyan',
                entries: [
                  { type: 'new', title: 'Team Calendar & Presence', desc: 'Trainingskalender per team met aanwezigheidsregistratie, drills toewijzen aan spelers en repeat weekly events.' },
                  { type: 'new', title: 'Locker Room Chat', desc: 'Groepschat per team + privéberichten tussen coach en individuele spelers.' },
                  { type: 'new', title: 'Drill Assignments', desc: 'Coaches kunnen drills toewijzen aan spelers met een deadline. Spelers zien hun opdrachten in de kalender.' },
                  { type: 'new', title: 'VBL Import', desc: 'Importeer wedstrijden rechtstreeks vanuit de VBL API via stamnummer of teamnaam.' },
                ],
              },
              {
                version: 'v2.1',
                date: 'jan 2025',
                label: 'Live & Video',
                labelColor: 'rose',
                entries: [
                  { type: 'new', title: 'Live Match Broadcaster', desc: 'Coaches kunnen een live score feed starten. Kijkers volgen real-time met AI commentary en highlights.' },
                  { type: 'new', title: 'TikTok Creator Studio', desc: 'Export van drills en plays als verticale 9:16 video voor social media promotie.' },
                  { type: 'improved', title: 'Drill Execution Mode', desc: 'Volledig scherm drill-uitvoering met timer, stap-voor-stap en Gemini coaching tips.' },
                ],
              },
              {
                version: 'v2.0',
                date: 'dec 2024',
                label: 'Foundation',
                labelColor: 'amber',
                entries: [
                  { type: 'new', title: 'Drill Library & Community Discover', desc: 'Persoonlijke drillbibliotheek + publieke community hub. Likes, pins, filters op niveau en focus.' },
                  { type: 'new', title: 'Playbooks (Training Sessions)', desc: 'Groepeer drills in trainingen. Deel publieke playbooks met de community.' },
                  { type: 'new', title: 'Local Courts Map', desc: 'Registreer en ontdek basketbalterreinen in de buurt via Leaflet/OpenStreetMap.' },
                  { type: 'new', title: 'Subscriptions & Stripe', desc: 'Free / Basic / Pro / Club abonnementen via Stripe. Automatische sync via Firebase Function.' },
                  { type: 'new', title: 'Push Notifications basis', desc: 'Firebase Cloud Messaging integratie. Token registratie, service worker, instelling in Settings.' },
                  { type: 'new', title: 'Partner Tracking', desc: 'Klik-attributie via ?ref= parameter. Partner dashboard met conversie stats in Admin HQ.' },
                ],
              },
            ].map((release) => (
              <div key={release.version} className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-xl">
                <div className={`px-8 py-5 flex items-center justify-between border-b border-slate-800 bg-${release.labelColor}-500/5`}>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-black italic text-white tracking-tighter">{release.version}</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-${release.labelColor}-500/10 text-${release.labelColor}-400 border border-${release.labelColor}-500/20`}>
                      {release.label}
                    </span>
                  </div>
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{release.date}</span>
                </div>
                <div className="divide-y divide-slate-900/60">
                  {release.entries.map((entry, i) => (
                    <div key={i} className="px-8 py-5 flex gap-5 items-start">
                      <span className={`mt-0.5 shrink-0 text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                        entry.type === 'new'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {entry.type === 'new' ? 'NEW' : 'UPD'}
                      </span>
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-black italic uppercase text-white tracking-tight">{entry.title}</p>
                        <p className="text-[9px] text-slate-500 font-medium leading-relaxed">{entry.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'leads' && <div className="animate-in fade-in"><LeadManager /></div>}
        
        {activeTab === 'feedback' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
             {feedbackList.length > 0 ? feedbackList.map(item => (
               <div key={item.id} className={`bg-[#0b1224] border p-6 rounded-[2rem] space-y-4 shadow-xl ${item.status === 'new' ? 'border-red-500/30' : 'border-slate-800'}`}>
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-white uppercase italic">{item.name}</p>
                    <p className="text-[7px] text-slate-600 font-bold uppercase">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="text-slate-300 text-xs font-medium leading-relaxed">{item.content}</p>
                  <div className="flex gap-2 pt-2 border-t border-slate-900">
                    {item.status === 'new' && <button onClick={() => updateRequestStatus('feedback', item.id, 'read')} className="px-4 py-2 bg-slate-900 text-slate-400 rounded-xl text-[9px] font-black uppercase border border-slate-800">Mark Read</button>}
                    <button onClick={() => deleteRequest('feedback', item.id)} className="p-2 text-red-500"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
                  </div>
               </div>
             )) : <div className="py-20 text-center text-slate-700 font-black uppercase tracking-widest text-[10px]">Intel channel clear.</div>}
          </div>
        )}

        {activeTab === 'releases' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in">
            <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] space-y-8 shadow-2xl">
              <div className="space-y-2">
                <h3 className="text-xl font-black italic uppercase text-white tracking-tighter">iOS Release Protocol</h3>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Guide for building and distributing the native iOS app</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-ha-bg p-6 rounded-2xl border border-slate-900 space-y-4">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Current Version</p>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black italic text-white">{stats.latestIosVersion || '1.5.4'}</span>
                    <span className="text-[8px] font-black text-slate-600 uppercase">Production</span>
                  </div>
                  <button 
                    onClick={() => {
                      const version = prompt("Enter new version (e.g. 1.5.5):", stats.latestIosVersion || '1.5.4');
                      if (version) {
                        updateDoc(doc(db, "system_config", "releases"), { iosVersion: version, updatedAt: Date.now() });
                      }
                    }}
                    className="w-full py-3 bg-slate-900 border border-slate-800 text-[9px] font-black uppercase text-slate-400 rounded-xl hover:text-white transition-all"
                  >
                    Update Version Number
                  </button>
                </div>

                <div className="bg-ha-bg p-6 rounded-2xl border border-slate-900 space-y-4">
                  <p className="text-[10px] font-black text-ha-brand uppercase tracking-widest">IPA Distribution</p>
                  <p className="text-[8px] text-slate-500 font-medium leading-relaxed">
                    Upload your generated .ipa file to Firebase App Distribution for testing and release.
                  </p>
                  <a 
                    href="https://console.firebase.google.com/project/hoopsatlas-e16e4/appdistribution" 
                    target="_blank" 
                    rel="noreferrer"
                    className="block w-full py-4 bg-ha-brand text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest text-center shadow-xl hover:brightness-110 transition-all"
                  >
                    Open Firebase Distribution
                  </a>
                </div>
              </div>

              <div className="bg-ha-bg p-8 rounded-2xl border border-slate-900 space-y-6">
                <h4 className="text-xs font-black italic uppercase text-white">Xcode Build Checklist</h4>
                <div className="space-y-4">
                  {[
                    { step: "1", title: "Sync Assets", desc: "Run 'npx cap sync ios' in your terminal." },
                    { step: "2", title: "App Icon", desc: "Ensure AppIcon is set in Assets.xcassets in Xcode." },
                    { step: "3", title: "Archive", desc: "Product -> Archive in Xcode (Target: Any iOS Device)." },
                    { step: "4", title: "Distribute", desc: "Distribute App -> Custom -> App Store Connect -> Export." },
                  ].map(item => (
                    <div key={item.step} className="flex gap-4 items-start">
                      <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center text-[10px] font-black italic shrink-0">{item.step}</div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">{item.title}</p>
                        <p className="text-[9px] text-slate-500 font-medium">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Troubleshooting: Auth Timeout</p>
                </div>
                <p className="text-[9px] text-amber-500/80 font-medium leading-relaxed">
                  If you see "Auth Timeout" on iOS, ensure <strong>capacitor://localhost</strong> is added to "Authorized Domains" in Firebase Authentication settings.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-6">
           <div className="bg-[#0b1224] border border-slate-800 p-8 rounded-[3rem] w-full max-sm space-y-8 animate-in zoom-in shadow-3xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-black italic uppercase text-white tracking-tighter">Personnel Profile</h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{editingUser.email}</p>
              </div>
              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Current Tier</label>
                    <select value={editingUser.plan} onChange={e => setEditingUser({...editingUser, plan: e.target.value as any})} className="w-full bg-ha-bg border border-slate-800 p-4 rounded-xl text-xs text-white font-black uppercase">
                       {Object.keys(PLAN_PRICES_MONTHLY).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Grant Pro Access</label>
                     <div className="flex flex-wrap gap-2">
                        <button 
                          type="button"
                          onClick={() => {
                            const currentExpiry = editingUser.proExpiresAt && editingUser.proExpiresAt > Date.now() ? editingUser.proExpiresAt : Date.now();
                            const expiry = currentExpiry + (7 * 24 * 60 * 60 * 1000);
                            setEditingUser({...editingUser, plan: 'pro', proExpiresAt: expiry});
                          }}
                          className="flex-1 min-w-[80px] py-3 bg-ha-bg border border-slate-800 rounded-xl text-[8px] font-black uppercase text-ha-brand hover:border-ha-brand transition-all"
                        >
                          +1 Week
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            const currentExpiry = editingUser.proExpiresAt && editingUser.proExpiresAt > Date.now() ? editingUser.proExpiresAt : Date.now();
                            const expiry = currentExpiry + (30 * 24 * 60 * 60 * 1000);
                            setEditingUser({...editingUser, plan: 'pro', proExpiresAt: expiry});
                          }}
                          className="flex-1 min-w-[80px] py-3 bg-ha-bg border border-slate-800 rounded-xl text-[8px] font-black uppercase text-indigo-400 hover:border-indigo-500 transition-all"
                        >
                          +1 Month
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            const currentExpiry = editingUser.proExpiresAt && editingUser.proExpiresAt > Date.now() ? editingUser.proExpiresAt : Date.now();
                            const expiry = currentExpiry + (365 * 24 * 60 * 60 * 1000);
                            setEditingUser({...editingUser, plan: 'pro', proExpiresAt: expiry});
                          }}
                          className="flex-1 min-w-[80px] py-3 bg-ha-bg border border-slate-800 rounded-xl text-[8px] font-black uppercase text-indigo-400 hover:border-indigo-500 transition-all"
                        >
                          +1 Year
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            const septemberEnd = new Date(new Date().getFullYear(), 8, 30, 23, 59, 59);
                            const expiry = septemberEnd.getTime();
                            setEditingUser({...editingUser, plan: 'pro', proExpiresAt: expiry});
                          }}
                          className="flex-1 min-w-[80px] py-3 bg-ha-bg border border-slate-800 rounded-xl text-[8px] font-black uppercase text-amber-400 hover:border-amber-500 transition-all"
                        >
                          Till Sept
                        </button>
                     </div>
                    {editingUser.proExpiresAt && (
                      <div className="flex items-center justify-between px-2">
                        <p className="text-[7px] text-emerald-500 font-black uppercase tracking-widest">
                          Expires: {new Date(editingUser.proExpiresAt).toLocaleDateString()}
                        </p>
                        <button 
                          type="button"
                          onClick={() => setEditingUser({...editingUser, proExpiresAt: undefined})}
                          className="text-[7px] text-red-500 font-black uppercase tracking-widest hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                 </div>
                 <div className="flex flex-col gap-3 pt-2">
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={editingUser.isAdmin} onChange={e => setEditingUser({...editingUser, isAdmin: e.target.checked})} className="w-5 h-5 rounded border-slate-800 bg-ha-bg text-red-500" /><span className="text-[10px] font-black uppercase text-slate-400">Admin Credentials</span></label>
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={editingUser.isTester} onChange={e => setEditingUser({...editingUser, isTester: e.target.checked})} className="w-5 h-5 rounded border-slate-800 bg-ha-bg text-amber-500" /><span className="text-[10px] font-black uppercase text-slate-400">Tester Status</span></label>
                 </div>
                 <div className="space-y-3 pt-2 border-t border-slate-900">
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Facturatie</p>
                    <div className="flex gap-2">
                      {(['monthly', 'yearly'] as const).map(p => (
                        <button key={p} onClick={() => setEditingUser({...editingUser, billingPeriod: p})} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all border ${editingUser.billingPeriod === p ? (p === 'yearly' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-indigo-600 border-indigo-500 text-white') : 'bg-ha-bg border-slate-800 text-slate-500'}`}>
                          {p === 'monthly' ? 'Maandelijks' : 'Jaarlijks'}
                        </button>
                      ))}
                      <button onClick={() => setEditingUser({...editingUser, billingPeriod: undefined})} className={`px-3 py-3 rounded-xl text-[9px] font-black uppercase transition-all border ${!editingUser.billingPeriod ? 'bg-slate-700 border-slate-600 text-white' : 'bg-ha-bg border-slate-800 text-slate-600'}`}>Onbekend</button>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Startdatum abonnement</p>
                      <input
                        type="date"
                        value={editingUser.subscriptionStartedAt ? new Date(editingUser.subscriptionStartedAt).toISOString().split('T')[0] : ''}
                        onChange={e => setEditingUser({...editingUser, subscriptionStartedAt: e.target.value ? new Date(e.target.value).getTime() : undefined})}
                        className="w-full bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none focus:border-ha-brand"
                      />
                    </div>
                 </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setEditingUser(null)} className="flex-1 py-4 bg-slate-900 text-slate-600 rounded-xl text-[9px] font-black uppercase">Cancel</button>
                 <button onClick={handleUpdateUser} disabled={isSavingUser || isDeletingUser} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase shadow-xl">{isSavingUser ? 'Uplinking...' : 'Commit Changes'}</button>
              </div>
              <button
                onClick={handleDeleteUser}
                disabled={isDeletingUser || isSavingUser}
                className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600 rounded-xl text-[9px] font-black uppercase transition-all disabled:opacity-50"
              >
                {isDeletingUser ? 'Verwijderen...' : 'Account Permanent Verwijderen'}
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
