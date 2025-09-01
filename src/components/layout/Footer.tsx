import React from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Mail, MapPin, Phone } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <img src="/logo.svg" alt="Moms Fitness Mojo" className="h-10 w-auto" />
            </div>
            <p className="text-gray-400 mb-6 max-w-md">
              Empowering mothers to prioritize their health and wellness through fitness, community, and support. 
              Join our vibrant community of strong, dedicated moms!
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-400">
                <Mail className="w-4 h-4" />
                <span>hello@momsfitnessmojo.com</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-400">
                <Phone className="w-4 h-4" />
                <span>(555) 123-4567</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-400">
                <MapPin className="w-4 h-4" />
                <span>Community Center, Your City</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <div className="space-y-2">
              {[
                { name: 'Home', href: '/' },
                { name: 'Events', href: '/events' },
                { name: 'Media', href: '/media' },
                { name: 'Posts', href: '/posts' },
              ].map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className="block text-gray-400 hover:text-purple-400 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Community</h3>
            <div className="space-y-2">
              <Link
                to="/sponsors"
                className="block text-gray-400 hover:text-purple-400 transition-colors"
              >
                Sponsors
              </Link>
              <Link
                to="/contact"
                className="block text-gray-400 hover:text-purple-400 transition-colors"
              >
                Contact Us
              </Link>
              <Link
                to="/about"
                className="block text-gray-400 hover:text-purple-400 transition-colors"
              >
                About Us
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2025 Mom's Fitness Mojo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;