import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setupGlobalErrorHandling } from './utils/globalErrorHandler';
// import { OrganizationSchema } from './components/seo/StructuredData';
import Layout from './components/layout/Layout';
import PopupAlertHandler from './components/notifications/PopupAlertHandler';
import Home from './pages/Home';
import Events from './pages/Events';
import Media from './pages/Media';
import MediaGallery from './components/media/MediaGallery';  // NEW VERSION
import Posts from './pages/Posts';
import Sponsors from './pages/Sponsors';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Profile from './pages/Profile';
import FamilyManagement from './pages/FamilyManagement';
import Founder from './pages/Founder';
import Contact from './pages/Contact';
import About from './pages/About';
import Reset from './pages/Reset';
import Press from './pages/Press';
import CommunityGuidelines from './pages/CommunityGuidelines';
import AdminBulkAttendees from './pages/AdminBulkAttendees';
import AdminCleanup from './pages/AdminCleanup';
import EventsReadOnly from './pages/EventsReadOnly';
import EventDetailsPage from './pages/EventDetailsPage';

function AppContent() {
  const { currentUser } = useAuth();
  
  return (
    <Router>
      {/* Global Popup Alert Handler */}
      {currentUser && (
        <PopupAlertHandler userId={currentUser.id} />
      )}
      
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
          <Route path="/admin/bulk-attendees" element={<AdminBulkAttendees />} />
          <Route path="/admin/cleanup" element={<AdminCleanup />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="events" element={<Events />} />
            <Route path="events/:eventId" element={<Events />} />
            <Route path="events-readonly" element={<EventsReadOnly />} />
            <Route path="events-readonly/:eventId" element={<EventDetailsPage />} />
            <Route path="media" element={<Media />} />  {/* UPDATED VERSION WITH LIVE UPLOAD */}
            {/* <Route path="media" element={<MediaGallery />} />  OLD VERSION - COMMENTED OUT */}
            <Route path="posts" element={<Posts />} />
            <Route path="sponsors" element={<Sponsors />} />
            <Route path="profile" element={<Profile />} />
            <Route path="family-management" element={<FamilyManagement />} />
            <Route path="founder" element={<Founder />} />
            <Route path="contact" element={<Contact />} />
            <Route path="about" element={<About />} />
            <Route path="reset" element={<Reset />} />
            <Route path="press" element={<Press />} />
            <Route path="community-guidelines" element={<CommunityGuidelines />} />
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
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('App Error Boundary caught error:', error, errorInfo)
      }}
    >
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;