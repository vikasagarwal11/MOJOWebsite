
# Events Advanced Package (v2.1)

**What you get**
- Modular Events feature for React + Firebase
- `useEvents` hook with multi-query union (members: 3 queries; guests: 1)
- Components: EventList, EventCard, EventCalendar, EventFormModal
- Firestore rules & composite indexes aligned with queries
- Vite + TS + path alias (@)

## Install
```
npm i
npm run dev
```

## Firebase
- Copy `.env.example` → `.env` and fill with Firebase config.
- Deploy:
```
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

