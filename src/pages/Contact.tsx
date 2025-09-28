import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ContactService } from '../services/contactService';
import { ContactMessageFormData } from '../types/contact';

// Contact form validation schema
const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  inquiryType: z.enum(['general', 'events', 'membership', 'technical', 'partnership', 'other']),
});

type ContactFormData = z.infer<typeof contactSchema>;

const Contact: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [searchParams] = useSearchParams();
  
  // Get inquiry type from URL parameters
  const urlInquiryType = searchParams.get('inquiryType') as 'general' | 'events' | 'membership' | 'technical' | 'partnership' | 'other' | null;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      inquiryType: urlInquiryType || 'general',
      message: urlInquiryType === 'partnership' ? 'I am interested in becoming a sponsor for Moms Fitness Mojo. Please provide me with information about sponsorship opportunities, packages, and how we can collaborate to benefit your community.' : '',
    },
  });

  // Set the inquiry type and message when URL parameter changes
  useEffect(() => {
    if (urlInquiryType) {
      setValue('inquiryType', urlInquiryType);
      if (urlInquiryType === 'partnership') {
        setValue('message', 'I am interested in becoming a sponsor for Moms Fitness Mojo. Please provide me with information about sponsorship opportunities, packages, and how we can collaborate to benefit your community.');
        setValue('subject', 'Sponsorship Inquiry - Partnership Opportunities');
      }
    }
  }, [urlInquiryType, setValue]);

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    
    try {
      // Store message in database
      const messageData: Omit<ContactMessageFormData, 'id' | 'createdAt' | 'updatedAt' | 'status'> = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        inquiryType: data.inquiryType,
        message: data.message,
      };
      
      await ContactService.submitMessage(messageData);
      
      // Show success message
      toast.success('Message received! We\'ll get back to you soon.');
      setIsSubmitted(true);
      reset();
      
      // Reset success state after 5 seconds
      setTimeout(() => setIsSubmitted(false), 5000);
      
    } catch (error) {
      console.error('Error submitting message:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const inquiryTypes = [
    { value: 'general', label: 'General Inquiry' },
    { value: 'events', label: 'Events & Activities' },
    { value: 'membership', label: 'Membership Questions' },
    { value: 'technical', label: 'Technical Support' },
    { value: 'partnership', label: 'Partnership Opportunities' },
    { value: 'other', label: 'Other' },
  ];

  // Structured data for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Moms Fitness Mojo',
    url: 'https://momfitnessmojo.web.app/contact',
    description: 'Get in touch with Moms Fitness Mojo. We\'d love to hear from you! Whether you have questions about our community, want to join an event, or just want to say hello, we\'re here to help.',
    mainEntity: {
      '@type': 'Organization',
      name: 'Moms Fitness Mojo',
      url: 'https://momfitnessmojo.web.app',
      logo: 'https://momfitnessmojo.web.app/assets/logo/square-logo.svg',
      email: 'momsfitnessmojo@gmail.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Short Hills',
        addressRegion: 'NJ',
        addressCountry: 'US',
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        email: 'momsfitnessmojo@gmail.com',
        availableLanguage: 'English',
      },
      sameAs: [
        'https://www.instagram.com/momsfitnessmojo/',
        'https://www.facebook.com/momsfitnessmojo/',
        'https://www.linkedin.com/company/momsfitnessmojo/',
      ],
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50">
      {/* SEO */}
      <Helmet>
        <title>Contact Us | Moms Fitness Mojo - Millburn & Short Hills NJ</title>
        <meta
          name="description"
          content="Get in touch with Moms Fitness Mojo. We'd love to hear from you! Whether you have questions about our community, want to join an event, or just want to say hello, we're here to help."
        />
        <link rel="canonical" href="https://momfitnessmojo.web.app/contact" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Contact Moms Fitness Mojo" />
        <meta property="og:description" content="Get in touch with Moms Fitness Mojo. We'd love to hear from you! Whether you have questions about our community, want to join an event, or just want to say hello, we're here to help." />
        <meta property="og:url" content="https://momfitnessmojo.web.app/contact" />
        <meta property="og:image" content="https://momfitnessmojo.web.app/assets/logo/facebook-post.svg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contact Moms Fitness Mojo" />
        <meta name="twitter:description" content="Get in touch with Moms Fitness Mojo. We'd love to hear from you!" />
        <meta name="twitter:image" content="https://momfitnessmojo.web.app/assets/logo/square-logo.svg" />
        
        {/* Structured Data */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {urlInquiryType === 'partnership' ? (
              <>
                Interested in partnering with Moms Fitness Mojo? We'd love to explore 
                sponsorship opportunities and collaborations that benefit our community. 
                Let's create meaningful partnerships together!
              </>
            ) : (
              <>
                We'd love to hear from you! Whether you have questions about our community, 
                want to join an event, or just want to say hello, we're here to help. 
                Your message will be sent directly to our team.
              </>
            )}
          </p>
        </motion.div>

        {/* Contact Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Send us a Message</h2>
            
            {isSubmitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">Email Client Opened!</h3>
                <p className="text-gray-600">
                  Your message has been pre-filled. Please send it from your email client.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Name and Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      {...register('name')}
                      type="text"
                      id="name"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="Your full name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      {...register('email')}
                      type="email"
                      id="email"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="your.email@example.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Phone and Inquiry Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      {...register('phone')}
                      type="tel"
                      id="phone"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div>
                    <label htmlFor="inquiryType" className="block text-sm font-medium text-gray-700 mb-2">
                      Inquiry Type *
                    </label>
                    <select
                      {...register('inquiryType')}
                      id="inquiryType"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                    >
                      {inquiryTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <input
                    {...register('subject')}
                    type="text"
                    id="subject"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                    placeholder="Brief description of your inquiry"
                  />
                  {errors.subject && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors.subject.message}
                    </p>
                  )}
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    {...register('message')}
                    id="message"
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200 resize-none"
                    placeholder="Tell us more about your inquiry..."
                  />
                  {errors.message && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors.message.message}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white py-4 px-6 rounded-lg font-semibold text-lg hover:from-[#E0451F] hover:to-[#E55A2A] focus:ring-4 focus:ring-[#F25129]/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Opening Email...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Send Message</span>
                    </>
                  )}
                </motion.button>
              </form>
            )}
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-20"
        >
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                question: "How do I join the community?",
                answer: "Simply create an account and start attending events! Most events are open to all members."
              },
              {
                question: "Are there membership fees?",
                answer: "We offer both free and premium membership options. Check our membership page for details."
              },
              {
                question: "How do I RSVP to events?",
                answer: "Click on any event and use the RSVP button. You can add family members to your RSVP."
              },
              {
                question: "What if I can't attend an event?",
                answer: "No problem! Just update your RSVP status or contact us if you need to cancel last minute."
              },
              {
                question: "How do I contact event organizers?",
                answer: "Use the contact form above or reach out to us directly at momsfitnessmojo@gmail.com"
              },
              {
                question: "Is there a mobile app?",
                answer: "Our website is fully mobile-responsive and works great on all devices!"
              }
            ].map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
                className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{faq.question}</h3>
                <p className="text-gray-600 text-sm">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Contact;
