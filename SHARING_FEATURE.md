# Drill & Playbook Sharing Feature

## Overview
Coaches kunnen nu drills en playbooks delen met andere coaches via URLs. Dit maakt het makkelijk om content te distribueren binnen je team of naar collega's.

## How It Works

### Sharing a Drill
1. Open een drill in detail-view
2. Klik op de **Share knop** (groene upload-pijl knop)
3. In het Share Modal:
   - De deellink wordt automatisch gegenereerd
   - Klik **Copy** om de link naar je clipboard te kopiëren
   - Of klik **Share via App** (op mobile) om via native share-dialog te delen

### Sharing a Playbook
1. Ga naar Playbooks > My Playbooks
2. Open een playbook of klik op een playbook in de lijst
3. Klik de **Share knop** (groene upload-pijl knop)
4. In het Share Modal:
   - De deellink wordt automatisch gegenereerd
   - Klik **Copy** om de link naar je clipboard te kopiëren

### Importing Shared Content
1. Ontvang een share-link van een collega (ziet er uit als: `https://hoopsatlas.app?share=type=drill&id=...&title=...&authorId=...`)
2. Open de link in je browser terwijl je ingelogd bent
3. Een **Import Modal** verschijnt automatisch
4. Klik **Import** om de drill/playbook als kopie in je library op te nemen
5. De originele content blijft bij de auteur

## Technical Implementation

### Files Modified:
- `utils/sharing.ts` - Share URL parsing en import logic
- `components/shared/ShareModal.tsx` - Share dialog component
- `components/shared/ImportModal.tsx` - Import dialog component
- `components/drills/DrillDetail.tsx` - Share button voor drills
- `components/drills/TrainingSessions.tsx` - Share button voor playbooks
- `App.tsx` - URL handling en import modal integration

### How Share URLs Work:
Share URLs bevatten gecodeerde informatie:
- `type`: 'drill' of 'playbook'
- `id`: Document ID in Firestore
- `title`: Display naam
- `authorId`: UID van de maker

Voorbeeld:
```
https://hoopsatlas.app?share=type%3Ddrill%26id%3D12345%26title%3DShot%2520Progression%26authorId%3Duser123
```

### Import Process:
1. URL wordt geparsed in App.tsx
2. ImportModal haalt de bron-content van Firestore
3. Maakt een kopie voor de huidige gebruiker
4. Slaat op in Firestore met `userId` van huidige user
5. URL wordt schoongemaakt na succesvol import

## Security Notes
- Shared content is standaard openbaar leesbaar
- Importers krijgen een eigen kopie (geen wijzigingen aan origineel)
- Auteur details worden gelinkt naar geïmporteerde content
- Gebruikers moeten ingelogd zijn om te importeren

## Future Enhancements
- Share met specifieke coaches/teams
- Share met access codes
- View-only sharing (geen import)
- Sharing analytics/tracking
- Bulk sharing van meerdere items
