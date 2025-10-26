import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#F25129]/20 bg-[#EFD8C5]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Main Footer Content */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-6">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Moms Fitness Mojo" className="h-8 w-8 rounded-full object-cover" />
            <span className="font-semibold text-[#F25129]">Moms Fitness Mojo</span>
          </div>
          
          {/* Essential Navigation */}
          <nav className="flex flex-wrap gap-6 text-sm text-gray-600 justify-center">
            <Link to="/events" className="hover:text-[#F25129] transition-colors">Events</Link>
            <Link to="/sponsors" className="hover:text-[#F25129] transition-colors">Sponsors</Link>
            <Link to="/community-guidelines" className="hover:text-[#F25129] transition-colors">Guidelines</Link>
            <Link to="/contact" className="hover:text-[#F25129] transition-colors">Contact</Link>
            <Link to="/register" className="hover:text-[#F25129] transition-colors">Join MOJO</Link>
          </nav>
        </div>
        
        {/* SEO Content & Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          <p className="text-center sm:text-right">
            <span className="block sm:inline">Moms Fitness, Lifestyle & Events | </span>
            <span className="block sm:inline">Short Hills • Millburn • Maplewood • Summit • Livingston • New Jersey</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;