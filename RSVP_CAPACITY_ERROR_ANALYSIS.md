# RSVP Capacity Error Handling - Detailed Analysis

## Executive Summary

Users are experiencing "Missing or insufficient permissions" errors when trying to change their RSVP status from `not-going` to `going` on events that are already at or over capacity. The error is technically correct (Firestore rules are blocking the update), but the user experience is poor because:

1. The error message is generic and not user-friendly
2. The client-side validation doesn't catch all scenarios
3. The server-side error isn't being parsed to provide context-specific messages

---

## Problem Statement

### User Experience Issue
- **Error Message**: "Missing or insufficient permissions"
- **User Confusion**: Users don't understand why they can't RSVP
- **Expected Behavior**: Clear message like "Event is full" or "Event is full, but you've been added to the waitlist"

### Technical Issue
- Firestore security rules correctly block capacity violations
- Client-side validation exists but doesn't prevent all cases
- Server errors aren't being parsed to extract capacity-specific context
- Error handling treats all "permission-denied" errors the same way

---

## Root Cause Analysis

### Scenario Breakdown

**Event State:**
- `maxAttendees: 3`
- `attendingCount: 4` (already exceeds capacity - data inconsistency or family members)
- `waitlistEnabled: false`

**User Action:**
- Current RSVP Status: `not-going`
- Desired Status: `going`

**What Happens:**

1. **Client-Side Flow:**
   ```
   User clicks dropdown → onChange fires → handleUpdateAttendee called
   → Checks capacityState (line 272-284 in AttendeeList.tsx)
   → capacityState.isAtCapacity = true
   → BUT: The check only runs for PRIMARY members changing to 'going'
   → If user is already 'not-going', the check might not catch it
   → Calls updateAttendee() anyway
   ```

2. **Server-Side Flow:**
   ```
   updateAttendee() → runTransaction()
   → Calculates delta: getAttendingDelta('not-going', 'going') = +1
   → New count = 4 + 1 = 5 (would exceed max of 3)
   → Transaction tries to update both:
      - Attendee document (rsvpStatus: 'going')
      - Event document (attendingCount: 5)
   ```

3. **Firestore Rules Evaluation:**
   ```
   Rule checks: allow update if...
   → User owns the attendee ✓
   → Status is 'going' → Check capacity
   → checkEventCapacity(eventId, true):
      → Reads event.attendingCount (4)
      → Checks: 4 < 3? → FALSE
      → waitlistEnabled? → FALSE
   → Rule blocks the update → Returns "permission-denied"
   ```

4. **Error Propagation:**
   ```
   Firestore throws error → updateAttendee catches it
   → Throws generic Error("Missing or insufficient permissions")
   → AttendeeList catches error
   → Shows generic toast: "You do not have permission to update this attendee."
   → User sees unhelpful error message
   ```

### Why Client-Side Validation Fails

**Current Check (lines 268-284 in AttendeeList.tsx):**
```typescript
if (attendeeToUpdate.userId === currentUser.id &&
    attendeeToUpdate.attendeeType === 'primary' &&
    pendingUpdate.rsvpStatus === 'going') {
  
  if (capacityState?.isAtCapacity) {
    // This check exists but...
    // 1. Only checks PRIMARY members
    // 2. Only checks when changing TO 'going'
    // 3. Doesn't account for edge cases (already at capacity, data sync issues)
    // 4. capacityState might not reflect latest server state
  }
}
```

**Gaps:**
- Only checks primary members (family members can also hit capacity)
- Relies on `capacityState` which might be stale
- Doesn't prevent all cases before calling `updateAttendee`
- No validation when status is `not-going` → `going` transition

---

## Current Error Handling Architecture

### 1. Client-Side Error Handling (AttendeeList.tsx)

**Location:** `src/components/events/AttendeeList.tsx` (lines 356-400)

