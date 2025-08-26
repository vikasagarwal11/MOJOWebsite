# Firestore Indexes Backup

## Temporarily Removed Index (Due to Conflict)

This index was removed from `firestore.indexes.json` due to a conflict with an existing `public` index. 
Add it back after the conflict is resolved.

```json
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "startAt", "order": "ASCENDING" }
  ]
}
```

## When to Restore

1. After the old `(public, startAt)` index is successfully removed from Firestore
2. When you're ready to deploy the new `(visibility, startAt)` index
3. After resolving the 409 "index already exists" error

## Current Status

- ❌ Old `(public, startAt)` index still exists in deployed Firestore
- ❌ New `(visibility, startAt)` index cannot be created due to conflict
- ✅ Other indexes should deploy successfully now

