# Event Indexes Backup
# These indexes were temporarily removed due to 409 conflicts
# Add them back after 24-48 hours when Firebase's internal state resolves

```json
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "startAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "startAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "startAt", "order": "DESCENDING" },
    { "fieldPath": "__name__", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "createdBy", "order": "ASCENDING" },
    { "fieldPath": "startAt", "order": "DESCENDING" }
  ]
}
```

## When to Restore:
1. Wait 24-48 hours after the 409 conflicts
2. Test that your app works with current indexes
3. Add them back one by one to firestore.indexes.json
4. Deploy with: `firebase deploy --only firestore:indexes`
