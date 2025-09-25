import React from 'react';
import { Helmet } from 'react-helmet-async';
import { ExternalLink, Calendar, FileText, Users, Heart } from 'lucide-react';

const Press: React.FC = () => {
  const pressData = {
    pageUrl: 'https://momfitnessmojo.web.app/press',
    orgUrl: 'https://momfitnessmojo.web.app/',
    email: 'momsfitnessmojo@gmail.com',
    pressKit: {
      founderBio: 'Aina Rai founded Moms Fitness Mojo in 2024 to create a supportive community where moms can prioritize their health while connecting with other women who understand the unique challenges of motherhood.',
      keyStats: {
        members: '180+',
        founded: '2024',
        location: 'Short Hills & Millburn, NJ',
        growth: '10 months'
      },
      mediaAssets: [
        'High-resolution founder photos',
        'Community event photos',
        'Logo files (SVG, PNG)',
        'Brand guidelines'
      ]
    }
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Press & Media - Moms Fitness Mojo',
    url: pressData.pageUrl,
    mainEntity: {
      '@type': 'Organization',
      name: 'Moms Fitness Mojo',
      url: pressData.orgUrl,
      founder: {
        '@type': 'Person',
        name: 'Aina Rai'
      },
      foundingDate: '2024',
      numberOfEmployees: '180+',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Short Hills',
        addressRegion: 'NJ',
        addressCountry: 'US'
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <Helmet>
        <title>Press & Media | Moms Fitness Mojo - Millburn & Short Hills NJ</title>
        <meta
          name="description"
          content="Press resources, media kit, and coverage for Moms Fitness Mojo - a supportive fitness community for moms in Short Hills & Millburn, NJ."
        />
        <link rel="canonical" href={pressData.pageUrl} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Press & Media
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Resources for journalists, bloggers, and media covering Moms Fitness Mojo
          </p>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div className="text-center p-6 bg-white rounded-2xl shadow-lg">
            <Users className="w-8 h-8 text-[#F25129] mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{pressData.pressKit.keyStats.members}</div>
            <div className="text-sm text-gray-600">Members</div>
          </div>
          <div className="text-center p-6 bg-white rounded-2xl shadow-lg">
            <Calendar className="w-8 h-8 text-[#F25129] mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{pressData.pressKit.keyStats.founded}</div>
            <div className="text-sm text-gray-600">Founded</div>
          </div>
          <div className="text-center p-6 bg-white rounded-2xl shadow-lg">
            <Heart className="w-8 h-8 text-[#F25129] mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{pressData.pressKit.keyStats.growth}</div>
            <div className="text-sm text-gray-600">Growth</div>
          </div>
          <div className="text-center p-6 bg-white rounded-2xl shadow-lg">
            <FileText className="w-8 h-8 text-[#F25129] mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">Local</div>
            <div className="text-sm text-gray-600">Focus</div>
          </div>
        </div>

        {/* Press Kit */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Press Kit</h2>
            <p className="text-gray-700 mb-6">{pressData.pressKit.founderBio}</p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Available Assets</h3>
            <ul className="space-y-2 text-gray-700">
              {pressData.pressKit.mediaAssets.map((asset, index) => (
                <li key={index} className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#F25129] rounded-full"></div>
                  {asset}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">Media Inquiries</h3>
                <a 
                  href={`mailto:${pressData.email}?subject=Media Inquiry`}
                  className="text-[#F25129] hover:underline"
                >
                  {pressData.email}
                </a>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Location</h3>
                <p className="text-gray-700">{pressData.pressKit.keyStats.location}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Response Time</h3>
                <p className="text-gray-700">Within 24 hours</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Coverage */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Coverage</h2>
          <div className="text-center py-8">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Coverage will be featured here as it becomes available</p>
            <p className="text-sm text-gray-400 mt-2">
              Check back after our upcoming feature in Millburn & Short Hills Magazine
            </p>
          </div>
        </div>

        {/* Quick Facts */}
        <div className="mt-12 bg-gradient-to-r from-[#F25129] to-[#FF6B35] rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-6">Quick Facts</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Community Focus</h3>
              <p className="text-white/90">
                Beyond fitness - we help moms reclaim their identity and build lasting friendships
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Accessibility</h3>
              <p className="text-white/90">
                Beginner-friendly with postpartum/injury modifications; women-only options available
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Local Impact</h3>
              <p className="text-white/90">
                Regular meetups at Taylor Park, South Mountain Reservation, and local partner gyms
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Growth Story</h3>
              <p className="text-white/90">
                180+ members in 10 months through word-of-mouth and local partnerships
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Press;
