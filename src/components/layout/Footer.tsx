import React from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Mail, MapPin, Phone } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-r from-[#1a0f1a] to-[#2d1b2d] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="md:col-span-2">
            <div className="flex items-center mb-4">
              <img src="/logo.png" alt="Moms Fitness Mojo" className="h-12 w-12 rounded-full object-cover mr-3" />
            </div>
            <p className="text-gray-300 leading-relaxed mb-6">
              Empowering mothers to prioritize their health and wellness through fitness, community, and support. Join our vibrant community of strong, dedicated moms!
            </p>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center">
                <Mail className="w-4 h-4 mr-2" />
                momsfitnessmojo@gmail.com
              </div>
              <div className="flex items-center">
                <Phone className="w-4 h-4 mr-2" />
                (555) 123-4567
              </div>
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Short Hills, NJ
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-[#FF6B35]">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link to="/" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Home</Link></li>
              <li><Link to="/events" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Events</Link></li>
              <li><Link to="/media" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Media</Link></li>
              <li><Link to="/posts" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Posts</Link></li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-[#FF6B35]">Community</h4>
            <ul className="space-y-2">
              <li><Link to="/sponsors" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Sponsors</Link></li>
              <li><Link to="/contact" className="text-gray-300 hover:text-[#FF6B35] transition-colors">Contact Us</Link></li>
              <li><Link to="/about" className="text-gray-300 hover:text-[#FF6B35] transition-colors">About Us</Link></li>
            </ul>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="border-t border-gray-700 mt-12 pt-8 text-center">
          <p className="text-gray-400">© 2025 Mom's Fitness Mojo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;