**Current Implementation:**
```typescript
catch (error) {
  console.error('Failed to update attendee:', error);
  
  // Basic error message extraction
  let message = error.message || String(error);
  
  // Attempts to detect capacity-related errors
  if (message.includes('over capacity') || 
      message.includes('cannot change status to "going"') || 
      message.includes('event is full')) {
    const blockedMessage = getCapacityBlockedMessage();
    toast.error(blockedMessage);
    return;
  }
  
  // Generic permission error handling
  if (error.message.includes('permission')) {
    toast.error('You do not have permission to update this attendee.');
  }
}
```

**Issues:**
- Only checks error message strings (unreliable)
- Doesn't check error codes
- No access to capacity context from error
- Generic "permission" message doesn't explain WHY

### 2. Service Layer (attendeeService.ts)

**Location:** `src/services/attendeeService.ts` (lines 831-884)

**Current Implementation:**
```typescript
export const updateAttendee = async (
  eventId: string,
  attendeeId: string,
  updateData: UpdateAttendeeData
): Promise<void> => {
  try {
    await runTransaction(db, async (transaction) => {
      // Transaction logic...
    });
  } catch (error) {
    // No error transformation
    // No context extraction
    // Just re-throws the raw Firestore error
    throw error;
  }
};
```

**Issues:**
- Doesn't catch and transform Firestore errors
- No capacity context extraction
- No custom error types
- Just passes through generic errors

### 3. Firestore Security Rules

**Location:** `firestore.rules` (lines 442-459)

**Current Implementation:**
```javascript
allow update: if isSignedIn() && (
  // Ownership checks...
) && 
// Capacity check when changing to 'going'
(isAdmin() ||
 get(/databases/$(database)/documents/events/$(eventId)).data.createdBy == request.auth.uid ||
 request.resource.data.attendeeType == 'family_member' ||
 resource.data.attendeeType == 'family_member' ||
 request.resource.data.rsvpStatus == 'waitlisted' ||
 request.resource.data.rsvpStatus == 'not-going' ||
 resource.data.rsvpStatus == 'going' ||
 resource.data.rsvpStatus == 'waitlisted' ||
 (request.resource.data.rsvpStatus == 'going' &&
  (get(/databases/$(database)/documents/events/$(eventId)).data.waitlistEnabled == true ||
   checkEventCapacity(eventId, true))));
```

**Issues:**
- Rule correctly blocks violations but returns generic error
- No way to distinguish capacity errors from other permission errors
- `checkEventCapacity` only sees current state, not the delta being applied
- Rule evaluation happens AFTER client validation

---

## Potential Solutions

### Solution 1: Client-Side Pre-Validation (Preventive)

**Philosophy:** "Don't even try if it will fail"

**Implementation:**
```typescript
// In AttendeeList.tsx - BEFORE calling updateAttendee
const handleUpdateAttendee = async (attendeeId: string, updateData: any) => {
  // Get attendee and capacity state
  const attendeeToUpdate = attendees.find(a => getAttendeeId(a) === attendeeId);
  const pendingUpdate = { ...updateData };
  
  // PRE-VALIDATE: Check if changing to 'going' would violate capacity
  if (pendingUpdate.rsvpStatus === 'going') {
    const currentStatus = attendeeToUpdate.rsvpStatus;
    
    // Only check if status is actually changing
    if (currentStatus !== 'going') {
      // Check capacity for ALL attendee types (not just primary)
      if (capacityState?.isAtCapacity) {
        if (capacityState.canWaitlist) {
          // Auto-convert to waitlisted
          pendingUpdate.rsvpStatus = 'waitlisted';
          toast.info('Event is full. You have been added to the waitlist.');
        } else {
          // BLOCK completely
          const blockedMessage = getCapacityBlockedMessage();
          updateStatusError(attendeeId, blockedMessage);
          toast.error(blockedMessage);
          return; // Don't call updateAttendee
        }
      }
    }
  }
  
  // Now call updateAttendee with potentially modified updateData
  try {
    await updateAttendee(attendeeId, pendingUpdate);
  } catch (error) {
    // Still need error handling as fallback
  }
};
```

