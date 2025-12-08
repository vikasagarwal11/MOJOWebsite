import React, { useMemo } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Header from './Header';
import Footer from './Footer';
import AssistantWidget from '../assistant/AssistantWidget';
import { StatusBanner } from '../common/StatusBanner';

// Public routes that don't require authentication or approval (available to everyone, including logged-out users)
// These routes are accessible WITHOUT login, so pending/rejected users can still see them
// Note: /events, /posts, and /media pages handle their own filtering (public vs private content)
const PUBLIC_ROUTES = ['/', '/events', '/events-readonly', '/posts', '/media', '/sponsors', '/founder', '/contact', '/about', '/press', '/community-guidelines', /* '/challenges', '/workouts', */ '/pending-approval', '/account-rejected']; // Challenges and Workouts hidden for now

// Protected routes that require approved status (create/edit actions within these pages are still protected)
const PROTECTED_ROUTES = ['/profile', '/admin', '/family-management'];

const Layout: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Show loading while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full" />
      </div>
    );
  }

  // Determine redirect path based on user status
  const redirectPath = useMemo(() => {
    const currentPath = location.pathname.toLowerCase();
    
    // Helper to check if the current path (including subpaths) matches a route in a list
    const checkRouteMatch = (routes: string[]) => routes.some(route => 
      currentPath === route || currentPath.startsWith(route + '/')
    );
    
    const isProtectedRoute = checkRouteMatch(PROTECTED_ROUTES);
    const isPublicRoute = checkRouteMatch(PUBLIC_ROUTES);

    // 1. If user is not logged in
    if (!currentUser) {
      // Allow public routes for logged-out users; redirect to home if trying to access non-public content
      return isPublicRoute ? null : '/';
    }

    // 🔥 CRITICAL FIX: Default to 'pending' if status is missing (consistent with AuthContext)
    // This ensures new users without status are treated as pending, not auto-approved
    const status = currentUser.status || 'pending';
    
    // --- PENDING/REJECTED USER LOGIC (Hybrid Model) ---
    if (status === 'pending' || status === 'needs_clarification' || status === 'rejected') {
      
      // Define the mandatory status page based on the most restrictive status
      const mandatoryStatusPage = 
          status === 'rejected' ? '/account-rejected' : '/pending-approval';
      
      // A. Allow access to their specific status page
      if (currentPath === '/pending-approval' || currentPath === '/account-rejected') {
        // If the user is on the correct mandatory status page, allow it.
        if (currentPath === mandatoryStatusPage) {
            return null;
        }
        // If they are on the WRONG status page (e.g., rejected user is on /pending-approval), redirect.
        return mandatoryStatusPage;
      }
      
      // B. Allow access to ALL public routes (UX requirement - Hybrid Model)
      if (isPublicRoute) {
          // They can view /events, /, /posts, /media, etc. (read-only, no interactions)
          return null; 
      }

      // C. Block access to protected routes (Security requirement)
      if (isProtectedRoute) {
        // If they try to hit /profile, /admin, /workouts, redirect them to the appropriate status page
        return mandatoryStatusPage;
      }
      
      // D. Fallback: If they hit a route that is neither public nor protected,
      // redirect them to prevent unexpected behavior.
      return mandatoryStatusPage;
    }
    
    // --- APPROVED USER LOGIC ---
    // Approved users can access all routes (public and protected)
    return null;
  }, [currentUser, location.pathname]);

  // Perform immediate redirect using Navigate component (declarative redirect)
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <Header />
      <StatusBanner currentUser={currentUser} />
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
      <Footer />
      <AssistantWidget />
    </div>
  );
};

export default Layout;
