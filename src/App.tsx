import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
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

/** Simple error boundary so a crash doesn't white-screen the app */
class SimpleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: any, info: any) {
    console.error('Boundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-gray-700">
          Something went wrong. Please refresh.
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <SimpleErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
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
              style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden' }}
            />

            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="events" element={<Events />} />
                <Route path="media" element={<Media />} />  {/* UPDATED VERSION WITH LIVE UPLOAD */}
                {/* <Route path="media" element={<MediaGallery />} />  OLD VERSION - COMMENTED OUT */}
                <Route path="posts" element={<Posts />} />
                <Route path="sponsors" element={<Sponsors />} />
                <Route path="profile" element={<Profile />} />
                <Route path="family-management" element={<FamilyManagement />} />
              </Route>
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </SimpleErrorBoundary>
  );
}

export default App;
