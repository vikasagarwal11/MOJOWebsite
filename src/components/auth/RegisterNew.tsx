import { zodResolver } from '@hookform/resolvers/zod';
import type { ConfirmationResult } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Clock, Mail, MapPin, Phone, Search, Shield, User, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeUSPhoneToE164OrNull } from '../../utils/phone';

const phoneSchema = z.object({
  phoneNumber: z.string().min(7, 'Enter a phone like 5551234567 or +12025550123'),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
});

const codeSchema = z.object({
  verificationCode: z.string().min(6, 'Verification code must be 6 digits'),
});

const additionalInfoSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  location: z.string().min(2, 'Location is required'),
  howDidYouHear: z.enum([
    'facebook',
    'instagram',
    'tiktok',
    'other_social',
    'referred_by_member',
    'friend',
    'family',
    'google_search',
    'other_search',
    'website',
    'fitness_event',
    'community_event',
    'gym',
    'other'
  ]),
  howDidYouHearOther: z.string().optional(),
  referredBy: z.string().optional(),
  referralNotes: z.string().optional(),
}).refine((data) => {
  if (data.howDidYouHear === 'other' && !data.howDidYouHearOther?.trim()) {
    return false;
  }
  return true;
}, {
  message: 'Please specify how you heard about us',
  path: ['howDidYouHearOther'],
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type CodeFormData = z.infer<typeof codeSchema>;
type AdditionalInfoFormData = z.infer<typeof additionalInfoSchema>;

const HOW_DID_YOU_HEAR_OPTIONS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'other_social', label: 'Other Social Media' },
  { value: 'referred_by_member', label: 'Referred by Existing Member' },
  { value: 'friend', label: 'Friend' },
  { value: 'family', label: 'Family Member' },
  { value: 'google_search', label: 'Google Search' },
  { value: 'other_search', label: 'Other Search Engine' },
  { value: 'website', label: 'Website/Blog' },
  { value: 'fitness_event', label: 'Fitness Event' },
  { value: 'community_event', label: 'Community Event' },
  { value: 'gym', label: 'Gym/Fitness Center' },
  { value: 'other', label: 'Other' },
];

