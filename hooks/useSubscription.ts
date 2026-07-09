import { useState, useMemo, useRef } from 'react';
import { type User } from 'firebase/auth';
import { doc, updateDoc, addDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Capacitor } from '@capacitor/core';
import { getActivePlan } from '../utils/revenuecat';
import { SubscriptionPlan, UserProfile } from '../types';

const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing']);

export function useSubscription(user: User | null, userProfile: UserProfile | null) {
  const [guestPlan, setGuestPlan] = useState<SubscriptionPlan>('free');
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [checkoutCycle, setCheckoutCycle] = useState<'month' | 'year'>('month');
  const [paymentFeedback, setPaymentFeedback] = useState<'success' | 'cancelled' | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isSyncingSubscription, setIsSyncingSubscription] = useState(false);
  // Ref prevents stale closure: state value captured at call time may lag behind
  const isSyncingRef = useRef(false);

  const mapStripePriceToPlan = (priceId?: string | null): SubscriptionPlan => {
    if (!priceId) return 'free';
    const env = import.meta.env;
    const priceMap: Record<string, SubscriptionPlan> = {
      [env.VITE_STRIPE_PRICE_BASIC_MONTH || 'price_1Ske3UP2I9jygKKDEx9iTc8o']: 'basic',
      [env.VITE_STRIPE_PRICE_BASIC_YEAR || 'price_1Ske3UP2I9jygKKDsyuemUrz']: 'basic',
      [env.VITE_STRIPE_PRICE_PRO_MONTH || 'price_1SlBQMP2I9jygKKDWMEdjIEm']: 'pro',
      [env.VITE_STRIPE_PRICE_PRO_YEAR || 'price_1SlBQMP2I9jygKKDAPzu4krq']: 'pro',
      [env.VITE_STRIPE_PRICE_CLUB10_MONTH || 'price_1SoVVvP2I9jygKKDMqczYko2']: 'club10',
      [env.VITE_STRIPE_PRICE_CLUB10_YEAR || 'price_1SoVVvP2I9jygKKDuUpPvPNH']: 'club10',
      [env.VITE_STRIPE_PRICE_CLUB20_MONTH || 'price_1SoVXFP2I9jygKKDulHau63s']: 'club20',
      [env.VITE_STRIPE_PRICE_CLUB20_YEAR || 'price_1SoVXFP2I9jygKKDweZqAKZb']: 'club20',
      [env.VITE_STRIPE_PRICE_CLUBUNLIMITED_MONTH || 'price_1SoVp9P2I9jygKKD0yTNqgSU']: 'clubUnlimited',
      [env.VITE_STRIPE_PRICE_CLUBUNLIMITED_YEAR || 'price_1SoVpbP2I9jygKKDHSLAHLNC']: 'clubUnlimited',
      [env.VITE_STRIPE_PRICE_GAMEANALYSIS_MONTH || 'price_1Tgg8cP2I9jygKKDzAVwAZc1']: 'gameAnalysis',
      [env.VITE_STRIPE_PRICE_GAMEANALYSIS_YEAR || 'price_1Tgg8cP2I9jygKKDUBcKvibr']: 'gameAnalysis',
    };
    return priceMap[priceId] || 'free';
  };

  const normalizePlan = (value?: string | null): SubscriptionPlan => {
    const normalized = (value || '').toLowerCase().replace(/[_\s-]/g, '');
    if (normalized === 'basic') return 'basic';
    if (normalized === 'pro') return 'pro';
    if (normalized === 'club10') return 'club10';
    if (normalized === 'club20') return 'club20';
    if (normalized === 'clubunlimited') return 'clubUnlimited';
    if (normalized === 'gameanalysis') return 'gameAnalysis';
    return 'free';
  };

  type StripeSubscriptionData = {
    status?: string;
    role?: string;
    stripeRole?: string;
    metadata?: { firebaseRole?: string };
    price?: string | { id?: string };
    priceId?: string;
    price_id?: string;
    items?: Array<{ price?: string | { id?: string } }> & { data?: Array<{ price?: string | { id?: string } }> };
  };

  const getActiveStripePlan = async (): Promise<SubscriptionPlan> => {
    if (!user?.uid) return 'free';
    try {
      const snap = await getDocs(collection(db, 'customers', user.uid, 'subscriptions'));

      let bestPlan: SubscriptionPlan = 'free';
      snap.forEach(subscriptionDoc => {
        const data = subscriptionDoc.data() as StripeSubscriptionData;
        if (!ACTIVE_STRIPE_STATUSES.has(String(data.status || '').toLowerCase())) return;

        const rolePlan = normalizePlan(data.role || data.stripeRole || data.metadata?.firebaseRole);
        if (rolePlan !== 'free') {
          bestPlan = rolePlan;
          return;
        }

        const extractId = (p: string | { id?: string } | undefined) =>
          typeof p === 'string' ? p : p?.id;

        const priceIds = [
          extractId(data.price),
          data.priceId,
          data.price_id,
          extractId(data.items?.[0]?.price),
          extractId(data.items?.data?.[0]?.price),
        ].filter(Boolean);

        for (const priceId of priceIds) {
          const pricePlan = mapStripePriceToPlan(priceId);
          if (pricePlan !== 'free') {
            bestPlan = pricePlan;
            break;
          }
        }
      });

      return bestPlan;
    } catch (error) {
      console.error("[Subscription] Stripe subscription check failed:", error);
      return 'free';
    }
  };

  const syncSubscriptionStatus = async (force = false) => {
    if (!user || !userProfile || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncingSubscription(true);
    console.log("[Subscription] Starting sync...");
    try {
      const platform = Capacitor.getPlatform();
      const stripePlan = await getActiveStripePlan();
      const rcPlan = await getActivePlan();
      let resolvedPlan = platform === 'web'
        ? (stripePlan !== 'free' ? stripePlan : rcPlan)
        : (rcPlan !== 'free' ? rcPlan : stripePlan);

      if (userProfile.managedByUid) resolvedPlan = 'pro';
      console.log(`[Subscription] Final Plan: ${resolvedPlan} (stripe=${stripePlan}, revenuecat=${rcPlan})`);

      const currentPlan = userProfile.plan || 'free';
      const isCurrentlyActive = !!(userProfile.subscriptionActive || userProfile.isSubscribed);
      const shouldBeActive = resolvedPlan !== 'free';

      if (force || resolvedPlan !== currentPlan || shouldBeActive !== isCurrentlyActive) {
        console.log(`[Subscription] Syncing Firestore: ${currentPlan} -> ${resolvedPlan}`);
        await updateDoc(doc(db, 'users', user.uid), {
          plan: resolvedPlan,
          subscriptionActive: shouldBeActive,
          isSubscribed: shouldBeActive,
          updatedAt: Date.now()
        });
      } else {
        console.log("[Subscription] Already in sync.");
      }
    } catch (error) {
      console.error("[Subscription] Sync failed:", error);
    } finally {
      isSyncingRef.current = false;
      setIsSyncingSubscription(false);
    }
  };

  const refreshGuestPlan = async () => {
    if (user) return;
    const plan = await getActivePlan();
    setGuestPlan(plan);
  };

  const handleUpgradeRequest = async (plan: SubscriptionPlan, cycle: 'month' | 'year') => {
    console.debug('Upgrade clicked:', plan, cycle);
    const platform = Capacitor.getPlatform();

    if (platform === 'ios') {
      setShowPaywall(true);
      return;
    }

    setCheckoutPlan(plan);
    setCheckoutCycle(cycle);

    try {
      await addDoc(collection(db, "checkout_signals"), {
        plan,
        cycle,
        userId: user?.uid || 'anonymous',
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        partnerRef: sessionStorage.getItem('ha_partner_ref') || null
      });
    } catch (e) {
      console.debug("Checkout signal logging suspended.");
    }
  };

  const checkoutPrice = useMemo(() => {
    if (!checkoutPlan) return "";
    const p = (checkoutPlan as string).toLowerCase();
    if (p === 'basic') return checkoutCycle === 'month' ? "€9,99" : "€99,99";
    if (p === 'pro') return checkoutCycle === 'month' ? "€14,99" : "€149,00";
    if (p === 'club10') return checkoutCycle === 'month' ? "€99" : "€999";
    if (p === 'club20') return checkoutCycle === 'month' ? "€169" : "€1699";
    if (p === 'clubunlimited') return checkoutCycle === 'month' ? "€249" : "€2499";
    if (p === 'gameanalysis') return checkoutCycle === 'month' ? "€49,99" : "€499";
    return "";
  }, [checkoutPlan, checkoutCycle]);

  const checkoutLookupKey = useMemo(() => {
    if (!checkoutPlan) return "";
    const env = import.meta.env;
    const priceMap: Record<string, string> = {
      'BASIC_MONTH':        env.VITE_STRIPE_PRICE_BASIC_MONTH        || 'price_1Ske3UP2I9jygKKDEx9iTc8o',
      'BASIC_YEAR':         env.VITE_STRIPE_PRICE_BASIC_YEAR         || 'price_1Ske3UP2I9jygKKDsyuemUrz',
      'PRO_MONTH':          env.VITE_STRIPE_PRICE_PRO_MONTH          || 'price_1SlBQMP2I9jygKKDWMEdjIEm',
      'PRO_YEAR':           env.VITE_STRIPE_PRICE_PRO_YEAR           || 'price_1SlBQMP2I9jygKKDAPzu4krq',
      'CLUB10_MONTH':       env.VITE_STRIPE_PRICE_CLUB10_MONTH       || 'price_1SoVVvP2I9jygKKDMqczYko2',
      'CLUB10_YEAR':        env.VITE_STRIPE_PRICE_CLUB10_YEAR        || 'price_1SoVVvP2I9jygKKDuUpPvPNH',
      'CLUB20_MONTH':       env.VITE_STRIPE_PRICE_CLUB20_MONTH       || 'price_1SoVXFP2I9jygKKDulHau63s',
      'CLUB20_YEAR':        env.VITE_STRIPE_PRICE_CLUB20_YEAR        || 'price_1SoVXFP2I9jygKKDweZqAKZb',
      'CLUBUNLIMITED_MONTH':   env.VITE_STRIPE_PRICE_CLUBUNLIMITED_MONTH    || 'price_1SoVp9P2I9jygKKD0yTNqgSU',
      'CLUBUNLIMITED_YEAR':    env.VITE_STRIPE_PRICE_CLUBUNLIMITED_YEAR     || 'price_1SoVpbP2I9jygKKDHSLAHLNC',
      'GAMEANALYSIS_MONTH':    env.VITE_STRIPE_PRICE_GAMEANALYSIS_MONTH     || 'price_1Tgg8cP2I9jygKKDzAVwAZc1',
      'GAMEANALYSIS_YEAR':     env.VITE_STRIPE_PRICE_GAMEANALYSIS_YEAR      || 'price_1Tgg8cP2I9jygKKDUBcKvibr',
    };
    const key = `${checkoutPlan.toUpperCase()}_${checkoutCycle.toUpperCase()}`;
    const result = priceMap[key] || "";
    console.debug(`Checkout Init: ${key} -> ${result ? 'ID_OK' : 'MISSING'}`);
    return result;
  }, [checkoutPlan, checkoutCycle]);

  return {
    guestPlan, setGuestPlan, refreshGuestPlan,
    checkoutPlan, setCheckoutPlan,
    checkoutCycle, setCheckoutCycle,
    paymentFeedback, setPaymentFeedback,
    showPaywall, setShowPaywall,
    isSyncingSubscription,
    syncSubscriptionStatus,
    handleUpgradeRequest,
    checkoutPrice,
    checkoutLookupKey,
  };
}
