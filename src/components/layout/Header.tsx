import { Facebook, Instagram, LogOut, Menu, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isUserPending } from '../../utils/userUtils';
import NotificationCenter from '../notifications/NotificationCenter';

function initialsFromName(name?: string) {
  if (!name) return 'MM';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'MM';
}

// Cache buster for images; pairs with user.updatedAt (Date) from AuthContext
function bust(url?: string, version?: Date) {
  if (!url) return url;
  const v = version ? version.getTime() : Date.now();
  return url + (url.includes('?') ? '&' : '?') + 'v=' + v;
}

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const location = useLocation();

  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Close user menu on Esc and when route changes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setUserMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Events', href: '/events' },
    // { name: 'Events (Read-Only)', href: '/events-readonly' }, // Hidden for now
    { name: 'Media', href: '/media' },
    // { name: 'Workouts', href: '/workouts' }, // Hidden for now
    // { name: 'Challenges', href: '/challenges' }, // Hidden for now
    // { name: 'Posts', href: '/posts' }, // Hidden for now - will bring back later
    { name: 'Testimonials', href: '/testimonials' },
    // { name: 'Support Tools', href: '/support-tools' }, // Hidden for now - not rolling out in initial phase
    { name: 'About Us', href: '/about' },
    { name: 'Founder', href: '/founder' },
    // { name: 'Press', href: '/press' }, // Hidden for now
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    try {
      console.log('Logging out...');
      await logout();
      console.log('Logout successful');
      // Force a page refresh to ensure clean state
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const displayName = currentUser?.displayName || 'Member';
  const email = currentUser?.email || '';
  const avatarSrc = currentUser?.photoURL
    ? bust(currentUser.photoURL, currentUser.updatedAt)
    : undefined;

  return (
    <header className="bg-[#F25129] backdrop-blur-lg border-b border-[#F25129]/30 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Row: Brand | Center nav | User area */}
        <div className="flex items-center gap-2 sm:gap-4 h-14 sm:h-16">
          {/* Logo - visible on all devices for better branding */}
          <Link to="/" className="flex items-center gap-2 shrink-0 md:hidden">
            <img src="/logo.png" alt="Moms Fitness Mojo" className="h-8 w-8 rounded-full object-cover" />
          </Link>

          {/* Center nav (desktop only; mobile uses hamburger menu) */}
          <nav className="hidden md:flex flex-1 justify-center min-w-0" aria-label="Primary">
            <div className="flex items-center gap-1 lg:gap-2">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`px-2 lg:px-3 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? 'bg-white/20 text-white'
                      : 'text-white/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
              {/* Social Media Icons */}
              <div className="hidden lg:flex items-center gap-2 ml-2 pl-2 border-l border-white/20">
                <a
                  href="https://www.instagram.com/momsfitnessmojo/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200"
                  aria-label="Follow us on Instagram"
                  title="Follow us on Instagram"
                >
                  <Instagram className="w-4 h-4 xl:w-5 xl:h-5" />
                </a>
                <a
                  href="https://www.facebook.com/momsfitnessmojo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200"
                  aria-label="Follow us on Facebook"
                  title="Follow us on Facebook"
                >
                  <Facebook className="w-4 h-4 xl:w-5 xl:h-5" />
                </a>
              </div>
            </div>
          </nav>

          {/* User area (notifications + avatar; bounded; cache-busted) */}
          <div className="hidden md:flex items-center gap-2 lg:gap-3 shrink-0" ref={menuRef}>
            {/* Notification Center */}
            {currentUser && (
              <NotificationCenter 
                userId={currentUser.id} 
                onNavigateToEvent={(eventId) => {
                  // Navigate to event when notification clicked
                  window.location.href = `/events/${eventId}`;
                }}
              />
            )}
            {currentUser ? (
              <div className="relative">
                <button
                  ref={buttonRef}
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="group/avatar relative flex items-center gap-1 lg:gap-2 pl-1 pr-1 lg:pr-2 py-1 rounded-full border border-[#F25129]/20 hover:bg-[#F25129]/10 transition-colors touch-target"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-controls="user-menu"
                  title={`${displayName}${email ? `\n${email}` : ''}`}
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-full overflow-hidden ring-1 ring-[#F25129]/30 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-semibold">
                        {initialsFromName(displayName)}
                      </span>
                    )}
                  </div>
                </button>

                {userMenuOpen && (
                  <div
                    id="user-menu"
                    className="absolute right-0 mt-2 w-56 sm:w-64 rounded-xl border bg-white shadow-lg overflow-hidden"
                    role="menu"
                    aria-labelledby="user-menu-button"
                  >
                    <div className="px-4 py-3 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden ring-1 ring-[#F25129]/30 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center">
                          {avatarSrc ? (
                            <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-xs font-semibold">
                              {initialsFromName(displayName)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {displayName}
                            </div>
                            {isUserPending(currentUser) && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                currentUser.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : currentUser.status === 'needs_clarification'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {currentUser.status === 'rejected' ? 'Rejected' :
                                 currentUser.status === 'needs_clarification' ? 'Needs Response' :
                                 'Pending'}
                              </span>
                            )}
                          </div>
                          {!!email && (
                            <div className="text-xs text-gray-500 truncate">{email}</div>
                          )}
                        </div>
                      </div>
                      {currentUser.role === 'admin' && (
                        <div className="mt-2 inline-block px-2 py-0.5 text-[10px] bg-[#F25129]/10 text-[#F25129] rounded-full">
                          Admin
                        </div>
                      )}
                    </div>
                    {currentUser.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm hover:bg-[#F25129]/10"
                        role="menuitem"
                      >
                        Admin Console
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm hover:bg-[#F25129]/10"
                      role="menuitem"
                    >
                      My Profile
                    </Link>
                    <button
                      onClick={async () => {
                        await handleLogout();
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F25129]/10"
                      role="menuitem"
                    >
                      <span className="inline-flex items-center gap-2">
                        <LogOut className="w-4 h-4" /> Logout
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 lg:gap-3">
                <Link
                  to="/login"
                  className="px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium text-white/90 hover:text-white transition-colors touch-target"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-3 lg:px-4 py-2 text-xs lg:text-sm font-medium bg-white text-[#F25129] rounded-lg hover:bg-gray-100 transition-all duration-200 border border-white/20 touch-target"
                >
                  Join MOJO
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button - improved touch target */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors ml-auto touch-target"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation - improved responsiveness */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/20 py-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="flex flex-col space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 touch-target ${
                    isActive(item.href)
                      ? 'bg-white/20 text-white'
                      : 'text-white/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
              
              {/* Social Media Icons - Mobile */}
              <div className="flex items-center gap-3 pt-3 border-t border-white/20 mt-2">
                <a
                  href="https://www.instagram.com/momsfitnessmojo/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 flex-1 touch-target"
                  aria-label="Follow us on Instagram"
                >
                  <Instagram className="w-5 h-5" />
                  <span>Instagram</span>
                </a>
                <a
                  href="https://www.facebook.com/momsfitnessmojo"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 flex-1 touch-target"
                  aria-label="Follow us on Facebook"
                >
                  <Facebook className="w-5 h-5" />
                  <span>Facebook</span>
                </a>
              </div>

              {currentUser ? (
                <div className="pt-4 border-t border-white/20 mt-4">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/30 bg-gradient-to-br from-white to-white/80 flex items-center justify-center">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs font-semibold">
                          {initialsFromName(displayName)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">
                        {displayName}
                      </div>
                      {currentUser.role === 'admin' && (
                        <div className="text-xs text-white/80">Admin</div>
                      )}
                    </div>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block w-full mt-2 px-3 py-3 text-left text-sm text-white/90 hover:bg-white/10 rounded-lg transition-colors touch-target"
                  >
                    My Profile
                  </Link>
                  {currentUser.role === 'admin' && (
                    <Link
                      to="/admin"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block w-full mt-1 px-3 py-3 text-left text-sm text-white/90 hover:bg-white/10 rounded-lg transition-colors touch-target"
                    >
                      Admin Console
                    </Link>
                  )}
                  <button
                    onClick={async () => {
                      await handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full mt-1 px-3 py-3 text-left text-sm text-white/90 hover:bg-white/10 rounded-lg transition-colors touch-target"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-white/20 mt-4 space-y-2">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-3 py-3 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors touch-target"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-3 py-3 text-sm font-medium bg-white text-[#F25129] rounded-lg hover:bg-gray-100 transition-all duration-200 touch-target"
                  >
                    Join MOJO
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
