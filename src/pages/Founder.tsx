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
  ChevronRight,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import ContactFormModal from '../components/ContactFormModal';

const Breadcrumbs: React.FC = () => (
  <nav aria-label="Breadcrumb" className="px-4 sm:px-6 lg:px-16 mt-4">
    <ol className="flex items-center gap-2 text-sm text-gray-600">
      <li>
        <a href="/" className="hover:text-[#F25129]">Home</a>
      </li>
      <li aria-hidden="true" className="text-gray-400">
        <ChevronRight className="w-4 h-4" />
      </li>
      <li className="text-gray-900 font-medium">Founder</li>
    </ol>
  </nav>
);

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
    pageUrl: 'https://momfitnessmojo.web.app/founder',
    orgUrl: 'https://momfitnessmojo.web.app/',
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
    name: 'Meet Our Founder — Aina Rai',
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
        <title>Meet Our Founder — Aina Rai | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Aina Rai founded Moms Fitness Mojo to bring moms in Short Hills & Millburn, NJ together through fitness, friendship, and accountability."
        />
        <link rel="canonical" href={founderData.pageUrl} />

        {/* Open Graph */}
        <meta property="og:type" content="profile" />
        <meta property="og:title" content="Aina Rai — Founder of Moms Fitness Mojo" />
        <meta property="og:description" content="Empowering moms through fitness in Short Hills & Millburn, NJ." />
        <meta property="og:url" content={founderData.pageUrl} />
        <meta property="og:image" content={founderData.ogImage} />
        <meta property="profile:first_name" content="Aina" />
        <meta property="profile:last_name" content="Rai" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Aina Rai — Founder, Moms Fitness Mojo" />
        <meta name="twitter:description" content="Fit, Fierce & Fabulous — Together." />
        <meta name="twitter:image" content={founderData.ogImage} />

        {/* JSON-LD */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Hero */}
      <div className="relative overflow-hidden mt-2">
        {/* Make hero height responsive and not too tall on small screens */}
        <div className="relative h-[250px] sm:h-[300px] lg:h-[350px] overflow-hidden bg-[#F25129]">
          <picture>
            <source media="(min-width:1024px)" srcSet="/images/founder-hero-2400x960.svg" type="image/svg+xml" />
            <source media="(max-width:1023px)" srcSet="/images/founder-hero-1200x600.svg" type="image/svg+xml" />
            <img
              src="/images/founder-hero-2400x960.svg"
              alt="Aina Rai with the Moms Fitness Mojo community"
              className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
              width={2400}
              height={960}
              fetchPriority="high"
            />
          </picture>

          {/* Subtle overlays for text readability */}
          <div className="absolute inset-0 bg-black/20" aria-hidden="true"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden="true"></div>

          {/* Keep just one gentle decorative glow */}
          <div
            className="absolute top-16 right-16 w-28 h-28 bg-[#FF6B35]/25 rounded-full blur-xl"
            aria-hidden="true"
          />
          
          {/* Hero copy (single visible H1 on page) */}
          <div className="absolute bottom-8 left-8 lg:left-16 right-8 lg:right-16">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl lg:text-6xl font-bold text-white mb-3 drop-shadow-2xl">
                Meet Our Founder
              </h1>
              <p className="text-xl lg:text-2xl text-white/90 mb-1 drop-shadow-lg">
                Empowering Moms Through Fitness
              </p>
              <p className="text-lg lg:text-xl text-white/80 drop-shadow-lg">
                Discover the story behind our community
              </p>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="relative -mt-8 mx-4 sm:mx-8 lg:mx-16">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Header band */}
            <div className="relative p-8 pt-8 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white">
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
                  
                  {/* Stats */}
                  <div className="flex flex-wrap justify-center lg:justify-start gap-6 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{founderData.followers}</div>
                      <div className="text-sm text-white/80">Followers</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{founderData.following}</div>
                      <div className="text-sm text-white/80">Following</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{founderData.posts}</div>
                      <div className="text-sm text-white/80">Posts</div>
                    </div>
                  </div>

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
                    href="/register"
                    className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-full font-semibold hover:bg-white/30 transition-all duration-200 flex items-center gap-2"
                  >
                    <Heart className="w-4 h-4" aria-hidden="true" />
                    Follow / Join
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
                <h3 id="story-heading" className="text-2xl font-bold text-gray-900 mb-6">
                  My Story
                </h3>
                <div className="prose prose-lg text-gray-700 max-w-none">
                  <p className="mb-6 text-lg leading-relaxed">
                    I'm Aina Rai, the heart behind Moms Fitness Mojo.
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    When I became a parent and moved to the suburbs, I thought it would be easy to connect with other moms. Like most new parents, I joined groups, went to meetups, and tried to find my tribe. But every single conversation circled back to kids—nap times, diaper changes, feeding schedules. I adore my children, but I found myself asking: Where am I in all of this? Where are the conversations about who I am as a person, not just as a mom?
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    At the same time, I was on my own fitness journey. During pregnancy, I gained weight, and I worked tirelessly—sometimes sneaking in workouts at 10 p.m.—to reclaim my health. But I had no one to share those wins with. Sure, family would notice, but they couldn't fully understand the effort it took to juggle a full-time job, family, home, and still carve out time for myself.
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    So I created the space I was looking for: a place where moms could come together to talk about goals beyond nap times, share fitness wins, celebrate progress, and connect as women—not just as mothers. Laugh, sweat, brunch, dance, and just be themselves.
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    That's how Moms Fitness Mojo was born. What started as a small idea has grown into a <a href="/events" className="text-[#F25129] hover:underline font-medium">circle of moms who truly inspire one another</a>. This group is more than workouts—it's about friendship, accountability, and rediscovering yourself.
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    Outside of MFM, I'm a mom of two energetic little boys, a wife, and a Technical Program Manager by profession. Through this community, I found a way to bring all of that back into my life while giving other moms the same opportunity. 
                  </p>
                  <p className="mb-6 text-lg leading-relaxed">
                    Moms Fitness Mojo has been life-changing—for me and for so many of us. Together, we are <strong className="text-[#F25129]">Fit, Fierce & Fabulous.</strong>
                  </p>
                </div>

                {/* Meetup Spots */}
                <div className="bg-orange-50 rounded-xl p-6 my-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Where We Meet</h3>
                  <p className="text-gray-700">
                    <strong>Taylor Park • South Mountain Reservation • Reeves-Reed Arboretum • local partner gyms</strong>
                  </p>
                </div>
                
                {/* Accessibility */}
                <div className="bg-blue-50 rounded-xl p-6 my-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Inclusive & Accessible</h3>
                  <p className="text-gray-700">
                    <strong>Beginner-friendly with postpartum/injury modifications; women-only options available; culturally respectful environment.</strong>
                  </p>
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