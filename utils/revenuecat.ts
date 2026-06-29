import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL, type PurchasesOffering, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Purchases as PurchasesWeb } from '@revenuecat/purchases-js';
import { SubscriptionPlan } from '../types';

const APPLE_KEY  = import.meta.env.VITE_REVENUECAT_APPLE_KEY  ?? '';
const WEB_KEY    = import.meta.env.VITE_REVENUECAT_API_KEY    ?? '';

const ENTITLEMENT_PRO   = 'hoopsatlas Pro';
const ENTITLEMENT_BASIC = 'hoopsatlas Basic';

const isNative = () => Capacitor.isNativePlatform();

// ─── Web (Stripe/RevenueCat Web Billing) ────────────────────────────────────

interface WebCustomerInfo {
  entitlements: { active: Record<string, unknown> };
}

interface WebPurchasesInstance {
  logIn(userId: string): Promise<void>;
  getCustomerInfo(): Promise<WebCustomerInfo>;
  restorePurchases(): Promise<unknown>;
  getOfferings(): Promise<{ current: unknown }>;
}

let webInstance: WebPurchasesInstance | null = null;
let webConfigured = false;

const getWebInstance = (): WebPurchasesInstance | null => {
  try {
    return (PurchasesWeb as unknown as { getSharedInstance?: () => WebPurchasesInstance }).getSharedInstance?.() ?? null;
  } catch {
    return null;
  }
};

const configureWeb = (userId?: string) => {
  if (!WEB_KEY || WEB_KEY.includes('placeholder')) return;
  try {
    if (!webConfigured) {
      (PurchasesWeb as unknown as { configure: (key: string, uid: string) => void })
        .configure(WEB_KEY, userId ?? 'anonymous');
      webConfigured = true;
    }
    webInstance = getWebInstance();
  } catch (e) {
    console.warn('[RC Web] configure failed:', e);
  }
};

// ─── Native (Apple IAP via RevenueCat Capacitor SDK) ────────────────────────

let nativeConfigured = false;

const configureNative = async (userId?: string) => {
  if (!APPLE_KEY) {
    console.error('[RC Native] APPLE_KEY is missing — check VITE_REVENUECAT_APPLE_KEY in your build env');
    return;
  }
  try {
    if (!nativeConfigured) {
      await Purchases.setLogLevel({ level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR });
      await Purchases.configure({ apiKey: APPLE_KEY });
      nativeConfigured = true;
    }
    if (userId) {
      await Purchases.logIn({ appUserID: userId });
    }
  } catch (e) {
    console.error('[RC Native] configure failed:', e);
    nativeConfigured = false;
  }
};

// ─── Public API ──────────────────────────────────────────────────────────────

export const initializeAnonymous = async () => {
  if (!isNative() || nativeConfigured) return;
  await configureNative();
};

export const configurePurchases = async (userId?: string) => {
  if (isNative()) {
    await configureNative(userId);
  } else {
    configureWeb(userId);
  }
};

export const getActivePlan = async (): Promise<SubscriptionPlan> => {
  try {
    if (isNative()) {
      if (!nativeConfigured) return 'free';
      const { customerInfo } = await Purchases.getCustomerInfo();
      const active = customerInfo.entitlements.active;
      if (active['club_unlimited']) return 'clubUnlimited';
      if (active['club_20'])        return 'club20';
      if (active['club_10'])        return 'club10';
      if (active['game_analysis'])  return 'gameAnalysis';
      if (active[ENTITLEMENT_PRO])  return 'pro';
      if (active[ENTITLEMENT_BASIC])return 'basic';
      return 'free';
    } else {
      if (!webConfigured) return 'free';
      const instance = webInstance ?? getWebInstance();
      if (!instance) return 'free';
      const info = await instance.getCustomerInfo();
      const active = info.entitlements.active;
      if (active['club_unlimited']) return 'clubUnlimited';
      if (active['club_20'])        return 'club20';
      if (active['club_10'])        return 'club10';
      if (active['game_analysis'])  return 'gameAnalysis';
      if (active[ENTITLEMENT_PRO])  return 'pro';
      if (active[ENTITLEMENT_BASIC])return 'basic';
      return 'free';
    }
  } catch (e) {
    console.error('[RC] getActivePlan failed:', e);
    return 'free';
  }
};

export const checkProEntitlement = async (): Promise<boolean> => {
  const plan = await getActivePlan();
  return plan === 'pro';
};

export const restorePurchases = async (): Promise<SubscriptionPlan> => {
  try {
    if (isNative()) {
      if (!nativeConfigured) return 'free';
      await Purchases.restorePurchases();
      return getActivePlan();
    } else {
      const instance = webInstance ?? getWebInstance();
      if (instance) await instance.restorePurchases();
      return getActivePlan();
    }
  } catch (e) {
    console.error('[RC] restorePurchases failed:', e);
    return 'free';
  }
};

// ─── Offerings ───────────────────────────────────────────────────────────────

export interface RCOffering {
  identifier: string;
  monthly: RCPackage | null;
  annual: RCPackage | null;
  availablePackages: RCPackage[];
}

export interface RCPackage {
  identifier: string;
  productIdentifier: string;
  localizedPriceString: string;
  product: {
    title: string;
    description: string;
    priceString: string;
  };
  _raw: PurchasesPackage;
}

const mapPackage = (pkg: PurchasesPackage): RCPackage => ({
  identifier: pkg.identifier,
  productIdentifier: pkg.product.identifier,
  localizedPriceString: pkg.product.priceString,
  product: {
    title: pkg.product.title,
    description: pkg.product.description,
    priceString: pkg.product.priceString,
  },
  _raw: pkg,
});

export const getOfferings = async (): Promise<RCOffering | null> => {
  if (!isNative()) return null;
  if (!nativeConfigured) {
    await configureNative();
  }
  if (!nativeConfigured) {
    throw new Error('Could not connect to the store. Please check your internet connection and try again.');
  }
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current ?? Object.values(offerings.all ?? {})[0] ?? null;
    if (!current) {
      throw new Error('No active subscription products found. Please try again later or contact support.');
    }
    return {
      identifier: current.identifier,
      monthly: current.monthly ? mapPackage(current.monthly) : null,
      annual: current.annual ? mapPackage(current.annual) : null,
      availablePackages: current.availablePackages.map(mapPackage),
    };
  } catch (e) {
    console.error('[RC] getOfferings failed:', e);
    throw e;
  }
};

export const purchasePackage = async (pkg: RCPackage): Promise<SubscriptionPlan> => {
  if (!isNative()) throw new Error('Native purchase only available on iOS/Android');
  try {
    await Purchases.purchasePackage({ aPackage: pkg._raw });
    return getActivePlan();
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) throw new Error('CANCELLED');
    throw e;
  }
};

// ─── Paywall / Customer Center ────────────────────────────────────────────────

export const showCustomerCenter = async () => {
  if (!isNative() || !nativeConfigured) throw new Error('Customer Center only available on iOS/Android');
  try {
    await (Purchases as unknown as { presentCustomerCenter: () => Promise<void> }).presentCustomerCenter();
  } catch (e) {
    console.error('[RC] Customer Center failed:', e);
    throw e;
  }
};

export const showProPaywall = async () => {
  const offerings = await getOfferings();
  if (!offerings) throw new Error('No offerings available');
  return offerings;
};
