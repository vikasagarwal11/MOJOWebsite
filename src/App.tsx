import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setupGlobalErrorHandling } from './utils/globalErrorHandler';
// import { OrganizationSchema } from './components/seo/StructuredData';
import Layout from './components/layout/Layout';
import PopupAlertHandler from './components/notifications/PopupAlertHandler';
import { PushNotificationInitializer } from './components/notifications/PushNotificationInitializer';
import ScrollToTop from './components/common/ScrollToTop';
import Home from './pages/Home';
import Events from './pages/Events';
import Media from './pages/Media';
import Posts from './pages/Posts';
import Sponsors from './pages/Sponsors';
import Login from './components/auth/Login';
import Register from './components/auth/RegisterNew';
import PendingApproval from './pages/PendingApproval';
import AccountRejected from './pages/AccountRejected';
import Profile from './pages/Profile';
import FamilyManagement from './pages/FamilyManagement';
import Founder from './pages/Founder';
import Contact from './pages/Contact';
import About from './pages/About';
import Reset from './pages/Reset';
import Press from './pages/Press';
import CommunityGuidelines from './pages/CommunityGuidelines';
import EventsReadOnly from './pages/EventsReadOnly';
import EventDetailsPage from './pages/EventDetailsPage';
import RSVPPage from './pages/RSVPPage';
import ShareYourStory from './pages/ShareYourStory';
// import Workouts from './pages/Workouts'; // Hidden for now
// import Challenges from './pages/Challenges'; // Hidden for now
// import ChallengeDetail from './pages/ChallengeDetail'; // Hidden for now
import AdminConsole from './pages/AdminConsole';

function AppContent() {
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
        {/* Global SEO Structured Data - Temporarily disabled */}
        {/* <OrganizationSchema 
          socialMedia={{
            facebook: "https://facebook.com/momsfitnessmojo",
            instagram: "https://instagram.com/momsfitnessmojo",
            twitter: "https://twitter.com/momsfitnessmojo"
          }}
        /> */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 2500,
            style: {
              background: '#111827',
              color: '#fff',
              borderRadius: '10px',
              padding: '10px 12px',
              boxShadow: '0 8px 24px rgba(0,0,0,.22)',
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
            <Route path="events/:eventId" element={<Events />} />
            <Route path="events/:eventId/rsvp" element={<RSVPPage />} />
            <Route path="events-readonly" element={<EventsReadOnly />} />
            <Route path="events-readonly/:eventId" element={<EventDetailsPage />} />
            <Route path="media" element={<Media />} />  {/* UPDATED VERSION WITH LIVE UPLOAD */}
          {/* <Route path="media" element={<MediaGallery />} />  OLD VERSION - COMMENTED OUT */}
            <Route path="posts" element={<Posts />} />
            <Route path="sponsors" element={<Sponsors />} />
            <Route path="profile" element={<Profile mode="profile" />} />
            <Route path="admin" element={<AdminConsole />} />
            <Route path="family-management" element={<FamilyManagement />} />
            <Route path="founder" element={<Founder />} />
            <Route path="contact" element={<Contact />} />
            <Route path="about" element={<About />} />
            <Route path="reset" element={<Reset />} />
            <Route path="press" element={<Press />} />
            <Route path="community-guidelines" element={<CommunityGuidelines />} />
            <Route path="share-your-story" element={<ShareYourStory />} />
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
  // Set up global error handling
  useEffect(() => {
    setupGlobalErrorHandling()
  }, [])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
