import { limit, orderBy, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  Calendar,
  Camera,
  Facebook,
  Heart,
  Image as ImageIcon,
  Instagram,
  MessageSquare,
  Users,
  X
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { useInView } from 'react-intersection-observer';
import { Link, useNavigate } from 'react-router-dom';
import HeroCarousel from '../components/hero/HeroCarousel';
import TestimonialCarousel from '../components/home/TestimonialCarousel';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { useTestimonials } from '../hooks/useTestimonials';

const LazyImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: '0px 0px 200px 0px',
  });
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div ref={ref} className="relative h-full w-full">
      {!isLoaded && <div className="absolute inset-0 h-full w-full bg-gray-200 animate-pulse" />}
      {inView && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={`h-full w-full object-contain transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${className ?? ''}`}
        />
      )}
    </div>
  );
};
// import { ResponsiveLogo } from '../components/common/ResponsiveLogo';

const isBrowser = typeof window !== 'undefined';

const HelmetWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
  if (!isBrowser) return <>{children}</>;
  return <Helmet>{children}</Helmet>;
};

const stripMotionProps = ({
  initial,
  animate,
  exit,
  whileInView,
  variants,
  transition,
  viewport,
  ...rest
}: Record<string, any>) => rest;

const MotionlessDiv: React.FC<any> = ({ children, ...rest }) => {
  const clean = stripMotionProps(rest);
  return <div {...clean}>{children}</div>;
};

const MotionContainer: any = isBrowser ? motion.div : MotionlessDiv;
const MotionItem: any = isBrowser ? motion.div : MotionlessDiv;

