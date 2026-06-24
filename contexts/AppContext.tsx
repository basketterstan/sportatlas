import React, { createContext, useContext } from 'react';
import { type User } from 'firebase/auth';
import {
  Drill, TrainingSession, Team, UserProfile,
  SkillFocus, Level, SortOption, SubscriptionPlan,
  TeamMember, ViewState,
} from '../types';

export interface AppContextValue {
  // Auth
  user: User | null;
  userProfile: UserProfile | null;
  // Data
  drills: Drill[];
  publicDrills: Drill[];
  trainingSessions: TrainingSession[];
  publicSessions: TrainingSession[];
  myTeams: Team[];
  unreadCount: number;
  partnerBannerEnabled: boolean;
  globalAlert: string;
  // Navigation
  view: ViewState;
  authMode: 'login' | 'signup' | 'create';
  selectedDrillId: string | undefined;
  selectedTeam: Team | null;
  setSelectedTeam: (team: Team | null) => void;
  selectedStreamId: string | null;
  initialMatchCode: string | null;
  chatInitialTab: string | undefined;
  setChatInitialTab: (tab: string | undefined) => void;
  chatInitialPlayer: TeamMember | undefined;
  setChatInitialPlayer: (player: TeamMember | undefined) => void;
  onNavigate: (view: ViewState, drillId?: string, mode?: 'login' | 'signup' | 'create', streamId?: string) => void;
  // Drill filters
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterFocus: SkillFocus | undefined;
  setFilterFocus: (f: SkillFocus | undefined) => void;
  filterLevel: Level | undefined;
  setFilterLevel: (l: Level | undefined) => void;
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (v: boolean) => void;
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  // Actions
  activeDrill: Drill | null;
  onSaveDrill: (drill: Drill, selectedPlaybookIds?: string[]) => Promise<void>;
  onTogglePinDrill: (drillId: string) => Promise<void>;
  onTogglePinSession: (sessionId: string) => Promise<void>;
  onAddToPlaybook: (drillId: string) => void;
  onUpgradeRequest: (plan: SubscriptionPlan, cycle: 'month' | 'year') => void;
  onClearInitialCode: () => void;
  isSyncingSubscription: boolean;
  onSyncSubscription: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ value: AppContextValue; children: React.ReactNode }> = ({ value, children }) => (
  <AppContext.Provider value={value}>{children}</AppContext.Provider>
);

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};
