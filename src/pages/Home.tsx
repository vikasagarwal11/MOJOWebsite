import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Calendar,
  Users,
  Camera,
  Heart,
  UploadCloud,
  Image as ImageIcon,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import HeroCarousel from '../components/hero/HeroCarousel';
import TestimonialCarousel from '../components/home/TestimonialCarousel';
import { useTestimonials } from '../hooks/useTestimonials';
// import { ResponsiveLogo } from '../components/common/ResponsiveLogo';

const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const isAuthed = !!currentUser;

  const features = [
    {
      icon: <Calendar className="w-8 h-8" />,
      title: 'Fun Fitness That Fits Your Life',
      description:
        'From hikes, tennis, and dance sessions to weekly fitness challenges, we make working out fun and motivating.',
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Social Vibes, Not Just Sweat',
      description:
        'Brunches, dinners, cocktail nights, and glamorous galas where moms connect, laugh, and celebrate together.',
    },
    {
      icon: <Camera className="w-8 h-8" />,
      title: 'Accountability & Inspiration',
      description:
        'A circle of moms who keep each other on track, share progress, and cheer every milestone—big or small.',
    },
    {
      icon: <Heart className="w-8 h-8" />,
      title: 'Not in your area',
      description:
        'Currently in Short Hills, Millburn, Livingston, Summit, Maplewood & Springfield — and expanding. Reach out and let’s bring Moms Fitness Mojo to you!',
    },
  ];

  const {
    testimonials: publishedTestimonials,
    loading: loadingTestimonials,
    error: testimonialsError,
  } = useTestimonials({
    statuses: ['published'],
    orderByField: 'createdAt',
    orderDirection: 'desc',
    prioritizeFeatured: true,
    limit: 12,
  });

  return (
    <div>
      <Helmet>
        <title>Moms Fitness Mojo | Millburn & Short Hills NJ Mom Fitness Events</title>
        <meta name="description" content="Moms Fitness Mojo - Fitness, Friendship & Lifestyle for Moms in NJ. Join our supportive community in Short Hills, Millburn, Maplewood, Summit & nearby NJ towns for workouts, events, and wellness." />
        <link rel="canonical" href="https://momsfitnessmojo.web.app/" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Moms Fitness Mojo - Millburn & Short Hills NJ Mom Fitness" />
        <meta property="og:description" content="Moms Fitness Mojo - Fitness, Friendship & Lifestyle for Moms in NJ. Join our supportive community for workouts, events, and wellness." />
        <meta property="og:url" content="https://momsfitnessmojo.web.app/" />
        <meta property="og:image" content="https://momsfitnessmojo.web.app/assets/logo/facebook-post.svg" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Moms Fitness Mojo - Millburn & Short Hills NJ" />
        <meta name="twitter:description" content="Moms Fitness Mojo - Fitness, Friendship & Lifestyle for Moms in NJ. Join our supportive community for workouts, events, and wellness." />
        <meta name="twitter:image" content="https://momsfitnessmojo.web.app/assets/logo/square-logo.svg" />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CommunityOrganization",
            "name": "Moms Fitness Mojo",
            "url": "https://momsfitnessmojo.web.app/",
            "logo": "https://momsfitnessmojo.web.app/assets/logo/mfm-logo-outline.svg",
            "sameAs": [
              "https://www.instagram.com/momsfitnessmojo/",
              "https://www.facebook.com/momsfitnessmojo/"
            ],
            "foundingDate": "2025",
            "areaServed": [
              "Short Hills, NJ", "Millburn, NJ", "Maplewood, NJ",
              "Summit, NJ", "Livingston, NJ", "South Orange, NJ"
            ],
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Short Hills",
              "addressRegion": "NJ",
              "addressCountry": "US"
            }
          })}
        </script>
      </Helmet>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {/* Coral → Peach soft gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#F25129]/10 via-[#FFF3EE] to-white" />
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#EFD8C5] blur-3xl opacity-60" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#FFE08A] blur-3xl opacity-50" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* MOJO Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107] pb-3">
              Moms Fitness Mojo
            </h1>
            <h3 className="text-base sm:text-lg lg:text-xl font-bold leading-tight tracking-tight text-[#FFC107]">
              Fit, Fierce, and Fabulous: Together
            </h3>
          </div>
          
          <div className="grid items-center gap-5 lg:grid-cols-2">
            
            {/* Left Content */}
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107]">Where</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107]">Fitness</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107]">meets Friendship</span>
              </h2>
              <p className="mt-6 text-lg sm:text-xl text-gray-700 max-w-2xl readable">
                More than a fitness group — we're a lifestyle and a circle of strength for moms balancing health, family, careers, and fun.
              </p>
              {!isAuthed && (
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/register"
                    className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold bg-[#F25129] text-white shadow hover:shadow-md transition-all duration-300"
                  >
                    Join MOJO
                  </Link>
                  <Link
                    to="/about"
                    className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-gray-50 transition-all duration-300"
                  >
                    Learn More
                  </Link>
                </div>
              )}

            </div>

            {/* Right Content - Dynamic Hero Image Carousel */}
            <div className="relative max-w-lg ml-auto min-h-[200px]">  {/* smaller carousel */}
              <HeroCarousel 
                imagesDirectory="/assets/hero-images"
                duration={4}
              />
            </div>
          </div>
        </div>
      </section>

      {/* About / Story */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <div className="lg:col-span-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F25129]">
              Your Lifestyle, Your Circle, Your Mojo
            </h2>
            <p className="mt-3 text-gray-700 text-lg leading-relaxed">
              Moms Fitness Mojo brings together health, wellness, and social life in one powerful community.
              From energizing workouts, hikes, tennis, and dance to social events like brunches, dinners,
              cocktail nights, and festival celebrations — every moment is filled with motivation, laughter,
              and lasting friendships.
            </p>
          </div>
          <div className="rounded-2xl border border-[#F25129]/15 bg-white/60 backdrop-blur p-5">
            <h3 className="font-semibold text-gray-900">Quick Facts</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>✓ Weekly fitness challenges & accountability</li>
              <li>✓ Chic social events & celebrations</li>
              <li>✓ Supportive, welcoming moms-only circle</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 -mt-4">
        <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            What We Do
          </h2>
          <p className="text-xl text-gray-600 readable">
            Fitness & wellness fused with a vibrant social calendar.
          </p>
        </div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="group p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-[#F25129]/20 hover:bg-white/80 hover:shadow-xl transition-transform hover:-translate-y-2 hover:rotate-[0.25deg]"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-[#F25129] to-[#FFC107] rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

             {/* Stats Section */}
       <section className="text-white py-8 sm:py-12 -mt-6">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 bg-gradient-to-r from-[#F25129] to-[#FFC107] rounded-2xl">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
             <div>
               <div className="text-4xl md:text-5xl font-bold mb-2">150+</div>
               <div className="text-[#FFE4D6]">Active Members</div>
             </div>
             <div>
               <div className="text-4xl md:text-5xl font-bold mb-2">2+</div>
               <div className="text-[#FFE4D6]">Monthly Events</div>
             </div>
             <div>
               <div className="text-4xl md:text-5xl font-bold mb-2">2025</div>
               <div className="text-[#FFE4D6]">Year Started</div>
             </div>
           </div>
         </div>
       </section>

      {/* Stronger Together / Community */}
      {!isAuthed && (
        <section className="py-8 sm:py-12 -mt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 p-4 sm:p-6 shadow-sm">
              <h2 className="text-3xl font-bold tracking-tight text-[#F25129]">Stronger Together</h2>
              <p className="mt-2 text-gray-700 readable">
                We&apos;re currently active across <strong>Short Hills</strong>, <strong>Millburn</strong>, <strong>Livingston</strong>, <strong>Summit</strong>, <strong>Maplewood</strong>, and <strong>Springfield</strong> and expanding soon! Not in your area? Reach out to start Moms Fitness Mojo near you.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {["Short Hills", "Millburn", "Livingston", "Summit", "Maplewood", "Springfield"].map((city) => (
                  <span key={city} className="rounded-full border border-gray-200 px-4 py-2 text-sm bg-white hover:border-[#F25129] hover:text-[#F25129] transition-colors">
                    {city}
                  </span>
                ))}
              </div>
              <Link
                to="/register"
                className="mt-4 inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition-all duration-300"
              >
                Start a Chapter
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 -mt-4 space-y-10">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-4 mb-3 flex-wrap">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              What Moms Are Saying
            </h2>
            <Link
              to="/share-your-story"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg transform hover:scale-105"
            >
              <MessageSquare className="w-4 h-4" />
              Share Your Story
            </Link>
          </div>
          <p className="mx-auto max-w-2xl text-base text-gray-600">
            Real words from the women shaping Moms Fitness Mojo. Scroll through our community stories or{' '}
            <Link to="/share-your-story" className="text-[#F25129] font-semibold hover:underline">
              share your own
            </Link>
            .
          </p>
        </div>

        <TestimonialCarousel
          testimonials={publishedTestimonials}
          loading={loadingTestimonials}
          error={testimonialsError}
        />
      </section>

      {/* CTA / Member Quick Actions */}
       {isAuthed && (
         <section className="py-8 sm:py-12 -mt-4">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl">
             <div className="text-center space-y-8">
               <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                 Welcome back{currentUser?.displayName ? `, ${currentUser.displayName}` : ''}!
               </h2>
               <p className="text-xl text-gray-600 max-w-2xl mx-auto readable">
                 Jump right in with these quick actions.
               </p>

               {/* NOTE: "My Profile" removed per your preference */}
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                 <Link
                   to="/events"
                   className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition"
                 >
                   <Calendar className="w-5 h-5 text-[#F25129]" />
                   <span>Upcoming Events</span>
                 </Link>
                 <Link
                   to="/media"
                   className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition"
                 >
                   <ImageIcon className="w-5 h-5 text-[#F25129]" />
                   <span>Media Gallery</span>
                 </Link>
                 <Link
                   to="/posts"
                   className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition"
                 >
                   <UploadCloud className="w-5 h-5 text-[#F25129]" />
                   <span>Create / View Posts</span>
                 </Link>
               </div>
             </div>
           </div>
                  </section>
       )}


     </div>
   );
 };
 
 export default Home;
