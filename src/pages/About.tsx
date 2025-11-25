import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Users, Mail, Instagram, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const About: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            About Us — Moms Fitness Mojo
          </h1>
        </motion.div>

        {/* Who We Are Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-200 mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mb-6">
            Who We Are
          </h2>
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              Moms Fitness Mojo is a community built on connection, support, and the shared belief that moms deserve space to take care of themselves.
            </p>
            <p>
              We are a growing circle of women who balance families, careers, responsibilities — and still choose to show up for our health and for one another.
            </p>
            <div className="bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6 mt-6">
              <p className="text-gray-800 font-medium">
                We're not a fitness center or a formal organization.
              </p>
              <p className="text-gray-700 mt-3">
                We're simply moms who believe in lifting each other up, staying active together, and creating moments that remind us that we matter too.
              </p>
            </div>
          </div>
        </motion.div>

        {/* What We Do Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-200 mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mb-6">
            What We Do
          </h2>
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              We bring moms together through activities that fit real life — workouts, walks, hikes, tennis, dance classes, and local meetups.
            </p>
            <p>
              These aren't just fitness sessions; they're opportunities to reconnect with ourselves and with a group that understands the everyday challenges of motherhood.
            </p>
            <p>
              Alongside fitness, we host social events, celebrations, and gatherings that help build genuine friendships and a sense of belonging.
            </p>
            <div className="bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6 mt-6">
              <p className="text-gray-800 font-semibold text-xl mb-2">Our goal is simple:</p>
              <p className="text-gray-700">
                to create consistent, supportive spaces where moms feel motivated, seen, and encouraged.
              </p>
            </div>
          </div>
        </motion.div>

        {/* How We Do It Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-200 mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mb-6">
            How We Do It
          </h2>
          <p className="text-lg text-gray-700 mb-6">
            We focus on community first.
          </p>
          <p className="text-lg text-gray-700 mb-8">
            Every class, event, or meetup is designed to make moms feel welcomed, supported, and included.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-[#F25129] flex-shrink-0 mt-1" />
              <p className="text-lg text-gray-700">We keep activities local and convenient</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-[#F25129] flex-shrink-0 mt-1" />
              <p className="text-lg text-gray-700">We choose experiences that inspire and energize</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-[#F25129] flex-shrink-0 mt-1" />
              <p className="text-lg text-gray-700">We partner with great gyms, studios, and instructors</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-[#F25129] flex-shrink-0 mt-1" />
              <p className="text-lg text-gray-700">We maintain a positive, respectful, uplifting environment</p>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-[#F25129] flex-shrink-0 mt-1" />
              <p className="text-lg text-gray-700">We show up for each other — with kindness, accountability, and zero judgment</p>
            </div>
          </div>
          <div className="mt-8 bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6">
            <p className="text-lg text-gray-800 font-medium">
              MFM works because moms lead it, moms live it, and moms support one another through every step of the journey.
            </p>
          </div>
        </motion.div>

        {/* Why It Matters Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-200 mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mb-6">
            Why It Matters
          </h2>
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              Motherhood can be rewarding — and it can also be incredibly demanding.
            </p>
            <p className="font-semibold text-gray-800">
              It's easy to put yourself last.
            </p>
            <p>
              Moms Fitness Mojo exists to change that.
            </p>
            <div className="bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6 mt-6">
              <p className="text-gray-800 font-semibold mb-4">This community is a reminder that:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-[#F25129] flex-shrink-0 mt-1" />
                  <p className="text-gray-700">Your health matters</p>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-[#F25129] flex-shrink-0 mt-1" />
                  <p className="text-gray-700">Your energy matters</p>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-[#F25129] flex-shrink-0 mt-1" />
                  <p className="text-gray-700">Your happiness matters</p>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-[#F25129] flex-shrink-0 mt-1" />
                  <p className="text-gray-700">And you don't have to do it alone</p>
                </div>
              </div>
            </div>
            <p className="mt-6 text-lg text-gray-700">
              We're here to help moms feel stronger — physically, mentally, and emotionally — through connection and consistency.
            </p>
          </div>
        </motion.div>

        {/* Connect With Us Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="bg-gradient-to-r from-[#F25129] to-[#FFC107] rounded-3xl p-8 sm:p-12 text-white shadow-xl"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Connect With Us</h2>
          <p className="text-xl mb-8 text-center opacity-95">
            If you're looking for a supportive circle that understands your world and helps you stay motivated:
          </p>
          <div className="space-y-6 max-w-md mx-auto">
            <a
              href="https://www.instagram.com/momsfitnessmojo/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#F25129] font-semibold rounded-full hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              <Instagram className="w-5 h-5" />
              <span>Instagram: @momsfitnessmojo</span>
            </a>
            <a
              href="mailto:momsfitnessmojo@gmail.com"
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-full hover:bg-white/30 transition-all duration-200 transform hover:scale-105"
            >
              <Mail className="w-5 h-5" />
              <span>Email: momsfitnessmojo@gmail.com</span>
            </a>
          </div>
          <p className="text-center mt-8 text-lg opacity-95">
            Join us — and be part of a community built for moms, with moms, and by moms.
          </p>
          <div className="flex justify-center mt-8">
            <Link
              to="/register"
              className="px-8 py-4 bg-white text-[#F25129] font-semibold rounded-full hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Join MOJO
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default About;
