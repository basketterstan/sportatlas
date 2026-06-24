import { useState, useEffect, useMemo } from 'react';
import { type User } from 'firebase/auth';
import { collection, query, onSnapshot, doc, where, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../utils/firebase';
import { Drill, Team, TrainingSession, UserProfile, SquadMessage } from '../types';

export function useAppData(user: User | null, userProfile: UserProfile | null) {
  const [personalDrills, setPersonalDrills] = useState<Drill[]>([]);
  const [clubDrills, setClubDrills] = useState<Drill[]>([]);
  const [publicDrills, setPublicDrills] = useState<Drill[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([]);
  const [publicSessions, setPublicSessions] = useState<TrainingSession[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [partnerBannerEnabled, setPartnerBannerEnabled] = useState(false);
  const [globalAlert, setGlobalAlert] = useState('');

  // Public data
  useEffect(() => {
    const unsubPublicDrills = onSnapshot(
      query(collection(db, "drills"), where("isPublic", "==", true), limit(50)),
      (snap) => {
        const list: Drill[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Drill));
        setPublicDrills(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "drills")
    );

    const unsubPublicSessions = onSnapshot(
      query(collection(db, "trainings"), where("isPublic", "==", true), limit(30)),
      (snap) => {
        const list: TrainingSession[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as TrainingSession));
        setPublicSessions(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "trainings")
    );

    return () => { unsubPublicDrills(); unsubPublicSessions(); };
  }, []);

  // System config
  useEffect(() => {
    const unsubFeatures = onSnapshot(
      doc(db, "system_config", "features"),
      (snap) => { if (snap.exists()) setPartnerBannerEnabled(!!snap.data().partnerBanner); },
      (err) => handleFirestoreError(err, OperationType.GET, "system_config/features")
    );

    const unsubAlert = onSnapshot(
      doc(db, "system_config", "announcements"),
      (snap) => { if (snap.exists()) setGlobalAlert(snap.data().message || ""); },
      (err) => handleFirestoreError(err, OperationType.GET, "system_config/announcements")
    );

    return () => { unsubFeatures(); unsubAlert(); };
  }, []);

  // User-specific data
  useEffect(() => {
    if (!user) {
      setPersonalDrills([]);
      setClubDrills([]);
      setTrainingSessions([]);
      setMyTeams([]);
      return;
    }

    const unsubPersonalDrills = onSnapshot(
      query(collection(db, "drills"), where("userId", "==", user.uid)),
      (snap) => {
        const list: Drill[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Drill));
        setPersonalDrills(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "drills")
    );

    const unsubSessions = onSnapshot(
      query(collection(db, "trainings"), where("userId", "==", user.uid)),
      (snap) => {
        const list: TrainingSession[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as TrainingSession));
        setTrainingSessions(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "trainings")
    );

    return () => { unsubPersonalDrills(); unsubSessions(); };
  }, [user]);

  // Club drills
  useEffect(() => {
    if (!userProfile?.clubId) { setClubDrills([]); return; }
    const unsub = onSnapshot(
      query(collection(db, "drills"), where("clubId", "==", userProfile.clubId)),
      (snap) => {
        const list: Drill[] = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id } as Drill));
        setClubDrills(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "drills")
    );
    return () => unsub();
  }, [userProfile?.clubId]);

  // Teams
  useEffect(() => {
    if (!user || !userProfile) return;
    const isNormalUser = userProfile.role === 'player' || userProfile.role === 'parent';
    const q = isNormalUser
      ? query(collection(db, "teams"), where("memberUids", "array-contains", user.uid))
      : query(collection(db, "teams"), where("coachId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Team[] = [];
        snap.forEach(d => list.push({ ...d.data(), id: d.id } as Team));
        setMyTeams(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "teams")
    );
    return () => unsub();
  }, [user, userProfile]);

  // Unread notifications
  useEffect(() => {
    if (!user || myTeams.length === 0) {
      setUnreadCount(0);
      return;
    }
    const teamIds = myTeams.map(t => t.id);
    let lastReadData: Record<string, number> = {};
    try {
      lastReadData = JSON.parse(localStorage.getItem(`lastRead_${user.uid}`) || '{}');
    } catch {
      lastReadData = {};
    }
    const chunks: string[][] = [];
    for (let i = 0; i < teamIds.length; i += 10) chunks.push(teamIds.slice(i, i + 10));
    const countsByChunk = new Map<number, number>();
    const updateTotal = () => {
      setUnreadCount(Array.from(countsByChunk.values()).reduce((sum, value) => sum + value, 0));
    };
    const unsubs = chunks.map((chunk, index) => onSnapshot(
      query(collection(db, "squadMessages"), where("teamId", "in", chunk), limit(40)),
      (snap) => {
        let count = 0;
        snap.forEach(d => {
          const msg = d.data() as SquadMessage;
          const lastRead = lastReadData[msg.teamId] || 0;
          if (msg.createdAt > lastRead && msg.senderId !== user.uid) count++;
        });
        countsByChunk.set(index, count);
        updateTotal();
      },
      (err) => handleFirestoreError(err, OperationType.GET, "squadMessages")
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [user, myTeams]);

  const drills = useMemo(() => {
    const combined = [...personalDrills, ...clubDrills];
    const uniqueMap = new Map<string, Drill>();
    combined.forEach(d => uniqueMap.set(d.id, d));
    return Array.from(uniqueMap.values());
  }, [personalDrills, clubDrills]);

  return { drills, publicDrills, trainingSessions, publicSessions, myTeams, unreadCount, partnerBannerEnabled, globalAlert };
}
