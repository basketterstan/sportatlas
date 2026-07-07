import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getOfferings, purchasePackage, restorePurchases, showCustomerCenter, type RCOffering, type RCPackage } from '../../utils/revenuecat';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onWebFallback?: () => void;
  isLoggedIn?: boolean;
  onRequestLogin?: () => void;
  targetPlan?: string;
}

const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, onSuccess, onWebFallback, isLoggedIn = true, onRequestLogin, targetPlan }) => {

  const isClubPlan = targetPlan && ['club10', 'club20', 'clubUnlimited', 'clubunlimited'].includes(targetPlan);
  const [offering, setOffering] = useState<RCOffering | null>(null);
  const [selected, setSelected] = useState<RCPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  const loadOfferings = () => {
    if (!isNative) {
      onWebFallback?.();
      return;
    }
    setError(null);
    setLoadingOfferings(true);
    getOfferings()
      .then(o => {
        setOffering(o);
        setSelected(o?.annual ?? o?.monthly ?? o?.availablePackages[0] ?? null);
      })
      .catch((e: unknown) => {
        const msg = (e as { message?: string })?.message ?? 'Kon abonnementen niet laden. Probeer opnieuw.';
        setError(msg);
      })
      .finally(() => setLoadingOfferings(false));
  };

  useEffect(() => {
    if (!isOpen) { setPurchaseComplete(false); return; }
    loadOfferings();
  }, [isOpen]);

  const handlePurchase = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await purchasePackage(selected);
      if (!isLoggedIn) {
        setPurchaseComplete(true);
      } else {
        onSuccess();
        onClose();
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (err?.message !== 'CANCELLED') {
        setError(err?.message ?? 'Purchase failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const plan = await restorePurchases();
      if (plan !== 'free') {
        onSuccess();
        onClose();
      } else {
        setError('No active subscription found to restore.');
      }
    } catch {
      setError('Restore failed. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleCustomerCenter = async () => {
    try {
      await showCustomerCenter();
    } catch {
      setError('Could not open customer center.');
    }
  };

  if (!isOpen) return null;

  if (purchaseComplete && !isLoggedIn) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-full sm:max-w-md bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 overflow-hidden shadow-2xl px-6 py-10 flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Aankoop geslaagd!</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Maak een account aan om je abonnement op al je apparaten te gebruiken. Je kan dit ook later doen.
            </p>
          </div>
          <button
            onClick={() => { onSuccess(); onRequestLogin?.(); }}
            className="w-full py-4 bg-blue-600 hover:brightness-110 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl text-sm"
          >
            Account aanmaken (aanbevolen)
          </button>
          <button
            onClick={() => { onSuccess(); onClose(); }}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors"
          >
            Overslaan — alleen op dit apparaat gebruiken
          </button>
        </div>
      </div>
    );
  }

  const getPlanLabel = (pkg: RCPackage) => {
    const id = pkg.productIdentifier.toLowerCase();
    if (id.includes('pro') && id.includes('year'))   return { name: 'Pro Yearly', badge: 'Best Value', color: 'bg-amber-500' };
    if (id.includes('pro') && id.includes('month'))  return { name: 'Pro Monthly', badge: '', color: '' };
    if (id.includes('basic') && id.includes('year')) return { name: 'Basic Yearly', badge: 'Save 17%', color: 'bg-blue-500' };
    if (id.includes('basic') && id.includes('month'))return { name: 'Basic Monthly', badge: '', color: '' };
    return { name: pkg.product.title, badge: '', color: '' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-4 text-center bg-gradient-to-b from-blue-600/20 to-transparent">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xl overflow-hidden border border-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">SportAtlas Premium</h2>
          <p className="text-slate-400 text-xs mt-1 font-medium">Unlock all coaching tools & AI features</p>
        </div>

        {/* Benefits */}
        <div className="px-6 py-3 grid grid-cols-2 gap-2">
          {['AI Match Analysis', 'Unlimited Drills', 'Team Management', 'Tactical Board', 'Training Sessions', 'Priority Support'].map(f => (
            <div key={f} className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="text-slate-300 text-[11px] font-medium">{f}</span>
            </div>
          ))}
        </div>

        {/* Club plan redirect banner */}
        {isClubPlan && (
          <div className="mx-6 mb-2 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <div>
              <p className="text-amber-400 font-black text-xs uppercase tracking-wider">Club subscription</p>
              <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                Club plans are managed via our website. Visit <span className="text-blue-400 font-bold">app.sportatlas.com</span> to subscribe with your club.
              </p>
              <button
                onClick={() => { window.open('https://app.sportatlas.com', '_blank'); onClose(); }}
                className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 font-black uppercase tracking-widest underline transition-colors"
              >
                Go to website →
              </button>
            </div>
          </div>
        )}

        {/* Packages */}
        <div className="px-6 py-3 space-y-2">
          {loadingOfferings ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? null : offering?.availablePackages.length ? (
            offering.availablePackages
              .filter(pkg => {
                const id = pkg.productIdentifier.toLowerCase();
                return id.includes('basic') || id.includes('pro');
              })
              .map(pkg => {
                const label = getPlanLabel(pkg);
                const isSelected = selected?.identifier === pkg.identifier;
                return (
                  <button
                    key={pkg.identifier}
                    onClick={() => setSelected(pkg)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${
                      isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-500' : 'border-slate-600'}`}>
                        {isSelected && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold text-sm">{label.name}</span>
                          {label.badge && (
                            <span className={`${label.color} text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full`}>
                              {label.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-white font-black text-sm">{pkg.localizedPriceString}</span>
                  </button>
                );
              })
          ) : null}

          {/* Static fallback prices when no offerings loaded */}
          {!loadingOfferings && !error && !offering?.availablePackages.length && (
            <>
              {[
                { id: 'basic_year',  name: 'Basic Yearly',  price: '€99.99', badge: 'Save 17%', badgeColor: 'bg-blue-500' },
                { id: 'basic_month', name: 'Basic Monthly', price: '€9.99',  badge: '',          badgeColor: '' },
                { id: 'pro_year',    name: 'Pro Yearly',    price: '€149.99', badge: 'Best Value', badgeColor: 'bg-amber-500' },
                { id: 'pro_month',   name: 'Pro Monthly',   price: '€14.99', badge: '',           badgeColor: '' },
              ].map(item => (
                <div key={item.id} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-slate-700 bg-slate-800/50 opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{item.name}</span>
                      {item.badge && (
                        <span className={`${item.badgeColor} text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-white font-black text-sm">{item.price}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center space-y-2">
            <p className="text-[11px] text-red-400 font-bold">{error}</p>
            <button
              onClick={loadOfferings}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* CTA */}
        <div className="px-6 pb-8 pt-2 space-y-3">
          <button
            onClick={handlePurchase}
            disabled={loading || !selected || loadingOfferings}
            className="w-full py-4 bg-blue-600 hover:brightness-110 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : selected ? `Subscribe — ${selected.localizedPriceString}` : 'Subscribe'}
          </button>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors"
            >
              {restoring ? 'Restoring...' : 'Restore Purchases'}
            </button>
            <span className="text-slate-700">·</span>
            <button
              onClick={handleCustomerCenter}
              className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors"
            >
              Manage
            </button>
          </div>

          <p className="text-center text-[9px] text-slate-600 leading-relaxed">
            Subscription auto-renews. Cancel anytime in App Store settings.
          </p>
          <p className="text-center text-[9px] text-slate-600 leading-relaxed">
            By subscribing you agree to our{' '}
            <button
              onClick={() => window.open('https://app.sportatlas.com/terms', '_blank')}
              className="text-slate-400 underline"
            >
              Terms of Use
            </button>
            {' '}and{' '}
            <button
              onClick={() => window.open('https://app.sportatlas.com/privacy', '_blank')}
              className="text-slate-400 underline"
            >
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;
