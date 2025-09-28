import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Users, Calendar, Target, Award, Globe } from 'lucide-react';

const About: React.FC = () => {
  const stats = [
    { icon: Users, label: 'Active Members', value: '500+' },
    { icon: Calendar, label: 'Events Hosted', value: '100+' },
    { icon: Heart, label: 'Lives Changed', value: '1000+' },
    { icon: Globe, label: 'Communities', value: '5+' },
  ];

  const values = [
    {
      icon: Heart,
      title: 'Empowerment',
      description: 'We believe every mom deserves to prioritize her health and wellness without guilt or judgment.'
    },
    {
      icon: Users,
      title: 'Community',
      description: 'Building strong connections and support networks that last beyond the gym walls.'
    },
    {
      icon: Target,
      title: 'Goals',
      description: 'Helping moms set and achieve realistic, sustainable fitness and wellness goals.'
    },
    {
      icon: Award,
      title: 'Excellence',
      description: 'Providing high-quality programs, events, and resources for our community.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            About Moms Fitness Mojo
          </h1>
          <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
            We're more than just a fitness community – we're a movement dedicated to empowering 
            mothers to prioritize their health, build lasting friendships, and create a life 
            they love, one workout at a time.
          </p>
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
              className="text-center bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
            >
              <stat.icon className="w-12 h-12 text-[#F25129] mx-auto mb-4" />
              <div className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</div>
              <div className="text-gray-600">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Mission Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-white rounded-3xl p-12 shadow-xl border border-gray-200 mb-20"
        >
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">Our Mission</h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-8">
              To create a supportive, inclusive community where mothers can focus on their physical 
              and mental well-being without sacrificing their family responsibilities. We believe 
              that when moms take care of themselves, they can better take care of their families 
              and communities.
            </p>
            <div className="bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-8">
              <blockquote className="text-xl font-semibold text-gray-800 italic">
                "A healthy mom is a happy mom, and a happy mom makes a happy family."
              </blockquote>
              <cite className="text-gray-600 mt-4 block">- Aina Rai, Founder</cite>
            </div>
          </div>
        </motion.div>

        {/* Values Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mb-20"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">Our Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 + index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 text-center"
              >
                <value.icon className="w-16 h-16 text-[#F25129] mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-gray-900 mb-4">{value.title}</h3>
                <p className="text-gray-600 leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Story Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20"
        >
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">Our Story</h2>
            <div className="space-y-6 text-gray-600 leading-relaxed">
              <p>
                Moms Fitness Mojo was born from a simple observation: mothers everywhere were 
                putting everyone else's needs before their own, often at the expense of their 
                health and happiness.
              </p>
              <p>
                Founded by Aina Rai, a mother herself who experienced the challenges of balancing 
                family life with personal wellness, our community was created to provide a safe, 
                supportive space where moms could focus on themselves without guilt.
              </p>
              <p>
                What started as a small group of friends meeting for morning walks has grown into 
                a vibrant community of hundreds of mothers supporting each other's fitness journeys, 
                celebrating victories, and lifting each other up during challenges.
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl p-8">
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Join Our MOJO</h3>
              <p className="text-gray-600 mb-6">
                Ready to prioritize your health and connect with amazing moms? 
                Join our community today and start your wellness journey!
              </p>
              <div className="space-y-4">
                <div className="flex items-center text-gray-600">
                  <div className="w-2 h-2 bg-[#F25129] rounded-full mr-3"></div>
                  <span>Access to exclusive events and workshops</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <div className="w-2 h-2 bg-[#F25129] rounded-full mr-3"></div>
                  <span>Connect with like-minded mothers</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <div className="w-2 h-2 bg-[#F25129] rounded-full mr-3"></div>
                  <span>Expert guidance and support</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <div className="w-2 h-2 bg-[#F25129] rounded-full mr-3"></div>
                  <span>Flexible scheduling for busy moms</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="text-center bg-gradient-to-r from-[#F25129] to-[#FFC107] rounded-3xl p-12 text-white"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Start Your Journey?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join hundreds of mothers who are already prioritizing their health and happiness.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/events"
              className="px-8 py-4 bg-white text-[#F25129] font-semibold rounded-full hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              View Events
            </a>
            <a
              href="/contact"
              className="px-8 py-4 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-full hover:bg-white/30 transition-all duration-200 transform hover:scale-105"
            >
              Get in Touch
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default About;
