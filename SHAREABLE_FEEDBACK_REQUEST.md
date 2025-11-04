# RSVP Capacity Error Handling - Feedback Request

## Context
I'm working on a React/TypeScript event management application using Firebase (Firestore + Auth). Users are experiencing poor UX when trying to RSVP to events that are at capacity.

## The Problem

### User Experience Issue
- **Current Error**: Users see "Missing or insufficient permissions" when trying to change RSVP status from `not-going` → `going` on events at capacity
- **User Confusion**: Generic error message doesn't explain WHY they can't RSVP
- **Expected Behavior**: Clear message like "Event is full" or "Event is full, but you've been added to the waitlist"

### Technical Flow
1. **Client-side**: User clicks dropdown → `handleUpdateAttendee` called → Has some validation but doesn't catch all cases
2. **Service layer**: Calls `updateAttendee()` → Firestore transaction tries to update
3. **Firestore Rules**: Correctly blocks capacity violations → Returns generic "permission-denied" error
4. **Error handling**: Generic error message shown to user

### Example Scenario
```typescript
// Event State
maxAttendees: 3
attendingCount: 4  // Already at/over capacity
waitlistEnabled: false

// User Action
Current Status: 'not-going'
Desired Status: 'going'

// What Happens
1. Client validation might pass (or might not)
2. Transaction calculates: 4 + 1 = 5 (would exceed max of 3)
3. Firestore rules block: "permission-denied"
4. User sees: "You do not have permission to update this attendee." ❌
```

## Current Implementation

### Client-Side Validation (AttendeeList.tsx)
```typescript
// Lines 268-284: Only checks PRIMARY members changing TO 'going'
if (attendeeToUpdate.userId === currentUser.id &&
    attendeeToUpdate.attendeeType === 'primary' &&
    pendingUpdate.rsvpStatus === 'going') {
  
  if (capacityState?.isAtCapacity) {
    if (capacityState.canWaitlist) {
      pendingUpdate = { ...pendingUpdate, rsvpStatus: 'waitlisted' };
      toast.success('Event is full, so you have been added to the waitlist.');
    } else {
      const blockedMessage = getCapacityBlockedMessage();
      updateStatusError(attendeeId, blockedMessage);
      toast.error(blockedMessage);
      return;
    }
  }
}
```

