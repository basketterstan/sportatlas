
import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, writeBatch, collection, arrayUnion } from 'firebase/firestore';
import { auth, db, generateReferralCode, persistencePromise } from '../../utils/firebase';
import { ViewState, UserRole, Sport } from '../../types';
import { SPORTS } from '../../data/sports';
import { getTranslation } from '../../utils/i18n';

interface AuthProps {
  onNavigate?: (view: ViewState, drillId?: string, mode?: 'login' | 'signup') => void;
  initialMode?: 'login' | 'signup';
}

type AuthMode = 'login' | 'signup' | 'reset' | 'join-code' | 'join-register';

const Auth: React.FC<AuthProps> = ({ onNavigate, initialMode = 'login' }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode as AuthMode);
  const [showVerification, setShowVerification] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [enteredReferralCode, setEnteredReferralCode] = useState('');
  const [role, setRole] = useState<UserRole>('coach');
  const [selectedSport, setSelectedSport] = useState<Sport>(Sport.BASKETBALL);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinTeamId, setJoinTeamId] = useState('');
  const [joinTeamName, setJoinTeamName] = useState('');

  const storedLang = localStorage.getItem('ha_language');
  const userLang = storedLang === 'es' ? 'es' : (navigator.language.startsWith('nl') ? 'nl' : 'en');
  const t = getTranslation({ language: userLang } as any);

  useEffect(() => {
    setMode(initialMode as AuthMode);
  }, [initialMode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await persistencePromise;
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg(userLang === 'nl' ? "Reset link verstuurd! Controleer je inbox." : "Reset link sent! Check your inbox.");
      setTimeout(() => setMode('login'), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      console.log(`[log] - Attempting ${mode}`);
      console.log(`[log] - Device is Online: ${navigator.onLine}`);
      
      if (!navigator.onLine) {
        throw new Error(userLang === 'nl' ? "Geen internetverbinding. Controleer je netwerk." : "No internet connection. Please check your network.");
      }
      
      // Wacht tot persistentie klaar is
      console.log("[log] - Waiting for persistence promise...");
      const persistenceOk = await persistencePromise;
      console.log(`[log] - Persistence promise resolved with: ${persistenceOk}`);

      if (mode === 'login') {
        console.log("[log] - Calling Firebase Auth (signInWithEmailAndPassword)...");
        
        try {
          // Voeg een timeout toe aan de login call zelf (verhoogd naar 45s)
          const loginPromise = signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Firebase Auth Timeout - No response from server. This usually means 'capacitor://localhost' needs to be added to Authorized Domains in Firebase Console.")), 45000)
          );

          await Promise.race([loginPromise, timeoutPromise]);
          console.log("[log] - Firebase Auth call completed successfully");
          if (onNavigate) onNavigate('home');
        } catch (innerErr: any) {
          console.error("[error] - Login failed detail:", JSON.stringify(innerErr, Object.getOwnPropertyNames(innerErr)));
          throw innerErr;
        }
      } else if (mode === 'signup') {
        if (cleanPassword !== confirmPassword.trim()) {
          setError(t.passwordMismatch || "Passwords do not match.");
          setLoading(false);
          return;
        }

        let referredByUid: string | undefined;
        let bonusActive = false;

        const cleanRefCode = enteredReferralCode.trim().toUpperCase();
        if (cleanRefCode) {
          const codeRef = doc(db, "referralCodes", cleanRefCode);
          const codeSnap = await getDoc(codeRef);
          if (codeSnap.exists()) {
            referredByUid = codeSnap.data().ownerUid;
            bonusActive = true;
          } else {
            setError(userLang === 'nl' ? "Ongeldige referral code." : "Invalid referral code.");
            setLoading(false);
            return;
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name.trim() });
        
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        const proExpiresAt = bonusActive ? Date.now() + thirtyDaysInMs : null;
        const myReferralCode = generateReferralCode(username || name);
        const batch = writeBatch(db);
        const userRef = doc(db, 'users', user.uid);
        batch.set(userRef, {
          uid: user.uid,
          name: name.trim(),
          username: username.trim().toLowerCase().replace(/\s+/g, ''),
          email: user.email,
          role: role,
          photoFileName: 'default_coach.png',
          plan: bonusActive ? 'pro' : 'free',
          subscriptionActive: bonusActive,
          proExpiresAt: proExpiresAt,
          referralCode: myReferralCode,
          referredBy: referredByUid || null,
          isSubscribed: bonusActive,
          language: userLang,
          sport: selectedSport,
          createdAt: Date.now()
        });

        const newCodeRef = doc(db, "referralCodes", myReferralCode);
        batch.set(newCodeRef, { ownerUid: user.uid, createdAt: Date.now() });
        await batch.commit();

        console.log("Signup successful");
        if (onNavigate) onNavigate('home');
        sendEmailVerification(user).catch(err => console.debug("Silent verification failed", err));
      }
    } catch (err: any) {
      console.error("Auth error:", err.code, err.message);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError(userLang === 'nl' 
          ? "Identificatie mislukt. Controleer je e-mail en wachtwoord." 
          : "Identification failed. Please check your email and password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError(userLang === 'nl' ? "Dit e-mailadres is al in gebruik." : "This email is already in use.");
      } else {
        setError(err.message);
      }
    } finally {
      clearTimeout(safetyTimeout);
      setLoading(false);
    }
  };

  const handleVerifyJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = joinCode.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Code must be 6 characters.');
      return;
    }
    // Skip Firestore pre-check (requires auth) — validate during account creation
    setJoinTeamId('');
    setJoinTeamName('');
    setMode('join-register');
  };

  const handleJoinRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword.trim()) {
      setError(userLang === 'nl' ? 'Wachtwoorden komen niet overeen.' : 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await persistencePromise;
      const cleanEmail = email.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password.trim());
      const user = userCredential.user;
      await updateProfile(user, { displayName: name.trim() });

      const myReferralCode = generateReferralCode(name);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: name.trim(),
        username: name.trim().toLowerCase().replace(/\s+/g, ''),
        email: cleanEmail,
        role: 'player',
        photoFileName: 'default_coach.png',
        plan: 'free',
        subscriptionActive: false,
        referralCode: myReferralCode,
        referredBy: null,
        isSubscribed: false,
        language: userLang,
        sport: Sport.BASKETBALL,
        createdAt: Date.now()
      });
      batch.set(doc(db, 'referralCodes', myReferralCode), { ownerUid: user.uid, createdAt: Date.now() });
      await batch.commit();

      // Verify & join team (signed in now, rules pass)
      const codeSnap = await getDoc(doc(db, 'joinCodes', joinCode.trim().toUpperCase()));
      if (!codeSnap.exists()) {
        setError(userLang === 'nl' ? 'Teamcode niet gevonden. Account aangemaakt maar niet aan team toegevoegd.' : 'Team code not found. Account created but not joined to a team.');
        setLoading(false);
        return;
      }
      const resolvedTeamId = codeSnap.data().teamId;
      // Use arrayUnion so we never need to read the team first (avoids permission issue for non-members)
      await updateDoc(doc(db, 'teams', resolvedTeamId), {
        members: arrayUnion({ uid: user.uid, name: name.trim(), email: cleanEmail, role: 'player' }),
        memberUids: arrayUnion(user.uid)
      });

      sendEmailVerification(user).catch(() => {});
      if (onNavigate) onNavigate('home');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError(userLang === 'nl' ? 'Dit e-mailadres is al in gebruik.' : 'This email is already in use.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ha-bg flex flex-col items-center justify-center p-8 text-slate-50 relative">
      <button 
        onClick={() => onNavigate && onNavigate('home')}
        className="absolute top-8 left-8 flex items-center gap-2 p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all group"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{t.home}</span>
      </button>

      <div className="w-full max-w-sm space-y-10 animate-in fade-in duration-700 py-12">
        <div className="text-center space-y-4">
          <div
            className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl"
            role="img"
            aria-label="SportAtlas logo"
          >
            <span className="text-white font-black text-3xl italic">S</span>
          </div>
          <h1
            className="text-4xl font-black tracking-tight uppercase"
          >
            Sport<span className="text-blue-500 ml-1">Atlas</span>
          </h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em]">
            {mode === 'login' ? t.tacticalAuth : mode === 'signup' ? t.createIdentity : mode === 'join-code' ? 'Join with Team Code' : mode === 'join-register' ? `Joining ${joinTeamName}` : 'Credentials Recovery'}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-900 p-8 rounded-[2.5rem] shadow-2xl space-y-8">
          {mode === 'reset' ? (
            <form onSubmit={handleResetPassword} className="space-y-6" aria-label="Wachtwoord reset formulier">
               <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Recovery Email</label>
                  <input id="reset-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" autoComplete="email" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white outline-none focus:border-blue-500 transition-all" />
               </div>
               {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest">{error}</div>}
               {successMsg && <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-[10px] text-emerald-400 font-black uppercase tracking-widest">{successMsg}</div>}
               <button type="submit" disabled={loading} className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-2xl">
                  {loading ? 'Sending...' : 'Send Reset Link'}
               </button>
               <button type="button" onClick={() => setMode('login')} className="w-full text-[10px] text-slate-500 font-black uppercase tracking-widest">Back to Login</button>
            </form>
          ) : mode === 'join-code' ? (
            <form onSubmit={handleVerifyJoinCode} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Team Code</label>
                <input
                  autoFocus required
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AB12CD"
                  maxLength={6}
                  className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-2xl text-white font-black uppercase tracking-[0.4em] outline-none focus:border-ha-brand transition-all text-center"
                />
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest text-center">Vraag de 6-letterige code aan je coach</p>
              </div>
              {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest">{error}</div>}
              <button type="submit" disabled={loading || joinCode.trim().length < 6} className="w-full py-5 bg-ha-brand text-slate-950 font-black uppercase tracking-widest rounded-2xl shadow-2xl disabled:opacity-50">
                {loading ? 'Checking...' : 'Verify Code'}
              </button>
              <button type="button" onClick={() => setMode('login')} className="w-full text-[10px] text-slate-500 font-black uppercase tracking-widest">Back to Login</button>
            </form>
          ) : mode === 'join-register' ? (
            <form onSubmit={handleJoinRegister} className="space-y-4">
              <div className="p-4 bg-ha-brand/10 border border-ha-brand/30 rounded-2xl text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-ha-brand/60">Joining with code</p>
                <p className="text-lg font-black italic tracking-widest text-ha-brand">{joinCode.trim().toUpperCase()}</p>
              </div>
              <input required autoComplete="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-ha-brand transition-all" />
              <input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
              <input required autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
              <input required autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
              {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-5 bg-ha-brand text-slate-950 font-black uppercase tracking-widest rounded-2xl shadow-2xl disabled:opacity-50">
                {loading ? 'Creating account...' : 'Join Team'}
              </button>
              <button type="button" onClick={() => setMode('join-code')} className="w-full text-[10px] text-slate-500 font-black uppercase tracking-widest">Back</button>
            </form>
          ) : (
            <div className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === 'login' ? 'Inlogformulier' : 'Registratieformulier'}>
                {mode === 'signup' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-2 p-1 bg-ha-bg border border-slate-800 rounded-2xl overflow-x-auto no-scrollbar">
                      <button type="button" onClick={() => setRole('coach')} className={`py-3 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${role === 'coach' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600'}`}>{t.coach}</button>
                      <button type="button" onClick={() => setRole('player')} className={`py-3 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${role === 'player' ? 'bg-ha-brand text-slate-950 shadow-lg' : 'text-slate-600'}`}>{t.player}</button>
                      <button type="button" onClick={() => setRole('club')} className={`py-3 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${role === 'club' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}>{t.club}</button>
                      <button type="button" onClick={() => setRole('parent')} className={`py-3 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${role === 'parent' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600'}`}>{t.parent}</button>
                    </div>
                    {/* Sport selector */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Your Sport</p>
                      <div className="grid grid-cols-3 gap-2">
                        {SPORTS.map(sport => (
                          <button
                            key={sport.id}
                            type="button"
                            onClick={() => setSelectedSport(sport.id)}
                            className={`py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all flex flex-col items-center gap-1 ${selectedSport === sport.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-ha-bg border border-slate-800 text-slate-500 hover:border-slate-600'}`}
                          >
                            <span className="text-lg">{sport.emoji}</span>
                            <span>{sport.labelEn}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <input required autoComplete="username" type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))} placeholder={t.username} className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
                    <input required autoComplete="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.fullName} className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
                  </div>
                )}

                <input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.email} className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />

                <div className="space-y-2">
                  <input required autoComplete={mode === 'login' ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.password} className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
                  {mode === 'login' && (
                    <div className="flex justify-end px-1">
                      <button type="button" onClick={() => setMode('reset')} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white">Reset Credentials?</button>
                    </div>
                  )}
                </div>

                {mode === 'signup' && (
                  <>
                    <input required autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" className="w-full bg-ha-bg border border-slate-800 rounded-xl px-5 py-4 text-sm text-white font-medium outline-none focus:border-blue-500 transition-all" />
                  </>
                )}

                {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-[10px] text-red-500 font-black uppercase tracking-widest">{error}</div>}

                <button type="submit" disabled={loading} className={`w-full py-5 ${mode === 'login' ? 'bg-blue-600' : 'bg-ha-brand text-slate-950'} hover:brightness-110 disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-2xl`}>
                  {loading ? 'Verifying...' : (mode === 'login' ? t.login : t.signup)}
                </button>
              </form>

              {mode === 'login' && (
                <button
                  onClick={() => { setError(null); setJoinCode(''); setMode('join-code'); }}
                  className="w-full py-4 bg-ha-brand/10 border border-ha-brand/30 text-ha-brand font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-ha-brand/20 transition-all flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
                  Login with Team Code
                </button>
              )}
            </div>
          )}
          {(mode === 'login' || mode === 'signup') && (
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full text-[10px] text-slate-500 hover:text-blue-400 font-black uppercase tracking-widest transition-colors">
              {mode === 'login' ? t.noAccount : t.hasAccount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
