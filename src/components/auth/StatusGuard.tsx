import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface StatusGuardProps {
  children: React.ReactNode;
}

/**
 * StatusGuard redirects users based on their account approval status
 * - Pending users → /pending-approval
 * - Rejected users → /account-rejected
 * - Approved users → Allow access
 */
export const StatusGuard: React.FC<StatusGuardProps> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return; // Wait for auth to load
    if (!currentUser) return; // Not logged in, let auth handle it

    // Check user status
    const status = currentUser.status || 'approved'; // Default to approved for existing users

    if (status === 'pending' || status === 'needs_clarification') {
      // Allow access to pending-approval page itself
      if (window.location.pathname === '/pending-approval') {
        return;
      }
      navigate('/pending-approval', { replace: true });
      return;
    }

    if (status === 'rejected') {
      // Allow access to account-rejected page itself
      if (window.location.pathname === '/account-rejected') {
        return;
      }
      navigate('/account-rejected', { replace: true });
      return;
    }

    // Approved users can access everything
  }, [currentUser, loading, navigate]);

  // Show loading while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
};