**Pros:**
- ✅ Fast user feedback (immediate)
- ✅ Prevents unnecessary server calls
- ✅ Good user experience (no waiting for server response)
- ✅ Reduces server load

**Cons:**
- ❌ Client state might be stale (race conditions)
- ❌ Doesn't protect against concurrent updates
- ❌ Requires maintaining sync between client and server state
- ❌ Still needs server-side validation as fallback

**Reliability:** ⚠️ Medium (good for UX, but not foolproof)

---

### Solution 2: Server-Side Error Wrapping (Reactive)

**Philosophy:** "Catch server errors and make them user-friendly"

**Implementation:**

**Step 1: Create Custom Error Classes**
```typescript
// In attendeeService.ts or new file: errors.ts
export class CapacityError extends Error {
  constructor(
    message: string,
    public eventId: string,
    public currentCount: number,
    public maxAttendees: number,
    public waitlistEnabled: boolean,
    public canWaitlist: boolean
  ) {
    super(message);
    this.name = 'CapacityError';
  }
  
  getUserMessage(): string {
    if (this.canWaitlist) {
      return 'Event is full. You have been added to the waitlist.';
    } else {
      return `Event is full (${this.currentCount}/${this.maxAttendees}). No more RSVPs can be accepted.`;
    }
  }
}

export class PermissionError extends Error {
  constructor(
    message: string,
    public reason: 'capacity' | 'ownership' | 'blocked' | 'unknown'
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}
```

**Step 2: Wrap Errors in Service Layer**
```typescript
// In attendeeService.ts updateAttendee function
export const updateAttendee = async (
  eventId: string,
  attendeeId: string,
  updateData: UpdateAttendeeData
): Promise<void> => {
  try {
    await runTransaction(db, async (transaction) => {
      // Existing transaction logic...
    });
  } catch (error: any) {
    // Check if it's a Firestore permission error
    if (error?.code === 'permission-denied') {
      // Fetch event to get capacity context
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      const eventData = eventDoc.data();
      
      // If trying to set status to 'going', it's likely a capacity issue
      if (updateData.rsvpStatus === 'going') {
        const maxAttendees = eventData?.maxAttendees;
        const attendingCount = eventData?.attendingCount || 0;
        const waitlistEnabled = eventData?.waitlistEnabled || false;
        const waitlistLimit = eventData?.waitlistLimit;
        
        // Check if it's actually a capacity issue
        if (maxAttendees && attendingCount >= maxAttendees) {
          // Check waitlist capacity
          const waitlistCount = eventData?.waitlistCount || 0;
          const canWaitlist = waitlistEnabled && 
            (!waitlistLimit || waitlistCount < waitlistLimit);
          
          throw new CapacityError(
            'Event is at capacity',
            eventId,
            attendingCount,
            maxAttendees,
            waitlistEnabled,
            canWaitlist
          );
        }
      }
      
      // Other permission errors
      throw new PermissionError('Permission denied', 'unknown');
    }
    
    // Re-throw other errors as-is
    throw error;
  }
};
```

**Step 3: Handle Errors in UI**
```typescript
// In AttendeeList.tsx catch block
catch (error) {
  if (error instanceof CapacityError) {
    // Use the error's context to show appropriate message
    const message = error.canWaitlist 
      ? 'Event is full. You have been added to the waitlist.'
      : error.getUserMessage();
    
    toast.error(message);
    
    // If waitlist is available, automatically set status to waitlisted
    if (error.canWaitlist) {
      // Retry with waitlisted status
      await updateAttendee(attendeeId, { rsvpStatus: 'waitlisted' });
      return;
    }
  } else if (error instanceof PermissionError) {
    // Show context-specific permission messages
    switch (error.reason) {
      case 'capacity':
        toast.error('Event is at capacity');
        break;
      case 'ownership':
        toast.error('You can only update your own RSVP');
        break;
      default:
        toast.error('You do not have permission to perform this action');
    }
  } else {
    // Generic error handling
    toast.error(error.message || 'An error occurred');
  }
}
```

