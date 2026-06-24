
export enum Sport {
  BASKETBALL = 'basketball',
  SOCCER = 'soccer',
  VOLLEYBALL = 'volleyball',
  AMERICAN_FOOTBALL = 'american-football',
  RUGBY = 'rugby',
  TENNIS = 'tennis'
}

// Kept for backward compatibility — basketball-specific skill values
export enum BasketballSkill {
  SHOOTING = 'Shooting',
  PASSING = 'Passing',
  BALL_HANDLING = 'Ball-handling',
  DEFENSE = 'Defense',
  CONDITIONING = 'Conditioning',
  TEAM_OFFENSE = 'Team offense',
  TEAM_DEFENSE = 'Team defense'
}

// Alias so existing enum references still compile
export enum SkillFocus {
  SHOOTING = 'Shooting',
  PASSING = 'Passing',
  BALL_HANDLING = 'Ball-handling',
  DEFENSE = 'Defense',
  CONDITIONING = 'Conditioning',
  TEAM_OFFENSE = 'Team offense',
  TEAM_DEFENSE = 'Team defense'
}

export enum Level {
  U10 = 'U10',
  U12 = 'U12',
  U14 = 'U14',
  U16 = 'U16',
  U18 = 'U18',
  U21 = 'U21',
  ADULT = 'Adult'
}

export enum SortOption {
  NEWEST = 'Newest',
  OLDEST = 'Oldest',
  AZ = 'A-Z',
  MOST_LIKES = 'Most Likes'
}

export type PlayerType = 'home' | 'away' | 'ball' | 'cone' | 'coach';
export type CourtType = 'half' | 'full' | 'field-full' | 'field-half' | 'volleyball-court' | 'tennis-court' | 'tennis-singles' | 'football-full' | 'football-half' | 'rugby-full' | 'rugby-half';
export type DiagramLineType = 'run' | 'pass' | 'screen' | 'dribble' | 'shot' | 'draw';
export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'club10' | 'club20' | 'clubUnlimited' | 'gameAnalysis';
export type UserRole = 'coach' | 'player' | 'club' | 'parent';
export type MemberRole = 'owner' | 'admin' | 'coach';
export type TacticalType = 'play' | 'drill';
export type StorageProvider = 'firebase' | 'external_vault' | 'youtube';

export type EventType = 'practice' | 'game' | 'other';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface MatchHighlight {
  time: number;
  label: string;
}

export interface DrillAssignment {
  id: string;
  teamId: string;
  drillId: string;
  dueDate: string;
  coachId: string;
  playerId?: string; 
  createdAt: number;
  completedUids?: string[];
}

export interface PrivateMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  content: string;
  createdAt: number;
  teamId: string; 
}

export interface VideoPart {
  url: string;
  order: number;
  name: string;
}

export interface UploadedMatch {
  id: string;
  userId: string;
  ownerName: string;
  title: string;
  description: string;
  videoUrl: string; 
  videoParts?: VideoPart[]; 
  thumbnailUrl?: string;
  visibility: 'public' | 'private';
  accessCode?: string;
  teamId?: string;
  aiSummary?: string;
  createdAt: number;
  duration?: string;
  viewCount?: number;
  highlights?: MatchHighlight[];
  storageNode?: StorageProvider;
  isLive?: boolean;
}

export interface UserProfile {
  uid?: string;
  name: string;
  username: string;
  email: string;
  photoFileName: string;
  plan: SubscriptionPlan;
  stripeRole?: string;
  role: UserRole;
  clubId?: string | null;
  subscriptionActive: boolean;
  isSubscribed?: boolean;
  isAdmin?: boolean;
  isTester?: boolean;
  isStreamer?: boolean;
  language?: 'en' | 'nl' | 'es';
  sport?: Sport;
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  earningsBalance?: number;
  proExpiresAt?: number;
  billingPeriod?: 'monthly' | 'yearly';
  subscriptionStartedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  lastActiveAt?: number;
  visitCount?: number;
  adminNotes?: string;
  notificationsEnabled?: boolean;
  fcmToken?: string;
  multiCloudEnabled?: boolean;
  externalVaultUrl?: string;
  managedCoachUids?: string[];
  managedByUid?: string;
}

export type ViewState = 'home' | 'library' | 'discover' | 'coach-search' | 'create' | 'edit' | 'detail' | 'settings' | 'auth' | 'privacy' | 'teams' | 'team-calendar' | 'match-board' | 'subscription-terms' | 'join-team' | 'admin-dashboard' | 'training-selection' | 'about' | 'playbooks' | 'data-erasure' | 'tiktok-studio' | 'unsubscribe' | 'club-hq' | 'match-analysis' | 'tournament-builder' | 'local-courts' | 'match-archive' | 'match-upload' | 'drill-brief' | 'chats' | 'match-broadcaster' | 'match-viewer' | 'match-stats' | 'support' | 'partners' | 'community' | 'community-post' | 'scrimmage-hub';

export interface ScrimmagePost {
  id: string;
  authorId: string;
  authorName: string;
  level: string;
  ageGroup: string;
  country: string;
  location: string;
  dates: string[];
  date?: string;
  extraInfo: string;
  contactEmail: string;
  contactPhone: string;
  createdAt: number;
  status: 'open' | 'closed';
}