const Register: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code' | 'additional'>('phone');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verifiedFirebaseUser, setVerifiedFirebaseUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  // SMS Code improvements
  const [codeExpiryTime, setCodeExpiryTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [maxResendAttempts] = useState(3);
  const [error, setError] = useState<string | null>(null);
  
  // Referrer search
  const [referrerSearchQuery, setReferrerSearchQuery] = useState('');
  const [referrerSearchResults, setReferrerSearchResults] = useState<any[]>([]);
  const [isSearchingReferrer, setIsSearchingReferrer] = useState(false);
  const [selectedReferrer, setSelectedReferrer] = useState<any>(null);

  const { sendVerificationCode, verifyPhoneCode, createPendingUser, checkIfUserExists } = useAuth();
  const navigate = useNavigate();

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<CodeFormData>({ resolver: zodResolver(codeSchema) });
  const additionalInfoForm = useForm<AdditionalInfoFormData>({ 
    resolver: zodResolver(additionalInfoSchema) 
  });

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (codeExpiryTime && timeLeft > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((codeExpiryTime - now) / 1000));
        setTimeLeft(remaining);
        
        if (remaining === 0) {
          setError('Verification code has expired. Please request a new one.');
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [codeExpiryTime, timeLeft]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Search for referrer users
  const handleReferrerSearch = async () => {
    if (!referrerSearchQuery.trim() || referrerSearchQuery.length < 2) {
      setReferrerSearchResults([]);
      return;
    }

    setIsSearchingReferrer(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('status', '==', 'approved'), // Only show approved users
        where('displayName', '>=', referrerSearchQuery),
        where('displayName', '<=', referrerSearchQuery + '\uf8ff'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        displayName: doc.data().displayName || 'Unknown User',
        email: doc.data().email || '',
      }));
      
      setReferrerSearchResults(results);
    } catch (error) {
      console.error('Failed to search referrers:', error);
      setReferrerSearchResults([]);
    } finally {
      setIsSearchingReferrer(false);
    }
  };

  // Debounce referrer search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleReferrerSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [referrerSearchQuery]);

  const onPhoneSubmit = async (data: PhoneFormData) => {
    const e164 = normalizeUSPhoneToE164OrNull(data.phoneNumber);
    
    if (!e164) {
      phoneForm.setError('phoneNumber', {
        message: 'Enter a valid US number like 5551234567 or +12025550123',
      });
      return;
    }

    setIsLoading(true);
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setPhoneNumber(e164);

    try {
      const userCheckResult = await checkIfUserExists(e164);
      
      // Handle detailed response (for rejected users)
      if (typeof userCheckResult === 'object' && userCheckResult !== null && 'exists' in userCheckResult) {
        const { exists, canReapply, message, reapplyDate, daysRemaining, userStatus } = userCheckResult;
        
        if (exists) {
          // User exists and cannot reapply yet
          if (userStatus === 'rejected' && !canReapply && message) {
            phoneForm.setError('phoneNumber', {
              message: message || `You can reapply after ${reapplyDate ? new Date(reapplyDate).toLocaleDateString() : '30 days'}.`
            });
          } else if (userStatus === 'pending') {
            phoneForm.setError('phoneNumber', {
              message: 'This phone number is already registered. Your account is pending approval. Please check your approval status.'
            });
          } else {
            phoneForm.setError('phoneNumber', {
              message: message || 'This phone number is already registered. Please sign in instead.'
            });
          }
          return;
        }
        
        // User exists but can reapply (rejected user, cooldown expired)
        if (!exists && canReapply) {
          // Allow registration to proceed - will update existing user
          console.log('✅ Rejected user can reapply - proceeding with registration');
        }
      } else if (userCheckResult === true) {
        // Boolean true - user exists (backward compatibility)
        phoneForm.setError('phoneNumber', {
          message: 'This phone number is already registered. Please sign in instead.'
        });
        return;
      }
      
      const result = await sendVerificationCode(e164);
      
      const expiryTime = Date.now() + (5 * 60 * 1000);
      setCodeExpiryTime(expiryTime);
      setTimeLeft(300);
      setError(null);
      setResendAttempts(0);
      
      setConfirmationResult(result);
      setStep('code');
    } catch (err: any) {
      let message = 'Could not send code. Please try again.';
      
      switch (err?.code) {
        case 'auth/invalid-phone-number':
          message = 'Invalid phone number. Please check and try again.';
          break;
        case 'auth/captcha-check-failed':
          message = "reCAPTCHA failed. Please try again.";
          break;
        case 'auth/operation-not-allowed':
          message = 'Phone sign-in is disabled. Please contact support.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many attempts. Please wait a minute and try again.';
          break;
        case 'auth/network-request-failed':
          message = 'Network error. Check your connection and try again.';
          break;
      }

      phoneForm.setError('phoneNumber', { message });
    } finally {
      setIsLoading(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormData) => {
    if (!confirmationResult) return;
    
    setIsLoading(true);
    try {
      // Verify code only - don't create user yet
      const fbUser = await verifyPhoneCode(confirmationResult, data.verificationCode);
      setVerifiedFirebaseUser(fbUser);
      setStep('additional');
    } catch (err: any) {
      let msg = 'Invalid code. Please try again.';
      
      if (err?.code === 'auth/invalid-verification-code') {
        msg = timeLeft === 0 
          ? 'Verification code has expired. Please request a new one.'
          : 'Invalid verification code. Please check the code and try again.';
      } else if (err?.code === 'auth/code-expired') {
        msg = 'Verification code has expired. Please request a new one.';
        setTimeLeft(0);
      } else if (err?.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please wait before trying again.';
      }
      
      codeForm.setError('verificationCode', { message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const onAdditionalInfoSubmit = async (data: AdditionalInfoFormData) => {
    if (!verifiedFirebaseUser) {
      toast.error('Session expired. Please start over.');
      navigate('/register');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 RegisterNew: Starting user creation with:', {
        userId: verifiedFirebaseUser.uid,
        email: data.email,
        firstName,
        lastName
      });
      
      // Create user with pending status and approval request
      await createPendingUser({
        userId: verifiedFirebaseUser.uid,
        firstName,
        lastName,
        email: data.email,
        phoneNumber,
        location: data.location,
        howDidYouHear: data.howDidYouHear,
        howDidYouHearOther: data.howDidYouHear === 'other' ? data.howDidYouHearOther : undefined,
        referredBy: selectedReferrer?.id || data.referredBy,
        referralNotes: data.referralNotes,
      });

      console.log('✅ RegisterNew: User creation successful, navigating to pending-approval');
      toast.success('Registration submitted! Your account is pending approval.');
      
      // Small delay to ensure state updates before navigation
      setTimeout(() => {
        navigate('/pending-approval');
      }, 100);
    } catch (err: any) {
      console.error('🚨 RegisterNew: Error completing registration:', {
        error: err,
        errorCode: err?.code,
        errorMessage: err?.message,
        errorStack: err?.stack
      });
      
      const errorMsg = err?.message || 'Failed to complete registration. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendAttempts >= maxResendAttempts || !phoneNumber) {
      setError(`Maximum resend attempts reached. Please try again later.`);
      return;
    }

    setIsResending(true);
    setError(null);

    try {
      const result = await sendVerificationCode(phoneNumber);
      
      const expiryTime = Date.now() + (5 * 60 * 1000);
      setCodeExpiryTime(expiryTime);
      setTimeLeft(300);
      setResendAttempts(prev => prev + 1);
      
      setConfirmationResult(result);
    } catch (err: any) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-[#F25129]/20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1">
              Join Our Community
            </h2>
            <p className="text-gray-600 mt-2">
              {step === 'phone' && 'Create your account to start your fitness journey'}
              {step === 'code' && 'Enter the verification code sent to your phone'}
              {step === 'additional' && 'Tell us a bit more about yourself'}
            </p>
          </div>

          {step === 'phone' && (
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...phoneForm.register('firstName')}
                      type="text"
                      autoComplete="given-name"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="First name"
                    />
                  </div>
                  {phoneForm.formState.errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">
                      {phoneForm.formState.errors.firstName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      {...phoneForm.register('lastName')}
                      type="text"
                      autoComplete="family-name"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="Last name"
                    />
                  </div>
                  {phoneForm.formState.errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">
                      {phoneForm.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                  <input
                    {...phoneForm.register('phoneNumber')}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                      phoneForm.formState.errors.phoneNumber ? 'border-red-300' : 'border-gray-300'
                    } focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                    placeholder="e.g., 5551234567 or (555) 123-4567"
                  />
                </div>
                {phoneForm.formState.errors.phoneNumber && (
                  <p className="mt-1 text-sm text-red-600">
                    {phoneForm.formState.errors.phoneNumber.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E5A900] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Verification Code</label>
                  {timeLeft > 0 && (
                    <div className="flex items-center space-x-1 text-sm">
                      <Clock className="w-4 h-4 text-orange-500" />
                      <span className={`font-mono ${timeLeft < 60 ? 'text-red-600' : 'text-gray-600'}`}>
                        {formatTime(timeLeft)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...codeForm.register('verificationCode')}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
                    placeholder="000000"
                  />
                </div>
                {codeForm.formState.errors.verificationCode && (
                  <p className="mt-1 text-sm text-red-600">
                    {codeForm.formState.errors.verificationCode.message}
                  </p>
                )}
                {error && (
                  <p className="mt-1 text-sm text-red-600">{error}</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      // Clear confirmation result to prevent stuck state in Safari
                      setConfirmationResult(null);
                      setIsLoading(false);
                      setError(null);
                      setTimeLeft(0);
                      setCodeExpiryTime(null);
                      codeForm.reset({ verificationCode: '' });
                      setStep('phone');
                    }}
                    className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || timeLeft === 0}
                    className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E5A900] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Verifying...' : timeLeft === 0 ? 'Code Expired' : 'Verify'}
                  </button>
                </div>
                
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isResending || resendAttempts >= maxResendAttempts || timeLeft > 0}
                    className="text-sm text-[#F25129] hover:text-[#E0451F] font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {isResending ? 'Sending...' : 
                     resendAttempts >= maxResendAttempts ? `Max attempts (${maxResendAttempts})` :
                     timeLeft > 0 ? `Resend in ${formatTime(timeLeft)}` : 'Resend Code'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {step === 'additional' && (
            <form onSubmit={additionalInfoForm.handleSubmit(onAdditionalInfoSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...additionalInfoForm.register('email')}
                    type="email"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                    placeholder="your.email@example.com"
                  />
                </div>
                {additionalInfoForm.formState.errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {additionalInfoForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...additionalInfoForm.register('location')}
                    type="text"
                    autoComplete="address-level2"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                    placeholder="City, State"
                  />
                </div>
                {additionalInfoForm.formState.errors.location && (
                  <p className="mt-1 text-sm text-red-600">
                    {additionalInfoForm.formState.errors.location.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <select
                  {...additionalInfoForm.register('howDidYouHear')}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                >
                  <option value="">Select an option...</option>
                  {HOW_DID_YOU_HEAR_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {additionalInfoForm.formState.errors.howDidYouHear && (
                  <p className="mt-1 text-sm text-red-600">
                    {additionalInfoForm.formState.errors.howDidYouHear.message}
                  </p>
                )}

                {additionalInfoForm.watch('howDidYouHear') === 'other' && (
                  <div className="mt-2">
                    <input
                      {...additionalInfoForm.register('howDidYouHearOther')}
                      type="text"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="Please specify..."
                    />
                    {additionalInfoForm.formState.errors.howDidYouHearOther && (
                      <p className="mt-1 text-sm text-red-600">
                        {additionalInfoForm.formState.errors.howDidYouHearOther.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {additionalInfoForm.watch('howDidYouHear') === 'referred_by_member' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referred By (Optional)
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={referrerSearchQuery}
                      onChange={(e) => setReferrerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                      placeholder="Search for member by name..."
                    />
                  </div>
                  {isSearchingReferrer && (
                    <p className="mt-1 text-sm text-gray-500">Searching...</p>
                  )}
                  {referrerSearchResults.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                      {referrerSearchResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            setSelectedReferrer(user);
                            setReferrerSearchQuery(user.displayName);
                            setReferrerSearchResults([]);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
                        >
                          <div className="font-medium">{user.displayName}</div>
                          {user.email && (
                            <div className="text-sm text-gray-500">{user.email}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedReferrer && (
                    <div className="mt-2 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm text-green-800">
                        Referred by: <strong>{selectedReferrer.displayName}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReferrer(null);
                          setReferrerSearchQuery('');
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  {...additionalInfoForm.register('referralNotes')}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                  placeholder="Anything else you'd like us to know?"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setStep('code')}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E5A900] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-[#F25129] hover:text-[#E0451F] font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

