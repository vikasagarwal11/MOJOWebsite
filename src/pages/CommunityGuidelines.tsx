import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Heart, Shield, Eye, AlertTriangle, Mail, ShieldAlert, Megaphone, X } from 'lucide-react';

const CommunityGuidelines: React.FC = () => {
  const [showContactModal, setShowContactModal] = useState(false);

  const guidelines = [
    {
      icon: Heart,
      title: 'Positivity first',
      description: 'We cheer, don\'t judge. Every mom is on her own journey.',
      details: 'Celebrate wins, offer encouragement, and remember that everyone has different starting points.'
    },
    {
      icon: Shield,
      title: 'Privacy',
      description: 'No screenshots or sharing chat content outside our community.',
      details: 'What\'s shared in our space stays in our space. Respect each other\'s privacy and personal stories.'
    },
    {
      icon: Eye,
      title: 'Consent',
      description: 'No kids\' faces without parent permission.',
      details: 'Always ask before posting photos of children, even in the background of workout photos.'
    },
    {
      icon: ShieldAlert,
      title: 'Respect & zero tolerance',
      description: 'Be kind. No harassment, bullying, discrimination, or hate speech.',
      details: 'We remove harmful content and may remove members who violate this. Zero tolerance policy enforced.'
    },
    {
      icon: Megaphone,
      title: 'No promotions or spam',
      description: 'Keep the space useful. No unsolicited ads, MLMs, or repetitive self-promotion.',
      details: 'Use the designated promo thread (if/when available). Keep the community focused on support and fitness.'
    },
    {
      icon: AlertTriangle,
      title: 'Safety',
      description: 'Modify for your body; this isn\'t medical advice.',
      details: 'Listen to your body, consult healthcare providers for medical concerns, and modify exercises as needed.'
    },
    {
      icon: Mail,
      title: 'Report',
      description: 'DM a moderator or use our contact form.',
      details: 'If something doesn\'t feel right, speak up. We\'re here to maintain a safe, supportive environment.'
    }
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Community Guidelines - Moms Fitness Mojo',
    url: 'https://momfitnessmojo.web.app/community-guidelines',
    description: 'Community guidelines and safety rules for Moms Fitness Mojo members',
    mainEntity: {
      '@type': 'Organization',
      name: 'Moms Fitness Mojo',
      email: 'momsfitnessmojo@gmail.com'
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <Helmet>
        <title>Community Guidelines | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Our positive, privacy-first rules to keep Moms Fitness Mojo welcoming and safe."
        />
        <link rel="canonical" href="https://momfitnessmojo.web.app/community-guidelines" />
        <meta property="og:title" content="Community Guidelines | Moms Fitness Mojo" />
        <meta property="og:description" content="Our positive, privacy-first rules to keep Moms Fitness Mojo welcoming and safe." />
        <meta property="og:url" content="https://momfitnessmojo.web.app/community-guidelines" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Community Guidelines
          </h1>
          <p className="text-sm text-gray-500 mt-2">Last updated: September 2025</p>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mt-4">
            Our shared values that keep Moms Fitness Mojo a safe, supportive space for every member
          </p>
        </div>

        {/* Guidelines */}
        <div className="space-y-8 mb-12">
          {guidelines.map((guideline, index) => (
            <div key={index} className="bg-white rounded-2xl p-8 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-[#F25129] rounded-xl flex items-center justify-center">
                    <guideline.icon className="w-6 h-6 text-white" aria-hidden="true" />
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {guideline.title}
                  </h2>
                  <p className="text-lg text-gray-700 mb-3">
                    {guideline.description}
                  </p>
                  <p className="text-gray-600">
                    {guideline.details}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Emergency Disclaimer */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">Emergency Notice</h3>
              <p className="text-red-800">
                <strong>If you're in immediate danger or a medical emergency, call 911.</strong> 
                These guidelines are for community management, not emergency response.
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-gradient-to-r from-[#F25129] to-[#FF6B35] rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Questions or Concerns?</h2>
          <p className="text-white/90 mb-6">
            Our community moderators are here to help. Use our contact form below if you have questions about these guidelines or need support.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#F25129] rounded-xl font-semibold hover:bg-gray-100 transition-colors"
            >
              <Mail className="w-5 h-5" aria-hidden="true" />
              Contact Us
            </a>
            <button
              onClick={() => setShowContactModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-white text-white rounded-xl font-semibold hover:bg-white hover:text-[#F25129] transition-colors"
            >
              <Mail className="w-5 h-5" aria-hidden="true" />
              Report a Concern
            </button>
            <a
              href="/events"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-white text-white rounded-xl font-semibold hover:bg-white hover:text-[#F25129] transition-colors"
            >
              Join Our Community
            </a>
          </div>
          
          {/* Email as clickable link */}
          <div className="mt-6 pt-6 border-t border-white/20">
            <p className="text-white/90 mb-2">Direct email:</p>
            <a 
              href="mailto:momsfitnessmojo@gmail.com" 
              className="text-white hover:underline font-medium"
            >
              momsfitnessmojo@gmail.com
            </a>
          </div>
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Report a Concern</h3>
              <button
                onClick={() => setShowContactModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              We take all reports seriously. Please use our contact form to report any concerns about community guidelines violations.
            </p>
            <div className="flex gap-3">
              <a
                href="/contact"
                className="flex-1 px-4 py-2 bg-[#F25129] text-white rounded-lg font-semibold text-center hover:bg-[#E0451F] transition-colors"
              >
                Go to Contact Form
              </a>
              <button
                onClick={() => setShowContactModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityGuidelines;
