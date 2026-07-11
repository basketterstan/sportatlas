
import React, { useState, useEffect } from 'react';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc, setDoc, collection, getDocs, query, getDoc, orderBy, limit, where, addDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, generateReferralCode, requestNotificationPermission } from '../../utils/firebase';
import { showCustomerCenter } from '../../utils/revenuecat';
import { Capacitor } from '@capacitor/core';
import { Drill, UserProfile, ViewState, SubscriptionPlan, Sport } from '../../types';
import { SPORTS } from '../../data/sports';
import { getTranslation, getAppLanguage, AppLanguage, LANGUAGE_STORAGE_KEY } from '../../utils/i18n';

interface SettingsProps {
  drills: Drill[];
  userProfile?: UserProfile | null;
  onImport: (newDrills: Drill[]) => void;
  onClearAll: () => void;
  onManageTeams?: () => void;
  onOpenAdmin?: () => void;
  onNavigate: (view: ViewState) => void;
  onSyncSubscription?: () => void;
  isSyncingSubscription?: boolean;
}

const Settings: React.FC<SettingsProps> = ({ userProfile, onOpenAdmin, onNavigate, onSyncSubscription, isSyncingSubscription }) => {
  const t = getTranslation(userProfile);
  const currentLang = getAppLanguage(userProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(userProfile?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [managedCoaches, setManagedCoaches] = useState<UserProfile[]>([]);
  const [newCoachEmail, setNewCoachEmail] = useState('');
  const [isAddingCoach, setIsAddingCoach] = useState(false);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState<'none' | 'pending' | 'approved'>('none');

  useEffect(() => {
    if (userProfile?.managedCoachUids?.length) {
      setLoadingCoaches(true);
      const fetchCoaches = async () => {
        try {
          const coaches: UserProfile[] = [];
          for (const uid of userProfile.managedCoachUids || []) {
            const docSnap = await getDoc(doc(db, 'users', uid));
            if (docSnap.exists()) {
              coaches.push({ ...docSnap.data() as UserProfile, uid });
            }
          }
          setManagedCoaches(coaches);
        } catch (err) {
          console.error("Error fetching managed coaches:", err);
        } finally {
          setLoadingCoaches(false);
        }
      };
      fetchCoaches();
    } else {
      setManagedCoaches([]);
    }
  }, [userProfile?.managedCoachUids]);

  useEffect(() => {
    const email = userProfile?.email || auth.currentUser?.email;
    if (!email) return;
    const checkPartner = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'partner_applications'), where('email', '==', email.toLowerCase())));
        if (!snap.empty) {
          const status = snap.docs[0].data().status;
          setPartnerStatus(status === 'approved' ? 'approved' : status === 'pending' ? 'pending' : 'none');
        }
      } catch (e) { /* silent */ }
    };
    checkPartner();
  }, [userProfile?.email]);

  const handleAddCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !newCoachEmail.trim() || isAddingCoach) return;

    const limit = userProfile.plan === 'club10' ? 10 : userProfile.plan === 'club20' ? 20 : 999;
    if ((userProfile.managedCoachUids?.length || 0) >= limit) {
      alert(`Limit reached for your ${userProfile.plan} plan.`);
      return;
    }

    setIsAddingCoach(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', newCoachEmail.trim().toLowerCase()));
      const querySnap = await getDocs(q);
      
      if (querySnap.empty) {
        alert("No user found with this email.");
        return;
      }

      const coachDoc = querySnap.docs[0];
      const coachData = coachDoc.data() as UserProfile;
      const coachUid = coachDoc.id;

      if (coachUid === userProfile.uid) {
        alert("You cannot add yourself.");
        return;
      }

      if (coachData.managedByUid) {
        alert("This coach is already managed by another club.");
        return;
      }

      // Update coach
      await updateDoc(doc(db, 'users', coachUid), {
        managedByUid: userProfile.uid,
        clubId: userProfile.uid,
        plan: 'pro',
        subscriptionActive: true,
        updatedAt: Date.now()
      });

      // Update club owner
      const currentManaged = userProfile.managedCoachUids || [];
      await updateDoc(doc(db, 'users', userProfile.uid!), {
        managedCoachUids: [...currentManaged, coachUid],
        updatedAt: Date.now()
      });

      setNewCoachEmail('');
      alert("Coach added successfully!");
    } catch (err) {
      console.error("Error adding coach:", err);
      alert("Failed to add coach.");
    } finally {
      setIsAddingCoach(false);
    }
  };

  const handleRemoveCoach = async (coachUid: string) => {
    if (!userProfile || !window.confirm("Are you sure you want to remove this coach? They will lose Pro access.")) return;

    try {
      // Update coach
      await updateDoc(doc(db, 'users', coachUid), {
        managedByUid: null,
        clubId: null,
        plan: 'free',
        subscriptionActive: false,
        updatedAt: Date.now()
      });

      // Update club owner
      const currentManaged = userProfile.managedCoachUids || [];
      await updateDoc(doc(db, 'users', userProfile.uid!), {
        managedCoachUids: currentManaged.filter(id => id !== coachUid),
        updatedAt: Date.now()
      });

      alert("Coach removed.");
    } catch (err) {
      console.error("Error removing coach:", err);
      alert("Failed to remove coach.");
    }
  };

  const isClubPlan = userProfile?.plan === 'club10' || userProfile?.plan === 'club20' || userProfile?.plan === 'clubUnlimited';
  const isPro = !!(userProfile?.isSubscribed || userProfile?.subscriptionActive || userProfile?.isTester || userProfile?.isAdmin);
  const isSecure = typeof window !== 'undefined' && window.isSecureContext;

  const handleLanguageChange = async (lang: AppLanguage) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { language: lang }).catch(() => {});
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { name: editName });
      await updateProfile(auth.currentUser, { displayName: editName });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Opslaan mislukt. Probeer opnieuw.");
    } finally { setSavingProfile(false); }
  };

  const handleToggleNotifications = async () => {
    if (!userProfile?.uid || isEnablingNotifications) return;
    
    if (userProfile.notificationsEnabled) {
      setIsEnablingNotifications(true);
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), { notificationsEnabled: false });
      } catch (e) {
        alert("Error during disable.");
      } finally {
        setIsEnablingNotifications(false);
      }
      return;
    }

    if (!isSecure) {
      alert("Push notifications require a secure connection (HTTPS).");
      return;
    }

    setIsEnablingNotifications(true);
    try {
      await requestNotificationPermission(userProfile.uid);
      alert("Notifications successfully activated!");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Unknown error while activating notifications.");
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  const handleOpenStripePortal = async () => {
    if (!auth.currentUser || isOpeningPortal) return;
    
    const platform = Capacitor.getPlatform();
    
    if (platform !== 'web') {
      // On native platforms, we use RevenueCat's Customer Center
      try {
        await showCustomerCenter();
        return;
      } catch (e) {
        console.error("Native Customer Center failed, falling back to Stripe portal:", e);
      }
    }

    setIsOpeningPortal(true);
    const uid = auth.currentUser.uid;
    const fallbackUrl = "https://billing.stripe.com/p/login/3cI8wR7I680p6iM44J8IU00";
    const portalTimeout = setTimeout(() => {
      setIsOpeningPortal(false);
      window.location.assign(fallbackUrl);
    }, 6500);
    try {
      const portalRef = collection(db, 'customers', uid, 'portal_sessions');
      const docRef = await addDoc(portalRef, { return_url: window.location.origin + '?view=settings' });
      const unsub = onSnapshot(docRef, (snap) => {
        const data = snap.data() as any;
        if (data?.url) {
          clearTimeout(portalTimeout); unsub();
          window.location.assign(data.url);
        } else if (data?.error) {
          clearTimeout(portalTimeout); unsub();
          setIsOpeningPortal(false); window.location.assign(fallbackUrl);
        }
      });
    } catch (err) {
      clearTimeout(portalTimeout); setIsOpeningPortal(false); window.location.assign(fallbackUrl);
    }
  };

  const handleShareApp = async () => {
    const shareData = {
      title: 'SportAtlas',
      text: 'Check out SportAtlas - The ultimate AI playbook and coaching app for sports!',
      url: window.location.origin
    };
    
    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      const mailto = `mailto:?subject=Check out SportAtlas&body=Hey! I've been using SportAtlas to organize my drills and plays. You should check it out: ${window.location.origin}`;
      window.location.href = mailto;
    }
  };

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter">Platform <span className="text-ha-brand">Office</span></h2>
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">Deployment & Credentials</p>
      </div>

      <section className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
         {isEditing ? (
           <form onSubmit={handleUpdateProfile} className="space-y-4">
             <div className="space-y-2">
               <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Display Name</label>
               <input
                 autoFocus
                 type="text"
                 value={editName}
                 onChange={(e) => setEditName(e.target.value)}
                 className="w-full bg-ha-bg border border-slate-700 rounded-xl px-5 py-4 text-sm text-white font-black uppercase tracking-tight outline-none focus:border-ha-brand transition-all"
               />
             </div>
             <div className="flex gap-3">
               <button type="button" onClick={() => { setIsEditing(false); setEditName(userProfile?.name || ''); }} className="flex-1 py-3 bg-slate-900 text-slate-500 font-black uppercase text-[10px] rounded-xl">Cancel</button>
               <button type="submit" disabled={savingProfile} className="flex-[2] py-3 bg-ha-brand text-slate-950 font-black uppercase text-[10px] rounded-xl disabled:opacity-50">{savingProfile ? 'Saving...' : 'Save Name'}</button>
             </div>
           </form>
         ) : (
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border-2 ${isPro ? 'border-indigo-500' : 'border-slate-800'} font-black italic text-3xl shadow-inner`}>{userProfile?.name?.charAt(0)}</div>
                <div className="text-left">
                  <p className="font-black text-white text-xl italic uppercase tracking-tighter leading-none mb-1">{userProfile?.name}</p>
                  <p className="text-[11px] text-slate-500 font-medium tracking-wide">{userProfile?.email}</p>
                </div>
              </div>
              <button onClick={() => setIsEditing(true)} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white hover:border-ha-brand transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
           </div>
         )}
      </section>
      
      {isClubPlan && (
        <section className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-ha-brand ml-1 italic">Club Management</h3>
          <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-black italic uppercase text-white">Managed Coaches</p>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-tight">
                Add coaches to your plan. They will receive Pro access.
                <br />
                Limit: {userProfile?.managedCoachUids?.length || 0} / {userProfile?.plan === 'club10' ? 10 : userProfile?.plan === 'club20' ? 20 : 'Unlimited'}
              </p>
            </div>

            <form onSubmit={handleAddCoach} className="flex gap-2">
              <input 
                type="email" 
                value={newCoachEmail}
                onChange={(e) => setNewCoachEmail(e.target.value)}
                placeholder="Coach Email"
                className="flex-1 bg-ha-bg border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:border-ha-brand outline-none transition-colors"
              />
              <button 
                type="submit"
                disabled={isAddingCoach || !newCoachEmail.trim()}
                className="px-6 py-3 bg-cyan-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {isAddingCoach ? '...' : 'Add'}
              </button>
            </form>

            <div className="space-y-3">
              {loadingCoaches ? (
                <div className="py-4 flex justify-center">
                  <div className="w-5 h-5 border-2 border-ha-brand/30 border-t-cyan-500 rounded-full animate-spin"></div>
                </div>
              ) : managedCoaches.length > 0 ? (
                managedCoaches.map((coach) => (
                  <div key={coach.uid} className="flex items-center justify-between p-4 bg-ha-bg/50 rounded-2xl border border-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800 font-black italic text-sm text-ha-brand">
                        {coach.name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white uppercase italic">{coach.name}</p>
                        <p className="text-[9px] text-slate-500 font-medium">{coach.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => coach.uid && handleRemoveCoach(coach.uid)}
                      className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center py-4">No coaches added yet.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* GROWTH & COMMUNITY */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 ml-1 italic">{t.growthCommunity}</h3>
        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-6">
           <div className="space-y-2">
              <p className="text-sm font-black italic uppercase text-white">{t.helpCommunityGrow}</p>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-tight">{t.inviteOtherCoaches}</p>
           </div>
           
           <button 
             onClick={handleShareApp}
             className="w-full py-5 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
           >
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
             {t.inviteACoach}
           </button>

           <div className="pt-4 border-t border-slate-900 flex items-center justify-between">
              <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">{t.shareSportAtlasOnSocial}</p>
              <div className="flex gap-3">
                 <a href="https://twitter.com/intent/tweet?text=I%27m%20using%20SportAtlas%20to%20level%20up%20my%20coaching!%20Check%20it%20out:%20https://sportatlas.com" target="_blank" className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                 </a>
                 <a href="https://www.facebook.com/sharer/sharer.php?u=https://sportatlas.com" target="_blank" className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                 </a>
              </div>
           </div>
        </div>
      </section>

      {/* NOTIFICATION SETTINGS */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1 italic">{t.tacticalAlerts}</h3>
        <div className={`bg-[#0b1224] border ${!isSecure ? 'border-amber-500/20' : 'border-slate-800'} rounded-[2.5rem] p-8 shadow-xl space-y-4`}>
           <div className="flex items-center justify-between">
              <div className="space-y-1">
                 <p className="text-sm font-black italic uppercase text-white">{t.pushNotifications}</p>
                 <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-tight">{t.receiveSquadUpdates}</p>
              </div>
              <button 
                onClick={handleToggleNotifications}
                disabled={isEnablingNotifications}
                className={`w-14 h-7 rounded-full relative transition-all duration-300 ${userProfile?.notificationsEnabled ? 'bg-indigo-600' : 'bg-slate-800'} ${!isSecure ? 'opacity-30 grayscale' : ''}`}
              >
                 <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 ${userProfile?.notificationsEnabled ? 'left-8' : 'left-1'}`}></div>
              </button>
           </div>
        </div>
      </section>

      {/* DISPLAY LANGUAGE */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1 italic">{t.languageSection}</h3>
        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-black italic uppercase text-white">{t.displayLang}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-tight">{t.languageSubtitle}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-b-4 transition-all flex items-center justify-center gap-2 ${
                currentLang === 'en'
                  ? 'bg-indigo-600 border-indigo-800 text-white shadow-xl'
                  : 'bg-slate-900 border-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-lg">🇬🇧</span> English
            </button>
            <button
              onClick={() => handleLanguageChange('es')}
              className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-b-4 transition-all flex items-center justify-center gap-2 ${
                currentLang === 'es'
                  ? 'bg-indigo-600 border-indigo-800 text-white shadow-xl'
                  : 'bg-slate-900 border-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-lg">🇪🇸</span> Español
            </button>
          </div>
        </div>
      </section>

      {/* PRIMARY SPORT */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-1 italic">Primary Sport</h3>
        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-black italic uppercase text-white">Your Sport</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-tight">Select the sport you coach or play</p>
          </div>
          {/* Sport selector */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Primary Sport</p>
            <div className="grid grid-cols-3 gap-2">
              {SPORTS.map(sport => {
                const isActive = userProfile?.sport === sport.id;
                return (
                  <button
                    key={sport.id}
                    onClick={async () => {
                      if (!userProfile?.uid) return;
                      await updateDoc(doc(db, 'users', userProfile.uid), { sport: sport.id });
                    }}
                    className={`py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all flex flex-col items-center gap-1 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'bg-ha-bg border border-slate-800 text-slate-500 hover:border-slate-600'}`}
                  >
                    <span className="text-lg">{sport.emoji}</span>
                    <span>{sport.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT HOOPSATLAS - MISSION BRIEF */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 italic">{t.missionProtocol}</h3>
        <div className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-6 overflow-hidden relative">
          <button 
            onClick={() => setShowAbout(!showAbout)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 text-ha-brand group-hover:scale-105 transition-transform">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M2 12h20M12 12l8-8M12 12l-8 8"/></svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-black italic uppercase text-white">{t.aboutSportAtlas}</p>
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">{t.ourOriginDirective}</p>
              </div>
            </div>
            <svg 
              className={`text-slate-700 transition-transform duration-300 ${showAbout ? 'rotate-180' : ''}`} 
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showAbout && (
            <div className="space-y-6 pt-6 border-t border-slate-900 animate-in slide-in-from-top-4 duration-300">
              <div className="p-6 bg-ha-bg/50 rounded-[2rem] border border-slate-900 space-y-4">
                <h4 className="text-[10px] font-black uppercase text-ha-brand tracking-[0.3em] border-b border-cyan-900/30 pb-2">{t.theMission}</h4>
                <div className="space-y-4 text-slate-400 text-[11px] font-medium leading-relaxed uppercase tracking-tight italic opacity-90">
                  <p>{t.aboutP1}</p>
                  <p>{t.aboutP2}</p>
                  <p>{t.aboutP3}</p>
                  <p>{t.aboutP4}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {userProfile?.isAdmin && (
        <section className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-red-500 ml-1 italic">{t.systemAdmin}</h3>
          <div className="bg-red-500/5 border border-red-500/20 rounded-[2.5rem] p-8 shadow-xl space-y-6">
             <button onClick={onOpenAdmin} className="w-full py-5 bg-slate-900 border border-red-900/30 text-red-500 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                {t.openCommandHQ}
             </button>
          </div>
        </section>
      )}

      <section className="bg-[#0b1224] border border-slate-800 rounded-[2.5rem] p-8 shadow-xl space-y-4 text-center">
         {partnerStatus === 'approved' ? (
           <button onClick={() => onNavigate('partners')} className="w-full py-5 bg-green-500/10 border border-green-500/30 text-green-400 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
             Partner Dashboard
           </button>
         ) : partnerStatus === 'pending' ? (
           <button onClick={() => onNavigate('partners')} className="w-full py-5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
             Application Pending
           </button>
         ) : (
           <button onClick={() => onNavigate('partners')} className="w-full py-5 bg-ha-brand/10 border border-ha-brand/30 text-ha-brand text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
             Become a Partner
           </button>
         )}
         <button onClick={() => onNavigate('support')} className="w-full py-5 bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
           {t.contactSupport}
         </button>
         <button onClick={handleOpenStripePortal} disabled={isOpeningPortal} className="w-full py-5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
           {isOpeningPortal ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
           {isOpeningPortal ? 'Linking...' : t.manageBillingPayouts}
         </button>
         {onSyncSubscription && (
           <button 
             onClick={onSyncSubscription} 
             disabled={isSyncingSubscription} 
             className="w-full py-5 bg-slate-900 border border-slate-800 text-indigo-400 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
           >
             {isSyncingSubscription ? <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></div> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>}
             {isSyncingSubscription ? 'Syncing...' : t.restorePurchases}
           </button>
         )}
      </section>

      <div className="flex flex-col items-center gap-6 pt-10">
        <button onClick={() => onNavigate('data-erasure')} className="w-full px-4 py-5 bg-red-500/5 border border-red-500/20 text-red-500/70 text-[10px] font-black uppercase rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Delete Account
        </button>
        <button onClick={() => signOut(auth)} className="w-full px-4 py-5 bg-ha-bg border border-slate-800 text-red-500/60 text-[10px] font-black uppercase rounded-2xl">{t.terminate}</button>
        <div className="flex items-center gap-4">
          <button onClick={() => onNavigate('privacy')} className="text-[8px] font-black text-slate-700 hover:text-slate-400 uppercase tracking-[0.3em] transition-colors">Privacy Policy</button>
          <span className="text-slate-800 text-[8px]">·</span>
          <button onClick={() => onNavigate('subscription-terms')} className="text-[8px] font-black text-slate-700 hover:text-slate-400 uppercase tracking-[0.3em] transition-colors">Terms</button>
        </div>
        <img src="/sportatlas-logo.png" alt="SportAtlas" className="w-32 opacity-20" />
      </div>
    </div>
  );
};

export default Settings;
