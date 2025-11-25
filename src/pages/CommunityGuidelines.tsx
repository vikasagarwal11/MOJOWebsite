import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Heart, Shield, AlertTriangle, Mail, ShieldAlert, Megaphone } from 'lucide-react';

const CommunityGuidelines: React.FC = () => {

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
    url: 'https://momsfitnessmojo.web.app/community-guidelines',
    description: 'Community guidelines and safety rules for Moms Fitness Mojo members',
    mainEntity: {
      '@type': 'Organization',
      name: 'Moms Fitness Mojo',
      email: 'momsfitnessmojo@gmail.com'
    }
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://momsfitnessmojo.web.app/'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Community Guidelines',
        item: 'https://momsfitnessmojo.web.app/community-guidelines'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <Helmet>
        <title>Community Guidelines | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Our positive, privacy-first rules to keep Moms Fitness Mojo welcoming and safe."
        />
        <link rel="canonical" href="https://momsfitnessmojo.web.app/community-guidelines" />
        <meta property="og:title" content="Community Guidelines | Moms Fitness Mojo" />
        <meta property="og:description" content="Our positive, privacy-first rules to keep Moms Fitness Mojo welcoming and safe." />
        <meta property="og:url" content="https://momsfitnessmojo.web.app/community-guidelines" />
        <meta property="og:type" content="website" />
        <meta name="date" content="2025-09-01" />
        <meta property="article:modified_time" content="2025-09-01" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
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

        {/* Additional Info */}
        <div className="bg-gradient-to-r from-[#F25129] to-[#FFC107] rounded-2xl p-8 text-white">
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

    </div>
  );
};

export default CommunityGuidelines;
