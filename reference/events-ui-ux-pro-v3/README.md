
# Events UI/UX Pro (v3)

A complete, drop-in Events experience for React + Firebase:
- Multi-query union fetching that matches rules
- List ↔ Calendar with sticky filters & legend
- EventCard with capacity/visibility pills
- RSVPModal with Portal + optional Quick RSVP
- Teaser modal for guests
- Create/Edit forms with live validation hints
- Matching Firestore rules + composite indexes

## Quick start
```bash
npm i
npm run dev
```

Set `.env` from `.env.example` and deploy rules/indexes:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Mount the page (example):
```tsx
import { AuthProvider } from '@/contexts/AuthContext'
import EventsPage from '@/features/events/EventsPage'

export default function App() {
  return (
    <AuthProvider>
      <EventsPage />
    </AuthProvider>
  )
}
```