export interface ScrimmageMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
}

export interface CommunityPost {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorIsPro: boolean;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  likesCount: number;
  repliesCount: number;
  isPinned: boolean;
  isFeatured: boolean;
  status: 'active' | 'removed';
}

export interface CommunityReply {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorIsPro: boolean;
  content: string;
  createdAt: number;
  likesCount: number;
  status: 'active' | 'removed';
}

export interface DiagramBoard {
  id: string;
  name: string;
  players: PlayerPosition[];
  lines: DiagramLine[];
  texts?: DiagramText[];
  courtType: CourtType;
}

export interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  type: PlayerType;
  label?: string;
  color?: string;
}

export interface DiagramLine {
  id: string;
  type: DiagramLineType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  controlX?: number;
  controlY?: number;
  points?: { x: number, y: number }[];
}

export interface DiagramText {
  id: string;
  x: number;
  y: number;
  value: string;
  fontSize?: number;
}

export interface Drill {
  id: string;
  userId: string;
  clubId?: string | null;
  authorName?: string;
  sport?: Sport;
  title: string;
  type: TacticalType;
  focus: SkillFocus | string;
  level: Level;
  duration: number;
  equipment?: string;
  steps: string[];
  tips?: string;
  tips_long?: string; 
  tags: string[];
  favorite: boolean;
  isPinned?: boolean;
  isPublic?: boolean;
  isHubUnit?: boolean;
  likes?: number;
  dislikes?: number;
  createdAt: number;
  updatedAt: number;
  boards: DiagramBoard[];
  videoUrls?: string[];
  videoUploads?: VideoUpload[];
  documentUploads?: DocumentUpload[];
  storageNode?: StorageProvider;
}

export interface TrainingSession {
  id: string;
  userId: string;
  clubId?: string | null;
  authorName?: string;
  sport?: Sport;
  name: string;
  drillIds: string[];
  isPinned?: boolean;
  isPublic?: boolean;
  createdAt: number;
  updatedAt: number;
  videoUrls?: string[];
  videoUploads?: VideoUpload[];
}

export interface Team {
  id: string;
  clubId?: string | null;
  coachId: string;
  sport?: Sport;
  name: string;
  category: Level;
  members: TeamMember[];
  memberUids?: string[];
  drillIds?: string[];
  joinCode?: string;
  createdAt: number;
}

export interface TeamMember {
  uid: string;
  name: string;
  email: string;
  role: 'player' | 'coach' | 'parent';
}

export interface SquadMessage {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  drillId: string;
  userId: string;
  userName: string;
  text: string;
  rating: number;
  createdAt: number;
}

export interface VideoUpload {
  url: string;
  name: string;
  storagePath: string;
  node?: StorageProvider;
}

export interface DocumentUpload {
  url: string;
  name: string;
  storagePath: string;
  type: string;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  teamId: string;
  userId: string;
  status: AttendanceStatus;
  updatedAt: number;
}

export interface CalendarEvent {
  id: string;
  teamId: string;
  type: EventType;
  title: string;
  date: string;
  time: string;
  location?: string;
  description?: string;
  drillIds?: string[];
  createdAt: number;
}

export interface LiveMatch {
  id: string;
  teamId: string;
  teamName: string;
  streamerId: string;
  streamerName: string;
  scoreHome: number;
  scoreAway: number;
  status: 'live' | 'ended';
  visibility: 'global' | 'team';
  currentFrame?: string;
  aiCommentary?: string;
  createdAt: number;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  category: 'AAU' | 'HighSchool' | 'Youth' | 'Academy';
  state: string;
  contacted: boolean;
}

export interface RegisteredCourt {
  id: string;
  userId: string;
  name: string;
  address?: string;
  type: 'indoor' | 'outdoor';
  lat: number;
  lng: number;
  createdAt: number;
}

export interface CancellationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  currentPlan: string;
  status: 'pending' | 'processed';
  createdAt: number;
}

export interface Feedback {
  id: string;
  name: string;
  email: string;
  content: string;
  userId: string;
  type: 'tester' | 'general';
  attachment?: { url: string; name: string } | null;
  status: 'new' | 'read';
  createdAt: number;
}

export interface FilmRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  matchTitle: string;
  date: string;
  location: string;
  notes?: string;
  adminComment?: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: number;
}

export interface TournamentTeam {
  id: string;
  name: string;
  players: string[];
  wins?: number;
  diff?: number;
}

export interface TournamentMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'live' | 'finished';
  round: number;
  slot?: number;
  court?: number;
}

export interface PlayerProfile {
  id: string;
  userId: string;
  name: string;
  position: string;
  height: string;
  weight: string;
  shootingHand: 'Left' | 'Right' | 'Both';
  preferredDribbleMoves: string;
  notes: string;
  photoUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerMatchStat {
  playerId: string;
  playerName: string;
  stats: Record<string, number>;
}

export interface MatchStats {
  id: string;
  userId: string;
  matchTitle: string;
  date: string;
  teamName: string;
  opponentName: string;
  statDefinitions: string[];
  playerStats: PlayerMatchStat[];
  createdAt: number;
  updatedAt: number;
}
