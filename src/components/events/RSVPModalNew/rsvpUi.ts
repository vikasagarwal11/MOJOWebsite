/**
 * RSVP Modal UI Configuration and Constants
 * Centralized configuration for consistent look/feel and easier maintenance
 */

// Age group options
export const AGE_GROUP_OPTIONS = [
  { value: '0-2', label: '0-2 Years' },
  { value: '3-5', label: '3-5 Years' },
  { value: '6-10', label: '6-10 Years' },
  { value: 'teen', label: 'Teen' },
  { value: 'adult', label: 'Adult' }
] as const;

// Relationship options
export const RELATIONSHIP_OPTIONS = [
  { value: 'primary', label: 'Primary User' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'friend', label: 'Friend' },
  { value: 'guest', label: 'Guest' }
] as const;

// RSVP status options
export const RSVP_STATUS_OPTIONS = [
  { value: 'going', label: 'Going' },
  { value: 'not_going', label: 'Not Going' },
  { value: 'pending', label: 'Pending' }
] as const;

// Capacity thresholds
export const CAPACITY_THRESHOLDS = {
  NEARLY_FULL: 0.9, // 90% capacity triggers warning
  FULL: 1.0 // 100% capacity triggers full warning
} as const;

// Animation durations and easing
export const ANIMATION_CONFIG = {
  MODAL_ENTRY: { type: 'spring', duration: 0.3 },
  SECTION_TOGGLE: { duration: 0.3, ease: 'easeInOut' },
  BUTTON_HOVER: { scale: 1.05 },
  BUTTON_TAP: { scale: 0.95 }
} as const;

// CSS class helpers
export const getCapacityBadgeClasses = (state: 'ok' | 'near' | 'full') => {
  switch (state) {
    case 'full':
      return 'bg-red-50 border border-red-200 text-red-800';
    case 'near':
      return 'bg-yellow-50 border border-yellow-200 text-yellow-800';
    default:
      return 'bg-green-50 border border-green-200 text-green-800';
  }
};

export const getStatusBadgeClasses = (status: 'going' | 'not_going' | 'pending') => {
  switch (status) {
    case 'going':
      return 'bg-green-100 text-green-800';
    case 'not_going':
      return 'bg-red-100 text-red-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

// Modal sizing
export const MODAL_SIZING = {
  MOBILE: 'max-w-[95vw]',
  TABLET: 'md:max-w-[50vw]',
  DESKTOP: 'lg:max-w-[45vw] xl:max-w-[40vw] 2xl:max-w-2xl',
  HEIGHT: 'max-h-[95vh]'
} as const;

// Color scheme
export const COLORS = {
  PRIMARY: '#F25129',
  PRIMARY_HOVER: '#E0451F',
  SECONDARY: '#FF6B35',
  SECONDARY_HOVER: '#E55A2A',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444'
} as const;