const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const isAuthed = !!currentUser;
  const { useRealtimeCollection } = useFirestore();
  const navigate = useNavigate();

  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof window === 'undefined') return;
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const focusTarget = element.querySelector<HTMLElement>('[data-section-heading]');
      if (focusTarget) {
        window.setTimeout(() => {
          focusTarget.focus({ preventScroll: true });
        }, 250);
      }
    }
  }, []);

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
      title: 'Our Current Communities',
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

  const momMediaSnapshot = useRealtimeCollection('media', [
    where('type', '==', 'image'),
    orderBy('createdAt', 'desc'),
    limit(6),
  ]);

  const momMediaRaw = momMediaSnapshot.data ?? [];
  const loadingMoments = momMediaSnapshot.loading;

  const momMoments = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

    return momMediaRaw
      .slice(0, 6)
      .map((media: any) => {
        // Use original URL instead of thumbnail to avoid cropping faces
        // Thumbnails are square (400x400, 800x800, 1200x1200) which crops images
        const rawUrl = media.url || media.thumbnailUrl || '';
        const imageUrl = rawUrl; // Use original image, not thumbnail
        const displayTitle =
          media.eventTitle ||
          media.title ||
          media.description ||
          'Mojo Moment';
        const displaySubtitleParts: string[] = [];
        if (media.location?.city) {
          displaySubtitleParts.push(media.location.city);
        } else if (media.eventLocation) {
          displaySubtitleParts.push(media.eventLocation);
        }
        if (media.createdAt instanceof Date) {
          displaySubtitleParts.push(formatter.format(media.createdAt));
        }

        return {
          id: media.id,
          imageUrl: imageUrl,
          title: displayTitle,
          subtitle: displaySubtitleParts.join(' • '),
        };
      })
      .filter((item) => !!item.imageUrl);
  }, [momMediaRaw]);

  return (
    <div>
      <HelmetWrapper>
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
      </HelmetWrapper>

      {/* Hero Section - Ladder Layout */}
      <section id="hero" className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {/* Coral → Peach soft gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#F25129]/10 via-[#FFF3EE] to-white" />
          {/* Decorative blobs - responsive sizes */}
          <div className="absolute -top-12 -right-12 sm:-top-24 sm:-right-24 h-48 w-48 sm:h-80 sm:w-80 rounded-full bg-[#EFD8C5] blur-3xl opacity-60" />
          <div className="absolute -bottom-12 -left-8 sm:-bottom-24 sm:-left-16 h-40 w-40 sm:h-72 sm:w-72 rounded-full bg-[#FFE08A] blur-3xl opacity-50" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12">
          {/* ROW 1: Logo + "Where Fitness meets Friendship" */}
          <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-2 mb-8 sm:mb-12">
            {/* Left: Logo */}
            <div className="flex justify-center lg:justify-start w-full">
              {/* Logo container with responsive sizing and solid background */}
              <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl rounded-xl sm:rounded-2xl shadow-lg overflow-hidden bg-[#F25129]">
                {/* Image wrapper with responsive padding to prevent edge touching */}
                <div className="w-full aspect-[4/3] p-8 sm:p-10 md:p-12 lg:p-14 xl:p-16 flex items-center justify-center">
                  <img 
                    src="/assets/logo/mfm-logo-updated-tagline-2.svg" 
                    alt="Moms Fitness Mojo - Where Fitness meets Friendship" 
                    className="w-full h-full max-w-full max-h-full object-contain"
                    loading="eager"
                    fetchpriority="high"
                    decoding="async"
                    width="800"
                    height="600"
                    style={{
                      objectFit: 'contain',
                      objectPosition: 'center',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto'
                    }}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      // Fallback to PNG if SVG fails
                      if (target.src.includes('.svg')) {
                        console.warn('SVG logo failed to load, using PNG fallback');
                        target.src = '/logo.png';
                        target.removeAttribute('srcset');
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            
            {/* Right: "Where Fitness meets Friendship" */}
            <div>
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight text-[#F25129]">
                <span>Where</span> <span>Fitness</span> <span>meets Friendship</span>
              </h2>
              <p className="mt-4 sm:mt-6 text-base sm:text-lg lg:text-xl text-gray-700 max-w-2xl readable">
                More than a fitness group — we're a lifestyle and a circle of strength for moms balancing health, family, careers, and fun.
              </p>
              {!isAuthed && (
                <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4">
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm sm:text-base font-semibold bg-[#F25129] text-white shadow hover:shadow-md transition-all duration-300 touch-target w-full sm:w-auto"
                  >
                    Join MOJO
                  </Link>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <span className="text-sm font-medium text-gray-700">Follow Us:</span>
                    <a
                      href="https://www.instagram.com/momsfitnessmojo/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-gray-300 text-gray-700 hover:border-[#E4405F] hover:text-[#E4405F] hover:bg-[#E4405F]/10 transition-all duration-300 touch-target"
                      aria-label="Follow us on Instagram"
                    >
                      <Instagram className="w-5 h-5" />
                    </a>
                    <a
                      href="https://www.facebook.com/momsfitnessmojo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-gray-300 text-gray-700 hover:border-[#1877F2] hover:text-[#1877F2] hover:bg-[#1877F2]/10 transition-all duration-300 touch-target"
                      aria-label="Follow us on Facebook"
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* ROW 2: "Your Lifestyle..." + Carousel */}
          <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-2 mb-6">
            {/* Left: "Your Lifestyle, Your Circle, Your Mojo" */}
            <div>
              <h2
                className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#F25129]"
                tabIndex={-1}
                data-section-heading
              >
                Your Lifestyle, Your Circle, Your Mojo
              </h2>
              <p className="mt-3 text-gray-700 text-base sm:text-lg leading-relaxed">
                Moms Fitness Mojo brings together health, wellness, and social life in one powerful community.
                From energizing workouts, hikes, tennis, and dance to social events like brunches, dinners,
                cocktail nights, and festival celebrations — every moment is filled with motivation, laughter,
                and lasting friendships.
              </p>
            </div>
            
            {/* Right: Hero Carousel (same size as before) */}
            <div className="relative max-w-lg ml-auto min-h-[200px]">
              <HeroCarousel 
                imagesDirectory="/assets/hero-images"
                duration={4}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 -mt-2">
        <div className="text-center mb-6 sm:mb-8">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#F25129] mb-3 sm:mb-4"
            tabIndex={-1}
            data-section-heading
          >
            What We Do
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 readable">
            Fitness & wellness fused with a vibrant social calendar.
          </p>
        </div>

          <MotionContainer 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
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
            <MotionItem
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="group p-5 sm:p-6 rounded-xl sm:rounded-2xl bg-white/50 backdrop-blur-sm border border-[#F25129]/20 hover:bg-white/80 hover:shadow-xl transition-transform hover:-translate-y-2 hover:rotate-[0.25deg]"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#F25129] rounded-xl sm:rounded-2xl flex items-center justify-center text-white mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            </MotionItem>
          ))}
        </MotionContainer>
      </section>

      {/* Mom Moments Highlight */}
      <section id="moments" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12 -mt-4">
        <div className="text-center mb-6 sm:mb-8">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#F25129] mb-3 sm:mb-4"
            tabIndex={-1}
            data-section-heading
          >
            Mom's Moments
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 readable mb-4">
            Real snapshots from our recent workouts, socials, and celebrations—see what the community is up to right now.
          </p>
          <Link
            to="/media"
            className="inline-flex items-center rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-semibold text-[#F25129] border border-[#F25129]/40 hover:bg-[#F25129]/10 transition-colors duration-300 touch-target"
          >
            View Gallery
          </Link>
        </div>

        {loadingMoments ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[4/3] rounded-2xl bg-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : momMoments.length === 0 ? (
          <div className="rounded-xl sm:rounded-2xl border border-dashed border-[#F25129]/30 bg-white/80 p-5 sm:p-6 text-center text-sm sm:text-base text-gray-600">
            Fresh highlights are on the way—check back soon!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {momMoments.map((moment) => (
              <div
                key={moment.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl sm:rounded-2xl shadow-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl bg-[#FFF5F2]"
              >
                <LazyImage src={moment.imageUrl} alt={moment.title} className="rounded-xl sm:rounded-2xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent transition-opacity duration-300 group-hover:from-black/60" />
                <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 text-white">
                  <h3 className="text-base sm:text-lg font-semibold leading-tight drop-shadow">{moment.title}</h3>
                  {moment.subtitle && (
                    <p className="mt-1 text-sm text-white/85 drop-shadow">
                      {moment.subtitle}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

             {/* Stats Section */}
      <section id="stats" className="text-white py-6 sm:py-10 lg:py-12 -mt-6">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 bg-[#F25129] rounded-xl sm:rounded-2xl">
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center">
             <div>
               <div className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2">180+</div>
               <div className="text-sm sm:text-base text-[#FFE4D6]">Active Members</div>
             </div>
             <div>
               <div className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2">2+</div>
               <div className="text-sm sm:text-base text-[#FFE4D6]">Monthly Events</div>
             </div>
             <div>
               <div className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2">2025</div>
               <div className="text-sm sm:text-base text-[#FFE4D6]">Year Started</div>
             </div>
           </div>
         </div>
       </section>

      {/* Stronger Together / Community */}
      {!isAuthed && (
        <section id="community" className="py-6 sm:py-10 lg:py-12 -mt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl sm:rounded-2xl border border-gray-100 bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 p-5 sm:p-6 lg:p-8 shadow-sm">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F25129]"
                tabIndex={-1}
                data-section-heading
              >
                Stronger Together
              </h2>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-gray-700 readable">
                We&apos;re currently active across <strong>Short Hills</strong>, <strong>Millburn</strong>, <strong>Livingston</strong>, <strong>Summit</strong>, <strong>Maplewood</strong>, and <strong>Springfield</strong> and expanding soon! Not in your area? Reach out to start Moms Fitness Mojo near you.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
                {["Short Hills", "Millburn", "Livingston", "Summit", "Maplewood", "Springfield"].map((city) => (
                  <span key={city} className="rounded-full border border-gray-200 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-white hover:border-[#F25129] hover:text-[#F25129] transition-colors">
                    {city}
                  </span>
                ))}
              </div>
              <Link
                to="/register"
                className="mt-4 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition-all duration-300 touch-target w-full sm:w-auto"
              >
                Start a Chapter
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      <section id="stories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12 -mt-4 space-y-6 sm:space-y-10">
        <div className="text-center mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-3 flex-wrap">
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent"
              tabIndex={-1}
              data-section-heading
            >
              What Moms Are Saying
            </h2>
            {isAuthed ? (
              <Link
                to="/share-your-story"
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg transform hover:scale-105 touch-target text-sm"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Share Your Story</span>
                <span className="sm:hidden">Share</span>
              </Link>
            ) : (
              <button
                onClick={() => {
                  toast(
                    (t) => (
                      <div className="flex flex-col gap-3 relative" style={{ minWidth: '280px', maxWidth: '90vw' }}>
                        {/* Close button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toast.dismiss(t.id);
                          }}
                          className="absolute top-0 right-0 text-white/70 hover:text-white transition-colors p-1 touch-target"
                          aria-label="Close"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div>
                          <span className="font-semibold text-white block mb-1 text-sm sm:text-base">Please sign in to share your story</span>
                          <p className="text-xs sm:text-sm text-gray-200">Create an account or log in to publish your testimonial.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toast.dismiss(t.id);
                              navigate('/login');
                            }}
                            className="flex-1 px-3 sm:px-4 py-2 bg-white text-[#F25129] rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-100 transition-colors touch-target"
                          >
                            Sign In
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toast.dismiss(t.id);
                              navigate('/register');
                            }}
                            className="flex-1 px-3 sm:px-4 py-2 border-2 border-white text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-white/20 transition-colors touch-target"
                          >
                            Join MOJO
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toast.dismiss(t.id);
                          }}
                          className="w-full px-3 sm:px-4 py-2 text-white/80 hover:text-white text-xs sm:text-sm font-medium transition-colors touch-target"
                        >
                          Cancel
                        </button>
                      </div>
                    ),
                    {
                      duration: Infinity, // Keep open until user dismisses
                      position: 'top-center',
                      style: {
                        background: '#1F2937', // Dark gray background
                        color: '#fff',
                        padding: '16px',
                        maxWidth: '90vw',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      },
                    }
                  );
                }}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg transform hover:scale-105 touch-target text-sm"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Share Your Story</span>
                <span className="sm:hidden">Share</span>
              </button>
            )}
          </div>
          <p className="mx-auto max-w-2xl text-sm sm:text-base text-gray-600 px-4">
            Real words from the women shaping Moms Fitness Mojo. Scroll through our community stories. Feeling inspired?{' '}
            {isAuthed ? (
              <Link to="/share-your-story" className="font-semibold text-[#F25129] hover:underline">
                Tap &ldquo;Share Your Story&rdquo; to add yours.
              </Link>
            ) : (
              <span className="font-semibold text-gray-800">&ldquo;Share Your Story.&rdquo;</span>
            )}
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
         <section id="actions" className="py-6 sm:py-10 lg:py-12 -mt-4">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12 bg-[#F25129]/10 rounded-xl sm:rounded-2xl">
             <div className="text-center space-y-6 sm:space-y-8">
               <h2
                 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#F25129]"
                 tabIndex={-1}
                 data-section-heading
               >
                 Welcome back{currentUser?.displayName ? `, ${currentUser.displayName}` : ''}!
               </h2>
               <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto readable px-4">
                 Jump right in with these quick actions.
               </p>

               {/* NOTE: "My Profile" removed per your preference */}
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
                 <Link
                   to="/events"
                   className="flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition touch-target"
                 >
                   <Calendar className="w-5 h-5 text-[#F25129]" />
                   <span className="text-sm sm:text-base">Upcoming Events</span>
                 </Link>
                 <Link
                   to="/media"
                   className="flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition touch-target"
                 >
                   <ImageIcon className="w-5 h-5 text-[#F25129]" />
                   <span className="text-sm sm:text-base">Media Gallery</span>
                 </Link>
                 {/* Posts link hidden for now - will bring back later */}
                 {/* <Link
                   to="/posts"
                   className="flex items-center justify-center gap-2 px-4 sm:px-5 py-3 sm:py-4 bg-white rounded-xl border border-[#F25129]/20 hover:shadow-lg transition touch-target"
                 >
                   <UploadCloud className="w-5 h-5 text-[#F25129]" />
                   <span className="text-sm sm:text-base">Create / View Posts</span>
                 </Link> */}
               </div>
             </div>
           </div>
                  </section>
       )}


     </div>
   );
 };
 
 export default Home;
