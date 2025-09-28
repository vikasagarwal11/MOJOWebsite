import React from "react";
import { motion } from "framer-motion";

// Brand Sparkles overlay (on-brand stars with soft twinkle)
const Sparkles: React.FC<{className?: string}> = ({ className = "" }) => (
  <div className={`pointer-events-none absolute inset-0 -z-0 ${className}`} aria-hidden>
    <svg className="absolute top-6 left-8 w-24 h-24 opacity-70" viewBox="0 0 100 100" fill="none">
      <path d="M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z" fill="#FFC107" opacity="0.8"/>
    </svg>
    <svg className="absolute bottom-10 right-8 w-20 h-20 opacity-60" viewBox="0 0 100 100" fill="none">
      <path d="M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z" fill="#F25129" opacity="0.75"/>
    </svg>
    <svg className="absolute top-1/2 left-1/3 -translate-y-1/2 -translate-x-1/3 w-12 h-12 opacity-60" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="3" fill="#EFD8C5" />
    </svg>
  </div>
);

/**
 * Moms Fitness Mojo — Homepage Landing
 * - Single-file React component
 * - TailwindCSS for styling
 * - Light framer-motion for tasteful animations
 *
 * Notes:
 * - Replace placeholder images/links with your own when integrating.
 * - Buttons point to #join and #events anchors in this mock.
 */