**Issues:**
- Only checks PRIMARY members (family members can also hit capacity)
- Only checks when changing TO 'going' (doesn't catch status transitions)
- Relies on `capacityState` which might be stale
- No validation when `not-going` → `going` transition

### Service Layer (attendeeService.ts)
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
    // Currently just re-throws raw Firestore error
    // No error transformation or context extraction
    throw error;
  }
};
```

**Issues:**
- Doesn't catch and transform Firestore errors
- No capacity context extraction
- No custom error types
- Just passes through generic errors

### Error Handling (AttendeeList.tsx)
```typescript
catch (error) {
  console.error('Failed to update attendee:', error);
  
  // Attempts to detect capacity-related errors by string matching
  let message = error.message || String(error);
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
- Doesn't check error codes (`error.code === 'permission-denied'`)
- No access to capacity context from error
- Generic "permission" message doesn't explain WHY

## Proposed Solutions

### Solution 1: Client-Side Pre-Validation Only (Preventive)
**Philosophy:** "Don't even try if it will fail"

**Pros:**
- ✅ Fast user feedback (immediate)
- ✅ Prevents unnecessary server calls
- ✅ Good user experience (no waiting)

**Cons:**
- ❌ Client state might be stale (race conditions)
- ❌ Doesn't protect against concurrent updates
- ❌ Still needs server-side validation as fallback

**Reliability:** ⚠️ Medium

---

### Solution 2: Server-Side Error Wrapping Only (Reactive)
**Philosophy:** "Catch server errors and make them user-friendly"

**Implementation:**
```typescript
// Step 1: Create Custom Error Classes
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

// Step 2: Wrap Errors in Service Layer
export const updateAttendee = async (...) => {
  try {
    await runTransaction(db, async (transaction) => {
      // Transaction logic...
    });
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      // Fetch event to get capacity context
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      const eventData = eventDoc.data();
      
      // If trying to set status to 'going', it's likely a capacity issue
      if (updateData.rsvpStatus === 'going') {
        const maxAttendees = eventData?.maxAttendees;
        const attendingCount = eventData?.attendingCount || 0;
        const waitlistEnabled = eventData?.waitlistEnabled || false;
        
        if (maxAttendees && attendingCount >= maxAttendees) {
          const waitlistCount = eventData?.waitlistCount || 0;
          const canWaitlist = waitlistEnabled && 
            (!eventData.waitlistLimit || waitlistCount < eventData.waitlistLimit);
          
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
      
      throw new PermissionError('Permission denied', 'unknown');
    }
    throw error;
  }
};

// Step 3: Handle Errors in UI
catch (error) {
  if (error instanceof CapacityError) {
    const message = error.canWaitlist 
      ? 'Event is full. You have been added to the waitlist.'
      : error.getUserMessage();
    
    toast.error(message);
    
    // Auto-retry with waitlisted status if available
    if (error.canWaitlist) {
      await updateAttendee(attendeeId, { rsvpStatus: 'waitlisted' });
      return;
    }
  }
  // ... other error handling
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
- ❌ Error happens AFTER user action (worse UX)

**Reliability:** ✅ High

---

### Solution 3: Hybrid Approach (Recommended)
**Philosophy:** "Validate early, but trust the server as final authority"

**Implementation:**
1. **Client pre-validation** (fast feedback)
2. **Server error wrapping** (safety net)
3. **UI error handling** (graceful degradation)

**Pros:**
- ✅ Fast user feedback (client pre-check)
- ✅ Server validation as safety net (handles race conditions)
- ✅ Graceful error handling (parsed server errors)
- ✅ Best user experience (immediate feedback + server reliability)

**Cons:**
- ❌ More code to maintain
- ❌ Requires coordination between client and server

**Reliability:** ✅ Highest (defense in depth)

---

## Questions for Feedback

### 1. Approach Selection
**Which solution do you recommend and why?**
- Client-only validation (fast but less reliable)
- Server-only error wrapping (reliable but slower)
- Hybrid approach (fast + reliable - recommended)
- Cloud Functions (very reliable but async/complex)

### 2. Error Message Strategy
**How should we communicate errors to users?**
- Generic: "Permission denied"
- Context-aware: "Event is full (4/3 attendees)"
- Actionable: "Event is full. Join waitlist?"
- All of the above based on error type?

### 3. Waitlist Auto-Conversion
**How should we handle automatic waitlist conversion?**
- Client-side: Immediate but might conflict with server
- Server-side: Always correct but requires retry logic
- Both: Client suggests, server confirms

### 4. Race Condition Handling
**How important is handling concurrent updates?**
- Current issue: Two users simultaneously RSVP to last spot
- Should we prioritize: UX speed or data consistency?
- Is hybrid approach worth the complexity?

### 5. Error Type Design
**Custom error classes vs. error codes?**
```typescript
// Option A: Custom Error Classes
if (error instanceof CapacityError) { ... }

// Option B: Error Codes
if (error.code === 'CAPACITY_EXCEEDED') { ... }

// Option C: Error Discriminated Union
if (error.type === 'capacity' && error.canWaitlist) { ... }
```

### 6. Performance vs. Reliability Trade-off
**Additional Firestore read for error context:**
- Is fetching event data in error handler acceptable?
- ~50ms additional latency vs. better error messages
- Alternative: Cache event data on client?

### 7. Implementation Priority
**If going with Hybrid approach, what's the implementation order?**
1. Phase 1: Enhanced client validation (fast feedback)
2. Phase 2: Server error wrapping (safety net)
3. Phase 3: UI error handling (graceful degradation)
4. Phase 4: Testing & edge cases

---

## Technical Stack Context
- **Frontend**: React 18 + TypeScript
- **Backend**: Firebase Firestore
- **State Management**: React hooks
- **Error Handling**: Try-catch with toast notifications
- **Security**: Firestore security rules (server-side validation)

---

## Specific Code Locations
- **Client Component**: `src/components/events/AttendeeList.tsx` (lines 260-400)
- **Service Layer**: `src/services/attendeeService.ts` (lines 517-642)
- **Firestore Rules**: `firestore.rules` (lines 442-459)
- **Capacity State Hook**: `src/components/events/RSVPModalNew/hooks/useCapacityState.ts`

---

## Desired Outcome
1. **Better UX**: Clear, actionable error messages
2. **Reliability**: Handles race conditions and edge cases
3. **Maintainability**: Clean, type-safe error handling
4. **Performance**: Fast user feedback when possible

---

## Additional Context
- Events have `maxAttendees`, `attendingCount`, `waitlistEnabled`, `waitlistLimit`
- Users can have PRIMARY and FAMILY_MEMBER attendees
- Family members require primary member to be "going"
- Waitlist system exists but auto-conversion needs improvement
- Current capacity checks work but error messages are poor

---

**What feedback can you provide on:**
1. Which solution approach is best?
2. Error handling architecture recommendations?
3. Edge cases I might be missing?
4. Performance optimizations?
5. Code organization improvements?

Thank you for your feedback! 🙏

