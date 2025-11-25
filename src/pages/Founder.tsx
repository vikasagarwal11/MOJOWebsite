import React, { useState } from 'react';
import {
  Heart,
  Calendar,
  Instagram,
  Facebook,
  Linkedin,
  MapPin,
  CheckCircle,
  MessageCircle,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import ContactFormModal from '../components/ContactFormModal';


const Founder: React.FC = () => {
  const [showContactModal, setShowContactModal] = useState(false);

  const founderData = {
    name: 'Aina Rai',
    title: 'Founder & CEO',
    subtitle: 'Moms Fitness Mojo',
    location: 'Short Hills, NJ',
    joinedLabel: 'January 2025',
    joinedISO: '2025-01-01',
    followers: '12.5K',
    following: '1.2K',
    posts: '856',
    // Images: using existing JPGs for now, can add WebP later
    coverJpg: '/images/founder-cover.jpg',
    profileJpg: '/images/founder-profile.jpg',
    ogImage: '/images/founder-profile.jpg', // Using existing image for OG
    pageUrl: 'https://momsfitnessmojo.web.app/founder',
    orgUrl: 'https://momsfitnessmojo.web.app/',
    email: 'momsfitnessmojo@gmail.com',
    socials: [
      { Icon: Instagram, url: 'https://www.instagram.com/momsfitnessmojo/', label: 'Follow on Instagram' },
      { Icon: Facebook,  url: 'https://www.facebook.com/momsfitnessmojo/',   label: 'Follow on Facebook'  },
      { Icon: Linkedin,  url: 'https://www.linkedin.com/company/momsfitnessmojo/', label: 'Follow on LinkedIn' },
    ],
  };

  // --- JSON-LD ---
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About the Founder — Aina Rai',
    url: founderData.pageUrl,
    primaryImageOfPage: founderData.profileJpg,
    mainEntity: {
      '@type': 'Person',
      name: founderData.name,
      jobTitle: founderData.title,
      image: founderData.profileJpg,
      worksFor: {
        '@type': 'Organization',
        name: 'Moms Fitness Mojo',
        url: founderData.orgUrl,
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Short Hills',
        addressRegion: 'NJ',
        addressCountry: 'US',
      },
      sameAs: founderData.socials.map(s => s.url),
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: founderData.orgUrl },
      { '@type': 'ListItem', position: 2, name: 'Founder', item: founderData.pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      {/* SEO */}
      <Helmet>
        <title>About the Founder — Aina Rai | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Aina Rai founded Moms Fitness Mojo to bring moms in Short Hills & Millburn, NJ together through fitness, friendship, and accountability."
        />
        <link rel="canonical" href={founderData.pageUrl} />

        {/* Open Graph */}
        <meta property="og:type" content="profile" />
        <meta property="og:title" content="About the Founder — Aina Rai | Moms Fitness Mojo" />
        <meta property="og:description" content="Empowering moms through fitness in Short Hills & Millburn, NJ." />
        <meta property="og:url" content={founderData.pageUrl} />
        <meta property="og:image" content={founderData.ogImage} />
        <meta property="profile:first_name" content="Aina" />
        <meta property="profile:last_name" content="Rai" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About the Founder — Aina Rai | Moms Fitness Mojo" />
        <meta name="twitter:description" content="Fit, Fierce & Fabulous — Together." />
        <meta name="twitter:image" content={founderData.ogImage} />

        {/* JSON-LD */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page H1 for accessibility */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">About the Founder — Aina Rai</h1>
        </div>
        
        {/* Profile Card */}
        <div className="relative">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header band */}
          <div className="relative p-8 pt-8 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
              {/* Profile image */}
              <div className="relative flex-shrink-0">
                <div className="w-48 h-48 lg:w-56 lg:h-56 rounded-2xl bg-white/20 backdrop-blur-sm border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-2xl">
                  <img
                    src={founderData.profileJpg}
                    alt="Aina Rai, Founder of Moms Fitness Mojo"
                    className="w-full h-full object-cover object-top rounded-2xl"
                    width={560}
                    height={560}
                    loading="lazy"
                  />
                </div>
                <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-green-500 rounded-full border-4 border-white flex items-center justify-center shadow-lg">
                  <CheckCircle className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
              </div>

              {/* Profile info */}
              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-3xl lg:text-4xl font-bold mb-2">{founderData.name}</h2>
                <p className="text-xl text-white/90 mb-1">{founderData.title}</p>
                <p className="text-lg text-white/80 mb-4">{founderData.subtitle}</p>

                {/* Location / joined */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-4 text-white/80">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    <address className="not-italic"> {founderData.location} </address>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                    <time dateTime={founderData.joinedISO}>Joined {founderData.joinedLabel}</time>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Button opens modal; anchor provides email fallback */}
                <a
                  href={`mailto:${founderData.email}`}
                  onClick={(e) => { e.preventDefault(); setShowContactModal(true); }}
                  className="px-6 py-3 bg-white text-[#F25129] rounded-full font-semibold hover:bg-white/90 transition-all duration-200 flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  Message
                </a>
                <a
                  href={founderData.socials[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-full font-semibold hover:bg-white/30 transition-all duration-200 flex items-center gap-2"
                >
                  <Instagram className="w-4 h-4" aria-hidden="true" />
                  Follow up
                </a>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-8">
            {/* Socials */}
            <div className="flex gap-4 mb-8">
              {founderData.socials.map(({ Icon, url, label }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-12 h-12 bg-gray-100 hover:bg-orange-100 rounded-full flex items-center justify-center transition-all duration-200 group"
                >
                  <Icon className="w-5 h-5 text-gray-600 group-hover:text-[#F25129]" aria-hidden="true" />
                </a>
              ))}
            </div>

            {/* Story */}
            <section aria-labelledby="story-heading" className="space-y-8">
              <h3 id="story-heading" className="text-3xl font-bold text-gray-900 mb-8 bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent">
                My Story
              </h3>
              
              <div className="prose prose-lg text-gray-700 max-w-none space-y-6">
                <p className="text-lg leading-relaxed">
                  I'm Aina Rai, the founder and heart behind Moms Fitness Mojo.
                </p>

                <h4 className="text-2xl font-bold text-gray-900 mt-8 mb-4">The Search for Connection</h4>
                <p className="text-lg leading-relaxed">
                  When I became a parent and moved to the suburbs, I expected to naturally connect with other moms. I joined groups, went to meetups, and tried to find my tribe: moms who understood the journey, the challenges, and the need for connection beyond motherhood.
                </p>
                <p className="text-lg leading-relaxed">
                  But almost every conversation circled back to kids — nap schedules, diaper changes, school logistics.
                </p>
                <p className="text-lg leading-relaxed">
                  I love my children deeply, but I quietly wondered:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 text-lg leading-relaxed text-gray-800 font-semibold">
                  <li>Where am I in all of this?</li>
                  <li>Where were the conversations about our goals, our dreams, and our identities beyond being moms?</li>
                </ul>

                <h4 className="text-2xl font-bold text-gray-900 mt-8 mb-4">My Fitness Journey</h4>
                <p className="text-lg leading-relaxed">
                  Meanwhile, I was on my own fitness journey. I had gained weight during pregnancy and worked out whenever I found a free moment — early mornings, lunch breaks, or sometimes even 10 p.m. if that's when the day slowed down. Balancing work, home, parenting, and self-care took effort, and while my family supported me, I still longed for a community of moms who understood what it takes to show up for yourself.
                </p>
                <p className="text-lg leading-relaxed">
                  That's when I realized something important:
                </p>
                <div className="bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6 my-6 border-l-4 border-[#F25129]">
                  <p className="text-xl text-gray-800 font-semibold">
                    Moms thrive when they have a circle that motivates and supports them.
                  </p>
                </div>

                <h4 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Creating the Space</h4>
                <p className="text-lg leading-relaxed">
                  So I created the space I was searching for:
                </p>
                <ul className="list-disc list-inside space-y-3 ml-4 text-lg leading-relaxed">
                  <li>A space where moms could talk about more than routines and responsibilities</li>
                  <li>A space where we could share our fitness wins, celebrate progress, laugh, move, reset, and feel like ourselves again</li>
                  <li>A space where fitness and connection naturally come together — from working out, walking, hiking, dancing, or taking a class, to enjoying occasional social gatherings that help us bond and build genuine friendships</li>
                </ul>
                <p className="text-lg leading-relaxed mt-6">
                  And that's how Moms Fitness Mojo was born.
                </p>

                <h4 className="text-2xl font-bold text-gray-900 mt-8 mb-4">The Community Today</h4>
                <p className="text-lg leading-relaxed">
                  What started as a small idea has grown into a powerful community of moms who uplift and energize one another every day. This isn't about perfect bodies or rigid routines — it's about:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 text-lg leading-relaxed">
                  <li>Encouragement</li>
                  <li>Accountability</li>
                  <li>Rediscovering yourself through connection and movement</li>
                </ul>

                <h4 className="text-2xl font-bold text-gray-900 mt-8 mb-4">About Me</h4>
                <p className="text-lg leading-relaxed">
                  Outside of MFM, I'm a mom to two energetic boys, a wife, and a Technical Program Manager by profession. Creating this community brought balance, joy, and confidence back into my own life — and now it's helping so many other moms do the same.
                </p>

                <div className="bg-gradient-to-r from-[#F25129] to-[#FFC107] rounded-2xl p-8 text-white mt-8 text-center">
                  <p className="text-xl font-semibold mb-2">
                    Moms Fitness Mojo has been transformative — for me, and for all of us who needed a space like this.
                  </p>
                  <p className="text-2xl font-bold mt-4">
                    Together, we are Fit, Fierce & Fabulous.
                  </p>
                </div>
              </div>




              {/* CTAs */}
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="/events"
                  className="px-6 py-3 rounded-full bg-[#F25129] text-white font-semibold hover:bg-[#E0451F] transition"
                >
                  See Events
                </a>
                <a
                  href="/register"
                  className="px-6 py-3 rounded-full border border-[#F25129] text-[#F25129] font-semibold hover:bg-orange-50 transition"
                >
                  Join the Community
                </a>
              </div>
            </section>
          </div>
        </div>
        </div>
      </div>

      {/* Contact Modal */}
      <ContactFormModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        recipient={founderData.name}
        recipientEmail={founderData.email}
        prefillSubject={`Message to ${founderData.name}`}
      />
    </div>
  );
};

export default Founder;