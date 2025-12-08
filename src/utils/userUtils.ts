import { User } from '../types';

export const isUserApproved = (user: User | null | undefined): boolean => {
  if (!user) return false;
  // Treat legacy users with no status as approved for compatibility
  return !user.status || user.status === 'approved';
};

export const isUserPending = (user: User | null | undefined): boolean => {
  return !!user && user.status !== 'approved';
};
