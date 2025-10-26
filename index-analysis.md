# Firestore Index Analysis

## Local File Analysis (firestore.indexes.json)

### ATTENDEES Collection Indexes (6 total):

#### Index 1: User + CreatedAt (COLLECTION)
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION",
  "fields": [
    {"fieldPath": "userId", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "ASCENDING"}
  ]
}
```

#### Index 2: User + Status + UpdatedAt (COLLECTION_GROUP)
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION_GROUP", 
  "fields": [
    {"fieldPath": "userId", "order": "ASCENDING"},
    {"fieldPath": "rsvpStatus", "order": "ASCENDING"},
    {"fieldPath": "updatedAt", "order": "DESCENDING"}
  ]
}
```

#### Index 3: Status + CreatedAt (COLLECTION_GROUP)
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {"fieldPath": "rsvpStatus", "order": "ASCENDING"},
    {"fieldPath": "createdAt", "order": "ASCENDING"}
  ]
}
```

#### Index 4: Status + WaitlistPosition (COLLECTION_GROUP) ⚠️ LIKELY CONFLICT
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {"fieldPath": "rsvpStatus", "order": "ASCENDING"},
    {"fieldPath": "waitlistPosition", "order": "ASCENDING"}
  ]
}
```

#### Index 5: Status + OriginalWaitlistJoinedAt + Name (COLLECTION_GROUP) ⚠️ LIKELY CONFLICT
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {"fieldPath": "rsvpStatus", "order": "ASCENDING"},
    {"fieldPath": "originalWaitlistJoinedAt", "order": "ASCENDING"},
    {"fieldPath": "__name__", "order": "ASCENDING"}
  ]
}
```

#### Index 6: Status + WaitlistPriority + Name (COLLECTION_GROUP) ⚠️ LIKELY CONFLICT
```json
{
  "collectionGroup": "attendees",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {"fieldPath": "rsvpStatus", "order": "ASCENDING"},
    {"fieldPath": "waitlistPriority", "order": "ASCENDING"},
    {"fieldPath": "__name__", "order": "ASCENDING"}
  ]
}
```

### EVENTS Collection Indexes (12 total):
- Multiple indexes for invitedUsers, invitedUserIds, visibility, startAt combinations
- Both COLLECTION and COLLECTION_GROUP scopes
- Various field combinations for event filtering

### MEDIA Collection Indexes (6 total):
- eventId + createdAt
- isPublic + createdAt  
- isPublic + type + createdAt
- isPublic + type + eventId + createdAt
- type + createdAt
- uploadedBy + createdAt

### OTHER Collections:
- notifications (2 indexes)
- posts (1 index)
- rsvps (2 indexes)
- userBlocks (4 indexes)
- payment_transactions (1 index)
- comments (1 index)

## Analysis Summary:

### Most Likely Conflict Sources:
1. **Index 4** (rsvpStatus + waitlistPosition) - Recent waitlist feature
2. **Index 5** (rsvpStatus + originalWaitlistJoinedAt + __name__) - Waitlist management
3. **Index 6** (rsvpStatus + waitlistPriority + __name__) - Waitlist priority system

### Development Phases Analysis:
- **Phase 1:** Basic attendees (Index 1, 2, 3)
- **Phase 2:** Waitlist system (Index 4, 5, 6)
- **Phase 3:** Events, Media, other collections

### Recommendations:
1. Check which specific attendees index is causing conflict
2. Compare server indexes with local file
3. Identify missing indexes on server
4. Plan consolidation strategy
