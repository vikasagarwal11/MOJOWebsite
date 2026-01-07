import { useEffect } from 'react';
import { useRollbar } from '@rollbar/react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Component to track user context in Rollbar
 * Should be placed inside RollbarProvider
 * This component should only be rendered when RollbarProvider is available
 */
export function RollbarUserTracker() {
  const rollbar = useRollbar();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!rollbar) {
      return;
    }

    if (currentUser) {
      // Set user context in Rollbar
      rollbar.configure({
        payload: {
          person: {
            id: currentUser.id,
            email: currentUser.email,
            username: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim(),
          },
        },
      });
    } else {
      // Clear user context
      rollbar.configure({
        payload: {
          person: null,
        },
      });
    }
  }, [rollbar, currentUser]);

  // This component doesn't render anything
  return null;
}

