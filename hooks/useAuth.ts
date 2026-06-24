import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, persistencePromise, handleFirestoreError, OperationType } from '../utils/firebase';
import { configurePurchases } from '../utils/revenuecat';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const handleError = (event: PromiseRejectionEvent) => {
      console.error("[error] - UNHANDLED REJECTION:", event.reason ?? event);
    };
    window.addEventListener('unhandledrejection', handleError);

    persistencePromise.then(ok => {
      console.log(`[log] - Persistence Ready in App: ${ok}`);
    });

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      console.log(`[log] - Auth State Changed: ${currentUser ? '[authenticated]' : 'NULL'}`);
      setUser(currentUser);

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (currentUser) {
        console.log("[log] - Starting profile listener...");
        configurePurchases(currentUser.uid);

        unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
          if (snap.exists()) {
            console.log("[log] - Profile Sync Success");
            setUserProfile({ ...snap.data() as UserProfile, uid: currentUser.uid });
          } else {
            console.warn("[log] - Profile missing, creating recovery profile");
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              name: currentUser.displayName || 'New Coach',
              username: (currentUser.displayName || 'user').toLowerCase().replace(/\s+/g, '') + '_' + crypto.randomUUID().substring(0, 8),
              email: currentUser.email || '',
              role: 'coach',
              plan: 'free',
              photoFileName: 'default_coach.png',
              subscriptionActive: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            setDoc(doc(db, 'users', currentUser.uid), newProfile).catch(e => {
              console.error("[error] - Profile recovery failed:", e);
            });
            setUserProfile(newProfile);
          }
          setAuthLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
          setAuthLoading(false);
        });
      } else {
        console.log("[log] - No user detected, clearing profile");
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    const timeout = setTimeout(() => {
      setAuthLoading(prev => {
        if (prev) console.warn("[warn] - Auth loading safety timeout reached.");
        return false;
      });
    }, 8000);

    const hideSplash = async () => {
      try {
        const cap = (window as Window & { Capacitor?: { Plugins?: { SplashScreen?: { hide: () => Promise<void> } } } }).Capacitor;
        if (cap?.Plugins?.SplashScreen) {
          await cap.Plugins.SplashScreen.hide();
        }
      } catch (e) {
        console.warn("Could not hide splash screen automatically", e);
      }
    };
    hideSplash();

    return () => {
      window.removeEventListener('unhandledrejection', handleError);
      unsubAuth();
      if (unsubProfile) unsubProfile();
      clearTimeout(timeout);
    };
  }, []);

  return { user, userProfile, authLoading, setAuthLoading };
}
