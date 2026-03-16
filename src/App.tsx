import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Provider as RollbarProvider, ErrorBoundary as RollbarErrorBoundary, useRollbar } from '@rollbar/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RollbarUserTracker } from './components/RollbarUserTracker';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { rollbarService } from './services/rollbarService';
import { setRollbarInstance } from './services/errorService';
import { setupGlobalErrorHandling } from './utils/globalErrorHandler';
import { OrganizationSchema } from './components/seo/StructuredData';
import Login from './components/auth/Login';
import Register from './components/auth/RegisterNew';
import ScrollToTop from './components/common/ScrollToTop';
import Layout from './components/layout/Layout';
import PopupAlertHandler from './components/notifications/PopupAlertHandler';
import { PushNotificationInitializer } from './components/notifications/PushNotificationInitializer';
import About from './pages/About';
import AccountRejected from './pages/AccountRejected';
import CommunityGuidelines from './pages/CommunityGuidelines';
import Contact from './pages/Contact';
import EventDetailsPage from './pages/EventDetailsPage';
import EventDetailsPageV2 from './pages/EventDetailsPageV2';
import Events from './pages/Events';
import EventsV2 from './pages/EventsV2';
import FamilyManagement from './pages/FamilyManagement';
import Founder from './pages/Founder';
import Home from './pages/Home';
import Media from './pages/Media';
import PendingApproval from './pages/PendingApproval';
import Posts from './pages/Posts';
import Press from './pages/Press';
import Profile from './pages/Profile';
import Reset from './pages/Reset';
import RSVPPage from './pages/RSVPPage';
import RSVPPageV2 from './pages/RSVPPageV2';
import GuestRSVPPage from './pages/GuestRSVPPage';
import ShareYourStory from './pages/ShareYourStory';
import Sponsors from './pages/Sponsors';
import Testimonials from './pages/Testimonials';
import ErrorLogs from './pages/ErrorLogs';
// import SupportTools from './pages/SupportTools'; // Hidden for now - not rolling out in initial phase
// import Workouts from './pages/Workouts'; // Hidden for now
// import Challenges from './pages/Challenges'; // Hidden for now
// import ChallengeDetail from './pages/ChallengeDetail'; // Hidden for now
import AdminConsole from './pages/AdminConsole';


// Component to store Rollbar instance
function RollbarInstanceTracker() {
  const rollbar = useRollbar();
  
  useEffect(() => {
    if (rollbar) {
      setRollbarInstance(rollbar);
      // Also store on window for global access
      (window as any).Rollbar = rollbar;
    }
  }, [rollbar]);
  
  return null;
}

// Component to wrap app with Rollbar
function AppWithRollbar() {
  const rollbarConfig = rollbarService.getConfig();
  const isRollbarEnabled = !!rollbarConfig;

  if (!rollbarConfig) {
    return <AppContent isRollbarEnabled={false} />;
  }

  return (
    <RollbarProvider config={rollbarConfig}>
      <RollbarInstanceTracker />
      <RollbarErrorBoundary>
        <AppContent isRollbarEnabled={true} />
      </RollbarErrorBoundary>
    </RollbarProvider>
  );
}

// Inner app content
function AppContent({ isRollbarEnabled }: { isRollbarEnabled: boolean }) {
  // Set up global error handling
  useEffect(() => {
    setupGlobalErrorHandling();
    
    // Get Rollbar instance from context and store it
    // This is a workaround since we can't use hooks in error service
    const checkRollbar = () => {
      try {
        // Try to get Rollbar from window (set by Rollbar Provider)
        const rollbar = (window as any).Rollbar;
        if (rollbar) {
          setRollbarInstance(rollbar);
        }
      } catch (e) {
        // Ignore
      }
    };
    
    // Check after a short delay to allow Rollbar to initialize
    setTimeout(checkRollbar, 100);
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        {isRollbarEnabled && <RollbarUserTracker />}
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}

// Rename the original AppContent to AppRouter
function AppRouter() {
  const { currentUser } = useAuth();
  
  return (
    <Router>
      {/* Scroll to top on route change */}
      <ScrollToTop />
      
      {/* Global Popup Alert Handler */}
      {currentUser && (
        <PopupAlertHandler userId={currentUser.id} />
      )}
      
      {/* Push Notification Initializer */}
      <PushNotificationInitializer />
      
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        {/* Global SEO Structured Data */}
        <OrganizationSchema />
        <Toaster
          position="top-center"
          containerStyle={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          toastOptions={{
            duration: 2500,
            style: {
              background: '#111827',
              color: '#fff',
              borderRadius: '10px',
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(0,0,0,.22)',
              fontSize: '15px',
              maxWidth: '90vw',
              textAlign: 'center',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#111827' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#111827' } },
          }}
        />

        {/* Single, global container for Firebase Phone Auth reCAPTCHA.
            Do NOT add per-page containers in Login/Register. */}
        <div
          id="recaptcha-container"
          style={{ position: 'fixed', width: '1px', height: '1px', top: '-9999px', left: '-9999px' }}
        />

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route path="/account-rejected" element={<AccountRejected />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="events" element={<Events />} />
            <Route path="events/:eventId" element={<EventDetailsPage />} />
            <Route path="events/:eventId/rsvp" element={<RSVPPage />} />
            <Route path="events/:eventId/guest-rsvp" element={<GuestRSVPPage />} />
            <Route path="events-v2" element={<EventsV2 />} />
            <Route path="events-v2/:eventId" element={<EventDetailsPageV2 />} />
            <Route path="events-v2/:eventId/rsvp" element={<RSVPPageV2 />} />
            <Route path="media" element={<Media />} />  {/* UPDATED VERSION WITH LIVE UPLOAD */}
          {/* <Route path="media" element={<MediaGallery />} />  OLD VERSION - COMMENTED OUT */}
            <Route path="posts" element={<Posts />} />
            {/* <Route path="support-tools" element={<SupportTools />} /> */} {/* Hidden for now - not rolling out in initial phase */}
            {/* <Route path="support-tools/:categorySlug" element={<SupportTools />} /> */} {/* Hidden for now - not rolling out in initial phase */}
            <Route path="sponsors" element={<Sponsors />} />
            <Route path="profile" element={<Profile mode="profile" />} />
            <Route path="admin" element={<AdminConsole />} />
            <Route path="admin/error-logs" element={<ErrorLogs />} />
            <Route path="family-management" element={<FamilyManagement />} />
            <Route path="founder" element={<Founder />} />
            <Route path="contact" element={<Contact />} />
            <Route path="about" element={<About />} />
            <Route path="reset" element={<Reset />} />
            <Route path="press" element={<Press />} />
            <Route path="community-guidelines" element={<CommunityGuidelines />} />
            <Route path="share-your-story" element={<ShareYourStory />} />
            <Route path="mfmstories" element={<Testimonials />} />
            <Route path="testimonials" element={<Navigate to="/mfmstories" replace />} />
            {/* <Route path="workouts" element={<Workouts />} /> */} {/* Hidden for now */}
            {/* <Route path="challenges" element={<Challenges />} /> */} {/* Hidden for now */}
            {/* <Route path="challenges/:id" element={<ChallengeDetail />} /> */} {/* Hidden for now */}
          </Route>
        </Routes>
      </div>
    </Router>
  );
}

function App() {
  return <AppWithRollbar />;
}

export default App;