**Pros:**
- ✅ Single source of truth (server state)
- ✅ Handles race conditions (server validates current state)
- ✅ Rich error context (capacity details, waitlist info)
- ✅ Type-safe error handling (custom error classes)

**Cons:**
- ❌ Slower user feedback (waits for server)
- ❌ Requires additional server reads (fetching event data)
- ❌ More complex error handling logic
- ❌ Error happens AFTER user action (worse UX)

**Reliability:** ✅ High (server is authoritative)

---

### Solution 3: Hybrid Approach (Recommended)

**Philosophy:** "Validate early, but trust the server as final authority"

**Implementation:**

**Phase 1: Client Pre-Validation (Fast Feedback)**
```typescript
// In AttendeeList.tsx - BEFORE calling updateAttendee
const handleUpdateAttendee = async (attendeeId: string, updateData: any) => {
  const attendeeToUpdate = attendees.find(a => getAttendeeId(a) === attendeeId);
  let pendingUpdate = { ...updateData };
  
  // CLIENT-SIDE PRE-CHECK: Fast feedback
  if (pendingUpdate.rsvpStatus === 'going' && 
      attendeeToUpdate.rsvpStatus !== 'going') {
    
    if (capacityState?.isAtCapacity) {
      if (capacityState.canWaitlist) {
        // Auto-convert to waitlisted on client
        pendingUpdate.rsvpStatus = 'waitlisted';
        toast.info('Event is full. Adding you to waitlist...');
      } else {
        // Block immediately
        const blockedMessage = getCapacityBlockedMessage();
        updateStatusError(attendeeId, blockedMessage);
        toast.error(blockedMessage);
        return; // Don't proceed
      }
    }
  }
  
  // Phase 2: Server call with error handling
  try {
    await updateAttendee(attendeeId, pendingUpdate);
  } catch (error) {
    // Handle server-side errors...
  }
};
```

**Phase 2: Server-Side Error Wrapping (Safety Net)**
```typescript
// In attendeeService.ts - Wrap Firestore errors
export const updateAttendee = async (
  eventId: string,
  attendeeId: string,
  updateData: UpdateAttendeeData
): Promise<void> => {
  try {
    await runTransaction(db, async (transaction) => {
      // Transaction logic...
    });
  } catch (error: any) {
    // Parse and wrap errors
    if (error?.code === 'permission-denied' && updateData.rsvpStatus === 'going') {
      // Fetch event context for detailed error
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      const eventData = eventDoc.data();
      
      if (eventData?.maxAttendees && 
          (eventData.attendingCount || 0) >= eventData.maxAttendees) {
        const waitlistCount = eventData.waitlistCount || 0;
        const canWaitlist = eventData.waitlistEnabled && 
          (!eventData.waitlistLimit || waitlistCount < eventData.waitlistLimit);
        
        throw new CapacityError(
          'Event is at capacity',
          eventId,
          eventData.attendingCount || 0,
          eventData.maxAttendees,
          eventData.waitlistEnabled || false,
          canWaitlist
        );
      }
    }
    throw error;
  }
};
```

**Phase 3: UI Error Handling (Graceful Degradation)**
```typescript
// In AttendeeList.tsx catch block
catch (error) {
  // Check for specific error types first
  if (error instanceof CapacityError) {
    const message = error.canWaitlist
      ? 'Event is full. You have been added to the waitlist.'
      : error.getUserMessage();
    
    toast.error(message);
    
    // Auto-retry with waitlisted if available
    if (error.canWaitlist && pendingUpdate.rsvpStatus !== 'waitlisted') {
      try {
        await updateAttendee(attendeeId, { rsvpStatus: 'waitlisted' });
        toast.success('You have been added to the waitlist.');
        return;
      } catch (retryError) {
        // Fall through to generic error
      }
    }
    
    updateStatusError(attendeeId, message);
    return;
  }
  
  // Fallback: Check error message/code for capacity hints
  const errorStr = error.message?.toLowerCase() || '';
  if (errorStr.includes('permission') && capacityState?.isAtCapacity) {
    const message = capacityState.canWaitlist
      ? 'Event is full. Would you like to join the waitlist?'
      : 'Event is full. No more RSVPs can be accepted.';
    toast.error(message);
    updateStatusError(attendeeId, message);
    return;
  }
  
  // Generic error handling
  toast.error(error.message || 'Failed to update RSVP');
}
```

