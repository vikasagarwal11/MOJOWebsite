import React, { useState } from 'react';
import {
  Heart,
  Users,
  Award,
  Calendar,
  MessageCircle,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Mail,
  Phone,
  MapPin,
  Star,
  Quote,
  ArrowRight,
  Trophy,
  Target,
  Lightbulb,
  Shield,
  Sparkles,
  Camera,
  BookOpen,
  Globe,
  Clock,
  CheckCircle,
  TrendingUp,
  Zap,
  Crown,
  Gem,
  Flame,
  Smartphone,
  User,
  Map,
} from 'lucide-react';

const Founder: React.FC = () => {
  const [activeTab, setActiveTab] = useState('about');

  const founderData = {
    name: 'Aina Rai',
    title: 'Founder & CEO',
    subtitle: 'Moms Fitness Community',
    bio: 'A passionate advocate for women\'s health and wellness, Aina Rai founded the Moms Fitness Community to empower mothers to prioritize their physical and mental well-being while balancing the demands of family life.',
    image: '/images/founder-profile.jpg', // Upload founder's photo here
    coverImage: '/images/founder-cover.jpg', // Upload founder's cover photo here
    location: 'Short Hills, NJ',
    joined: 'January 2025',
    followers: '12.5K',
    following: '1.2K',
    posts: '856',
  };

  const achievements = [
    {
      icon: <Trophy className="w-6 h-6" />,
      title: 'Fitness Industry Leader',
      description: 'Recognized as Top 50 Women in Fitness 2023',
      year: '2023',
    },
    {
      icon: <Award className="w-6 h-6" />,
      title: 'Community Impact Award',
      description: 'For outstanding contribution to women\'s wellness',
      year: '2022',
    },
    {
      icon: <Star className="w-6 h-6" />,
      title: 'Best Fitness App',
      description: 'Moms Fitness Community voted #1 by Health Magazine',
      year: '2023',
    },
    {
      icon: <Heart className="w-6 h-6" />,
      title: 'Mental Health Advocate',
      description: 'Certified in Maternal Mental Health Support',
      year: '2021',
    },
  ];

  const milestones = [
    {
      year: 'Jan 2025',
      title: 'Community Founded',
      description: 'Started with just 50 members in San Francisco',
      icon: <Users className="w-5 h-5" />,
    },
    {
      year: ' Mar 2025',
      title: 'First 1000 Members',
      description: 'Expanded to 5 cities across California',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      year: 'Apr 2025',
      title: 'Mobile App Launch',
      description: 'Launched iOS and Android apps with live streaming',
      icon: <Smartphone className="w-5 h-5" />,
    },
    {
      year: 'May 2025',
      title: 'National Expansion',
      description: 'Now serving 50,000+ moms across 25 states',
      icon: <Globe className="w-5 h-5" />,
    },
  ];

  const testimonials = [
    {
      name: 'Jennifer Martinez',
      role: 'Mother of 3',
      text: 'Aina\'s approach to fitness changed my life. She understands the unique challenges we face as mothers.',
      rating: 5,
      image: '/api/placeholder/60/60',
    },
    {
      name: 'Lisa Thompson',
      role: 'Working Mom',
      text: 'The community Aina built is incredible. It\'s not just about fitness, it\'s about supporting each other.',
      rating: 5,
      image: '/api/placeholder/60/60',
    },
    {
      name: 'Maria Rodriguez',
      role: 'New Mom',
      text: 'Aina\'s guidance helped me find balance between motherhood and self-care. I\'m forever grateful.',
      rating: 5,
      image: '/api/placeholder/60/60',
    },
  ];

  const socialLinks = [
    { icon: <Instagram className="w-5 h-5" />, url: '#', label: 'Instagram' },
    { icon: <Facebook className="w-5 h-5" />, url: '#', label: 'Facebook' },
    { icon: <Twitter className="w-5 h-5" />, url: '#', label: 'Twitter' },
    { icon: <Linkedin className="w-5 h-5" />, url: '#', label: 'LinkedIn' },
  ];

  const tabs = [
    { id: 'about', label: 'About', icon: <User className="w-4 h-4" /> },
    { id: 'achievements', label: 'Achievements', icon: <Trophy className="w-4 h-4" /> },
    { id: 'journey', label: 'Journey', icon: <Map className="w-4 h-4" /> },
    { id: 'testimonials', label: 'Testimonials', icon: <MessageCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Cover Image with Founder Photo Overlay */}
        <div className="h-[500px] relative overflow-hidden pb-8">
          <img 
            src={founderData.coverImage} 
            alt="Founder cover"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to gradient if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#F25129] via-[#FF6B35] to-[#E0451F] hidden"></div>
          <div className="absolute inset-0 bg-black/30"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
          
           {/* Hero Content */}
           <div className="absolute bottom-8 left-8 lg:left-16 right-8 lg:right-16">
             <div className="text-center lg:text-left">
               <h1 className="text-4xl lg:text-6xl font-bold text-white mb-4 drop-shadow-2xl">
                 Meet Our Founder
               </h1>
               <p className="text-xl lg:text-2xl text-white/90 mb-2 drop-shadow-lg">
                 Empowering Moms Through Fitness
               </p>
               <p className="text-lg lg:text-xl text-white/80 drop-shadow-lg">
                 Discover the story behind our community
               </p>
             </div>
           </div>
          
          {/* Floating Elements */}
          <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute top-20 right-20 w-32 h-32 bg-[#FF6B35]/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-16 h-16 bg-[#E0451F]/20 rounded-full blur-xl animate-pulse delay-2000"></div>
        </div>

        {/* Profile Card */}
        <div className="relative -mt-8 mx-4 sm:mx-8 lg:mx-16">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Profile Header */}
            <div className="relative p-8 pt-8 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white">
              <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
                {/* Large Profile Image */}
                <div className="relative flex-shrink-0">
                  <div className="w-48 h-48 lg:w-56 lg:h-56 rounded-2xl bg-white/20 backdrop-blur-sm border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-2xl">
                    <img 
                      src={founderData.image} 
                      alt={founderData.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <div className="w-full h-full rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E0451F] flex items-center justify-center text-6xl font-bold text-white hidden">
                      AR
                    </div>
                  </div>
                  <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-green-500 rounded-full border-4 border-white flex items-center justify-center shadow-lg">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 text-center lg:text-left">
                  <h1 className="text-3xl lg:text-4xl font-bold mb-2">{founderData.name}</h1>
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

                  {/* Location & Join Date */}
                  <div className="flex flex-wrap justify-center lg:justify-start gap-4 text-white/80">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{founderData.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Joined {founderData.joined}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button className="px-6 py-3 bg-white text-[#F25129] rounded-full font-semibold hover:bg-white/90 transition-all duration-200 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Message
                  </button>
                  <button className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-full font-semibold hover:bg-white/30 transition-all duration-200 flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Follow
                  </button>
                </div>
              </div>
            </div>

            {/* Bio Section */}
            <div className="p-8">
              <p className="text-gray-700 text-lg leading-relaxed mb-6">
                {founderData.bio}
              </p>

              {/* Social Links */}
              <div className="flex gap-4 mb-8">
                {socialLinks.map((social, index) => (
                  <a
                    key={index}
                    href={social.url}
                    className="w-12 h-12 bg-gray-100 hover:bg-orange-100 rounded-full flex items-center justify-center transition-all duration-200 group"
                    aria-label={social.label}
                  >
                    <div className="text-gray-600 group-hover:text-[#F25129] transition-colors">
                      {social.icon}
                    </div>
                  </a>
                ))}
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-8">
                <nav className="flex space-x-8">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-[#F25129] text-[#F25129]'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="min-h-[400px]">
                {activeTab === 'about' && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">About Aina Rai</h3>
                      <div className="prose prose-lg text-gray-700">
                        <p className="mb-4">
                          Aina Rai is a certified fitness trainer, nutritionist, and maternal health specialist 
                          with over 15 years of experience in women's wellness. She holds a Ph.D. in Exercise Physiology 
                          from Stanford University and is a certified personal trainer through NASM.
                        </p>
                        <p className="mb-4">
                          After becoming a mother herself, Aina realized the unique challenges that mothers face 
                          when trying to maintain their health and fitness. This personal experience inspired her to 
                          create a supportive community where mothers could find encouragement, resources, and 
                          motivation to prioritize their well-being.
                        </p>
                        <p className="mb-6">
                          Aina's approach combines evidence-based fitness science with practical, real-world 
                          solutions that work for busy mothers. She believes that self-care isn't selfish—it's 
                          essential for being the best parent you can be.
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl">
                        <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-purple-600" />
                          Education
                        </h4>
                        <ul className="space-y-2 text-gray-700">
                          <li>• Ph.D. Exercise Physiology, Stanford University</li>
                          <li>• M.S. Nutrition Science, UC Berkeley</li>
                          <li>• B.S. Kinesiology, UCLA</li>
                          <li>• Certified Personal Trainer (NASM)</li>
                          <li>• Certified Nutritionist (CNS)</li>
                        </ul>
                      </div>

                      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl">
                        <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Target className="w-5 h-5 text-indigo-600" />
                          Specializations
                        </h4>
                        <ul className="space-y-2 text-gray-700">
                          <li>• Maternal Fitness & Postpartum Recovery</li>
                          <li>• Women's Hormonal Health</li>
                          <li>• Stress Management & Mental Wellness</li>
                          <li>• Family Nutrition Planning</li>
                          <li>• Time-Efficient Workout Design</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'achievements' && (
                  <div className="space-y-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Recognition & Achievements</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                      {achievements.map((achievement, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-[#F25129] to-[#FF6B35] rounded-xl flex items-center justify-center text-white">
                              {achievement.icon}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-lg font-semibold text-gray-900">{achievement.title}</h4>
                                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{achievement.year}</span>
                              </div>
                              <p className="text-gray-700">{achievement.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'journey' && (
                  <div className="space-y-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Community Journey</h3>
                    <div className="relative">
                      {/* Timeline Line */}
                      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#F25129] to-[#FF6B35]"></div>
                      
                      {milestones.map((milestone, index) => (
                        <div key={index} className="relative flex items-start gap-6 mb-8">
                          <div className="w-16 h-16 bg-gradient-to-br from-[#F25129] to-[#FF6B35] rounded-full flex items-center justify-center text-white relative z-10">
                            {milestone.icon}
                          </div>
                          <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
                            <div className="flex items-center gap-4 mb-2">
                              <h4 className="text-xl font-semibold text-gray-900">{milestone.title}</h4>
                              <span className="text-sm text-[#F25129] bg-orange-100 px-3 py-1 rounded-full font-medium">
                                {milestone.year}
                              </span>
                            </div>
                            <p className="text-gray-700">{milestone.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'testimonials' && (
                  <div className="space-y-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">What Our Community Says</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                      {testimonials.map((testimonial, index) => (
                        <div key={index} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-200">
                          <div className="flex items-center gap-1 mb-4">
                            {[...Array(testimonial.rating)].map((_, i) => (
                              <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                            ))}
                          </div>
                          <blockquote className="text-gray-700 mb-4 italic">
                            "{testimonial.text}"
                          </blockquote>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-[#F25129] to-[#FF6B35] rounded-full flex items-center justify-center text-white font-semibold">
                              {testimonial.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{testimonial.name}</div>
                              <div className="text-sm text-gray-500">{testimonial.role}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Founder;
