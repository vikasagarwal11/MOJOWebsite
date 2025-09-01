import React from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Users,
  Camera,
  Heart,
  Star,
  ArrowRight,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const isAuthed = !!currentUser;

  const features = [
    {
      icon: <Calendar className="w-8 h-8" />,
      title: 'Fitness Events',
      description:
        'Join our regular fitness classes, workshops, and wellness events designed for busy moms.',
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Supportive Community',
      description:
        'Connect with like-minded mothers who understand the challenges of balancing family and fitness.',
    },
    {
      icon: <Camera className="w-8 h-8" />,
      title: 'Share Your Journey',
      description:
        'Upload photos and videos of your fitness progress and celebrate milestones together.',
    },
    {
      icon: <Heart className="w-8 h-8" />,
      title: 'Wellness Focus',
      description:
        'Holistic approach to health including mental wellness, nutrition, and self-care.',
    },
  ];

  const testimonials = [
    {
      name: 'Sarah Johnson',
      text: 'This community has been a game-changer for my fitness journey. The support and motivation from other moms is incredible!',
      rating: 5,
    },
    {
      name: 'Emily Chen',
      text: 'I love how flexible the events are. As a working mom, I can finally fit fitness into my busy schedule.',
      rating: 5,
    },
    {
      name: 'Maria Rodriguez',
      text: "The friendships I've made here go beyond fitness. We support each other in all aspects of motherhood.",
      rating: 5,
    },
  ];

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center space-y-8">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 bg-clip-text text-transparent leading-tight">
              Moms Fitness Mojo
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Empowering mothers to prioritize their health, connect with their community,
              and find their fitness mojo in a supportive, understanding environment.
            </p>

            {/* Primary hero actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {!isAuthed ? (
                <>
                  <Link
                    to="/register"
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    Join Our Community
                  </Link>
                  <Link
                    to="/events"
                    className="px-8 py-4 border-2 border-purple-600 text-purple-600 font-semibold rounded-full hover:bg-purple-600 hover:text-white transition-all duration-300 transform hover:scale-105"
                  >
                    View Events
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/events"
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    View Events
                  </Link>
                  <Link
                    to="/media"
                    className="px-8 py-4 border-2 border-purple-600 text-purple-600 font-semibold rounded-full hover:bg-purple-600 hover:text-white transition-all duration-300 transform hover:scale-105"
                  >
                    Explore Media
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-10 w-32 h-32 bg-purple-200 rounded-full opacity-20 animate-pulse" />
          <div className="absolute bottom-20 right-10 w-24 h-24 bg-pink-200 rounded-full opacity-20 animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-orange-200 rounded-full opacity-20 animate-pulse delay-2000" />
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Join Mom&apos;s Fitness Mojo?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-purple-100 hover:bg-white/80 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2">500+</div>
              <div className="text-purple-100">Active Members</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2">50+</div>
              <div className="text-purple-100">Monthly Events</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold mb-2">2+</div>
              <div className="text-purple-100">Years Strong</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            What Our Members Say
          </h2>
          <p className="text-xl text-gray-600">Real stories from real moms in our community</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center mb-4">
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} className="w-5 h-5 text-yellow-400 fill-current" />
                ))}
              </div>
              <p className="text-gray-700 mb-4 italic">"{t.text}"</p>
              <div className="text-purple-600 font-semibold">{t.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA / Member Quick Actions */}
      {!isAuthed ? (
        <section className="bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="text-center space-y-8">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Ready to Start Your Fitness Journey?
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Join hundreds of moms who have already transformed their lives through our supportive
                community.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Get Started Today
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="text-center space-y-8">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Welcome back{currentUser?.displayName ? `, ${currentUser.displayName}` : ''}!
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Jump right in with these quick actions.
              </p>

              {/* NOTE: "My Profile" removed per your preference */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <Link
                  to="/events"
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-purple-100 hover:shadow-lg transition"
                >
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <span>Upcoming Events</span>
                </Link>
                <Link
                  to="/media"
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-purple-100 hover:shadow-lg transition"
                >
                  <ImageIcon className="w-5 h-5 text-purple-600" />
                  <span>Media Gallery</span>
                </Link>
                <Link
                  to="/posts"
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-white rounded-xl border border-purple-100 hover:shadow-lg transition"
                >
                  <UploadCloud className="w-5 h-5 text-purple-600" />
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