**Pros:**
- ✅ Fast user feedback (client pre-check)
- ✅ Server validation as safety net (handles race conditions)
- ✅ Graceful error handling (parsed server errors)
- ✅ Best user experience (immediate feedback + server reliability)

**Cons:**
- ❌ More code to maintain
- ❌ Requires coordination between client and server
- ❌ Slightly more complex architecture

**Reliability:** ✅ Highest (defense in depth)

---

### Solution 4: Firestore Cloud Functions (Server-Side Logic)

**Philosophy:** "Move complex validation to server-side functions"

**Implementation:**
```typescript
// Cloud Function: onAttendeeUpdate
export const onAttendeeUpdate = functions.firestore
  .document('events/{eventId}/attendees/{attendeeId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const eventId = context.params.eventId;
    
    // Check if changing to 'going'
    if (before.rsvpStatus !== 'going' && after.rsvpStatus === 'going') {
      const eventDoc = await admin.firestore()
        .doc(`events/${eventId}`)
        .get();
      const eventData = eventDoc.data();
      
      // Validate capacity
      if (eventData?.maxAttendees && 
          eventData.attendingCount >= eventData.maxAttendees) {
        
        // Auto-convert to waitlisted if available
        if (eventData.waitlistEnabled) {
          await change.after.ref.update({
            rsvpStatus: 'waitlisted',
            autoWaitlisted: true
          });
        } else {
          // Revert the change
          await change.after.ref.update({
            rsvpStatus: before.rsvpStatus
          });
          throw new Error('Event is at capacity');
        }
      }
    }
  });
```

**Pros:**
- ✅ Server-side validation (always correct)
- ✅ Can auto-convert to waitlisted
- ✅ Can revert invalid changes

**Cons:**
- ❌ Additional latency (Cloud Function execution)
- ❌ More complex infrastructure
- ❌ Higher cost (Cloud Function invocations)
- ❌ User still sees initial error, then correction

**Reliability:** ✅ Very High (but worse UX due to async nature)

---

## Comparison Matrix

| Solution | UX Speed | Reliability | Complexity | Cost | Race Condition Protection |
|----------|---------|-------------|------------|------|---------------------------|
| **1. Client Only** | ⚡ Fast | ⚠️ Medium | 🟢 Low | 💰 Low | ❌ No |
| **2. Server Only** | 🐢 Slow | ✅ High | 🟡 Medium | 💰 Low | ✅ Yes |
| **3. Hybrid** | ⚡ Fast | ✅ Highest | 🔴 High | 💰 Low | ✅ Yes |
| **4. Cloud Functions** | 🐢 Slow | ✅ Very High | 🔴 High | 💰💰 Higher | ✅ Yes |

---

## Recommended Solution: Hybrid Approach (Solution 3)

**Why:**
1. **Best User Experience**: Fast feedback from client-side validation
2. **Highest Reliability**: Server-side validation as safety net
3. **Handles Edge Cases**: Race conditions, stale data, concurrent updates
4. **Cost Effective**: No additional infrastructure
5. **Maintainable**: Clear separation of concerns

**Implementation Priority:**
1. ✅ **Phase 1**: Enhanced client-side pre-validation (fast feedback)
2. ✅ **Phase 2**: Server-side error wrapping (safety net)
3. ✅ **Phase 3**: UI error handling with custom error types

---

## Technical Considerations

### Error Type Safety
- Create custom error classes (`CapacityError`, `PermissionError`)
- Use TypeScript discriminated unions for error handling
- Maintain error context throughout the call stack

