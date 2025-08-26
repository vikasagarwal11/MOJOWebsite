# Event Teasers Cleanup - Single Source of Truth

## Problem Identified
The application was **duplicating teaser writes** to the `event_teasers` collection:

1. **CreateEventModal** was directly writing teasers when creating/editing private events
2. **EventCard** was directly deleting teasers when deleting events  
3. **ProfileAdminTab** was directly deleting teasers when deleting events
4. **Cloud Functions** were also managing the same collection

This created **redundant operations** and potential **data inconsistencies**.

## Solution Implemented
**Removed all direct client-side writes** to `event_teasers` and let **Cloud Functions be the single source of truth**.

### Changes Made

#### 1. CreateEventModal.tsx
- ❌ Removed direct teaser creation for new private events
- ❌ Removed direct teaser updates when editing private events  
- ❌ Removed direct teaser removal when changing visibility
- ✅ Added comments explaining Cloud Functions handle teaser management
- ✅ Removed unused `setDoc` import

#### 2. EventCard.tsx
- ❌ Removed direct teaser deletion when deleting events
- ✅ Added comment explaining Cloud Functions handle cleanup

#### 3. ProfileAdminTab.tsx  
- ❌ Removed direct teaser deletion in both delete handlers
- ✅ Added comments explaining Cloud Functions handle cleanup

### What Cloud Functions Should Handle

Cloud Functions should now be responsible for:

1. **Creating teasers** when private events are created
2. **Updating teasers** when private events are modified
3. **Removing teasers** when:
   - Events are deleted
   - Events change from private to public/members
   - Events become past events

## Benefits

✅ **Single source of truth** - Only Cloud Functions write to teasers  
✅ **No data duplication** - Eliminates redundant operations  
✅ **Consistent behavior** - All teaser logic centralized  
✅ **Easier maintenance** - One place to update teaser logic  
✅ **Better reliability** - No race conditions between client and CFN  

## Reading vs Writing

- ✅ **Reading teasers** (Events.tsx) - Still allowed for display
- ❌ **Writing teasers** - Now only through Cloud Functions
- ❌ **Deleting teasers** - Now only through Cloud Functions

## Testing Required

After this change, verify that:

1. **Private events still create teasers** (via Cloud Functions)
2. **Editing private events updates teasers** (via Cloud Functions)  
3. **Changing visibility removes/creates teasers** (via Cloud Functions)
4. **Deleting events cleans up teasers** (via Cloud Functions)
5. **Guest users still see teasers** (reading still works)

## Cloud Function Requirements

Ensure your Cloud Functions handle these triggers:

- `onCreate` - Create teaser for new private events
- `onUpdate` - Update/remove teaser based on visibility changes
- `onDelete` - Remove teaser when event is deleted

This creates a **clean, maintainable architecture** with Cloud Functions as the single source of truth for teaser management.
