import React, { useState, useEffect } from 'react';
import { ExternalLink, Gift, Calendar, Star } from 'lucide-react';
import { format } from 'date-fns';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { Sponsor } from '../types';

const Sponsors: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();

  // Get sponsors from Firestore in real-time
  const { data: sponsors, loading } = useRealtimeCollection('sponsors', [orderBy('createdAt', 'desc')]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Our Amazing Sponsors
        </h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          We're grateful for our partners who support our community with exclusive deals and promotions.
          {!currentUser && (
            <span className="block mt-2 text-purple-600 font-medium">
              Join our community to access exclusive member promotions!
            </span>
          )}
        </p>
      </div>

      {/* Sponsors Grid */}
      <div className="space-y-12">
        {sponsors.map((sponsor) => (
          <div
            key={sponsor.id}
            className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-purple-100 overflow-hidden"
          >
            {/* Sponsor Header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
                <img
                  src={sponsor.logo}
                  alt={sponsor.name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">{sponsor.name}</h2>
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                      ))}
                    </div>
                  </div>
                  <p className="text-gray-600 mb-3">{sponsor.description}</p>
                  {sponsor.website && (
                    <a
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-purple-600 hover:text-purple-700 font-medium transition-colors"
                    >
                      Visit Website
                      <ExternalLink className="w-4 h-4 ml-1" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Promotions */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Current Promotions
                {!currentUser && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (Login to access)
                  </span>
                )}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sponsor.promotions.map((promotion) => (
                  <div
                    key={promotion.id}
                    className={`rounded-xl border-2 p-4 transition-all duration-300 ${
                      currentUser
                        ? 'border-purple-200 bg-purple-50 hover:border-purple-300 hover:bg-purple-100'
                        : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                  >
                    {promotion.imageUrl && (
                      <img
                        src={promotion.imageUrl}
                        alt={promotion.title}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                      />
                    )}
                    
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{promotion.title}</h4>
                      <div className="flex items-center text-purple-600">
                        <Gift className="w-4 h-4 mr-1" />
                        <span className="text-sm font-bold">
                          {promotion.discountPercentage}% OFF
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 text-sm mb-3">{promotion.description}</p>
                    
                    <div className="flex items-center justify-between">
                      {currentUser ? (
                        <div className="space-y-1">
                          {promotion.discountCode && (
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">Code:</span>
                              <code className="px-2 py-1 bg-purple-100 text-purple-700 rounded font-mono text-sm font-bold">
                                {promotion.discountCode}
                              </code>
                            </div>
                          )}
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="w-3 h-3 mr-1" />
                            Valid until {format(promotion.validUntil, 'MMM d, yyyy')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center w-full">
                          <p className="text-sm text-gray-500 mb-2">Login to view discount code</p>
                          <button className="text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors">
                            Join Community
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="mt-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Want to Become a Sponsor?
        </h2>
        <p className="text-purple-100 mb-6 max-w-2xl mx-auto">
          Partner with Mom's Fitness Mojo to reach an engaged community of health-conscious mothers. 
          Let's create meaningful partnerships that benefit our members.
        </p>
        <a
          href="mailto:partnerships@momsfitnessmojo.com"
          className="inline-flex items-center px-8 py-3 bg-white text-purple-600 font-semibold rounded-full hover:bg-gray-100 transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          Contact Us
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>
    </div>
  );
};

export default Sponsors;