### State Synchronization
- `capacityState` hook provides real-time updates
- Event document has `attendingCount` (needs to stay in sync)
- Consider optimistic updates with rollback on error

### Race Conditions
- Multiple users updating simultaneously
- Client state might be stale
- Server validation is final authority

### Performance
- Client pre-validation: instant (no network call)
- Server validation: ~100-200ms (network + Firestore read)
- Error wrapping: adds one additional Firestore read (~50ms)

---

## Testing Scenarios

### Test Case 1: Event at Capacity, Waitlist Disabled
- **Action**: User tries to change `not-going` → `going`
- **Expected**: Immediate error "Event is full. No more RSVPs can be accepted."
- **Client**: Should block before server call
- **Server**: Should also block and return `CapacityError`

### Test Case 2: Event at Capacity, Waitlist Enabled
- **Action**: User tries to change `not-going` → `going`
- **Expected**: Auto-converted to `waitlisted` with message "Event is full. You have been added to the waitlist."
- **Client**: Should convert before server call
- **Server**: If client missed it, server should catch and convert

### Test Case 3: Race Condition
- **Scenario**: Two users simultaneously try to RSVP to last spot
- **Expected**: First succeeds, second gets waitlisted or error
- **Client**: Both might pass pre-validation
- **Server**: Only one succeeds, other gets `CapacityError`

### Test Case 4: Status Change (No Capacity Impact)
- **Action**: User changes `going` → `not-going`
- **Expected**: Always succeeds (reduces count)
- **Client**: No validation needed
- **Server**: Should always allow

---

## Implementation Checklist

### Phase 1: Client-Side Pre-Validation
- [ ] Enhance capacity check to cover all attendee types
- [ ] Add validation before calling `updateAttendee`
- [ ] Auto-convert to `waitlisted` when appropriate
- [ ] Show immediate user feedback

### Phase 2: Server-Side Error Wrapping
- [ ] Create `CapacityError` class
- [ ] Create `PermissionError` class
- [ ] Wrap Firestore errors in `updateAttendee`
- [ ] Extract event capacity context from errors

### Phase 3: UI Error Handling
- [ ] Update catch blocks to handle custom errors
- [ ] Show context-specific error messages
- [ ] Auto-retry with waitlisted status when appropriate
- [ ] Fallback to generic error handling

### Phase 4: Testing
- [ ] Unit tests for error classes
- [ ] Integration tests for error scenarios
- [ ] E2E tests for user flows
- [ ] Load testing for race conditions

---

## Questions for Feedback

1. **Should we prioritize UX speed or reliability?**
   - Client-only: Fast but less reliable
   - Server-only: Reliable but slower
   - Hybrid: Fast + Reliable (recommended)

2. **How should we handle waitlist auto-conversion?**
   - Client-side: Immediate but might conflict with server
   - Server-side: Always correct but requires retry logic
   - Both: Client suggests, server confirms

3. **Error message strategy:**
   - Generic messages: "Permission denied"
   - Context-aware: "Event is full"
   - Actionable: "Event is full. Join waitlist?"

4. **Performance vs. Reliability trade-off:**
   - Pre-validation only: Fast but might miss edge cases
   - Server validation only: Reliable but slower
   - Both: Fast + Reliable (recommended)

---

## Conclusion

The current implementation has gaps in both client-side validation and server-side error handling. The recommended **Hybrid Approach** provides the best balance of user experience, reliability, and maintainability.

**Key Improvements:**
1. Enhanced client pre-validation (fast feedback)
2. Server-side error wrapping (safety net)
3. Context-aware error messages (better UX)
4. Type-safe error handling (maintainable code)

**Next Steps:**
1. Review this analysis with team/ChatGPT/Cursor
2. Confirm approach and priorities
3. Implement Phase 1 (client validation)
4. Implement Phase 2 (server wrapping)
5. Implement Phase 3 (UI handling)
6. Test thoroughly
7. Deploy incrementally

---

*Document created: 2025-11-03*
*Last updated: 2025-11-03*

