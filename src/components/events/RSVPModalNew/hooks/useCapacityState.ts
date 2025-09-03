import { useMemo } from 'react';

interface CapacityCounts {
  goingCount: number;
  notGoingCount: number;
  pendingCount: number;
  totalGoing: number;
}

interface CapacityState {
  state: 'ok' | 'near' | 'full';
  remaining: number;
  isAtCapacity: boolean;
  isNearlyFull: boolean;
  capacityPercentage: number;
  warningMessage: string;
  slotsRemainingText: string;
}

/**
 * Hook to handle event capacity state and warnings
 * Encapsulates all capacity-related logic and messaging
 */
export const useCapacityState = (counts: CapacityCounts, maxAttendees?: number): CapacityState => {
  return useMemo(() => {
    if (!maxAttendees) {
      return {
        state: 'ok',
        remaining: Infinity,
        isAtCapacity: false,
        isNearlyFull: false,
        capacityPercentage: 0,
        warningMessage: '',
        slotsRemainingText: ''
      };
    }

    const capacityPercentage = counts.totalGoing / maxAttendees;
    const remaining = maxAttendees - counts.totalGoing;
    const isAtCapacity = counts.totalGoing >= maxAttendees;
    const isNearlyFull = counts.totalGoing >= maxAttendees * 0.9;

    let state: 'ok' | 'near' | 'full';
    let warningMessage = '';
    let slotsRemainingText = '';

    if (isAtCapacity) {
      state = 'full';
      warningMessage = 'Event is at capacity';
      slotsRemainingText = 'You can still add people (limit not enforced), but consider capacity.';
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
      slotsRemainingText
    };
  }, [counts.totalGoing, maxAttendees]);
};
