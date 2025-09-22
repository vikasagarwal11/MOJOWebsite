import { useMemo } from 'react';

interface CapacityCounts {
  goingCount: number;
  notGoingCount: number;
  pendingCount: number;
  waitlistedCount: number;
  totalGoing: number;
}

interface CapacityState {
  state: 'ok' | 'near' | 'full' | 'waitlist';
  remaining: number;
  isAtCapacity: boolean;
  isNearlyFull: boolean;
  capacityPercentage: number;
  warningMessage: string;
  slotsRemainingText: string;
  canAddMore: boolean; // Can add to main capacity
  canWaitlist: boolean; // Can add to waitlist
  waitlistCount: number;
}

/**
 * Hook to handle event capacity state and warnings
 * Encapsulates all capacity-related logic and messaging
 */
export const useCapacityState = (counts: CapacityCounts, maxAttendees?: number, waitlistEnabled = false, waitlistLimit?: number): CapacityState => {
  return useMemo(() => {
    if (!maxAttendees) {
      return {
        state: 'ok',
        remaining: Infinity,
        isAtCapacity: false,
        isNearlyFull: false,
        capacityPercentage: 0,
        warningMessage: '',
        slotsRemainingText: '',
        canAddMore: true, // No limit, can always add more
        canWaitlist: false, // No waitlist needed when unlimited
        waitlistCount: counts.waitlistedCount
      };
    }

    const capacityPercentage = counts.totalGoing / maxAttendees;
    const remaining = maxAttendees - counts.totalGoing;
    const isAtCapacity = counts.totalGoing >= maxAttendees;
    const isNearlyFull = counts.totalGoing >= maxAttendees * 0.9;

    // Check waitlist capacity
    const waitlistCount = counts.waitlistedCount;
    const canWaitlist = waitlistEnabled && (!waitlistLimit || waitlistCount < waitlistLimit);

    let state: 'ok' | 'near' | 'full' | 'waitlist';
    let warningMessage = '';
    let slotsRemainingText = '';

    if (isAtCapacity) {
      if (waitlistEnabled && canWaitlist) {
        state = 'waitlist';
        warningMessage = 'Event is full - join waitlist';
        slotsRemainingText = waitlistLimit 
          ? `Waitlist available (${waitlistLimit - waitlistCount} spots remaining)`
          : 'Join waitlist to be notified if spots open up';
      } else {
        state = 'full';
        warningMessage = 'Event is at capacity';
        slotsRemainingText = 'Event is full. No more RSVPs can be accepted.';
      }
    } else if (isNearlyFull) {
      state = 'near';
      warningMessage = 'Event is nearly full';
      slotsRemainingText = `Only ${remaining} slot${remaining === 1 ? '' : 's'} remaining.`;
    } else {
      state = 'ok';
      warningMessage = '';
      slotsRemainingText = '';
    }

    return {
      state,
      remaining,
      isAtCapacity,
      isNearlyFull,
      capacityPercentage,
      warningMessage,
      slotsRemainingText,
      canAddMore: !isAtCapacity, // Can add to main capacity
      canWaitlist: isAtCapacity && canWaitlist, // Can add to waitlist when full
      waitlistCount
    };
  }, [counts.totalGoing, counts.waitlistedCount, maxAttendees, waitlistEnabled, waitlistLimit]);
};