export default function MomsFitnessMojoLanding() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#F25129]/95 text-white border-b border-[#F25129]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <picture>
              {/* Prefer SVG; fallback to PNGs */}
              <source srcSet="/mnt/data/MFM Logo Outline.svg" type="image/svg+xml" />
              <img
                src="/assets/logo/mfm-logo-800.png"
                srcSet="/assets/logo/mfm-logo-800.png 1x, /assets/logo/mfm-logo-1600.png 2x"
                alt="Moms Fitness Mojo logo"
                className="h-9 w-9 rounded-xl object-contain bg-white/0"
              />
            </picture>
            <span className="font-semibold tracking-tight">Moms Fitness Mojo</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#about" className="hover:opacity-90">About</a>
            <a href="#activities" className="hover:opacity-90">Activities</a>
            <a href="#community" className="hover:opacity-90">Community</a>
            <a href="#events" className="hover:opacity-90">Events</a>
          </nav>
          <a href="#join" className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium shadow-sm border border-white bg-white text-[#F25129] hover:bg-white/90">Join the Mojo</a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {/* Coral → Peach soft gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#F25129]/10 via-[#FFF3EE] to-white" />
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#EFD8C5] blur-3xl opacity-60" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#FFE08A] blur-3xl opacity-50" />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                Where <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107]">Fitness</span> meets Friendship
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-700 max-w-2xl">
                More than a fitness group — we’re a lifestyle and a circle of strength for moms balancing health, family, careers, and fun.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#join" className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold bg-[#F25129] text-white shadow hover:shadow-md">Join Us Today</a>
                <a href="#about" className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-gray-50">Learn More</a>
              </div>
              <div className="mt-6 text-sm text-gray-600"><span className="inline-block rounded-full px-4 py-2 text-sm font-medium bg-[#EFD8C5]/60 text-gray-900">Fit, Fierce, and Fabulous: Together</span></div>
            </motion.div>

            {/* Hero visual (single brand panel instead of 3 photos) */}
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="relative rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-[#FFF3EE] via-[#EFD8C5] to-white">
              <div className="aspect-[21/9] flex items-center justify-center p-8 sm:p-10">
                <picture>
                  <source srcSet="/mnt/data/MFM Logo Outline.svg" type="image/svg+xml" />
                  <img src="/assets/logo/mfm-logo-800.png" alt="MFM logo" className="h-20 w-20 sm:h-24 sm:w-24 object-contain" />
                </picture>
                <div className="ml-4 sm:ml-6 text-center sm:text-left">
                  <h3 className="text-xl sm:text-2xl font-semibold text-[#F25129]">Moms Fitness Mojo</h3>
                  <p className="text-sm sm:text-base text-gray-700">Fit, Fierce, and Fabulous: Together</p>
                </div>
              </div>
              <Sparkles />
            </motion.div>
                  <Sparkles />
        </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-10 items-start">
            <div className="lg:col-span-2">
              <h2 className="text-3xl font-bold tracking-tight text-[#F25129]">Your Lifestyle, Your Circle, Your Mojo</h2>
              <p className="mt-4 text-gray-700 text-lg">
                Moms Fitness Mojo brings together health, wellness, and social life in one powerful community. From energizing workouts, hikes, tennis, and dance to social events like brunches, dinners, cocktail nights, and festival celebrations — every moment is filled with motivation, laughter, and lasting friendships.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h3 className="font-semibold">Quick Facts</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>✓ Weekly fitness challenges & accountability</li>
                <li>✓ Chic social events & celebrations</li>
                <li>✓ Supportive, welcoming moms-only circle</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ACTIVITIES */}
      <section id="activities" className="py-16 sm:py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-center">What We Do</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">Fitness & wellness fused with a vibrant social calendar.</p>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Group Workouts", desc: "Strength, cardio, flexibility — all levels welcome.", img: "https://images.unsplash.com/photo-1579758629938-03607ccdbaba?q=80&w=1400&auto=format&fit=crop" },
              { title: "Hikes & Outdoors", desc: "Fresh air, nature trails, and mom-time.", img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1400&auto=format&fit=crop" },
              { title: "Tennis & Dance", desc: "Rackets or rhythms — move with your tribe.", img: "https://images.unsplash.com/photo-1610196170734-5459b9b3a67c?q=80&w=1400&auto=format&fit=crop" },
              { title: "Brunches & Dinners", desc: "Chic meetups that sparkle with conversation.", img: "https://images.unsplash.com/photo-1521017432531-fbd92d1cfb1a?q=80&w=1400&auto=format&fit=crop" },
              { title: "Cocktail Nights", desc: "Mocktails, cocktails, and laughter that lingers.", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c76d6?q=80&w=1400&auto=format&fit=crop" },
              { title: "Festival Celebrations", desc: "Celebrate together — lights, color, and joy.", img: "https://images.unsplash.com/photo-1574782096590-ec8297b4aa3c?q=80&w=1400&auto=format&fit=crop" },
            ].map((card, i) => (
              <motion.div key={card.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md">
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={card.img} alt={card.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold">{card.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* COMMUNITY / LOCATIONS */}
      <section id="community" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-100 bg-gradient-to-r from-white to-[#EFD8C5] p-8 sm:p-10 shadow-sm">
            <h2 className="text-3xl font-bold tracking-tight text-[#F25129]">Stronger Together</h2>
            <p className="mt-3 text-gray-700 max-w-3xl">
              We’re currently active across <strong>Short Hills</strong>, <strong>Millburn</strong>, <strong>Livingston</strong>, <strong>Summit</strong>, <strong>Maplewood</strong>, and <strong>Springfield</strong> — and expanding soon! Not in your area? Reach out to start Moms Fitness Mojo near you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {["Short Hills", "Millburn", "Livingston", "Summit", "Maplewood", "Springfield"].map((city) => (
                <span key={city} className="rounded-full border border-gray-200 px-4 py-2 text-sm bg-white">{city}</span>
              ))}
            </div>
            <a href="#join" className="mt-8 inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#e04a22]">Start a Chapter</a>
          </div>
        </div>
      </section>

      {/* EVENTS HIGHLIGHT */}
      <section id="events" className="py-16 sm:py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#F25129]">Mojo Moments</h2>
              <p className="mt-2 text-gray-600">From Sunday brunches to sparkling celebration nights — highlights from our calendar.</p>
            </div>
            <a href="#join" className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border border-[#F25129] text-[#F25129] bg-white hover:bg-white/90">View Upcoming Events</a>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Sunrise Hike + Coffee", date: "Every Month", img: "https://images.unsplash.com/photo-1520975693410-001d1eabc1b9?q=80&w=1400&auto=format&fit=crop" },
              { title: "Tennis & Tonic Thursdays", date: "Weekly", img: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?q=80&w=1400&auto=format&fit=crop" },
              { title: "Dance & Brunch Social", date: "Bi-Weekly", img: "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1400&auto=format&fit=crop" },
            ].map((ev, i) => (
              <motion.article key={ev.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md">
                <div className="aspect-[16/10] overflow-hidden">
                  <img src={ev.img} alt={ev.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold">{ev.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{ev.date}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-center">What Moms Are Saying</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              "I’ve never felt stronger, inside and out.",
              "It’s more than fitness — it’s friendship and support.",
              "I finally found my circle.",
            ].map((quote, i) => (
              <motion.figure key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: i * 0.05 }} className="rounded-2xl border border-gray-100 p-6 bg-white shadow-sm">
                <blockquote className="text-gray-800">“{quote}”</blockquote>
                <figcaption className="mt-3 text-sm text-gray-500">— MFM Member</figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA CLOSER */}
      <section id="join" className="py-16 sm:py-20 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-white via-[#EFD8C5] to-[#FFF8F0]" />
          <div className="absolute -top-24 left-10 h-64 w-64 rounded-full bg-[#ffe0b2] blur-3xl opacity-60" />
          <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-[#ffd180] blur-3xl opacity-60" />
        </div>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Ready to Find Your Mojo?</h2>
          <p className="mt-4 text-lg text-gray-700">Join our circle of strength. Celebrate fitness, friendship, and lifestyle — together.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#" className="inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#e04a22]">Join MFM</a>
            <a href="#events" className="inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-white bg-white">See Events</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#F25129]/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          <p className="text-sm text-gray-500">Fit, Fierce, and Fabulous: Together.</p>
        </div>
      </footer>
    </div>
  );
}
