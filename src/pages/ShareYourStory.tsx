import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Clock, HelpCircle, Lightbulb, MessageSquare, Star } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { TestimonialSubmissionForm } from '../components/home/TestimonialSubmissionForm';
import { useAuth } from '../contexts/AuthContext';

const ShareYourStory: React.FC = () => {
  const isBrowser = typeof window !== 'undefined';
  const HelmetWrapper = useMemo(() => {
    return ({ children }: { children?: React.ReactNode }) =>
      isBrowser ? <Helmet>{children}</Helmet> : <>{children}</>;
  }, [isBrowser]);

  const MotionlessDiv = useMemo(
    () =>
      ({ children, ...rest }: any) => {
        const { initial, animate, exit, transition, variants, whileInView, viewport, ...clean } = rest;
        return <div {...clean}>{children}</div>;
      },
    []
  );
  const Motion = isBrowser ? motion : { div: MotionlessDiv };

  const { currentUser } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const promptSuggestions = [
    "What made you join Moms Fitness Mojo?",
    "Describe a favorite event or workout session.",
    "How has the community supported your fitness journey?",
    "Share a moment that made you feel strong and empowered.",
    "What would you tell a mom considering joining?"
  ];

  const faqs = [
    {
      question: "How long does approval take?",
      answer: "We review testimonials within 24-48 hours. You'll be notified once your story is published!"
    },
    {
      question: "Can I edit my testimonial after submitting?",
      answer: "Currently, you can submit a new version. We're working on an edit feature for future updates."
    },
    {
      question: "What makes a great testimonial?",
      answer: "Be authentic and specific! Share real experiences, moments, or feelings. You have up to 2,000 characters—plenty of room for a vivid story."
    },
    {
      question: "Will my testimonial definitely be published?",
      answer: "We review all submissions to ensure they align with our community values. Most testimonials are approved!"
    }
  ];

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <HelmetWrapper>
          <title>Share Your Story · Moms Fitness Mojo</title>
        </HelmetWrapper>

        <div className="text-center mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[#F25129] hover:text-[#E0451F] mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Share Your Story</h1>
          <p className="text-lg text-gray-600 mb-8">
            Join our community by sharing how Moms Fitness Mojo has impacted your life.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-[#F25129]/30 bg-white/80 p-12 text-center">
          <MessageSquare className="w-16 h-16 text-[#F25129] mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Sign in to share your story</h2>
          <p className="text-gray-600 mb-6">
            You need to be signed in to submit a testimonial. Join our community to share your experience!
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/login"
              className="px-6 py-3 bg-[#F25129] text-white rounded-full font-semibold hover:bg-[#E0451F] transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-6 py-3 border border-[#F25129] text-[#F25129] rounded-full font-semibold hover:bg-[#F25129]/10 transition"
            >
              Join MOJO
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <HelmetWrapper>
          <title>Thank You! · Moms Fitness Mojo</title>
        </HelmetWrapper>

        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Thank You!</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Your story has been submitted and is pending review. We'll notify you once it's published on the homepage.
          </p>

          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 mb-8 max-w-2xl mx-auto">
            <div className="flex items-start gap-4 text-left">
              <Clock className="w-6 h-6 text-green-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">What happens next?</h3>
                <ul className="space-y-2 text-gray-700 text-sm">
                  <li>• We review your testimonial within 24-48 hours</li>
                  <li>• You'll receive a notification when it's published</li>
                  <li>• Your story will appear in the "What Moms Are Saying" carousel on the homepage</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              to="/"
              className="px-6 py-3 bg-[#F25129] text-white rounded-full font-semibold hover:bg-[#E0451F] transition"
            >
              Back to Home
            </Link>
            <button
              onClick={() => setSubmitted(false)}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-full font-semibold hover:bg-gray-50 transition"
            >
              Share Another Story
            </button>
          </div>
        </Motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      <HelmetWrapper>
        <title>Share Your Story · Moms Fitness Mojo</title>
        <meta name="description" content="Share your experience with Moms Fitness Mojo. Tell other moms how our community has impacted your fitness journey." />
      </HelmetWrapper>

      {/* Header */}
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[#F25129] hover:text-[#E0451F] mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Share Your Story
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl">
          Your experience matters! Share how Moms Fitness Mojo has made a difference in your life, and inspire other moms to join our community.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form Column */}
        <div className="lg:col-span-2">
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8"
          >
            <TestimonialSubmissionForm onSubmitted={() => setSubmitted(true)} />
          </Motion.div>
        </div>

        {/* Sidebar with Guidelines */}
        <div className="space-y-6">
          {/* Writing Tips */}
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Lightbulb className="w-6 h-6 text-[#F25129]" />
              <h3 className="text-lg font-semibold text-gray-900">Writing Tips</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Star className="w-4 h-4 text-[#FFC107] mt-0.5 flex-shrink-0" />
                <span><strong>Be authentic:</strong> Share real experiences and feelings</span>
              </li>
              <li className="flex items-start gap-2">
                <Star className="w-4 h-4 text-[#FFC107] mt-0.5 flex-shrink-0" />
                <span><strong>Share a full story:</strong> You can write up to 2,000 characters—enough for vivid detail</span>
              </li>
              <li className="flex items-start gap-2">
                <Star className="w-4 h-4 text-[#FFC107] mt-0.5 flex-shrink-0" />
                <span><strong>Be specific:</strong> Mention events, workouts, or moments</span>
              </li>
              <li className="flex items-start gap-2">
                <Star className="w-4 h-4 text-[#FFC107] mt-0.5 flex-shrink-0" />
                <span><strong>Share impact:</strong> How has it changed your life?</span>
              </li>
            </ul>
          </Motion.div>

          {/* Prompt Suggestions */}
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#F25129]" />
              Need Inspiration?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Not sure what to write? Try answering one of these:
            </p>
            <ul className="space-y-3">
              {promptSuggestions.map((prompt, index) => (
                <li key={index} className="text-sm text-gray-700 pl-4 border-l-2 border-[#F25129]/20">
                  {prompt}
                </li>
              ))}
            </ul>
          </Motion.div>

          {/* FAQ */}
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#F25129]" />
              Frequently Asked
            </h3>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div key={index}>
                  <p className="font-medium text-gray-900 text-sm mb-1">{faq.question}</p>
                  <p className="text-sm text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          </Motion.div>

          {/* Quick Stats */}
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-[#F25129] to-[#FFC107] rounded-2xl p-6 text-white"
          >
            <h3 className="text-lg font-semibold mb-3">Why Share?</h3>
            <p className="text-sm opacity-90">
              Your story helps other moms discover the community and feel inspired to join. Every testimonial makes a difference!
            </p>
          </Motion.div>
        </div>
      </div>
    </div>
  );
};

export default ShareYourStory;

