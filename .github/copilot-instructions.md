# HoopsAtlas AI Coding Instructions

## Architecture Overview
HoopsAtlas is a basketball coaching platform built as a React TypeScript SPA with Firebase backend and Capacitor mobile apps. The app integrates with Belgian basketball league (VBL) APIs for match/team data and uses AI for video analysis.

**Core Components:**
- **Frontend:** React with Vite build system, Tailwind CSS styling
- **Backend:** Firebase (Auth, Firestore, Storage, Functions), local Express server for development
- **Mobile:** Capacitor for iOS/Android native apps
- **External APIs:** VBL proxy for league data, Google GenAI for AI features, RevenueCat for subscriptions

**Data Flow:**
- Real-time Firestore listeners for live updates (teams, drills, matches)
- Local storage for offline drill access
- Props drilling for state management (no global state library)
- Firebase Functions handle production API calls

## Key Patterns & Conventions

### State Management
- Use props drilling from App.tsx root component
- Firebase onSnapshot for real-time data: `onSnapshot(collection(db, 'teams'), (snapshot) => {...})`
- Local storage via `utils/storage.ts` for offline drills
- Clean objects before Firestore writes: `cleanObject(data)`

### Component Structure
- Feature components in `/components/` directory
- Props interfaces defined inline or in `types.ts`
- Error handling with try/catch and user-friendly messages
- Loading states with boolean flags

### Firebase Usage
- Auth persistence: iOS uses `browserLocalPersistence`, others `indexedDBLocalPersistence`
- Firestore queries with compound filters: `query(collection, where(), orderBy())`
- Batch operations for multiple writes: `const batch = writeBatch(db); batch.set(...); await batch.commit()`
- Error handling: `handleFirestoreError(error, OperationType.CREATE)`

### API Integration
- VBL proxy endpoints: `/api/vbl/search`, `/api/vbl/club/:id/teams`, etc.
- Multiple fallback endpoints per resource (VBL API instability)
- Timeout handling (15s) with user-friendly error messages

### Mobile Development
- Build web first: `npm run build` → `npx cap sync`
- Platform-specific: `npx cap add ios/android`
- Test on device: `npx cap run ios/android`

## Development Workflows

### Local Development
```bash
npm install
npm run dev  # Runs Express server with Vite middleware
```

### Building & Deployment
```bash
npm run lint     # TypeScript check
npm run build    # Vite production build
npx cap sync     # Sync web assets to mobile
npx cap run ios  # Test on iOS device
```

### Firebase Deployment
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Common Tasks
- **Add drill:** Create in `FOUNDATION_UNITS` array (App.tsx) or Firestore collection
- **New component:** Add to `/components/`, import in App.tsx, handle in view switch
- **Firebase query:** Use `query()`, `where()`, `orderBy()` with real-time listeners
- **Error handling:** Wrap in try/catch, show user message, log details

## Code Examples

### Real-time Firestore Listener
```typescript
useEffect(() => {
  const q = query(collection(db, 'drills'), where('userId', '==', user.uid));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const drills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setPersonalDrills(drills);
  });
  return unsubscribe;
}, [user]);
```

### VBL API Call with Fallbacks
```typescript
const endpoints = ['/Clubs', '/Club/GetClubs'];
for (const endpoint of endpoints) {
  try {
    const response = await vblApi.get(endpoint);
    if (response.data) return res.json(response.data);
  } catch (error) {
    console.warn(`Failed ${endpoint}: ${error.message}`);
  }
}
```

### Component Props Pattern
```typescript
interface DrillLibraryProps {
  drills: Drill[];
  onSelectDrill: (id: string) => void;
  searchQuery: string;
  // ... more props
}
```

## File Organization
- `types.ts`: All interfaces and enums
- `utils/firebase.ts`: Firebase setup and helpers
- `utils/storage.ts`: Local storage operations
- `components/`: Feature components
- `server.ts`: Local dev server with VBL proxy
- `functions/`: Firebase cloud functions

## Key Dependencies
- React 19, TypeScript, Tailwind CSS
- Firebase SDK, Capacitor 8
- Google GenAI, RevenueCat, Leaflet
- Express, Axios, HTML2PDF, Leaflet