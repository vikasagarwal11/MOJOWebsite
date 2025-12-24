import { Facebook, Instagram } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Footer: React.FC = () => {
  const { currentUser } = useAuth();
  
  return (
    <footer className="border-t border-[#F25129]/20 bg-[#EFD8C5]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Main Footer Content */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-6">
          {/* Logo + Brand */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity" aria-label="Moms Fitness Mojo Home">
            <img 
              src="/logo.png" 
              alt="Moms Fitness Mojo" 
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover ring-1 ring-[#F25129]/20"
              width="36"
              height="36"
              loading="lazy"
              decoding="async"
            />
            <span className="font-semibold text-sm sm:text-base text-[#F25129]">Moms Fitness Mojo</span>
          </Link>
          
          {/* Essential Navigation */}
          <nav className="flex flex-wrap gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm text-gray-600 justify-center">
            <Link to="/events" className="hover:text-[#F25129] transition-colors touch-target">Events</Link>
            <Link to="/sponsors" className="hover:text-[#F25129] transition-colors touch-target">Sponsors</Link>
            <Link to="/community-guidelines" className="hover:text-[#F25129] transition-colors touch-target">Guidelines</Link>
            <Link to="/contact" className="hover:text-[#F25129] transition-colors touch-target">Contact</Link>
            {!currentUser && (
              <Link to="/register" className="hover:text-[#F25129] transition-colors font-medium touch-target">Join MOJO</Link>
            )}
          </nav>
        </div>
        
        {/* Social Media Links */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4 sm:mb-6">
          <a
            href="https://www.instagram.com/momsfitnessmojo/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-600 hover:text-[#F25129] transition-colors touch-target"
            aria-label="Follow us on Instagram"
          >
            <Instagram className="w-5 h-5" />
            <span className="text-xs sm:text-sm">Instagram</span>
          </a>
          <a
            href="https://www.facebook.com/momsfitnessmojo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-600 hover:text-[#F25129] transition-colors touch-target"
            aria-label="Follow us on Facebook"
          >
            <Facebook className="w-5 h-5" />
            <span className="text-xs sm:text-sm">Facebook</span>
          </a>
        </div>
        
        {/* SEO Content & Copyright */}
        <div className="flex flex-col items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 text-center">
          <p>© {new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          <p className="max-w-2xl">
            <span className="block sm:inline">Moms Fitness, Lifestyle & Events</span>
            <span className="hidden sm:inline"> | </span>
            <span className="block sm:inline">Short Hills • Millburn • Maplewood • Summit • Livingston • New Jersey</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;