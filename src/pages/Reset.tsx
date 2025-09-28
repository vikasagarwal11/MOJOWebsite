import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, Clock, Heart, Users, CheckCircle } from 'lucide-react';

const Reset: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsSubmitted(true);
    setIsLoading(false);
  };

  const features = [
    {
      icon: <Clock className="w-8 h-8 text-blue-500" />,
      title: "3 Micro-Workouts",
      description: "5, 10, and 15-minute routines you can do anywhere"
    },
    {
      icon: <Heart className="w-8 h-8 text-green-500" />,
      title: "Breathing Drill",
      description: "60-second reset technique for instant calm"
    },
    {
      icon: <Users className="w-8 h-8 text-purple-500" />,
      title: "Weekly Tracker",
      description: "Simple habit tracker to celebrate your wins"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      <Helmet>
        <title>10-Minute Reset Kit | Moms Fitness Mojo</title>
        <meta name="description" content="Get your free 10-minute reset kit: 3 micro-workouts, breathing drill, and habit tracker designed for busy moms in Short Hills & Millburn, NJ." />
        <link rel="canonical" href="https://momfitnessmojo.web.app/reset" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="10-Minute Reset Kit - Moms Fitness Mojo" />
        <meta property="og:description" content="Free wellness kit for busy moms: micro-workouts, breathing exercises, and habit tracking." />
        <meta property="og:url" content="https://momfitnessmojo.web.app/reset" />
        <meta property="og:image" content="https://momfitnessmojo.web.app/assets/logo/facebook-post.svg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="10-Minute Reset Kit - Moms Fitness Mojo" />
        <meta name="twitter:description" content="Free wellness kit for busy moms." />
        <meta name="twitter:image" content="https://momfitnessmojo.web.app/assets/logo/square-logo.svg" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Your 10-Minute Reset Kit
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
            No time? No problem. Get your free wellness kit with micro-workouts, breathing exercises, and a habit tracker designed for busy moms.
          </p>
          
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Free • No spam • Instant download
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <div key={index} className="text-center p-6 bg-white rounded-2xl shadow-lg">
              <div className="flex justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Email Capture Form */}
        <div className="max-w-2xl mx-auto">
          {!isSubmitted ? (
            <div className="bg-white rounded-3xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                Get Your Free Kit
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="Your first name"
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    placeholder="your.email@example.com"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-bold py-4 px-8 rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Getting your kit...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Download className="w-5 h-5" />
                      Download My Free Kit
                    </span>
                  )}
                </button>
              </form>
              
              <p className="text-sm text-gray-500 text-center mt-4">
                We respect your privacy. Unsubscribe at any time.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Check Your Email!
              </h2>
              
              <p className="text-gray-600 mb-6">
                Your 10-Minute Reset Kit is on its way to <strong>{email}</strong>. 
                Check your inbox (and spam folder) for the download link.
              </p>
              
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-orange-800 mb-2">What's Next?</h3>
                <ul className="text-sm text-orange-700 space-y-1">
                  <li>• Download your PDF and save it to your phone</li>
                  <li>• Try the 5-minute stretch today</li>
                  <li>• Join our next event in Short Hills</li>
                </ul>
              </div>
              
              <a
                href="/events"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#F25129] text-white font-semibold rounded-lg hover:bg-[#E0451F] transition-colors"
              >
                See Upcoming Events
              </a>
            </div>
          )}
        </div>

        {/* Social Proof */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 mb-4">Join 500+ moms who've already downloaded their kit</p>
          <div className="flex justify-center items-center gap-4 text-sm text-gray-400">
            <span>⭐⭐⭐⭐⭐</span>
            <span>"Game changer for my morning routine!"</span>
            <span>— Sarah M.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reset;
