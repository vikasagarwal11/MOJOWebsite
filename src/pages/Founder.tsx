import React, { useState } from 'react';
import {
  Heart,
  Calendar,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  MapPin,
  CheckCircle,
  MessageCircle,
} from 'lucide-react';
import ContactFormModal from '../components/ContactFormModal';

const Founder: React.FC = () => {
  const [showContactModal, setShowContactModal] = useState(false);

  const founderData = {
    name: 'Aina Rai',
    title: 'Founder & CEO',
    subtitle: 'Moms Fitness Mojo',
    image: '/images/founder-profile.jpg',
    coverImage: '/images/founder-cover.jpg',
    location: 'Short Hills, NJ',
    joined: 'January 2025',
    followers: '12.5K',
    following: '1.2K',
    posts: '856',
  };

  // Removed unused data arrays - keeping it simple

  const socialLinks = [
    { icon: <Instagram className="w-5 h-5" />, url: '#', label: 'Instagram' },
    { icon: <Facebook className="w-5 h-5" />, url: '#', label: 'Facebook' },
    { icon: <Twitter className="w-5 h-5" />, url: '#', label: 'Twitter' },
    { icon: <Linkedin className="w-5 h-5" />, url: '#', label: 'LinkedIn' },
  ];

  // Removed tabs - keeping it simple as a single page

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Cover Image with Founder Photo Overlay */}
        <div className="h-[500px] relative overflow-hidden pb-8 bg-gradient-to-br from-orange-100 to-red-100">
          <img 
            src={founderData.coverImage} 
            alt="Founder cover"
            className="w-full h-full object-contain"
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
                  <button 
                    onClick={() => setShowContactModal(true)}
                    className="px-6 py-3 bg-white text-[#F25129] rounded-full font-semibold hover:bg-white/90 transition-all duration-200 flex items-center gap-2"
                  >
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

              {/* Aina's Story - Simple Single Page */}
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">My Story</h3>
                  <div className="prose prose-lg text-gray-700 max-w-none">
                    <p className="mb-6 text-lg leading-relaxed">
                      I'm Aina Rai, the heart behind Moms Fitness Mojo.
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      When I became a parent and moved to the suburbs, I thought it would be easy to connect with other moms. Like most new parents, I joined groups, went to meetups, and tried to find my tribe. But every single conversation circled back to kids—nap times, diaper changes, feeding schedules. Don't get me wrong, I adore my children, but I found myself asking: Where am I in all of this? Where are the conversations about who I am as a person, not just as a mom?
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      At the same time, I was on my own fitness journey. During pregnancy, I had gained weight, and I worked tirelessly—sometimes sneaking in workouts at 10 p.m.—to shed those pounds and reclaim my health. But I had no one to share those wins with. Sure, family would notice, but they couldn't fully understand the effort it took to juggle a full-time job, family, home, and still carve out time for myself. It felt like there was nowhere to brag about my achievements outside of work—because let's be real, staying fit, raising kids, and keeping your sanity is an achievement worth celebrating!
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      So one day, I decided to create the space I was looking for. A place where moms could come together to: Talk about goals beyond nap times and snacks, Share fitness wins and celebrate progress, Connect as women, not just as mothers, Laugh, sweat, brunch, dance, and just be themselves.
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      That's how Moms Fitness Mojo was born. And what started as a small idea has grown into a circle of moms who truly inspire one another. This group is more than workouts—it's about friendship, accountability, and rediscovering yourself.
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      Outside of MFM, I'm a mom of two energetic little boys, a wife, and by profession a Technical Program Manager. I love fitness, socializing, and a good party—and through this community, I found a way to bring all of that back into my life while giving other moms the same opportunity. 
                    </p>
                    <p className="mb-6 text-lg leading-relaxed">
                      Moms Fitness Mojo has been life-changing—for me and for so many of us. Together, we are <strong className="text-[#F25129]">Fit, Fierce & Fabulous.</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Form Modal */}
      <ContactFormModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        recipient={founderData.name}
        recipientEmail="momsfitnessmojo@gmail.com"
        prefillSubject={`Message to ${founderData.name}`}
      />
    </div>
  );
};

export default Founder;
