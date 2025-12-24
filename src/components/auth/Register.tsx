import { zodResolver } from '@hookform/resolvers/zod';
import type { ConfirmationResult } from 'firebase/auth';
import { Clock, Phone, Shield, User, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeUSPhoneToE164OrNull } from '../../utils/phone';

const phoneSchema = z.object({
  // We do strict normalization with normalizeUSPhoneToE164OrNull in onPhoneSubmit
  phoneNumber: z.string().min(7, 'Enter a phone like 5551234567 or +12025550123'),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
});

const codeSchema = z.object({
  verificationCode: z.string().min(6, 'Verification code must be 6 digits'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type CodeFormData  = z.infer<typeof codeSchema>;

const Register: React.FC = () => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  // SMS Code improvements
  const [codeExpiryTime, setCodeExpiryTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [maxResendAttempts] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showSMSStatusModal, setShowSMSStatusModal] = useState(false);
  const [smsStatusData, setSmsStatusData] = useState<any>(null);

  const { sendVerificationCode, verifyCode, checkIfUserExists, checkSMSDeliveryStatus } = useAuth();
  const navigate = useNavigate();

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const codeForm  = useForm<CodeFormData>({ resolver: zodResolver(codeSchema) });

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

  const onPhoneSubmit = async (data: PhoneFormData) => {
    console.log('🔍 Register: onPhoneSubmit called with data:', data);
    
    // Normalize anything the user types (US-first) to E.164
    const e164 = normalizeUSPhoneToE164OrNull(data.phoneNumber);
    console.log('🔍 Register: Phone normalization result:', { original: data.phoneNumber, e164 });
    
    if (!e164) {
      console.log('🔍 Register: Phone normalization failed');
      phoneForm.setError('phoneNumber', {
        message: 'Enter a valid US number like 5551234567 or +12025550123',
      });
      return;
    }

    console.log('🔍 Register: Setting state variables');
    setIsLoading(true);
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setPhoneNumber(e164);

    try {
      // Check if phone number is already registered
      console.log('🔍 Register: Checking if phone number is already registered...');
      const userExists = await checkIfUserExists(e164);
      if (userExists) {
        console.log('🔍 Register: Phone number already registered, showing error');
        phoneForm.setError('phoneNumber', {
          message: 'This phone number is already registered. Please sign in instead.'
        });
        return;
      }
      
      console.log('🔍 Register: Phone number available, sending verification code...');
      // IMPORTANT: Always send E.164 to Firebase
      const result = await sendVerificationCode(e164);
      
      // Set code expiry time (5 minutes from now)
      const expiryTime = Date.now() + (5 * 60 * 1000);
      setCodeExpiryTime(expiryTime);
      setTimeLeft(300); // 5 minutes in seconds
      setError(null); // Clear any previous errors
      setResendAttempts(0); // Reset resend attempts
      
      setConfirmationResult(result);
      setStep('code');
    } catch (err: any) {
  console.error('Phone verification error:', err);

  let message = 'Could not send code. Please try again.';

  switch (err?.code) {
    case 'auth/invalid-phone-number':
      message = 'Invalid phone number. Please check and try again.';
      break;
    case 'auth/captcha-check-failed':
      message =
        "reCAPTCHA failed: add this site’s host to Firebase → Authentication → Authorized domains, then retry.";
      break;
    case 'auth/operation-not-allowed':
      message =
        'Phone sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.';
      break;
    case 'auth/too-many-requests':
      message = 'Too many attempts. Please wait a minute and try again.';
      break;
    case 'auth/network-request-failed':
      message = 'Network error. Check your connection and try again.';
      break;
  }

  // Handle common text variants too
  const lower = String(err?.message || '').toLowerCase();
  if (lower.includes('hostname match not found')) {
    message =
      "This preview host isn’t authorized in Firebase. Add the exact host under Authentication → Authorized domains and retry.";
  } else if (lower.includes('already been rendered')) {
    // We retry inside AuthContext, but surface a friendly note here just in case
    message = 'Security check hiccup. Please try again.';
  }

  phoneForm.setError('phoneNumber', { message });
}
 finally {
      setIsLoading(false);
    }
  };

  const onCodeSubmit = async (data: CodeFormData) => {
    console.log('🔍 Register: onCodeSubmit called with data:', data);
    console.log('🔍 Register: Current state:', { firstName, lastName, phoneNumber, confirmationResult: !!confirmationResult });
    
    if (!confirmationResult) {
      console.log('🔍 Register: No confirmationResult, returning');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('🔍 Register: Calling verifyCode with:', {
        code: data.verificationCode,
        firstName,
        lastName,
        phoneNumber
      });
      
      await verifyCode(confirmationResult, data.verificationCode, firstName, lastName, phoneNumber, false);
      console.log('🔍 Register: verifyCode completed successfully, navigating to home');
      navigate('/');
    } catch (err: any) {
      console.error('🚨 Register: Code verification error:', {
        error: err,
        errorCode: err?.code,
        errorMessage: err?.message,
        errorStack: err?.stack
      });
      
      let msg = 'Invalid code. Please try again.';
      
      if (err?.code === 'auth/invalid-verification-code') {
        if (timeLeft === 0) {
          msg = 'Verification code has expired. Please request a new one.';
          setError('Code expired. Click "Resend Code" to get a new one.');
        } else {
          msg = 'Invalid verification code. Please check the code and try again.';
        }
      } else if (err?.code === 'auth/code-expired') {
        msg = 'Verification code has expired. Please request a new one.';
        setError('Code expired. Click "Resend Code" to get a new one.');
        setTimeLeft(0);
      } else if (err?.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please wait before trying again.';
        setError('Too many failed attempts. Please wait a few minutes before trying again.');
      }
      
      codeForm.setError('verificationCode', { message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // COMMENTED OUT FOR PRODUCTION - SMS Status Check Function
  /* const handleCheckSMSStatus = async () => {
    if (!confirmationResult || !phoneNumber) {
      console.log('🔍 Register: No confirmation result or phone number available');
      return;
    }

    try {
      console.log('🔍 Register: Checking SMS delivery status...');
      const status = await checkSMSDeliveryStatus(phoneNumber, confirmationResult.verificationId);
      console.log('🔍 Register: SMS delivery status:', status);
      
      if (status.success) {
        console.log('🔍 Register: SMS status check successful');
        console.log('🔍 Register: Debug info:', status.debugInfo);
        console.log('🔍 Register: Recommendations:', status.recommendations);
        
        // Store status data and show modal
        setSmsStatusData(status);
        setShowSMSStatusModal(true);
      } else {
        console.error('🔍 Register: SMS status check failed:', status.error);
        setError('Failed to check SMS status. Please try again.');
      }
    } catch (error) {
      console.error('🔍 Register: Error checking SMS status:', error);
    }
  }; */

  const handleResendCode = async () => {
    if (resendAttempts >= maxResendAttempts) {
      setError(`Maximum resend attempts (${maxResendAttempts}) reached. Please try again later.`);
      return;
    }

    if (!phoneNumber) {
      setError('Phone number not available for resend.');
      return;
    }

    setIsResending(true);
    setError(null);

    try {
      console.log('🔍 Register: Resending verification code...');
      const result = await sendVerificationCode(phoneNumber);
      
      // Reset timer for new code
      const expiryTime = Date.now() + (5 * 60 * 1000);
      setCodeExpiryTime(expiryTime);
      setTimeLeft(300);
      setResendAttempts(prev => prev + 1);
      
      setConfirmationResult(result);
      console.log('🔍 Register: New verification code sent successfully');
    } catch (err: any) {
      console.error('🔍 Register: Resend error:', err);
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
              {step === 'phone'
                ? 'Create your account to start your fitness journey'
                : 'Enter the verification code sent to your phone'}
            </p>
          </div>

          {step === 'phone' ? (
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
          ) : (
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
                  <p className="mt-1 text-sm text-red-600">
                    {error}
                  </p>
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
                    {isLoading ? 'Verifying...' : timeLeft === 0 ? 'Code Expired' : 'Create Account'}
                  </button>
                </div>
                
                {/* Resend Code Button */}
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
                
                {/* SMS Status Check Button - COMMENTED OUT FOR PRODUCTION */}
                {/* <button
                  type="button"
                  onClick={handleCheckSMSStatus}
                  className="w-full py-2 px-4 rounded-lg border border-blue-300 text-blue-700 font-medium hover:bg-blue-50 transition-colors text-sm"
                >
                  🔍 Check SMS Delivery Status
                </button> */}
                
                {/* SMS Troubleshooting Tips - COMMENTED OUT FOR PRODUCTION */}
                {/* <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium mb-2">🚨 SMS Not Received? Try These:</p>
                  <div className="space-y-2 text-xs text-yellow-700">
                    <p>• <a href="https://console.firebase.google.com/project/momfitnessmojo/authentication/usage" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Check Firebase Console → Authentication → Usage (SMS quota)</a></p>
                    <p>• <a href="https://console.firebase.google.com/project/momfitnessmojo/settings/billing" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Verify billing is enabled in Firebase Console</a></p>
                    <p>• Try a different phone number (different carrier)</p>
                    <p>• Check spam folder on your phone</p>
                    <p>• Wait 2-3 minutes for delivery</p>
                    <p>• Try from a different device/network</p>
                  </div>
                </div> */}
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

      {/* SMS Status Modal */}
      {showSMSStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">SMS Delivery Status</h3>
              <button
                onClick={() => setShowSMSStatusModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800 font-medium">✅ SMS Status Check Complete!</p>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm text-gray-700 font-medium">Check these Firebase Console pages:</p>
                
                <div className="space-y-2">
                  <a
                    href="https://console.firebase.google.com/project/momfitnessmojo/authentication/usage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">1. Authentication Usage</span>
                      <span className="text-xs text-blue-500">(SMS quota & limits)</span>
                    </div>
                  </a>
                  
                  <a
                    href="https://console.firebase.google.com/project/momfitnessmojo/authentication/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">2. Authentication Settings</span>
                      <span className="text-xs text-blue-500">(Phone provider enabled)</span>
                    </div>
                  </a>
                  
                  <a
                    href="https://console.firebase.google.com/project/momfitnessmojo/settings/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 font-medium">3. Billing Settings</span>
                      <span className="text-xs text-blue-500">(SMS billing enabled)</span>
                    </div>
                  </a>
                </div>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium mb-2">Other things to try:</p>
                <ul className="text-xs text-yellow-700 space-y-1">
                  <li>• Check your phone's spam folder</li>
                  <li>• Try a different phone number (different carrier)</li>
                  <li>• Wait 2-3 minutes for delivery</li>
                  <li>• Try from a different device/network</li>
                </ul>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setShowSMSStatusModal(false)}
                  className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Register;
