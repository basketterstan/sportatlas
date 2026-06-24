
import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, browserLocalPersistence, indexedDBLocalPersistence, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getMessaging, Messaging, getToken, isSupported } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const isNative = Capacitor.isNativePlatform();
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

// initializeAuth sets persistence up front — no hidden iframe, no auth domain network call.
// Falls back to getAuth() if auth was already initialized (hot reload / multiple imports).
const createAuth = (): Auth => {
  try {
    return initializeAuth(app, {
      persistence: (isNative || isFileProtocol) ? browserLocalPersistence : indexedDBLocalPersistence,
    });
  } catch {
    return getAuth(app);
  }
};

export const db: Firestore = getFirestore(app);
export const auth: Auth = createAuth();
export const storage: FirebaseStorage = getStorage(app);

/**
 * Probeert messaging veilig te initialiseren en geeft een specifieke reden bij falen.
 */
export const getSafeMessaging = async (): Promise<{ messaging: Messaging | null; error?: string }> => {
  if (typeof window === 'undefined') return { messaging: null };
  
  if (!window.isSecureContext) {
    return { 
      messaging: null, 
      error: "UNSECURE CONNECTION: Push notifications only work via HTTPS or localhost. You are currently using an unsecure IP address or connection." 
    };
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      return { messaging: null, error: "BROWSER LIMITATION: This browser does not support Firebase Messaging." };
    }
    return { messaging: getMessaging(app) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { messaging: null, error: `INITIALIZATION ERROR: ${msg}` };
  }
};

// Persistence is set via initializeAuth above — this resolves immediately for backwards compat.
export const persistencePromise = Promise.resolve(true);

export const requestNotificationPermission = async (uid: string) => {
  const { messaging: messagingInstance, error: initError } = await getSafeMessaging();
  
  if (initError) {
    throw new Error(initError);
  }

  if (!messagingInstance) {
    throw new Error("Messaging service is not available.");
  }

  const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  if (!VAPID_KEY) {
    throw new Error("CONFIGURATION NEEDED: Voeg VITE_FIREBASE_VAPID_KEY toe in je .env bestand (Firebase Console > Project Settings > Cloud Messaging).");
  }
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Android vereist dat de service worker geregistreerd is voordat getToken wordt aangeroepen
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      
      // Wacht tot de service worker actief is
      await navigator.serviceWorker.ready;
      
      const token = await getToken(messagingInstance, { 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', uid), { 
          fcmToken: token, 
          notificationsEnabled: true,
          updatedAt: Date.now()
        });
        return token;
      }
      throw new Error("No token received from Google.");
    } else {
      throw new Error("Permission denied by user.");
    }
  } catch (error: unknown) {
    console.error("FCM Error:", error);
    throw error;
  }
};

export const generateReferralCode = (userName: string) => {
  const prefix = (userName || 'HA').substring(0, 3).toUpperCase().padEnd(3, 'X');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${random}`;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

type Serializable = string | number | boolean | null | Serializable[] | { [key: string]: Serializable };

export const cleanRecord = (obj: unknown): Record<string, unknown> =>
  (cleanObject(obj) ?? {}) as Record<string, unknown>;

export const cleanObject = (obj: unknown, seen = new WeakSet()): Serializable | undefined => {
  if (obj === null || typeof obj !== 'object') return obj as Serializable;
  if (seen.has(obj as object)) return undefined;
  const record = obj as Record<string, unknown>;
  const constructorName = record.constructor?.name;
  if (
    constructorName === 'Y' || constructorName === 'Ka' ||
    record._leaflet_id !== undefined || record._leaflet_events !== undefined ||
    (typeof Node !== 'undefined' && obj instanceof Node) ||
    (typeof Window !== 'undefined' && obj instanceof Window)
  ) {
    return undefined;
  }
  if (['FieldValue', 'Timestamp', 'GeoPoint'].includes(constructorName as string)) {
    return obj as Serializable;
  }
  seen.add(obj as object);
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(item => cleanObject(item, seen)).filter((v): v is Serializable => v !== undefined);
  }
  const isPlainObject = record.constructor === Object || record.constructor === undefined;
  if (!isPlainObject) {
    if (typeof (record as { toJSON?: () => unknown }).toJSON === 'function') {
      try {
        const json = (record as { toJSON: () => unknown }).toJSON();
        if (json !== obj) return cleanObject(json, seen);
      } catch { return undefined; }
    }
  }
  const cleaned: Record<string, Serializable> = {};
  let hasProperties = false;
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      if (key.startsWith('_')) continue;
      const cleanedVal = cleanObject(record[key], seen);
      if (cleanedVal !== undefined) {
        cleaned[key] = cleanedVal;
        hasProperties = true;
      }
    }
  }
  return hasProperties ? cleaned : (isPlainObject ? {} : undefined);
};
