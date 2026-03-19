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

type NavItem = {
  name: string;
  href: string;
  matchPrefix?: boolean;
  children?: NavItem[];
};

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
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
    setMobileResourcesOpen(false);
  }, [location.pathname]);

  const navigation: NavItem[] = [
    { name: 'Home', href: '/' },
    { name: 'Events', href: '/events' },
    // { name: 'Events - 2', href: '/events-v2' }, // Removed - no longer needed
    // { name: 'Events (Read-Only)', href: '/events-readonly' }, // Hidden for now
    { name: 'Media', href: '/media' },
    // { name: 'Workouts', href: '/workouts' }, // Hidden for now
    // { name: 'Challenges', href: '/challenges' }, // Hidden for now
    { name: 'Posts', href: '/posts' },
    {
      name: 'Resources',
      href: '/resources',
      matchPrefix: true,
      children: [
        { name: 'Recipes', href: '/resources/recipes' },
        {
          name: 'Recommendations',
          href: '/resources/recommendations',
          children: [
            { name: 'Gyms & Fitness Centers', href: '/resources/recommendations/gyms-fitness-centers' },
            { name: 'Healthy Eating Places', href: '/resources/recommendations/healthy-eating-places' },
            { name: 'Trainers & Coaches', href: '/resources/recommendations/trainers-coaches' },
            { name: 'Wellness Services', href: '/resources/recommendations/wellness-services' },
            { name: 'Kids Activities & Family Spots', href: '/resources/recommendations/kids-activities-family-friendly-spots' },
          ],
        },
        { name: 'Classes & Schedules', href: '/resources/classes-schedules' },
      ],
    },
    { name: 'MFM Stories', href: '/mfmstories' },
    // { name: 'Support Tools', href: '/support-tools' }, // Hidden from menu bar header
    { name: 'About Us', href: '/about' },
    { name: 'Founder', href: '/founder' },
    // { name: 'Press', href: '/press' }, // Hidden for now
  ];

  const isActive = (path: string, matchPrefix = false) =>
    matchPrefix ? location.pathname.startsWith(path) : location.pathname === path;

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
            <img 
              src="/logo.png" 
              alt="Moms Fitness Mojo" 
              className="h-8 w-8 rounded-full object-cover" 
              loading="eager"
              decoding="async"
              fetchpriority="high"
            />
          </Link>

          {/* Center nav (desktop only; mobile uses hamburger menu) */}
          <nav className="hidden md:flex flex-1 justify-center min-w-0" aria-label="Primary">
            <div className="flex items-center gap-1 lg:gap-2">
              {navigation.map((item) =>
                item.children ? (
                  <div key={item.name} className="relative group">
                    <Link
                      to={item.href}
                      className={`px-2 lg:px-3 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all duration-200 inline-flex items-center gap-1 ${
                        isActive(item.href, item.matchPrefix)
                          ? 'bg-white/20 text-white'
                          : 'text-white/90 hover:text-white hover:bg-white/10'
                      }`}
                      aria-haspopup="menu"
                    >
                      {item.name}
                    </Link>
                    <div className="absolute left-0 mt-2 w-56 rounded-xl border border-white/10 bg-white shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition">
                      <div className="py-2">
                        {item.children.map(child =>
                          child.children ? (
                            <div key={child.name} className="relative group/sub">
                              <Link
                                to={child.href}
                                className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-[#F25129]/10 flex items-center justify-between"
                              >
                                {child.name}
                                <span className="text-gray-400">›</span>
                              </Link>
                              <div className="absolute left-full top-0 ml-2 w-64 rounded-xl border border-gray-200 bg-white shadow-xl opacity-0 pointer-events-none group-hover/sub:opacity-100 group-hover/sub:pointer-events-auto transition">
                                <div className="py-2">
                                  {child.children.map(grand => (
                                    <Link
                                      key={grand.name}
                                      to={grand.href}
                                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#F25129]/10"
                                    >
                                      {grand.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Link
                              key={child.name}
                              to={child.href}
                              className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#F25129]/10"
                            >
                              {child.name}
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`px-2 lg:px-3 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all duration-200 ${
                      isActive(item.href, item.matchPrefix)
                        ? 'bg-white/20 text-white'
                        : 'text-white/90 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.name}
                  </Link>
                )
              )}
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
            onClick={() =>
              setIsMobileMenuOpen((open) => {
                const next = !open;
                if (!next) setMobileResourcesOpen(false);
                return next;
              })
            }
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
              {navigation.map((item) =>
                item.children ? (
                  <div key={item.name} className="flex flex-col">
                    <button
                      onClick={() => setMobileResourcesOpen((prev) => !prev)}
                      className={`px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 touch-target flex items-center justify-between ${
                        isActive(item.href, item.matchPrefix)
                          ? 'bg-white/20 text-white'
                          : 'text-white/90 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>{item.name}</span>
                      <span className="text-white/80">{mobileResourcesOpen ? '-' : '+'}</span>
                    </button>
                    {mobileResourcesOpen && (
                      <div className="ml-2 pl-3 border-l border-white/20 space-y-1">
                        {item.children.map((child) =>
                          child.children ? (
                            <div key={child.name} className="flex flex-col">
                              <Link
                                to={child.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="px-3 py-2 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 transition"
                              >
                                {child.name}
                              </Link>
                              <div className="ml-2 pl-3 border-l border-white/10 space-y-1">
                                {child.children.map((grand) => (
                                  <Link
                                    key={grand.name}
                                    to={grand.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="px-3 py-2 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 transition"
                                  >
                                    {grand.name}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <Link
                              key={child.name}
                              to={child.href}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="px-3 py-2 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 transition"
                            >
                              {child.name}
                            </Link>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 touch-target ${
                      isActive(item.href, item.matchPrefix)
                        ? 'bg-white/20 text-white'
                        : 'text-white/90 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {item.name}
                  </Link>
                )
              )}
              
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
